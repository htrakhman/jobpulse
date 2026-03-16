import { getGmailClientForUser } from "./client";
import { prisma } from "@/lib/prisma";

const TOPIC = process.env.GOOGLE_PUBSUB_TOPIC!;
// Gmail watch expires after 7 days — renew at 6 days
const WATCH_TTL_MS = 6 * 24 * 60 * 60 * 1000;

export async function setupGmailWatch(userId: string): Promise<void> {
  const gmail = await getGmailClientForUser(userId);

  const res = await gmail.users.watch({
    userId: "me",
    requestBody: {
      topicName: TOPIC,
      labelIds: ["INBOX"],
    },
  });

  const expiration = res.data.expiration
    ? new Date(Number(res.data.expiration))
    : new Date(Date.now() + WATCH_TTL_MS);

  const historyId = res.data.historyId ?? undefined;

  await prisma.connectedAccount.update({
    where: { userId },
    data: {
      watchExpiry: expiration,
      ...(historyId ? { historyId } : {}),
    },
  });
}

export async function stopGmailWatch(userId: string): Promise<void> {
  try {
    const gmail = await getGmailClientForUser(userId);
    await gmail.users.stop({ userId: "me" });
  } catch {
    // Best effort — don't throw if account already disconnected
  }
}

export async function renewExpiredWatches(): Promise<void> {
  const soon = new Date(Date.now() + 24 * 60 * 60 * 1000); // expires within 24h

  const accounts = await prisma.connectedAccount.findMany({
    where: {
      OR: [{ watchExpiry: null }, { watchExpiry: { lte: soon } }],
    },
    select: { userId: true },
  });

  await Promise.allSettled(
    accounts.map(({ userId }: { userId: string }) => setupGmailWatch(userId))
  );
}
