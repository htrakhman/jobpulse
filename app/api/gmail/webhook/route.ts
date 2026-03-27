import { NextRequest, NextResponse } from "next/server";
import { requirePrisma } from "@/lib/prisma";
import { syncFromHistory } from "@/lib/gmail/sync";
import { recomputeContactGraphForUser } from "@/lib/services/contact-graph.service";
import { generateFollowUpSuggestions } from "@/lib/services/followup.service";
import { backfillOperationalDataForUser } from "@/lib/services/backfill.service";
import { runAgentForApplication } from "@/lib/services/agent.service";

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

    const userId = account.userId;

    // Process new emails asynchronously (don't block the response)
    syncFromHistory(userId, historyId)
      .then(async () => {
        await Promise.all([
          generateFollowUpSuggestions(userId),
          recomputeContactGraphForUser(userId, { daysBack: 120, limit: 60 }),
          backfillOperationalDataForUser(userId, { limit: 80 }),
        ]);
        // Agent trigger: auto-run for newly confirmed applications
        await triggerAgentForNewApplications(userId);
      })
      .catch((err) => console.error("[webhook] Sync error:", err));

    // Acknowledge immediately (Pub/Sub requires < 10s response)
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[api/gmail/webhook] Error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/**
 * After a sync, look for applications that were just confirmed (application_confirmation)
 * but haven't had an agent run yet, and trigger the agent for each one.
 */
async function triggerAgentForNewApplications(userId: string) {
  const prisma = requirePrisma();

  try {
    // Check if agent is enabled for this user
    const config = await prisma.agentConfig.findUnique({ where: { userId } });
    if (config && !config.enabled) return;

    // Find emails classified as application_confirmation that:
    // - belong to this user
    // - are linked to an application
    // - that application has NO agent runs yet
    const freshConfirmations = await prisma.emailMessage.findMany({
      where: {
        userId,
        emailType: "application_confirmation",
        applicationId: { not: null },
        application: {
          agentRuns: { none: {} },
        },
      },
      select: {
        id: true,
        applicationId: true,
        application: { select: { id: true, company: true } },
      },
      take: 5, // safety cap per webhook event
    });

    for (const email of freshConfirmations) {
      if (!email.applicationId || !email.application) continue;

      console.log(`[agent] Triggering for application ${email.applicationId} (${email.application.company})`);

      // Fire and forget — run doesn't block webhook response
      runAgentForApplication(email.applicationId, userId, {
        triggerType: "email_webhook",
        triggerEmailId: email.id,
      }).catch((err) =>
        console.error(`[agent] Run failed for application ${email.applicationId}:`, err)
      );
    }
  } catch (err) {
    console.error("[agent] triggerAgentForNewApplications error:", err);
  }
}
