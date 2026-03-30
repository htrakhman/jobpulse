import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { resolveOwnerUserId } from "@/lib/auth/resolve-owner-user-id";
import { requirePrisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const prisma = requirePrisma();
  const ownerUserId = await resolveOwnerUserId(prisma, userId);
  const { searchParams } = new URL(request.url);
  const applicationId = searchParams.get("applicationId");
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "20"), 100);

  const runs = await prisma.agentRun.findMany({
    where: {
      userId: ownerUserId,
      ...(applicationId ? { applicationId } : {}),
    },
    include: {
      application: { select: { id: true, company: true, role: true } },
      steps: { orderBy: { createdAt: "asc" } },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return NextResponse.json({ runs });
}
