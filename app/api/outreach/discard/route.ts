import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { requirePrisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const prisma = requirePrisma();
  const body = await request.json() as { messageId: string };

  const message = await prisma.outreachMessage.findFirst({
    where: { id: body.messageId, userId, status: "draft" },
  });

  if (!message) {
    return NextResponse.json({ error: "Draft not found" }, { status: 404 });
  }

  await prisma.outreachMessage.update({
    where: { id: body.messageId },
    data: { status: "failed", errorMessage: "Discarded by user" },
  });

  return NextResponse.json({ success: true });
}
