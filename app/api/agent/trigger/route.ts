import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { runAgentForApplication } from "@/lib/services/agent.service";
import { requirePrisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const prisma = requirePrisma();
  const body = await request.json() as { applicationId: string };
  const { applicationId } = body;

  if (!applicationId) {
    return NextResponse.json({ error: "applicationId is required" }, { status: 400 });
  }

  // Verify ownership
  const application = await prisma.application.findFirst({
    where: { id: applicationId, userId },
    select: { id: true, company: true },
  });

  if (!application) {
    return NextResponse.json({ error: "Application not found" }, { status: 404 });
  }

  try {
    const result = await runAgentForApplication(applicationId, userId, { triggerType: "manual" });
    return NextResponse.json({ success: true, result });
  } catch (err) {
    console.error("[agent/trigger]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
