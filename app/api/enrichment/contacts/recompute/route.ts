import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { requirePrisma } from "@/lib/prisma";
import {
  recomputeContactGraphForApplication,
  recomputeContactGraphForUser,
} from "@/lib/services/contact-graph.service";

export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const prisma = requirePrisma();
  const body = (await request.json().catch(() => ({}))) as {
    applicationId?: string;
    mode?: "application" | "all";
    daysBack?: number;
    async?: boolean;
  };

  const mode = body.mode ?? (body.applicationId ? "application" : "all");
  const runAsync = body.async !== false;

  if (mode === "application") {
    if (!body.applicationId) {
      return NextResponse.json({ error: "applicationId required" }, { status: 400 });
    }
    const application = await prisma.application.findFirst({
      where: { id: body.applicationId, userId },
      select: { id: true },
    });
    if (!application) {
      return NextResponse.json({ error: "Application not found" }, { status: 404 });
    }

    if (runAsync) {
      setTimeout(() => {
        void recomputeContactGraphForApplication(userId, body.applicationId as string).catch((err) =>
          console.error("[contacts/recompute] application async error:", err)
        );
      }, 0);
      return NextResponse.json({ accepted: true, mode: "application" }, { status: 202 });
    }

    const result = await recomputeContactGraphForApplication(userId, body.applicationId);
    return NextResponse.json({ success: true, mode: "application", ...result });
  }

  if (runAsync) {
    setTimeout(() => {
      void recomputeContactGraphForUser(userId, {
        daysBack: body.daysBack,
      }).catch((err) => console.error("[contacts/recompute] bulk async error:", err));
    }, 0);
    return NextResponse.json({ accepted: true, mode: "all" }, { status: 202 });
  }

  const result = await recomputeContactGraphForUser(userId, {
    daysBack: body.daysBack,
  });
  return NextResponse.json({ success: true, mode: "all", ...result });
}

