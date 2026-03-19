import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { requirePrisma } from "@/lib/prisma";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const prisma = requirePrisma();
  const { id } = await params;
  const body = await request.json();

  const review = await prisma.interviewReview.updateMany({
    where: { id, userId },
    data: {
      interviewType: body.interviewType,
      roundNumber: body.roundNumber,
      confidenceRating: body.confidenceRating,
      performanceRating: body.performanceRating,
      roleFitRating: body.roleFitRating,
      interviewerVibe: body.interviewerVibe,
      difficulty: body.difficulty,
      notes: body.notes,
      outcomeReason: body.outcomeReason,
    },
  });

  return NextResponse.json({ updatedCount: review.count });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const prisma = requirePrisma();
  const { id } = await params;
  const deleted = await prisma.interviewReview.deleteMany({
    where: { id, userId },
  });
  return NextResponse.json({ deletedCount: deleted.count });
}

