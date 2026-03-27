/**
 * Job Pulse Agent Service
 *
 * Orchestrates the full post-apply workflow:
 *   1. Find top N execs/leaders at the company
 *   2. Enrich each (email + LinkedIn) via waterfall
 *   3. Draft personalized outreach via AI
 *   4. Auto-send or queue as drafts for approval
 */

import { requirePrisma } from "@/lib/prisma";
import { searchPeopleAtCompany } from "@/lib/enrichment/waterfall";
import { runEnrichmentWaterfall } from "@/lib/enrichment/waterfall";
import { generateDraft } from "@/lib/outreach/ai-draft";
import { DEFAULT_TEMPLATES } from "@/lib/outreach/templates";
import { sendEmailViaGmail } from "@/lib/gmail/send";

export interface AgentRunResult {
  runId: string;
  contactsFound: number;
  contactsEnriched: number;
  emailsDrafted: number;
  emailsSent: number;
  status: string;
  error?: string;
}

/** Default titles to target when no AgentConfig is set */
const DEFAULT_TARGET_TITLES = [
  "CEO",
  "CTO",
  "CPO",
  "COO",
  "VP Engineering",
  "VP of Engineering",
  "VP Product",
  "VP of Product",
  "Head of Engineering",
  "Head of Product",
  "Director of Engineering",
  "Founder",
  "Co-Founder",
  "President",
  "Chief of Staff",
];

async function addStep(
  runId: string,
  kind: string,
  status: "running" | "done" | "error" | "skipped",
  summary?: string,
  metadata?: Record<string, unknown>
) {
  const prisma = requirePrisma();
  return prisma.agentRunStep.create({
    data: { runId, kind, status, summary, metadata: metadata as never },
  });
}

/**
 * Main agent entry point. Creates an AgentRun record and executes the full workflow.
 */
export async function runAgentForApplication(
  applicationId: string,
  userId: string,
  options?: {
    triggerType?: "email_webhook" | "manual";
    triggerEmailId?: string;
  }
): Promise<AgentRunResult> {
  const prisma = requirePrisma();
  const triggerType = options?.triggerType ?? "manual";

  // ── Load application ────────────────────────────────────────────────────
  const application = await prisma.application.findFirst({
    where: { id: applicationId, userId },
    select: { id: true, company: true, role: true, appliedAt: true },
  });

  if (!application) {
    throw new Error(`Application ${applicationId} not found for user ${userId}`);
  }

  // ── Load agent config ───────────────────────────────────────────────────
  const config = await prisma.agentConfig.findUnique({ where: { userId } });
  const targetTitles = config?.targetTitles?.length ? config.targetTitles : DEFAULT_TARGET_TITLES;
  const maxContacts = config?.maxContacts ?? 3;
  const autoSend = config?.autoSend ?? false;
  const preferredTemplateId = config?.preferredTemplate ?? "executive-intro";
  const channel = (config?.channel as "email" | "linkedin") ?? "email";

  // ── Create AgentRun ─────────────────────────────────────────────────────
  const run = await prisma.agentRun.create({
    data: {
      userId,
      applicationId,
      status: "running",
      triggerType,
      triggerEmailId: options?.triggerEmailId,
    },
  });

  const runId = run.id;

  try {
    // ── Step 1: Search for people ────────────────────────────────────────
    await addStep(runId, "search", "running", `Searching for ${maxContacts} leaders at ${application.company}…`);

    let people: Awaited<ReturnType<typeof searchPeopleAtCompany>> = [];
    try {
      people = await searchPeopleAtCompany(
        application.company,
        targetTitles,
        maxContacts * 3 // fetch more, we'll take top N after enrichment
      );
    } catch (err) {
      await addStep(runId, "search", "error", `Search failed: ${String(err)}`);
      throw err;
    }

    const topPeople = people.slice(0, maxContacts);

    await addStep(
      runId,
      "search",
      "done",
      `Found ${topPeople.length} candidate${topPeople.length !== 1 ? "s" : ""} at ${application.company}`,
      { count: topPeople.length, names: topPeople.map((p) => p.fullName).filter(Boolean) }
    );

    if (topPeople.length === 0) {
      await prisma.agentRun.update({
        where: { id: runId },
        data: {
          status: "completed",
          contactsFound: 0,
          completedAt: new Date(),
        },
      });
      return { runId, contactsFound: 0, contactsEnriched: 0, emailsDrafted: 0, emailsSent: 0, status: "completed" };
    }

    await prisma.agentRun.update({ where: { id: runId }, data: { contactsFound: topPeople.length } });

    // ── Step 2: Upsert + Enrich contacts ────────────────────────────────
    let enriched = 0;
    const enrichedContactIds: string[] = [];

    for (const person of topPeople) {
      await addStep(runId, "enrich", "running", `Enriching ${person.fullName ?? "unknown"} (${person.title ?? "unknown title"})…`);

      try {
        // Upsert contact record
        const uniqueMatchers = [];
        if (person.linkedinUrl) uniqueMatchers.push({ linkedinUrl: person.linkedinUrl });
        if (person.email) uniqueMatchers.push({ email: person.email });
        if (person.fullName) uniqueMatchers.push({ fullName: person.fullName });

        const existing = uniqueMatchers.length > 0
          ? await prisma.enrichedContact.findFirst({ where: { applicationId, OR: uniqueMatchers } })
          : null;

        let contact = existing;
        if (!contact) {
          contact = await prisma.enrichedContact.create({
            data: {
              applicationId,
              userId,
              firstName: person.firstName ?? undefined,
              lastName: person.lastName ?? undefined,
              fullName: person.fullName ?? undefined,
              title: person.title ?? undefined,
              department: person.department ?? undefined,
              seniority: person.seniority ?? undefined,
              email: person.email ?? undefined,
              emailVerified: person.emailVerified,
              linkedinUrl: person.linkedinUrl ?? undefined,
              phone: person.phone ?? undefined,
              company: person.company,
              companyDomain: person.companyDomain ?? undefined,
              enrichmentStatus: "pending",
            },
          });
        }

        // Run enrichment waterfall if email or LinkedIn is missing
        if (!contact.email || !contact.linkedinUrl) {
          const result = await runEnrichmentWaterfall(contact.id);
          if (result.emailFound || result.linkedinFound) {
            enriched++;
            enrichedContactIds.push(contact.id);
            await addStep(
              runId,
              "enrich",
              "done",
              `Enriched ${person.fullName ?? "contact"}: ${result.emailFound ? "email ✓" : "no email"}, ${result.linkedinFound ? "LinkedIn ✓" : "no LinkedIn"}`,
              { contactId: contact.id, emailFound: result.emailFound, linkedinFound: result.linkedinFound }
            );
          } else {
            await addStep(runId, "enrich", "skipped", `Could not enrich ${person.fullName ?? "contact"} — no email or LinkedIn found`);
          }
        } else {
          enriched++;
          enrichedContactIds.push(contact.id);
          await addStep(runId, "enrich", "done", `${person.fullName ?? "Contact"} already has email + LinkedIn`, { contactId: contact.id });
        }
      } catch (err) {
        await addStep(runId, "enrich", "error", `Failed enriching ${person.fullName ?? "contact"}: ${String(err)}`);
      }
    }

    await prisma.agentRun.update({ where: { id: runId }, data: { contactsEnriched: enriched } });

    // ── Step 3: Draft outreach emails ────────────────────────────────────
    let drafted = 0;
    let sent = 0;
    const template = DEFAULT_TEMPLATES.find((t) => t.id === preferredTemplateId) ?? DEFAULT_TEMPLATES[DEFAULT_TEMPLATES.length - 1];

    // Load user name from DB user record
    const userRecord = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
    const senderName = userRecord?.email?.split("@")[0] ?? "Me";

    for (const contactId of enrichedContactIds) {
      const contact = await prisma.enrichedContact.findUnique({
        where: { id: contactId },
        include: { application: { select: { role: true, company: true, appliedAt: true } } },
      });

      if (!contact) continue;
      if (channel === "email" && !contact.email) {
        await addStep(runId, "draft", "skipped", `Skipping ${contact.fullName ?? "contact"} — no email address`);
        continue;
      }

      await addStep(runId, "draft", "running", `Drafting outreach for ${contact.fullName ?? "contact"}…`);

      try {
        const draft = await generateDraft({
          template,
          contact: {
            fullName: contact.fullName,
            title: contact.title,
            company: contact.company,
            linkedinUrl: contact.linkedinUrl,
          },
          application: {
            role: contact.application.role,
            company: contact.application.company,
            appliedAt: contact.application.appliedAt?.toISOString() ?? null,
          },
          senderName,
        });

        // Check for an existing draft for this contact
        const existingMsg = await prisma.outreachMessage.findFirst({
          where: { contactId, applicationId, status: "draft" },
        });

        let messageId: string;
        if (existingMsg) {
          await prisma.outreachMessage.update({
            where: { id: existingMsg.id },
            data: { subject: draft.subject, body: draft.body },
          });
          messageId = existingMsg.id;
        } else {
          const msg = await prisma.outreachMessage.create({
            data: {
              contactId,
              applicationId,
              userId,
              channel,
              subject: draft.subject,
              body: draft.body,
              status: "draft",
            },
          });
          messageId = msg.id;
        }

        drafted++;
        await addStep(runId, "draft", "done", `Drafted email for ${contact.fullName ?? "contact"}`, { messageId });

        // ── Step 4: Auto-send if configured ───────────────────────────
        if (autoSend && channel === "email" && contact.email) {
          await addStep(runId, "send", "running", `Sending email to ${contact.fullName ?? contact.email}…`);
          try {
            const result = await sendEmailViaGmail({
              userId,
              to: contact.email,
              subject: draft.subject ?? `Reaching out — ${contact.company}`,
              body: draft.body,
            });

            if (result.success) {
              await prisma.outreachMessage.update({
                where: { id: messageId },
                data: { status: "sent", sentAt: new Date() },
              });
              sent++;
              await addStep(runId, "send", "done", `Sent to ${contact.email}`);
            } else {
              await addStep(runId, "send", "error", `Send failed: ${result.error}`);
            }
          } catch (err) {
            await addStep(runId, "send", "error", `Send error: ${String(err)}`);
          }
        }
      } catch (err) {
        await addStep(runId, "draft", "error", `Draft failed for ${contact.fullName ?? "contact"}: ${String(err)}`);
      }
    }

    // ── Finalize run ──────────────────────────────────────────────────────
    const finalStatus = autoSend ? "completed" : drafted > 0 ? "pending_approval" : "completed";

    await prisma.agentRun.update({
      where: { id: runId },
      data: {
        status: finalStatus as never,
        contactsFound: topPeople.length,
        contactsEnriched: enriched,
        emailsDrafted: drafted,
        emailsSent: sent,
        completedAt: new Date(),
      },
    });

    return { runId, contactsFound: topPeople.length, contactsEnriched: enriched, emailsDrafted: drafted, emailsSent: sent, status: finalStatus };
  } catch (err) {
    const errorMsg = String(err);
    await prisma.agentRun.update({
      where: { id: runId },
      data: { status: "failed", error: errorMsg, completedAt: new Date() },
    });
    return { runId, contactsFound: 0, contactsEnriched: 0, emailsDrafted: 0, emailsSent: 0, status: "failed", error: errorMsg };
  }
}

/** Get or create a default AgentConfig for a user */
export async function getOrCreateAgentConfig(userId: string) {
  const prisma = requirePrisma();
  const existing = await prisma.agentConfig.findUnique({ where: { userId } });
  if (existing) return existing;

  return prisma.agentConfig.create({
    data: {
      userId,
      enabled: true,
      targetTitles: DEFAULT_TARGET_TITLES,
      maxContacts: 3,
      autoSend: false,
      preferredTemplate: "executive-intro",
      channel: "email",
    },
  });
}
