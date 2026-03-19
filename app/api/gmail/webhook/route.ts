import { NextRequest, NextResponse } from "next/server";
import { requirePrisma } from "@/lib/prisma";
import { syncFromHistory } from "@/lib/gmail/sync";
import { recomputeContactGraphForUser } from "@/lib/services/contact-graph.service";
import { generateFollowUpSuggestions } from "@/lib/services/followup.service";

// Google Pub/Sub pushes a base64-encoded JSON payload
interface PubSubMessage {
  message: {
    data: string; // base64
    messageId: string;
    publishTime: string;
  };
  subscription: string;
}

interface GmailNotification {
  emailAddress: string;
  historyId: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: PubSubMessage = await request.json();
    const decoded = Buffer.from(body.message.data, "base64").toString("utf-8");
    const notification: GmailNotification = JSON.parse(decoded);

    const { emailAddress, historyId } = notification;
    if (!emailAddress || !historyId) {
      return NextResponse.json({ error: "Invalid notification" }, { status: 400 });
    }

    const prisma = requirePrisma();
    // Find the user with this Gmail address
    const account = await prisma.connectedAccount.findFirst({
      where: { email: emailAddress },
      select: { userId: true },
    });

    if (!account) {
      // Not a user we track — acknowledge to prevent retries
      return NextResponse.json({ ok: true });
    }

    // Process new emails asynchronously (don't block the response)
    syncFromHistory(account.userId, historyId)
      .then(() =>
        Promise.all([
          generateFollowUpSuggestions(account.userId),
          recomputeContactGraphForUser(account.userId, { daysBack: 120, limit: 60 }),
        ])
      )
      .catch((err) => console.error("[webhook] Sync error:", err));

    // Acknowledge immediately (Pub/Sub requires < 10s response)
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[api/gmail/webhook] Error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
