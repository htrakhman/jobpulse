import { requirePrisma } from "@/lib/prisma";
import { findExistingApplication } from "@/lib/classification/deduplication";
import type { ClassificationResult, ParsedEmail, ApplicationStage } from "@/types";

// Stage priority: higher index = more advanced stage
const STAGE_PRIORITY: ApplicationStage[] = [
  "Applied",
  "Waiting",
  "Scheduling",
  "Assessment",
  "Interviewing",
  "Offer",
  "Rejected",
  "Closed",
];

function shouldUpdateStage(current: ApplicationStage, incoming: ApplicationStage): boolean {
  // Never move back from Rejected or Closed
  if (current === "Rejected" || current === "Closed") return false;

  const currentIdx = STAGE_PRIORITY.indexOf(current);
  const incomingIdx = STAGE_PRIORITY.indexOf(incoming);

  return incomingIdx > currentIdx;
}

export async function upsertApplication(
  userId: string,
  email: ParsedEmail,
  classification: ClassificationResult
): Promise<string> {
  const prisma = requirePrisma();
  const existingId = await findExistingApplication(userId, email, classification);

  if (existingId) {
    return updateApplication(existingId, userId, email, classification);
  } else {
    return createApplication(userId, email, classification);
  }
}

async function createApplication(
  userId: string,
  email: ParsedEmail,
  classification: ClassificationResult
): Promise<string> {
  const prisma = requirePrisma();
  const company = classification.company ?? extractCompanyFromEmail(email);

  if (!company) {
    // Store the email without an application if we can't identify company
    await storeEmailMessage(userId, email, classification, null);
    return "";
  }

  const application = await prisma.application.create({
    data: {
      userId,
      company,
      role: classification.role ?? null,
      stage: classification.stage,
      appliedAt:
        classification.emailType === "application_confirmation"
          ? email.receivedAt
          : null,
      lastActivityAt: email.receivedAt,
      threadIds: [email.threadId],
      atsProvider: classification.atsProvider ?? null,
    },
  });

  // Create recruiter contact if we have info
  if (classification.recruiterName || classification.recruiterEmail) {
    await prisma.recruiterContact.create({
      data: {
        applicationId: application.id,
        name: classification.recruiterName ?? null,
        email: classification.recruiterEmail ?? null,
        lastSeenAt: email.receivedAt,
      },
    });
  }

  // Store email and event
  const emailRecord = await storeEmailMessage(userId, email, classification, application.id);

  await prisma.applicationEvent.create({
    data: {
      applicationId: application.id,
      emailId: emailRecord,
      stage: classification.stage,
      emailType: classification.emailType,
      summary: buildEventSummary(classification),
      occurredAt: email.receivedAt,
    },
  });

  return application.id;
}

async function updateApplication(
  applicationId: string,
  userId: string,
  email: ParsedEmail,
  classification: ClassificationResult
): Promise<string> {
  const prisma = requirePrisma();
  const application = await prisma.application.findUnique({
    where: { id: applicationId },
    include: { recruiter: true },
  });

  if (!application) return applicationId;

  const updateData: Record<string, unknown> = {
    lastActivityAt: email.receivedAt,
  };

  // Update role if we now have one
  if (!application.role && classification.role) {
    updateData.role = classification.role;
  }

  // Update ATS if not set
  if (!application.atsProvider && classification.atsProvider) {
    updateData.atsProvider = classification.atsProvider;
  }

  // Advance stage if appropriate
  if (shouldUpdateStage(application.stage as ApplicationStage, classification.stage)) {
    updateData.stage = classification.stage;
  }

  // Add thread ID if not already tracked
  if (!application.threadIds.includes(email.threadId)) {
    updateData.threadIds = [...application.threadIds, email.threadId];
  }

  // Set appliedAt if this is a confirmation and we don't have one
  if (classification.emailType === "application_confirmation" && !application.appliedAt) {
    updateData.appliedAt = email.receivedAt;
  }

  await prisma.application.update({
    where: { id: applicationId },
    data: updateData,
  });

  // Update recruiter info
  if (classification.recruiterName || classification.recruiterEmail) {
    await prisma.recruiterContact.upsert({
      where: { applicationId },
      create: {
        applicationId,
        name: classification.recruiterName ?? null,
        email: classification.recruiterEmail ?? null,
        lastSeenAt: email.receivedAt,
      },
      update: {
        name: classification.recruiterName ?? application.recruiter?.name ?? null,
        email: classification.recruiterEmail ?? application.recruiter?.email ?? null,
        lastSeenAt: email.receivedAt,
      },
    });
  }

  // Store email and event
  const emailRecord = await storeEmailMessage(userId, email, classification, applicationId);

  await prisma.applicationEvent.create({
    data: {
      applicationId,
      emailId: emailRecord,
      stage: classification.stage,
      emailType: classification.emailType,
      summary: buildEventSummary(classification),
      occurredAt: email.receivedAt,
    },
  });

  return applicationId;
}

async function storeEmailMessage(
  userId: string,
  email: ParsedEmail,
  classification: ClassificationResult,
  applicationId: string | null
): Promise<string> {
  const prisma = requirePrisma();
  await prisma.emailMessage.upsert({
    where: { id: email.id },
    create: {
      id: email.id,
      threadId: email.threadId,
      userId,
      subject: email.subject,
      fromName: email.fromName,
      fromEmail: email.fromEmail,
      snippet: email.snippet.slice(0, 500),
      bodyText: email.bodyText.slice(0, 3000),
      emailType: classification.emailType,
      receivedAt: email.receivedAt,
      applicationId,
    },
    update: {
      emailType: classification.emailType,
      applicationId: applicationId ?? undefined,
    },
  });
  return email.id;
}

function buildEventSummary(classification: ClassificationResult): string {
  const typeLabels: Record<string, string> = {
    application_confirmation: "Application confirmed",
    interview_request: "Interview requested",
    interview_scheduled: "Interview scheduled",
    assessment: "Assessment received",
    rejection: "Application rejected",
    offer: "Offer received",
    general_update: "Status update",
  };
  return typeLabels[classification.emailType] ?? "Email received";
}

function extractCompanyFromEmail(email: ParsedEmail): string | null {
  const domain = email.fromEmail?.split("@")[1];
  if (!domain) return null;

  const genericDomains = [
    "gmail.com",
    "yahoo.com",
    "hotmail.com",
    "outlook.com",
    "icloud.com",
    "ashbyhq.com",
    "lever.co",
    "greenhouse.io",
    "workday.com",
  ];
  if (genericDomains.some((d) => domain.includes(d))) return null;

  const base = domain.split(".")[0];
  return base.charAt(0).toUpperCase() + base.slice(1);
}

function normalizeCompanyKey(company: string): string {
  return company
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ");
}

const COMPANY_STOP_WORDS = new Set([
  "inc",
  "llc",
  "ltd",
  "corp",
  "co",
  "company",
  "recruiting",
  "recruitment",
  "careers",
  "career",
  "jobs",
  "job",
  "team",
  "the",
]);

function canonicalCompanyTokens(company: string): string[] {
  return normalizeCompanyKey(company)
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length > 1 && !COMPANY_STOP_WORDS.has(token));
}

function isSameCompanyName(a: string, b: string): boolean {
  const na = normalizeCompanyKey(a);
  const nb = normalizeCompanyKey(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if ((na.includes(nb) || nb.includes(na)) && Math.min(na.length, nb.length) >= 5) return true;

  const ta = canonicalCompanyTokens(a);
  const tb = canonicalCompanyTokens(b);
  if (ta.length === 0 || tb.length === 0) return false;
  const setB = new Set(tb);
  const intersection = ta.filter((token) => setB.has(token)).length;
  const union = new Set([...ta, ...tb]).size;
  const jaccard = union > 0 ? intersection / union : 0;
  return jaccard >= 0.75;
}

export async function getApplicationsForUser(
  userId: string,
  filters?: { stage?: ApplicationStage; stages?: ApplicationStage[] }
) {
  const prisma = requirePrisma();
  return prisma.application.findMany({
    where: {
      userId,
      ...(filters?.stages && filters.stages.length > 0
        ? { stage: { in: filters.stages } }
        : filters?.stage
        ? { stage: filters.stage }
        : {}),
    },
    include: {
      recruiter: true,
      emails: {
        select: {
          id: true,
          threadId: true,
          receivedAt: true,
        },
        orderBy: { receivedAt: "desc" },
        take: 1,
      },
      contacts: {
        include: {
          emails: {
            orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
            take: 4,
          },
        },
        orderBy: [{ confidence: "desc" }, { updatedAt: "desc" }],
        take: 3,
      },
      events: {
        orderBy: { occurredAt: "desc" },
        take: 1,
      },
      _count: {
        select: { emails: true, events: true },
      },
    },
    orderBy: { lastActivityAt: "desc" },
  });
}

export async function getApplicationById(userId: string, applicationId: string) {
  const prisma = requirePrisma();
  return prisma.application.findFirst({
    where: { id: applicationId, userId },
    include: {
      recruiter: true,
      contacts: {
        include: {
          emails: {
            orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
            take: 6,
          },
          evidence: {
            orderBy: { createdAt: "desc" },
            take: 5,
          },
        },
        orderBy: [{ confidence: "desc" }, { updatedAt: "desc" }],
      },
      events: {
        include: {
          email: {
            select: {
              subject: true,
              fromName: true,
              fromEmail: true,
              snippet: true,
              receivedAt: true,
            },
          },
        },
        orderBy: { occurredAt: "asc" },
      },
    },
  });
}

export async function getDashboardStats(userId: string, windowDays?: number) {
  const prisma = requirePrisma();
  const cutoff =
    typeof windowDays === "number" && windowDays > 0
      ? new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000)
      : null;
  const [applications, pendingFollowUps] = await Promise.all([
    prisma.application.findMany({
      where: {
        userId,
        ...(cutoff
          ? { OR: [{ appliedAt: { gte: cutoff } }, { lastActivityAt: { gte: cutoff } }] }
          : {}),
      },
      select: {
        id: true,
        company: true,
        stage: true,
        appliedAt: true,
        lastActivityAt: true,
      },
      orderBy: { lastActivityAt: "desc" },
    }),
    prisma.followUpSuggestion.count({
      where: { userId, dismissed: false, completed: false },
    }),
  ]);

  const byCompany = new Map<string, (typeof applications)[number]>();
  for (const app of applications) {
    const existingEntry = [...byCompany.entries()].find(([, current]) =>
      isSameCompanyName(current.company, app.company)
    );
    const key = existingEntry?.[0] ?? normalizeCompanyKey(app.company);
    const existing = existingEntry?.[1] ?? byCompany.get(key);
    if (!existing) {
      byCompany.set(key, app);
      continue;
    }
    const existingTime = existing.lastActivityAt.getTime();
    const incomingTime = app.lastActivityAt.getTime();
    if (incomingTime > existingTime) byCompany.set(key, app);
  }

  const deduped = [...byCompany.values()];
  const stageMap = new Map<ApplicationStage, number>();
  for (const stage of STAGE_PRIORITY) stageMap.set(stage, 0);
  for (const app of deduped) {
    stageMap.set(app.stage as ApplicationStage, (stageMap.get(app.stage as ApplicationStage) ?? 0) + 1);
  }

  return {
    total: deduped.length,
    applied: stageMap.get("Applied") ?? 0,
    waiting: stageMap.get("Waiting") ?? 0,
    scheduling: stageMap.get("Scheduling") ?? 0,
    assessment: stageMap.get("Assessment") ?? 0,
    interviewing: stageMap.get("Interviewing") ?? 0,
    offers: stageMap.get("Offer") ?? 0,
    rejected: stageMap.get("Rejected") ?? 0,
    pendingFollowUps,
  };
}

const ATS_OR_GENERIC_DOMAINS = [
  "gmail.com",
  "yahoo.com",
  "hotmail.com",
  "outlook.com",
  "icloud.com",
  "ashbyhq.com",
  "lever.co",
  "greenhouse.io",
  "workday.com",
  "myworkdayjobs.com",
  "smartrecruiters.com",
  "jobvite.com",
];

function normalizeCompanyToken(company: string): string {
  return company.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function extractDomain(email: string | null): string | null {
  if (!email || !email.includes("@")) return null;
  return email.split("@")[1]?.toLowerCase() ?? null;
}

function isLikelyCompanySender(emailDomain: string, company: string): boolean {
  if (!emailDomain) return false;
  if (ATS_OR_GENERIC_DOMAINS.some((d) => emailDomain.includes(d))) return false;

  const root = emailDomain.split(".")[0] ?? "";
  const companyToken = normalizeCompanyToken(company);
  if (!root || !companyToken) return false;
  return root.includes(companyToken) || companyToken.includes(root);
}

function detectInterviewRound(text: string): 0 | 1 | 2 | 3 {
  const t = text.toLowerCase();
  if (
    /(third\s+round|3rd\s+round|round\s*3|final\s+round|final interview)/i.test(t)
  ) {
    return 3;
  }
  if (/(second\s+round|2nd\s+round|round\s*2)/i.test(t)) {
    return 2;
  }
  if (
    /(first\s+round|1st\s+round|round\s*1|phone\s+screen|screening\s+call|recruiter\s+screen)/i.test(t)
  ) {
    return 1;
  }
  return 0;
}

function detectInviteSignals(text: string): boolean {
  return /(invitation:|calendar invite|google calendar|accepted:|declined:|proposed new time|join with google meet|zoom\.us|microsoft teams|teams\.microsoft)/i.test(
    text
  );
}

function hasInterviewLanguage(text: string): boolean {
  return /(interview|phone screen|screening call|hiring manager|panel interview|onsite|on-site)/i.test(
    text
  );
}

function extractLikelyInviteDate(text: string, referenceAt: Date): Date | null {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const dateFocused = lines
    .filter((line) => /(when:|date:|time:|invitation:|calendar)/i.test(line))
    .join("\n");
  const corpus = `${dateFocused}\n${text}`;
  const candidates: string[] = [];

  const isoMatches = corpus.match(
    /\b\d{4}-\d{2}-\d{2}(?:[ t]\d{1,2}:\d{2}(?::\d{2})?(?:\s?(?:am|pm))?)?(?:z|[+-]\d{2}:?\d{2})?\b/gi
  );
  if (isoMatches) candidates.push(...isoMatches);

  const monthMatches = corpus.match(
    /\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+\d{1,2}(?:st|nd|rd|th)?(?:,\s*\d{4})?(?:\s+(?:at\s+)?\d{1,2}(?::\d{2})?\s*(?:am|pm)?)?/gi
  );
  if (monthMatches) candidates.push(...monthMatches);

  const dayNameMatches = corpus.match(
    /\b(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday),?\s+(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+\d{1,2}(?:st|nd|rd|th)?(?:,\s*\d{4})?(?:\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?)?/gi
  );
  if (dayNameMatches) candidates.push(...dayNameMatches);

  let best: Date | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  const referenceMs = referenceAt.getTime();
  const maxDistanceMs = 400 * 24 * 60 * 60 * 1000;

  for (const rawCandidate of candidates) {
    const normalized = rawCandidate.replace(/\b(\d{1,2})(st|nd|rd|th)\b/gi, "$1");
    const parsedMs = Date.parse(normalized);
    if (!Number.isFinite(parsedMs)) continue;
    const distance = Math.abs(parsedMs - referenceMs);
    if (distance > maxDistanceMs) continue;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = new Date(parsedMs);
    }
  }

  return best;
}

function detectInviteDerivedStage(
  subject: string | null,
  snippet: string | null,
  bodyText: string | null,
  receivedAt: Date
): ApplicationStage | null {
  const text = `${subject ?? ""}\n${snippet ?? ""}\n${(bodyText ?? "").slice(0, 2500)}`;
  if (!hasInterviewLanguage(text)) return null;
  const inviteDate = extractLikelyInviteDate(text, receivedAt);
  const hasInvite = detectInviteSignals(text);
  const hasConfirmedSignal =
    hasInvite ||
    /(interview confirmed|your interview is scheduled|calendar invite attached|invite attached)/i.test(
      text
    );
  if (!hasInvite && !inviteDate) return null;
  if (!inviteDate) return "Scheduling";
  // Keep in Scheduling when we only have "next steps"/availability dates without explicit confirmation.
  if (!hasConfirmedSignal) return "Scheduling";
  return inviteDate.getTime() <= Date.now() ? "Interviewing" : "Scheduling";
}

export async function reconcileInterviewInvites(userId: string, daysBack: number): Promise<number> {
  const prisma = requirePrisma();
  const cutoff = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);
  const applications = await prisma.application.findMany({
    where: {
      userId,
      stage: { in: ["Applied", "Waiting", "Scheduling"] },
      OR: [{ appliedAt: { gte: cutoff } }, { lastActivityAt: { gte: cutoff } }],
    },
    select: {
      id: true,
      stage: true,
      emails: {
        select: {
          id: true,
          subject: true,
          snippet: true,
          bodyText: true,
          receivedAt: true,
        },
        orderBy: { receivedAt: "desc" },
      },
      events: {
        where: { emailType: "interview_scheduled" },
        select: { emailId: true, stage: true },
      },
    },
  });

  let updated = 0;
  for (const app of applications) {
    let inferredStage: ApplicationStage | null = null;
    let sourceEmailId: string | null = null;
    for (const email of app.emails) {
      const detected = detectInviteDerivedStage(
        email.subject,
        email.snippet,
        email.bodyText,
        email.receivedAt
      );
      if (!detected) continue;
      if (
        !inferredStage ||
        STAGE_PRIORITY.indexOf(detected) > STAGE_PRIORITY.indexOf(inferredStage)
      ) {
        inferredStage = detected;
        sourceEmailId = email.id;
      }
    }
    if (!inferredStage) continue;
    if (!shouldUpdateStage(app.stage as ApplicationStage, inferredStage)) continue;

    await prisma.application.update({
      where: { id: app.id },
      data: { stage: inferredStage },
    });

    const hasMatchingEvent = app.events.some(
      (event) => event.emailId === sourceEmailId && event.stage === inferredStage
    );
    if (!hasMatchingEvent) {
      await prisma.applicationEvent.create({
        data: {
          applicationId: app.id,
          emailId: sourceEmailId,
          stage: inferredStage,
          emailType: "interview_scheduled",
          summary:
            inferredStage === "Interviewing"
              ? "Interview likely completed (invite date passed)"
              : "Interview invite detected",
          occurredAt: new Date(),
        },
      });
    }
    updated++;
  }

  return updated;
}

export interface InterviewRoundMetrics {
  total: number;
  firstRoundCount: number;
  secondRoundCount: number;
  thirdRoundCount: number;
  firstRoundRate: number;
  secondRoundRate: number;
  thirdRoundRate: number;
}

export async function getInterviewRoundsByApplicationIds(
  userId: string,
  applicationIds: string[]
): Promise<Record<string, { round: 0 | 1 | 2 | 3; label: string | null }>> {
  const prisma = requirePrisma();
  if (applicationIds.length === 0) return {};

  const applications = await prisma.application.findMany({
    where: {
      userId,
      id: { in: applicationIds },
    },
    select: {
      id: true,
      company: true,
      emails: {
        select: {
          fromEmail: true,
          subject: true,
          snippet: true,
          bodyText: true,
          emailType: true,
        },
      },
    },
  });

  const toLabel = (round: 0 | 1 | 2 | 3): string | null => {
    if (round === 1) return "1st round";
    if (round === 2) return "2nd round";
    if (round === 3) return "3rd/final round";
    return null;
  };

  const result: Record<string, { round: 0 | 1 | 2 | 3; label: string | null }> = {};

  for (const app of applications) {
    let maxRound: 0 | 1 | 2 | 3 = 0;

    for (const email of app.emails) {
      const domain = extractDomain(email.fromEmail);
      if (!domain || !isLikelyCompanySender(domain, app.company)) continue;

      const text = `${email.subject ?? ""}\n${email.snippet ?? ""}\n${
        (email.bodyText ?? "").slice(0, 1200)
      }`;
      const detected = detectInterviewRound(text);
      if (detected > maxRound) {
        maxRound = detected;
      } else if (
        maxRound === 0 &&
        (email.emailType === "interview_request" || email.emailType === "interview_scheduled")
      ) {
        maxRound = 1;
      }
    }

    result[app.id] = {
      round: maxRound,
      label: toLabel(maxRound),
    };
  }

  return result;
}

export async function getInterviewRoundMetrics(
  userId: string,
  windowDays: number,
  stages?: ApplicationStage[]
): Promise<InterviewRoundMetrics> {
  const prisma = requirePrisma();
  const cutoff = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

  const applications = await prisma.application.findMany({
    where: {
      userId,
      ...(stages && stages.length > 0 ? { stage: { in: stages } } : {}),
      OR: [{ appliedAt: { gte: cutoff } }, { lastActivityAt: { gte: cutoff } }],
    },
    select: {
      id: true,
      company: true,
      emails: {
        select: {
          fromEmail: true,
          subject: true,
          snippet: true,
          bodyText: true,
          emailType: true,
        },
      },
    },
  });

  let firstRoundCount = 0;
  let secondRoundCount = 0;
  let thirdRoundCount = 0;

  for (const app of applications) {
    let maxRound: 0 | 1 | 2 | 3 = 0;

    for (const email of app.emails) {
      const domain = extractDomain(email.fromEmail);
      if (!domain || !isLikelyCompanySender(domain, app.company)) continue;

      const text = `${email.subject ?? ""}\n${email.snippet ?? ""}\n${
        (email.bodyText ?? "").slice(0, 1200)
      }`;
      const detected = detectInterviewRound(text);
      if (detected > maxRound) {
        maxRound = detected;
      } else if (
        maxRound === 0 &&
        (email.emailType === "interview_request" || email.emailType === "interview_scheduled")
      ) {
        maxRound = 1;
      }
    }

    if (maxRound >= 1) firstRoundCount++;
    if (maxRound >= 2) secondRoundCount++;
    if (maxRound >= 3) thirdRoundCount++;
  }

  const total = applications.length;
  const pct = (n: number) => (total ? (n / total) * 100 : 0);

  return {
    total,
    firstRoundCount,
    secondRoundCount,
    thirdRoundCount,
    firstRoundRate: pct(firstRoundCount),
    secondRoundRate: pct(secondRoundCount),
    thirdRoundRate: pct(thirdRoundCount),
  };
}
