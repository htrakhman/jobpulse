import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { requirePrisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const prisma = requirePrisma();
  const applicationId = new URL(request.url).searchParams.get("applicationId");
  const reviews = await prisma.interviewReview.findMany({
    where: {
      userId,
      ...(applicationId ? { applicationId } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return NextResponse.json({ reviews });
}

export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const prisma = requirePrisma();
  const body = await request.json();
  if (!body.applicationId) {
    return NextResponse.json({ error: "Missing applicationId" }, { status: 400 });
  }
  const review = await prisma.interviewReview.create({
    data: {
      userId,
      applicationId: body.applicationId,
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
  return NextResponse.json({ review });
}

