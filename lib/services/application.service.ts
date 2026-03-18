import { requirePrisma } from "@/lib/prisma";
import { findExistingApplication } from "@/lib/classification/deduplication";
import type { ClassificationResult, ParsedEmail, ApplicationStage } from "@/types";

// Stage priority: higher index = more advanced stage
const STAGE_PRIORITY: ApplicationStage[] = [
  "Applied",
  "Waiting",
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

export async function getApplicationsForUser(
  userId: string,
  filters?: { stage?: ApplicationStage }
) {
  const prisma = requirePrisma();
  return prisma.application.findMany({
    where: {
      userId,
      ...(filters?.stage ? { stage: filters.stage } : {}),
    },
    include: {
      recruiter: true,
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

export async function getDashboardStats(userId: string) {
  const prisma = requirePrisma();
  const [counts, pendingFollowUps] = await Promise.all([
    prisma.application.groupBy({
      by: ["stage"],
      where: { userId },
      _count: { id: true },
    }),
    prisma.followUpSuggestion.count({
      where: { userId, dismissed: false, completed: false },
    }),
  ]);

  const stageMap = Object.fromEntries(counts.map((c: { stage: string; _count: { id: number } }) => [c.stage, c._count.id]));

  return {
    total: counts.reduce((sum: number, c: { _count: { id: number } }) => sum + c._count.id, 0),
    applied: stageMap["Applied"] ?? 0,
    waiting: stageMap["Waiting"] ?? 0,
    assessment: stageMap["Assessment"] ?? 0,
    interviewing: stageMap["Interviewing"] ?? 0,
    offers: stageMap["Offer"] ?? 0,
    rejected: stageMap["Rejected"] ?? 0,
    pendingFollowUps,
  };
}
