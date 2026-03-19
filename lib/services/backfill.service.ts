import type { ApplicationStage } from "@/types";
import { requirePrisma } from "@/lib/prisma";
import { applyInferenceToApplication } from "./inference.service";

const FOLLOWUP_URGENCY_BY_STAGE: Record<ApplicationStage, "urgent" | "high" | "normal" | "low"> = {
  Applied: "normal",
  Waiting: "normal",
  Scheduling: "urgent",
  Interviewing: "high",
  Assessment: "high",
  Offer: "urgent",
  Rejected: "low",
  Closed: "low",
};

export async function recomputeApplicationDerivedFields(userId: string, applicationId: string) {
  const prisma = requirePrisma();
  const app = await prisma.application.findFirst({
    where: { id: applicationId, userId },
    include: {
      events: { orderBy: { occurredAt: "asc" }, take: 1 },
    },
  });
  if (!app) return;
  const now = new Date();
  const daysSinceLastTouch = Math.max(
    0,
    Math.round((now.getTime() - app.lastActivityAt.getTime()) / (24 * 60 * 60 * 1000))
  );
  const stageEnteredAt = app.stageEnteredAt ?? app.events[0]?.occurredAt ?? app.appliedAt ?? app.lastActivityAt;
  await prisma.application.update({
    where: { id: app.id },
    data: {
      daysSinceLastTouch,
      stageEnteredAt,
      followUpUrgency: FOLLOWUP_URGENCY_BY_STAGE[app.stage as ApplicationStage] as never,
    },
  });
}

export async function backfillOperationalDataForUser(userId: string, options?: { limit?: number }) {
  const prisma = requirePrisma();
  const apps = await prisma.application.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    take: options?.limit ?? 200,
  });

  for (const app of apps) {
    await recomputeApplicationDerivedFields(userId, app.id);
    if (app.source === "unknown" || app.method === "unknown") {
      await applyInferenceToApplication(userId, app.id);
    }
    const existingTransition = await prisma.applicationTransition.findFirst({
      where: { applicationId: app.id },
      select: { id: true },
    });
    if (!existingTransition) {
      await prisma.applicationTransition.create({
        data: {
          applicationId: app.id,
          fromStage: null,
          toStage: app.stage,
          triggerType: "backfill_baseline",
          transitionedAt: app.appliedAt ?? app.createdAt,
        },
      });
    }
  }
}

