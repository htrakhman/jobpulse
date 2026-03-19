import { auth, currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncInbox } from "@/lib/gmail/sync";
import { reconcileInterviewInvites } from "@/lib/services/application.service";
import { recomputeContactGraphForUser } from "@/lib/services/contact-graph.service";
import { generateFollowUpSuggestions } from "@/lib/services/followup.service";

const ALLOWED_WINDOWS = new Set([30, 90, 180, 365]);
const FULL_RESCAN_DAYS = 3650;

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as {
      daysBack?: number;
      fullRescan?: boolean;
    };
    const fullRescan = body?.fullRescan === true;
    const requestedWindow = Number(body?.daysBack);
    const daysBack = fullRescan
      ? FULL_RESCAN_DAYS
      : ALLOWED_WINDOWS.has(requestedWindow)
      ? requestedWindow
      : 180;

    if (!prisma) {
      return NextResponse.json({ error: "Database not configured" }, { status: 500 });
    }

    let ownerUserId = userId;
    const dbUser = await prisma.user.findUnique({ where: { id: userId } });
    if (!dbUser) {
      const clerk = await currentUser();
      const clerkEmail = clerk?.emailAddresses[0]?.emailAddress ?? "";
      if (clerkEmail) {
        const fallback = await prisma.user.findUnique({ where: { email: clerkEmail } });
        if (fallback) ownerUserId = fallback.id;
      }
    }

    const result = await syncInbox(ownerUserId, {
      daysBack,
      maxMessages: fullRescan ? 8000 : undefined,
    });
    const inviteReconciled = await reconcileInterviewInvites(ownerUserId, daysBack);
    await generateFollowUpSuggestions(ownerUserId);
    setTimeout(() => {
      void recomputeContactGraphForUser(ownerUserId, {
        daysBack,
        limit: 80,
      }).catch((recomputeErr) =>
        console.error("[api/gmail/sync] contact graph recompute failed:", recomputeErr)
      );
    }, 0);

    return NextResponse.json({
      success: true,
      fullRescan,
      daysBack,
      inviteReconciled,
      ...result,
    });
  } catch (err) {
    console.error("[api/gmail/sync] Error:", err);
    return NextResponse.json({ error: "Sync failed" }, { status: 500 });
  }
}
