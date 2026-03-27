import { auth, currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  syncQuick,
  syncInboxFull,
  syncWindowGap,
} from "@/lib/gmail/sync";
import { reconcileInterviewInvites } from "@/lib/services/application.service";
import { recomputeContactGraphForUser } from "@/lib/services/contact-graph.service";
import { generateFollowUpSuggestions } from "@/lib/services/followup.service";
import { backfillOperationalDataForUser } from "@/lib/services/backfill.service";

const ALLOWED_WINDOWS = new Set([30, 90, 180, 365]);
const FULL_RESCAN_DAYS = 3650;

function isGmailInvalidGrantError(err: unknown): boolean {
  const asAny = err as
    | { message?: string; code?: number; status?: number; cause?: unknown }
    | undefined;
  const msg = `${asAny?.message ?? ""}`.toLowerCase();
  if (msg.includes("invalid_grant")) return true;
  if (msg.includes("invalid grant")) return true;

  const causeMsg = `${(asAny?.cause as { message?: string } | undefined)?.message ?? ""}`.toLowerCase();
  if (causeMsg.includes("invalid_grant") || causeMsg.includes("invalid grant")) return true;

  const blob = JSON.stringify(err ?? {});
  return /invalid[_\s-]?grant/i.test(blob);
}

async function runPostSyncPipeline(
  ownerUserId: string,
  daysBack: number,
  fullRescan: boolean,
  hadNewMail: boolean
): Promise<number> {
  const runHeavy = fullRescan || hadNewMail;
  let inviteReconciled = 0;

  if (runHeavy) {
    inviteReconciled = await reconcileInterviewInvites(ownerUserId, daysBack);
    await generateFollowUpSuggestions(ownerUserId);
  }

  setTimeout(() => {
    if (!runHeavy) {
      void reconcileInterviewInvites(ownerUserId, daysBack).catch((e) =>
        console.error("[api/gmail/sync] deferred reconcile failed:", e)
      );
      void generateFollowUpSuggestions(ownerUserId).catch((e) =>
        console.error("[api/gmail/sync] deferred follow-ups failed:", e)
      );
    }
    void recomputeContactGraphForUser(ownerUserId, {
      daysBack,
      limit: fullRescan ? 80 : 50,
    }).catch((recomputeErr) =>
      console.error("[api/gmail/sync] contact graph recompute failed:", recomputeErr)
    );
    void backfillOperationalDataForUser(ownerUserId, {
      limit: fullRescan ? 300 : hadNewMail ? 120 : 40,
    }).catch((backfillErr) =>
      console.error("[api/gmail/sync] operational backfill failed:", backfillErr)
    );
  }, 0);

  return inviteReconciled;
}

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as {
      daysBack?: number;
      fullRescan?: boolean;
      /** When expanding dashboard window (e.g. scanned 90d, now 180d), only fetch the gap. */
      previousScannedDays?: number;
    };
    const fullRescan = body?.fullRescan === true;
    const requestedWindow = Number(body?.daysBack);
    const daysBack = fullRescan
      ? FULL_RESCAN_DAYS
      : ALLOWED_WINDOWS.has(requestedWindow)
        ? requestedWindow
        : 180;
    const previousScanned =
      typeof body.previousScannedDays === "number" && body.previousScannedDays > 0
        ? body.previousScannedDays
        : null;

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

    let result: Awaited<ReturnType<typeof syncQuick>>;

    if (fullRescan) {
      result = await syncInboxFull(ownerUserId, daysBack, 8000);
    } else if (
      previousScanned != null &&
      daysBack > previousScanned &&
      ALLOWED_WINDOWS.has(previousScanned)
    ) {
      result = await syncWindowGap(ownerUserId, daysBack, previousScanned);
      await prisma.user.updateMany({
        where: { id: ownerUserId },
        data: { initialScanRangeDays: daysBack },
      });
    } else {
      const [userRow, acct] = await Promise.all([
        prisma.user.findUnique({
          where: { id: ownerUserId },
          select: { lastInboxSyncedAt: true },
        }),
        prisma.connectedAccount.findUnique({
          where: { userId: ownerUserId },
          select: { historyId: true },
        }),
      ]);
      result = await syncQuick(ownerUserId, {
        daysBack,
        lastInboxSyncedAt: userRow?.lastInboxSyncedAt ?? null,
        historyId: acct?.historyId ?? null,
      });
    }

    const hadNewMail = result.processed > 0 || result.applications > 0;
    // Never block the HTTP response on follow-ups / reconcile / graph — if those throw, the client
    // used to get 500 even though inbox sync + lastInboxSyncedAt already succeeded.
    setTimeout(() => {
      void runPostSyncPipeline(ownerUserId, daysBack, fullRescan, hadNewMail).catch((e) =>
        console.error("[api/gmail/sync] post-sync pipeline failed:", e)
      );
    }, 0);

    return NextResponse.json({
      success: true,
      fullRescan,
      daysBack,
      strategy: result.strategy ?? (fullRescan ? "full_list" : "unknown"),
      inviteReconciled: null,
      ...result,
    });
  } catch (err) {
    console.error("[api/gmail/sync] Error:", err);
    if (isGmailInvalidGrantError(err)) {
      return NextResponse.json(
        {
          error: "Gmail authorization expired. Reconnect Gmail and try refresh again.",
          code: "gmail_reconnect_required",
        },
        { status: 401 }
      );
    }
    return NextResponse.json({ error: "Sync failed" }, { status: 500 });
  }
}
