import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { requirePrisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const prisma = requirePrisma();
  const body = await request.json();
  const ids: string[] = Array.isArray(body.ids) ? body.ids : [];
  if (ids.length === 0) {
    return NextResponse.json({ error: "Missing ids" }, { status: 400 });
  }

  const patch = {
    source: body.source,
    method: body.method,
    resumeVersion: body.resumeVersion,
    targetPriority: body.targetPriority,
    nextAction: body.nextAction,
    nextActionDate: body.nextActionDate ? new Date(body.nextActionDate) : undefined,
    followUpUrgency: body.followUpUrgency,
    outreachSent: body.outreachSent,
    contactedRecruiter: body.contactedRecruiter,
  };

  const result = await prisma.application.updateMany({
    where: { id: { in: ids }, userId },
    data: patch,
  });

  return NextResponse.json({ updatedCount: result.count });
}

