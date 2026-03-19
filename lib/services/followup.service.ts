import { requirePrisma } from "@/lib/prisma";

const FOLLOW_UP_DAYS_APPLIED = 5;
const FOLLOW_UP_DAYS_WAITING = 7;
const FOLLOW_UP_DAYS_SCHEDULING = 2;
const FOLLOW_UP_DAYS_INTERVIEWING = 3;

function classifyUrgency(params: {
  stage: string;
  daysSinceActivity: number;
  everEngaged: boolean;
}): "urgent" | "high" | "normal" | "low" {
  if (params.stage === "Scheduling" && params.daysSinceActivity >= FOLLOW_UP_DAYS_SCHEDULING) {
    return "urgent";
  }
  if (
    (params.stage === "Interviewing" || params.stage === "Assessment") &&
    params.daysSinceActivity >= FOLLOW_UP_DAYS_INTERVIEWING
  ) {
    return "high";
  }
  if (params.stage === "Applied" && params.daysSinceActivity >= FOLLOW_UP_DAYS_APPLIED) {
    return "normal";
  }
  if (params.stage === "Waiting" && params.daysSinceActivity >= FOLLOW_UP_DAYS_WAITING) {
    return params.everEngaged ? "high" : "normal";
  }
  return "low";
}

function nextStepDate(urgency: "urgent" | "high" | "normal" | "low"): Date {
  const now = new Date();
  if (urgency === "urgent") return now;
  const d = new Date(now);
  d.setDate(now.getDate() + (urgency === "high" ? 1 : urgency === "normal" ? 3 : 7));
  return d;
}

export async function generateFollowUpSuggestions(userId: string): Promise<void> {
  const prisma = requirePrisma();
  const now = new Date();

  const applications = await prisma.application.findMany({
    where: {
      userId,
      stage: { in: ["Applied", "Waiting", "Scheduling", "Interviewing", "Assessment"] },
    },
    select: {
      id: true,
      company: true,
      role: true,
      stage: true,
      lastActivityAt: true,
      events: {
        select: { id: true },
      },
      followUps: {
        where: { dismissed: false, completed: false },
        select: { id: true, createdAt: true },
      },
    },
  });

  for (const app of applications) {
    // Skip if there's already an active follow-up suggestion
    if (app.followUps.length > 0) continue;

    const daysSinceActivity = Math.floor(
      (now.getTime() - app.lastActivityAt.getTime()) / (1000 * 60 * 60 * 24)
    );

    const threshold =
      app.stage === "Applied"
        ? FOLLOW_UP_DAYS_APPLIED
        : app.stage === "Waiting"
        ? FOLLOW_UP_DAYS_WAITING
        : app.stage === "Scheduling"
        ? FOLLOW_UP_DAYS_SCHEDULING
        : FOLLOW_UP_DAYS_INTERVIEWING;

    if (daysSinceActivity >= threshold) {
      const everEngaged = app.events.length > 0 && app.stage !== "Applied";
      const urgency = classifyUrgency({
        stage: app.stage,
        daysSinceActivity,
        everEngaged,
      });
      const reason = buildFollowUpReason(app.company, app.role, app.stage, daysSinceActivity);
      const recommendedAction =
        urgency === "urgent"
          ? "Follow up now"
          : urgency === "high"
          ? "Send follow-up within 24h"
          : urgency === "normal"
          ? "Send follow-up this week"
          : "Monitor";

      await prisma.followUpSuggestion.create({
        data: {
          userId,
          applicationId: app.id,
          reason,
          dueAt: now,
          urgency: urgency as never,
          recommendedAction,
          recommendationReason:
            app.stage === "Scheduling"
              ? "Open scheduling loop without confirmed calendar invite."
              : `No meaningful response in ${daysSinceActivity} days at ${app.stage} stage.`,
          daysSinceLastTouch: daysSinceActivity,
          nextStepDate: nextStepDate(urgency),
          generatedBy: "intelligence_v2",
        },
      });
    }
  }
}

function buildFollowUpReason(
  company: string,
  role: string | null,
  stage: string,
  days: number
): string {
  const roleStr = role ? ` for ${role}` : "";
  if (stage === "Applied") {
    return `No response from ${company}${roleStr} after ${days} days. Consider sending a follow-up email.`;
  }
  return `${company}${roleStr} has been quiet for ${days} days. Consider checking in.`;
}

export async function dismissFollowUp(userId: string, followUpId: string): Promise<void> {
  const prisma = requirePrisma();
  await prisma.followUpSuggestion.update({
    where: { id: followUpId, userId },
    data: { dismissed: true, dismissedAt: new Date() },
  });
}

export async function completeFollowUp(userId: string, followUpId: string): Promise<void> {
  const prisma = requirePrisma();
  await prisma.followUpSuggestion.update({
    where: { id: followUpId, userId },
    data: { completed: true, completedAt: new Date() },
  });
}

export async function getFollowUpSuggestions(userId: string) {
  const prisma = requirePrisma();
  return prisma.followUpSuggestion.findMany({
    where: { userId, dismissed: false, completed: false },
    include: {
      application: {
        select: { id: true, company: true, role: true, stage: true, nextActionDate: true },
      },
    },
    orderBy: [{ urgency: "asc" }, { dueAt: "asc" }],
    take: 25,
  });
}
