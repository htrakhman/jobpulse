import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { getApplicationById } from "@/lib/services/application.service";
import { requirePrisma } from "@/lib/prisma";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const application = await getApplicationById(userId, id);

  if (!application) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ application });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const prisma = requirePrisma();
  const { id } = await params;
  const body = await request.json();

  const existing = await prisma.application.findFirst({
    where: { id, userId },
    select: { id: true, stage: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const updateData = {
    source: body.source,
    method: body.method,
    resumeVersion: body.resumeVersion,
    coverLetterVersion: body.coverLetterVersion,
    targetPriority: body.targetPriority,
    salaryBand: body.salaryBand,
    targetCompMin: body.targetCompMin,
    targetCompMax: body.targetCompMax,
    roleDesirabilityScore: body.roleDesirabilityScore,
    companyDesirabilityScore: body.companyDesirabilityScore,
    fitScore: body.fitScore,
    locationPreferenceFit: body.locationPreferenceFit,
    workModelPreference: body.workModelPreference,
    outreachSent: body.outreachSent,
    contactedRecruiter: body.contactedRecruiter,
    nextAction: body.nextAction,
    nextActionDate: body.nextActionDate ? new Date(body.nextActionDate) : null,
    followUpUrgency: body.followUpUrgency,
    daysSinceLastTouch: body.daysSinceLastTouch,
    offerOutcome: body.offerOutcome,
    closedReason: body.closedReason,
    stage: body.stage,
    stageEnteredAt: body.stage ? new Date() : undefined,
    lastActivityAt: new Date(),
  };

  const updated = await prisma.application.update({
    where: { id },
    data: updateData,
  });

  if (body.stage && body.stage !== existing.stage) {
    await prisma.applicationTransition.create({
      data: {
        applicationId: id,
        fromStage: existing.stage,
        toStage: body.stage,
        triggerType: "manual_patch",
        transitionedAt: new Date(),
      },
    });
  }

  if (body.nextAction || body.notes) {
    await prisma.applicationActivity.create({
      data: {
        applicationId: id,
        kind: "manual_update",
        summary: body.notes ?? body.nextAction ?? "Application updated",
        occurredAt: new Date(),
        metadata: {
          fieldsUpdated: Object.keys(body),
        },
      },
    });
  }

  return NextResponse.json({ application: updated });
}
