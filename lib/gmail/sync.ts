import { getGmailClientForUser } from "./client";
import { parseGmailMessage } from "./parser";
import { classifyEmail } from "@/lib/classification";
import { upsertApplication } from "@/lib/services/application.service";
import { requirePrisma } from "@/lib/prisma";

function buildJobSearchQuery(daysBack: number): string {
  return `(application OR interview OR invitation OR calendar OR scheduling OR availability OR "next steps" OR "phone screen" OR "hiring manager" OR assessment OR offer OR rejection OR hiring OR "thank you for applying" OR "application received") newer_than:${daysBack}d`;
}

const BATCH_SIZE = 20;
const MAX_MESSAGES = 2000;

export interface SyncResult {
  processed: number;
  classified: number;
  applications: number;
  errors: number;
}

export async function syncInbox(
  userId: string,
  options?: { daysBack?: number; maxMessages?: number }
): Promise<SyncResult> {
  const prisma = requirePrisma();
  const gmail = await getGmailClientForUser(userId);
  const result: SyncResult = { processed: 0, classified: 0, applications: 0, errors: 0 };
  const daysBack = options?.daysBack ?? 180;
  const maxMessages = options?.maxMessages ?? MAX_MESSAGES;
  const query = buildJobSearchQuery(daysBack);

  let pageToken: string | undefined;
  let totalFetched = 0;

  do {
    const listRes = await gmail.users.messages.list({
      userId: "me",
      q: query,
      maxResults: BATCH_SIZE,
      pageToken,
    });

    const messages = listRes.data.messages ?? [];
    if (messages.length === 0) break;

    // Fetch full messages in parallel (batches of 10)
    const chunks = chunkArray(messages, 10);
    for (const chunk of chunks) {
      await Promise.all(
        chunk.map(async (msg) => {
          if (!msg.id) return;

          try {
            // Skip already-processed messages
            const existing = await prisma.emailMessage.findUnique({
              where: { id: msg.id },
              select: { id: true },
            });
            if (existing) return;

            const fullMsg = await gmail.users.messages.get({
              userId: "me",
              id: msg.id,
              format: "full",
            });

            const parsed = parseGmailMessage(fullMsg.data);
            if (!parsed) return;

            result.processed++;

            const classification = await classifyEmail(parsed);
            if (!classification) return;

            result.classified++;

            await upsertApplication(userId, parsed, classification);
            result.applications++;
          } catch (err) {
            console.error(`[sync] Error processing message ${msg.id}:`, err);
            result.errors++;
          }
        })
      );
    }

    totalFetched += messages.length;
    pageToken = listRes.data.nextPageToken ?? undefined;
  } while (pageToken && totalFetched < maxMessages);

  // Update historyId for incremental sync
  const profile = await gmail.users.getProfile({ userId: "me" });
  if (profile.data.historyId) {
    await prisma.connectedAccount.update({
      where: { userId },
      data: { historyId: profile.data.historyId },
    });
  }

  return result;
}

export async function syncFromHistory(userId: string, historyId: string): Promise<SyncResult> {
  const prisma = requirePrisma();
  const gmail = await getGmailClientForUser(userId);
  const result: SyncResult = { processed: 0, classified: 0, applications: 0, errors: 0 };

  const account = await prisma.connectedAccount.findUnique({
    where: { userId },
    select: { historyId: true },
  });

  const startHistoryId = account?.historyId ?? historyId;

  try {
    const historyRes = await gmail.users.history.list({
      userId: "me",
      startHistoryId,
      historyTypes: ["messageAdded"],
    });

    const history = historyRes.data.history ?? [];
    const messageIds = new Set<string>();

    for (const record of history) {
      for (const added of record.messagesAdded ?? []) {
        if (added.message?.id) messageIds.add(added.message.id);
      }
    }

    for (const msgId of messageIds) {
      try {
        const existing = await prisma.emailMessage.findUnique({
          where: { id: msgId },
          select: { id: true },
        });
        if (existing) continue;

        const fullMsg = await gmail.users.messages.get({
          userId: "me",
          id: msgId,
          format: "full",
        });

        const parsed = parseGmailMessage(fullMsg.data);
        if (!parsed) continue;

        result.processed++;

        const classification = await classifyEmail(parsed);
        if (!classification) continue;

        result.classified++;

        await upsertApplication(userId, parsed, classification);
        result.applications++;
      } catch (err) {
        console.error(`[sync history] Error processing message ${msgId}:`, err);
        result.errors++;
      }
    }

    // Update historyId
    if (historyRes.data.historyId) {
      await prisma.connectedAccount.update({
        where: { userId },
        data: { historyId: historyRes.data.historyId },
      });
    }
  } catch (err: unknown) {
    // historyId expired (410) — fall back to full sync
    if ((err as { code?: number }).code === 410) {
      return syncInbox(userId);
    }
    throw err;
  }

  return result;
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}
