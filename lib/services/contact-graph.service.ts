import Anthropic from "@anthropic-ai/sdk";
import { requirePrisma } from "@/lib/prisma";
import {
  buildGoogleSearchUrl,
  isLikelyCompanyDomain,
  normalizeName,
} from "./contact-graph.utils";

interface GraphMessage {
  id: string;
  threadId: string;
  fromName: string | null;
  fromEmail: string | null;
  subject: string | null;
  snippet: string | null;
  bodyText: string | null;
  receivedAt: Date;
}

interface TitleCandidate {
  title: string;
  confidence: number;
  sourceMessageId: string | null;
  snippet: string | null;
}

interface ContactCluster {
  key: string;
  fullName: string | null;
  emails: Map<string, number>;
  domains: Set<string>;
  messages: GraphMessage[];
  titleCandidates: TitleCandidate[];
}

interface PreparedContact {
  fullName: string | null;
  primaryEmail: string | null;
  inferredTitle: string | null;
  confidence: number;
  webProfileUrl: string | null;
  messages: GraphMessage[];
  titleEvidence: TitleCandidate[];
  additionalEmails: string[];
  companyDomain: string | null;
}

interface ViewerIdentity {
  emails: Set<string>;
  nameTokens: Set<string>;
}

interface MentionedPerson {
  email: string;
  fullName: string | null;
}

const TITLE_KEYWORDS = [
  "head of",
  "vp ",
  "vice president",
  "director",
  "manager",
  "recruiter",
  "talent acquisition",
  "chief",
  "founder",
  "partner",
  "coordinator",
  "engineer",
  "specialist",
  "lead",
  "principal",
];

let anthropicClient: Anthropic | null = null;

function getAnthropicClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!anthropicClient) {
    anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return anthropicClient;
}

function normalizeEmail(email: string | null): string {
  return (email ?? "").trim().toLowerCase();
}

function extractDomain(email: string | null): string | null {
  const normalized = normalizeEmail(email);
  if (!normalized.includes("@")) return null;
  return normalized.split("@")[1] ?? null;
}

function extractNameTokensFromEmail(email: string | null): string[] {
  const normalized = normalizeEmail(email);
  if (!normalized || !normalized.includes("@")) return [];
  const local = normalized.split("@")[0] ?? "";
  return local
    .split(/[._\-+]/)
    .map((part) => part.trim())
    .filter((part) => part.length >= 2);
}

function isLikelyPersonEmail(email: string | null): boolean {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;
  const local = normalized.split("@")[0] ?? "";
  if (!local) return false;
  return !/(no-?reply|donotreply|notifications|alerts|jobs|careers|support)/i.test(local);
}

function extractEmailsFromText(text: string): string[] {
  const matches = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-z]{2,}/g) ?? [];
  return [...new Set(matches.map((value) => normalizeEmail(value)))];
}

function extractMentionedPeopleFromText(text: string): MentionedPerson[] {
  const results: MentionedPerson[] = [];
  const seen = new Set<string>();

  const nameEmailRegex = /([A-Za-z][A-Za-z .,'-]{1,80})\s*<([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-z]{2,})>/g;
  let match: RegExpExecArray | null;
  while ((match = nameEmailRegex.exec(text)) !== null) {
    const fullName = normalizeName(match[1]).replace(/\s+/g, " ").trim();
    const email = normalizeEmail(match[2]);
    if (!email) continue;
    const key = `${email}|${fullName}`;
    if (seen.has(key)) continue;
    seen.add(key);
    results.push({
      email,
      fullName: fullName ? match[1].trim() : null,
    });
  }

  const wroteRegex = /on\s.+?\s([A-Za-z][A-Za-z .,'-]{1,80})\s*<([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-z]{2,})>\s+wrote:/gi;
  while ((match = wroteRegex.exec(text)) !== null) {
    const fullName = match[1]?.trim() ?? null;
    const email = normalizeEmail(match[2]);
    if (!email) continue;
    const key = `${email}|${normalizeName(fullName)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    results.push({ email, fullName });
  }

  return results;
}

function isViewerIdentityMessage(
  message: GraphMessage,
  viewerIdentity: ViewerIdentity
): boolean {
  const email = normalizeEmail(message.fromEmail);
  if (email && viewerIdentity.emails.has(email)) return true;
  const normalizedName = normalizeName(message.fromName);
  if (!normalizedName) return false;
  const parts = normalizedName.split(" ").filter(Boolean);
  if (parts.length === 0) return false;
  const overlap = parts.filter((part) => viewerIdentity.nameTokens.has(part)).length;
  return overlap >= Math.min(2, parts.length);
}

function scoreRecency(receivedAt: Date): number {
  const ageDays = Math.max(0, (Date.now() - receivedAt.getTime()) / (24 * 60 * 60 * 1000));
  if (ageDays <= 14) return 0.25;
  if (ageDays <= 60) return 0.15;
  if (ageDays <= 180) return 0.08;
  return 0.03;
}

function guessTitleFromText(message: GraphMessage): TitleCandidate[] {
  const candidates: TitleCandidate[] = [];
  const text = `${message.subject ?? ""}\n${message.snippet ?? ""}\n${message.bodyText ?? ""}`;
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const signatureLines = lines.slice(Math.max(0, lines.length - 30));

  for (const line of signatureLines) {
    const normalizedLine = line.toLowerCase();
    if (!TITLE_KEYWORDS.some((k) => normalizedLine.includes(k))) continue;
    if (line.length < 3 || line.length > 100) continue;
    if (/@|http|www\.|linkedin/i.test(line)) continue;
    candidates.push({
      title: line,
      confidence: 0.45 + scoreRecency(message.receivedAt),
      sourceMessageId: message.id,
      snippet: line,
    });
  }

  const introMatch = text.match(
    /\b(?:i am|i'm|this is|my name is)\s+[a-z .'-]{2,40},?\s+(?:the\s+)?([a-z][a-z/&,\-\s]{2,70})\s+at\b/i
  );
  if (introMatch?.[1]) {
    candidates.push({
      title: introMatch[1].trim(),
      confidence: 0.62 + scoreRecency(message.receivedAt),
      sourceMessageId: message.id,
      snippet: introMatch[0],
    });
  }

  const linkedinSnippetMatch = text.match(
    /\b[A-Z][A-Za-z .'-]{1,60}\s*[-|]\s*([A-Za-z][A-Za-z/&,\-\s]{2,80})\s*[-|]\s*[A-Za-z][A-Za-z .'-]{1,80}\s*\|?\s*LinkedIn/i
  );
  if (linkedinSnippetMatch?.[1]) {
    candidates.push({
      title: linkedinSnippetMatch[1].trim(),
      confidence: 0.58 + scoreRecency(message.receivedAt),
      sourceMessageId: message.id,
      snippet: linkedinSnippetMatch[0],
    });
  }

  return candidates;
}

function selectBestTitle(
  cluster: ContactCluster
): { title: string | null; confidence: number; evidence: TitleCandidate[] } {
  if (cluster.titleCandidates.length === 0) {
    return { title: null, confidence: 0, evidence: [] };
  }
  const grouped = new Map<string, { title: string; score: number; evidence: TitleCandidate[] }>();
  for (const candidate of cluster.titleCandidates) {
    const key = candidate.title.toLowerCase();
    const existing = grouped.get(key);
    if (existing) {
      existing.score += candidate.confidence;
      existing.evidence.push(candidate);
    } else {
      grouped.set(key, {
        title: candidate.title,
        score: candidate.confidence,
        evidence: [candidate],
      });
    }
  }
  const sorted = [...grouped.values()].sort((a, b) => b.score - a.score);
  const best = sorted[0];
  const confidence = Math.min(1, best.score / Math.max(1, cluster.messages.length));
  return { title: best.title, confidence, evidence: best.evidence.slice(0, 5) };
}

async function inferTitleWithLlm(params: {
  company: string;
  personName: string | null;
  primaryEmail: string | null;
  messages: GraphMessage[];
}): Promise<{ inferredTitle: string | null; confidence: number }> {
  const client = getAnthropicClient();
  if (!client) return { inferredTitle: null, confidence: 0 };

  const compactMessages = params.messages
    .slice(0, 10)
    .map((m) => {
      const preview = `${m.subject ?? ""}\n${m.snippet ?? ""}\n${(m.bodyText ?? "").slice(0, 350)}`;
      return `- ${preview}`;
    })
    .join("\n");

  const prompt = `You are inferring a contact's job title from mailbox messages.
Company: ${params.company}
Person name: ${params.personName ?? "unknown"}
Primary email: ${params.primaryEmail ?? "unknown"}

Messages:
${compactMessages}

Return ONLY valid JSON:
{
  "title": string | null,
  "confidence": number
}

Rules:
- confidence must be between 0 and 1
- if uncertain, title should be null
- prefer recruiter/hiring/team titles explicitly mentioned`;

  try {
    const response = await client.messages.create({
      model: "claude-3-5-haiku-20241022",
      max_tokens: 200,
      messages: [{ role: "user", content: prompt }],
    });
    const text = response.content[0]?.type === "text" ? response.content[0].text : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { inferredTitle: null, confidence: 0 };
    const parsed = JSON.parse(jsonMatch[0]) as { title?: unknown; confidence?: unknown };
    const inferredTitle =
      typeof parsed.title === "string" && parsed.title.trim().length > 0
        ? parsed.title.trim()
        : null;
    const confidence = Math.max(
      0,
      Math.min(1, typeof parsed.confidence === "number" ? parsed.confidence : 0)
    );
    return { inferredTitle, confidence };
  } catch {
    return { inferredTitle: null, confidence: 0 };
  }
}

function pickPrimaryEmail(emailCounts: Map<string, number>, companyDomains: Set<string>): string | null {
  const entries = [...emailCounts.entries()];
  if (entries.length === 0) return null;
  entries.sort((a, b) => {
    const aDomain = extractDomain(a[0]);
    const bDomain = extractDomain(b[0]);
    const aWorkBoost = aDomain && companyDomains.has(aDomain) ? 1000 : 0;
    const bWorkBoost = bDomain && companyDomains.has(bDomain) ? 1000 : 0;
    return b[1] + bWorkBoost - (a[1] + aWorkBoost);
  });
  return entries[0][0];
}

function mergeClusterForMessage(
  clusters: Map<string, ContactCluster>,
  emailToCluster: Map<string, string>,
  nameDomainToCluster: Map<string, string>,
  message: GraphMessage,
  companyDomains: Set<string>,
  viewerIdentity: ViewerIdentity,
  company: string
): ContactCluster | null {
  let latestCluster: ContactCluster | null = null;

  const upsertCandidate = (candidateEmail: string, candidateName: string | null) => {
    if (!candidateEmail || !isLikelyPersonEmail(candidateEmail)) return;
    if (viewerIdentity.emails.has(candidateEmail)) return;
    const candidateDomain = extractDomain(candidateEmail);
    if (!candidateDomain) return;
    if (
      !isLikelyCompanyDomain(candidateDomain, company) &&
      !companyDomains.has(candidateDomain)
    ) {
      return;
    }

    const normalizedName = normalizeName(candidateName);
    const nameDomainKey = normalizedName ? `${normalizedName}|${candidateDomain}` : null;
    let clusterKey =
      emailToCluster.get(candidateEmail) ??
      (nameDomainKey ? nameDomainToCluster.get(nameDomainKey) : null);

    if (!clusterKey) {
      clusterKey = `cluster:${candidateEmail}`;
      clusters.set(clusterKey, {
        key: clusterKey,
        fullName: candidateName,
        emails: new Map(),
        domains: new Set(),
        messages: [],
        titleCandidates: [],
      });
    }

    const cluster = clusters.get(clusterKey);
    if (!cluster) return;
    if (!cluster.fullName && candidateName) {
      cluster.fullName = candidateName;
    }
    cluster.emails.set(candidateEmail, (cluster.emails.get(candidateEmail) ?? 0) + 1);
    cluster.domains.add(candidateDomain);
    cluster.messages.push(message);
    cluster.titleCandidates.push(...guessTitleFromText(message));

    const bodyEmails = extractEmailsFromText(
      `${message.subject ?? ""}\n${message.snippet ?? ""}\n${message.bodyText ?? ""}`
    );
    for (const discoveredEmail of bodyEmails) {
      if (!isLikelyPersonEmail(discoveredEmail)) continue;
      if (viewerIdentity.emails.has(discoveredEmail)) continue;
      const discoveredDomain = extractDomain(discoveredEmail);
      if (!discoveredDomain) continue;
      if (discoveredDomain !== candidateDomain && !companyDomains.has(discoveredDomain)) continue;
      if (discoveredEmail === candidateEmail) continue;
      cluster.emails.set(discoveredEmail, (cluster.emails.get(discoveredEmail) ?? 0) + 1);
    }

    emailToCluster.set(candidateEmail, clusterKey);
    if (nameDomainKey) nameDomainToCluster.set(nameDomainKey, clusterKey);
    latestCluster = cluster;
  };

  // 1) Sender (if not viewer identity)
  if (!isViewerIdentityMessage(message, viewerIdentity)) {
    const senderEmail = normalizeEmail(message.fromEmail);
    upsertCandidate(senderEmail, message.fromName ?? null);
  }

  // 2) Mentioned people in quoted chains/signatures, e.g. "Caroline <caroline@vertice.one>"
  const mentions = extractMentionedPeopleFromText(
    `${message.subject ?? ""}\n${message.snippet ?? ""}\n${message.bodyText ?? ""}`
  );
  for (const mention of mentions) {
    upsertCandidate(mention.email, mention.fullName);
  }

  return latestCluster;
}

async function loadGraphMessages(userId: string, applicationId: string): Promise<{
  company: string;
  companyDomains: Set<string>;
  messages: GraphMessage[];
  viewerIdentity: ViewerIdentity;
}> {
  const prisma = requirePrisma();
  const [application, user, connectedAccount] = await Promise.all([
    prisma.application.findFirst({
      where: { id: applicationId, userId },
      select: { id: true, company: true, threadIds: true },
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    }),
    prisma.connectedAccount.findUnique({
      where: { userId },
      select: { email: true },
    }),
  ]);
  if (!application) {
    return {
      company: "",
      companyDomains: new Set(),
      messages: [],
      viewerIdentity: { emails: new Set(), nameTokens: new Set() },
    };
  }

  const viewerEmails = new Set(
    [user?.email, connectedAccount?.email]
      .map((value) => normalizeEmail(value ?? null))
      .filter(Boolean)
  );
  const viewerNameTokens = new Set(
    [...viewerEmails].flatMap((email) => extractNameTokensFromEmail(email))
  );

  const seedMessages = await prisma.emailMessage.findMany({
    where: {
      userId,
      OR: [{ applicationId }, { threadId: { in: application.threadIds } }],
    },
    orderBy: { receivedAt: "desc" },
    select: {
      id: true,
      threadId: true,
      fromName: true,
      fromEmail: true,
      subject: true,
      snippet: true,
      bodyText: true,
      receivedAt: true,
    },
  });

  const senderEmails = new Set(
    seedMessages
      .map((m) => normalizeEmail(m.fromEmail))
      .filter((e) => !!e)
  );
  const companyDomains = new Set<string>();
  for (const msg of seedMessages) {
    const domain = extractDomain(msg.fromEmail);
    if (!domain) continue;
    if (isLikelyCompanyDomain(domain, application.company)) {
      companyDomains.add(domain);
    }
  }

  const relatedMessages = await prisma.emailMessage.findMany({
    where: {
      userId,
      OR: [
        { applicationId },
        { threadId: { in: application.threadIds } },
        senderEmails.size > 0 ? { fromEmail: { in: [...senderEmails] } } : undefined,
        ...[...companyDomains].map((domain) => ({
          fromEmail: { endsWith: `@${domain}` },
        })),
      ].filter(Boolean) as Array<Record<string, unknown>>,
    },
    orderBy: { receivedAt: "desc" },
    take: 1800,
    select: {
      id: true,
      threadId: true,
      fromName: true,
      fromEmail: true,
      subject: true,
      snippet: true,
      bodyText: true,
      receivedAt: true,
    },
  });

  return {
    company: application.company,
    companyDomains,
    messages: relatedMessages,
    viewerIdentity: {
      emails: viewerEmails,
      nameTokens: viewerNameTokens,
    },
  };
}

export interface ApplicationContactSummary {
  id: string;
  fullName: string | null;
  primaryEmail: string | null;
  inferredTitle: string | null;
  webProfileUrl: string | null;
  confidence: number;
  additionalEmails: string[];
}

export async function recomputeContactGraphForApplication(
  userId: string,
  applicationId: string
): Promise<{ contactsCreated: number }> {
  const prisma = requirePrisma();
  const { company, companyDomains, messages, viewerIdentity } = await loadGraphMessages(
    userId,
    applicationId
  );
  if (!company) return { contactsCreated: 0 };

  const clusters = new Map<string, ContactCluster>();
  const emailToCluster = new Map<string, string>();
  const nameDomainToCluster = new Map<string, string>();

  for (const message of messages) {
    mergeClusterForMessage(
      clusters,
      emailToCluster,
      nameDomainToCluster,
      message,
      companyDomains,
      viewerIdentity,
      company
    );
  }

  const prepared: PreparedContact[] = [];
  for (const cluster of clusters.values()) {
    if (cluster.messages.length === 0) continue;
    const primaryEmail = pickPrimaryEmail(cluster.emails, companyDomains);
    const deterministic = selectBestTitle(cluster);
    let inferredTitle = deterministic.title;
    let confidence = deterministic.confidence;

    if ((!inferredTitle || confidence < 0.45) && cluster.messages.length > 0) {
      const llm = await inferTitleWithLlm({
        company,
        personName: cluster.fullName,
        primaryEmail,
        messages: cluster.messages,
      });
      if (llm.inferredTitle && llm.confidence > confidence) {
        inferredTitle = llm.inferredTitle;
        confidence = llm.confidence;
      }
    }

    const additionalEmails = [...cluster.emails.keys()].filter((e) => e !== primaryEmail);
    const webProfileUrl = buildGoogleSearchUrl(cluster.fullName, company, primaryEmail);
    prepared.push({
      fullName: cluster.fullName,
      primaryEmail,
      inferredTitle,
      confidence,
      webProfileUrl,
      messages: cluster.messages,
      titleEvidence: deterministic.evidence,
      additionalEmails,
      companyDomain:
        (primaryEmail ? extractDomain(primaryEmail) : null) ??
        [...cluster.domains][0] ??
        null,
    });
  }

  prepared.sort((a, b) => b.confidence - a.confidence);

  await prisma.$transaction(async (tx) => {
    await tx.applicationContact.deleteMany({
      where: { applicationId, userId },
    });

    for (const entry of prepared.slice(0, 40)) {
      const created = await tx.applicationContact.create({
        data: {
          applicationId,
          userId,
          companyDomain: entry.companyDomain ?? undefined,
          primaryEmail: entry.primaryEmail ?? undefined,
          fullName: entry.fullName ?? undefined,
          inferredTitle: entry.inferredTitle ?? undefined,
          webProfileUrl: entry.webProfileUrl ?? undefined,
          confidence: entry.confidence,
          lastResolvedAt: new Date(),
          emails: {
            create: [
              ...(entry.primaryEmail
                ? [
                    {
                      email: entry.primaryEmail,
                      emailType: "primary" as const,
                      source: "mailbox_graph",
                      isPrimary: true,
                    },
                  ]
                : []),
              ...entry.additionalEmails.map((email) => ({
                email,
                emailType:
                  extractDomain(email) && companyDomains.has(extractDomain(email) ?? "")
                    ? ("work" as const)
                    : ("unknown" as const),
                source: "mailbox_graph",
                isPrimary: false,
              })),
            ],
          },
        },
      });

      const evidenceRows: Array<{
        title: string;
        confidence: number;
        sourceMessageId: string | null;
        snippet: string | null;
      }> = entry.titleEvidence.length
        ? entry.titleEvidence
        : entry.messages.slice(0, 2).map((msg) => ({
            title: entry.inferredTitle ?? "",
            confidence: entry.confidence,
            sourceMessageId: msg.id,
            snippet: msg.snippet ?? msg.subject ?? null,
          }));

      for (const evidence of evidenceRows) {
        await tx.contactEvidence.create({
          data: {
            contactId: created.id,
            emailMessageId: evidence.sourceMessageId ?? undefined,
            threadId:
              entry.messages.find((m) => m.id === evidence.sourceMessageId)?.threadId ??
              entry.messages[0]?.threadId,
            sourceEmail: entry.primaryEmail ?? undefined,
            snippet: evidence.snippet ?? undefined,
            extractedTitle: evidence.title ?? undefined,
            confidence: evidence.confidence,
          },
        });
      }
    }
  });

  return { contactsCreated: Math.min(prepared.length, 40) };
}

export async function recomputeContactGraphForUser(
  userId: string,
  options?: { daysBack?: number; limit?: number }
): Promise<{ applicationsProcessed: number; contactsCreated: number }> {
  const prisma = requirePrisma();
  const daysBack = options?.daysBack ?? 180;
  const limit = options?.limit ?? 120;
  const cutoff = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);
  const apps = await prisma.application.findMany({
    where: {
      userId,
      OR: [{ appliedAt: { gte: cutoff } }, { lastActivityAt: { gte: cutoff } }],
    },
    orderBy: { lastActivityAt: "desc" },
    take: limit,
    select: { id: true },
  });

  let contactsCreated = 0;
  for (const app of apps) {
    const result = await recomputeContactGraphForApplication(userId, app.id);
    contactsCreated += result.contactsCreated;
  }
  return { applicationsProcessed: apps.length, contactsCreated };
}

export async function getApplicationContactSummaries(
  userId: string,
  applicationIds: string[]
): Promise<Record<string, ApplicationContactSummary[]>> {
  if (applicationIds.length === 0) return {};
  const prisma = requirePrisma();
  const contacts = await prisma.applicationContact.findMany({
    where: {
      userId,
      applicationId: { in: applicationIds },
    },
    include: {
      emails: {
        orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
      },
    },
    orderBy: [{ confidence: "desc" }, { updatedAt: "desc" }],
  });

  const grouped: Record<string, ApplicationContactSummary[]> = {};
  for (const contact of contacts) {
    if (!grouped[contact.applicationId]) grouped[contact.applicationId] = [];
    grouped[contact.applicationId].push({
      id: contact.id,
      fullName: contact.fullName,
      primaryEmail: contact.primaryEmail,
      inferredTitle: contact.inferredTitle,
      webProfileUrl: contact.webProfileUrl,
      confidence: contact.confidence,
      additionalEmails: contact.emails
        .filter((e) => !e.isPrimary)
        .map((e) => e.email)
        .slice(0, 3),
    });
  }
  return grouped;
}

