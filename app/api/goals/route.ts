import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { requirePrisma } from "@/lib/prisma";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const prisma = requirePrisma();
  const goal = await prisma.userGoal.findFirst({
    where: { userId, isActive: true },
    orderBy: { updatedAt: "desc" },
  });
  return NextResponse.json({ goal });
}

export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const prisma = requirePrisma();
  const body = await request.json();

  await prisma.userGoal.updateMany({
    where: { userId, isActive: true },
    data: { isActive: false },
  });
  const goal = await prisma.userGoal.create({
    data: {
      userId,
      dailyApplicationGoal: body.dailyApplicationGoal ?? 5,
      weeklyApplicationGoal: body.weeklyApplicationGoal ?? 25,
      weeklyInterviewGoal: body.weeklyInterviewGoal ?? 3,
      weeklyNetworkingGoal: body.weeklyNetworkingGoal ?? 5,
      weeklyFollowupGoal: body.weeklyFollowupGoal ?? 10,
      isActive: true,
    },
  });

  return NextResponse.json({ goal });
}

