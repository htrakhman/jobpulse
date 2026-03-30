import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { resolveOwnerUserId } from "@/lib/auth/resolve-owner-user-id";
import { getOrCreateAgentConfig } from "@/lib/services/agent.service";
import { requirePrisma } from "@/lib/prisma";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const prisma = requirePrisma();
  const ownerUserId = await resolveOwnerUserId(prisma, userId);
  const config = await getOrCreateAgentConfig(ownerUserId);
  return NextResponse.json({ config });
}

export async function PUT(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const prisma = requirePrisma();
  const ownerUserId = await resolveOwnerUserId(prisma, userId);
  const body = await request.json() as {
    enabled?: boolean;
    targetTitles?: string[];
    maxContacts?: number;
    autoSend?: boolean;
    preferredTemplate?: string;
    channel?: "email" | "linkedin";
  };

  const config = await prisma.agentConfig.upsert({
    where: { userId: ownerUserId },
    update: {
      ...(body.enabled !== undefined && { enabled: body.enabled }),
      ...(body.targetTitles !== undefined && { targetTitles: body.targetTitles }),
      ...(body.maxContacts !== undefined && { maxContacts: body.maxContacts }),
      ...(body.autoSend !== undefined && { autoSend: body.autoSend }),
      ...(body.preferredTemplate !== undefined && { preferredTemplate: body.preferredTemplate }),
      ...(body.channel !== undefined && { channel: body.channel }),
    },
    create: {
      userId: ownerUserId,
      enabled: body.enabled ?? true,
      targetTitles: body.targetTitles ?? ["CEO", "CTO", "VP Engineering", "Founder"],
      maxContacts: body.maxContacts ?? 3,
      autoSend: body.autoSend ?? false,
      preferredTemplate: body.preferredTemplate ?? "executive-intro",
      channel: body.channel ?? "email",
    },
  });

  return NextResponse.json({ config });
}
