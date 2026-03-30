import { subDays, subHours } from "date-fns";
import { getGmailClientForUser } from "./client";
import { passesApplicationConfirmationInboxFilter } from "./application-confirmation-filter";
import { parseGmailMessage } from "./parser";
import { classifyEmail } from "@/lib/classification";
import { upsertApplication } from "@/lib/services/application.service";
import { requirePrisma } from "@/lib/prisma";

/**
 * Gmail `q` for listing candidate messages. Ingest still requires confirmation phrases in
 * BOTH subject and body (see `passesApplicationConfirmationInboxFilter`).
 */
const APPLICATION_CONFIRMATION_GMAIL_QUERY = [
  '"thanks for applying"',
  '"thank you for applying"',
  '"thanks for your application"',
  '"thank you for your application"',
].join(" OR ");

export function buildJobSearchQuery(daysBack: number, after?: Date): string {
  let q = `(${APPLICATION_CONFIRMATION_GMAIL_QUERY}) newer_than:${daysBack}d`;
  if (after) {
    q += ` after:${formatGmailAfterDate(after)}`;
  }
  return q;
}

/** Only messages between two rolling windows (e.g. 180d–90d ago) — avoids re-listing the whole outer window. */
export function buildWindowGapQuery(outerDaysBack: number, innerDaysBack: number): string {
  const after = subDays(new Date(), outerDaysBack);
  const before = subDays(new Date(), innerDaysBack);
  return `(${APPLICATION_CONFIRMATION_GMAIL_QUERY}) after:${formatGmailAfterDate(after)} before:${formatGmailAfterDate(before)}`;
}

function formatGmailAfterDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}/${m}/${day}`;
}

/**
 * Lower bound for "what's new since last sync" while still respecting the dashboard window.
 */
function computeDeltaAfterDate(lastInboxSyncedAt: Date | null, daysBack: number): Date {
  const now = new Date();
  const windowStart = subDays(now, daysBack);
  if (!lastInboxSyncedAt) {
    return subDays(now, Math.min(14, daysBack));
  }
  const buffered = subHours(lastInboxSyncedAt, 12);
  return buffered.getTime() > windowStart.getTime() ? buffered : windowStart;
}

const BATCH_LIST = 50;
const MAX_MESSAGES_FULL = 2000;
const MAX_MESSAGES_DEEP = 8000;
const MAX_MESSAGES_DELTA = 500;
const MAX_MESSAGES_GAP = 1500;
const INGEST_CONCURRENCY = 12;

export interface SyncResult {
  processed: number;
  classified: number;
  applications: number;
  errors: number;
  lastInboxSyncedAt?: string;
  lastInboxSyncedAtPersisted?: boolean;
  /** How the sync ran (for logs / UI). */
  strategy?: "gmail_history" | "delta_query" | "window_gap" | "full_list";
}

async function ingestMessageIds(
  userId: string,
  messageIds: string[],
  prisma: ReturnType<typeof requirePrisma>,
  gmail: Awaited<ReturnType<typeof getGmailClientForUser>>,
  result: SyncResult
): Promise<void> {
  const chunks = chunkArray(messageIds, INGEST_CONCURRENCY);
  for (const chunk of chunks) {
    if (chunk.length === 0) continue;
    const existing = await prisma.emailMessage.findMany({
      where: { id: { in: chunk } },
      select: { id: true },
    });
    const have = new Set(existing.map((e) => e.id));
    await Promise.all(
      chunk
        .filter((id) => !have.has(id))
        .map(async (msgId) => {
          try {
            const fullMsg = await gmail.users.messages.get({
              userId: "me",
              id: msgId,
              format: "full",
            });
            const parsed = parseGmailMessage(fullMsg.data);
            if (!parsed) return;
            if (!passesApplicationConfirmationInboxFilter(parsed)) return;
            result.processed++;
            const classification = await classifyEmail(parsed);
            if (!classification) return;
            result.classified++;
            await upsertApplication(userId, parsed, classification);
            result.applications++;
          } catch (err) {
            console.error(`[sync] Error processing message ${msgId}:`, err);
            result.errors++;
          }
        })
    );
  }
}

async function persistHistoryAndUserTimestamp(
  userId: string,
  result: SyncResult,
  historyIdFromApi?: string | null
): Promise<Pick<SyncResult, "lastInboxSyncedAt" | "lastInboxSyncedAtPersisted">> {
  const prisma = requirePrisma();
  const gmail = await getGmailClientForUser(userId);

  let hid = historyIdFromApi;
  if (!hid) {
    const profile = await gmail.users.getProfile({ userId: "me" });
    hid = profile.data.historyId ?? undefined;
  }
  if (hid) {
    try {
      await prisma.connectedAccount.update({
        where: { userId },
        data: { historyId: hid },
      });
    } catch (e) {
      console.error("[sync] Could not persist historyId on connectedAccount:", e);
    }
  }

  const syncedAt = new Date();
  let lastInboxSyncedAtPersisted = false;
  try {
    const upd = await prisma.user.updateMany({
      where: { id: userId },
      data: { lastInboxSyncedAt: syncedAt },
    });
    lastInboxSyncedAtPersisted = upd.count > 0;

    // Clerk id vs Prisma User.id mismatch: same Gmail account, different user row key
    if (!lastInboxSyncedAtPersisted) {
      const acct = await prisma.connectedAccount.findUnique({
        where: { userId },
        select: { email: true },
      });
      if (acct?.email) {
        const byEmail = await prisma.user.updateMany({
          where: { email: acct.email },
          data: { lastInboxSyncedAt: syncedAt },
        });
        lastInboxSyncedAtPersisted = byEmail.count > 0;
      }
    }

    if (!lastInboxSyncedAtPersisted) {
      console.error(
        "[sync] lastInboxSyncedAt not saved for userId",
        userId,
        "— no User row matched id or connectedAccount email."
      );
    }
  } catch (e) {
    console.error("[sync] Could not persist lastInboxSyncedAt:", e);
  }

  return {
    lastInboxSyncedAt: syncedAt.toISOString(),
    lastInboxSyncedAtPersisted,
  };
}

export async function syncInbox(
  userId: string,
  options?: {
    daysBack?: number;
    maxMessages?: number;
    after?: Date;
    /** Full query — use for window gap (ignores daysBack/after). */
    customQuery?: string;
    strategyLabel?: SyncResult["strategy"];
  }
): Promise<SyncResult> {
  const prisma = requirePrisma();
  const gmail = await getGmailClientForUser(userId);
  const result: SyncResult = { processed: 0, classified: 0, applications: 0, errors: 0 };
  const daysBack = options?.daysBack ?? 180;
  const maxMessages = options?.maxMessages ?? MAX_MESSAGES_FULL;
  const query =
    options?.customQuery ??
    buildJobSearchQuery(daysBack, options?.after);

  let pageToken: string | undefined;
  let totalFetched = 0;
  const toIngest: string[] = [];

  do {
    const listRes = await gmail.users.messages.list({
      userId: "me",
      q: query,
      maxResults: BATCH_LIST,
      pageToken,
    });

    const messages = listRes.data.messages ?? [];
    if (messages.length === 0) break;

    for (const m of messages) {
      if (m.id) toIngest.push(m.id);
    }

    totalFetched += messages.length;
    pageToken = listRes.data.nextPageToken ?? undefined;
  } while (pageToken && totalFetched < maxMessages);

  await ingestMessageIds(userId, toIngest, prisma, gmail, result);

  const meta = await persistHistoryAndUserTimestamp(userId, result);
  return {
    ...result,
    ...meta,
    strategy: options?.strategyLabel ?? (options?.after || options?.customQuery ? "delta_query" : "full_list"),
  };
}

/**
 * Fast path: Gmail History API — only mail added since stored historyId (typically seconds).
 */
export async function syncViaGmailHistory(userId: string, startHistoryIdFallback: string): Promise<SyncResult> {
  const prisma = requirePrisma();
  const gmail = await getGmailClientForUser(userId);
  const result: SyncResult = { processed: 0, classified: 0, applications: 0, errors: 0 };

  const account = await prisma.connectedAccount.findUnique({
    where: { userId },
    select: { historyId: true },
  });
  const startHistoryId = account?.historyId ?? startHistoryIdFallback;

  let pageToken: string | undefined;
  const messageIds = new Set<string>();
  let latestHistoryId: string | undefined;
  let isFirstPage = true;

  try {
    do {
      const historyRes = await gmail.users.history.list({
        userId: "me",
        ...(isFirstPage ? { startHistoryId } : {}),
        ...(pageToken ? { pageToken } : {}),
        historyTypes: ["messageAdded"],
      });
      isFirstPage = false;

      for (const record of historyRes.data.history ?? []) {
        for (const added of record.messagesAdded ?? []) {
          if (added.message?.id) messageIds.add(added.message.id);
        }
      }
      if (historyRes.data.historyId) {
        latestHistoryId = historyRes.data.historyId;
      }
      pageToken = historyRes.data.nextPageToken ?? undefined;
    } while (pageToken);

    await ingestMessageIds(userId, [...messageIds], prisma, gmail, result);

    const meta = await persistHistoryAndUserTimestamp(userId, result, latestHistoryId);
    return { ...result, ...meta, strategy: "gmail_history" };
  } catch (err: unknown) {
    if ((err as { code?: number }).code === 410) {
      throw err;
    }
    throw err;
  }
}

/**
 * List-only delta: job keywords + `after:` near last sync — avoids walking the whole newer_than window.
 */
export async function syncInboxDelta(
  userId: string,
  daysBack: number,
  lastInboxSyncedAt: Date | null
): Promise<SyncResult> {
  const after = computeDeltaAfterDate(lastInboxSyncedAt, daysBack);
  return syncInbox(userId, {
    daysBack,
    maxMessages: MAX_MESSAGES_DELTA,
    after,
    strategyLabel: "delta_query",
  });
}

/**
 * Extend dashboard window without re-fetching the inner range (e.g. already scanned 90d, now want 180d).
 */
export async function syncWindowGap(userId: string, outerDaysBack: number, innerDaysBack: number): Promise<SyncResult> {
  const q = buildWindowGapQuery(outerDaysBack, innerDaysBack);
  return syncInbox(userId, {
    daysBack: outerDaysBack,
    maxMessages: MAX_MESSAGES_GAP,
    customQuery: q,
    strategyLabel: "window_gap",
  });
}

/**
 * Default refresh: History API if possible, else date-bounded delta list (not full inbox walk).
 */
export async function syncQuick(
  userId: string,
  options: {
    daysBack: number;
    lastInboxSyncedAt: Date | null;
    historyId: string | null;
  }
): Promise<SyncResult> {
  if (options.historyId) {
    try {
      return await syncViaGmailHistory(userId, options.historyId);
    } catch (err: unknown) {
      if ((err as { code?: number }).code === 410) {
        console.warn("[sync] historyId expired (410); using delta query fallback");
      } else {
        throw err;
      }
    }
  }
  return syncInboxDelta(userId, options.daysBack, options.lastInboxSyncedAt);
}

/** Deep / first-time scan — walks the full query window (slow on large mailboxes). */
export async function syncInboxFull(userId: string, daysBack: number, maxMessages: number): Promise<SyncResult> {
  return syncInbox(userId, {
    daysBack,
    maxMessages,
    strategyLabel: "full_list",
  });
}

/**
 * @deprecated Prefer syncQuick / syncViaGmailHistory. Kept for webhook signature compatibility.
 */
export async function syncFromHistory(userId: string, historyId: string): Promise<SyncResult> {
  try {
    return await syncViaGmailHistory(userId, historyId);
  } catch (err: unknown) {
    if ((err as { code?: number }).code === 410) {
      const prisma = requirePrisma();
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { lastInboxSyncedAt: true },
      });
      return syncInboxDelta(userId, 180, user?.lastInboxSyncedAt ?? null);
    }
    throw err;
  }
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}
