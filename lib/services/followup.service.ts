import { requirePrisma } from "@/lib/prisma";

const FOLLOW_UP_DAYS_APPLIED = 7;
const FOLLOW_UP_DAYS_WAITING = 10;

export async function generateFollowUpSuggestions(userId: string): Promise<void> {
  const prisma = requirePrisma();
  const now = new Date();

  const applications = await prisma.application.findMany({
    where: {
      userId,
      stage: { in: ["Applied", "Waiting"] },
    },
    select: {
      id: true,
      company: true,
      role: true,
      stage: true,
      lastActivityAt: true,
      followUps: {
        where: { dismissed: false, completed: false },
        select: { id: true },
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
      app.stage === "Applied" ? FOLLOW_UP_DAYS_APPLIED : FOLLOW_UP_DAYS_WAITING;

    if (daysSinceActivity >= threshold) {
      const reason = buildFollowUpReason(app.company, app.role, app.stage, daysSinceActivity);

      await prisma.followUpSuggestion.create({
        data: {
          userId,
          applicationId: app.id,
          reason,
          dueAt: now,
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
    data: { dismissed: true },
  });
}

export async function completeFollowUp(userId: string, followUpId: string): Promise<void> {
  const prisma = requirePrisma();
  await prisma.followUpSuggestion.update({
    where: { id: followUpId, userId },
    data: { completed: true },
  });
}

export async function getFollowUpSuggestions(userId: string) {
  const prisma = requirePrisma();
  return prisma.followUpSuggestion.findMany({
    where: { userId, dismissed: false, completed: false },
    include: {
      application: {
        select: { id: true, company: true, role: true, stage: true },
      },
    },
    orderBy: { dueAt: "asc" },
    take: 10,
  });
}
