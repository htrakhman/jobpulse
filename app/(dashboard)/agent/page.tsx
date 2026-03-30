import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { requirePrisma } from "@/lib/prisma";
import AgentDashboardClient from "@/components/agent/AgentDashboardClient";

const DEFAULT_CONFIG = {
  enabled: true,
  targetTitles: ["CEO", "CTO", "VP Engineering", "Founder"],
  maxContacts: 3,
  autoSend: false,
  preferredTemplate: "executive-intro",
  channel: "email",
};

export default async function AgentPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const prisma = requirePrisma();
  const clerkUser = await currentUser();
  const clerkEmail = clerkUser?.emailAddresses[0]?.emailAddress ?? "";

  /** Same owner resolution as dashboard — data may live under email-matched User row */
  let ownerUserId = userId;
  const userById = await prisma.user.findUnique({ where: { id: userId } });
  if (!userById && clerkEmail) {
    const userByEmail = await prisma.user.findUnique({ where: { email: clerkEmail } });
    if (userByEmail) ownerUserId = userByEmail.id;
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: ownerUserId },
    select: { lastInboxSyncedAt: true },
  });
  const connectedAccount = await prisma.connectedAccount.findUnique({
    where: { userId: ownerUserId },
    select: { email: true },
  });
  const lastInboxSyncedAtIso = dbUser?.lastInboxSyncedAt?.toISOString() ?? null;
  const gmailConnected = !!connectedAccount?.email;

  // Use raw SQL to avoid stale Prisma client model delegates
  try {
    // Check if agent tables exist
    const tableCheck = await prisma.$queryRawUnsafe<{ exists: boolean }[]>(
      `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'AgentConfig') as exists`
    );
    const tablesExist = tableCheck[0]?.exists === true;

    if (!tablesExist) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-[#f0f2f7] p-10">
          <div className="max-w-lg w-full rounded-2xl border border-amber-200 bg-amber-50 p-8 text-center">
            <p className="text-3xl mb-4">⚙️</p>
            <h1 className="text-xl font-bold text-slate-900 mb-2">Setting up agent tables…</h1>
            <p className="text-sm text-slate-600 mb-6">
              The agent database tables need to be created. Visit the setup endpoint to run the migration:
            </p>
            <a
              href="/api/setup"
              className="inline-block rounded-xl bg-blue-600 px-6 py-3 text-sm font-bold text-white hover:bg-blue-700 transition-colors"
            >
              Run Setup →
            </a>
            <p className="text-xs text-slate-500 mt-4">
              After setup completes, come back here and refresh.
            </p>
          </div>
        </div>
      );
    }

    // Fetch agent config via raw SQL
    const configs = await prisma.$queryRawUnsafe<Array<{
      enabled: boolean;
      targetTitles: string[];
      maxContacts: number;
      autoSend: boolean;
      preferredTemplate: string | null;
      channel: string;
    }>>(`SELECT "enabled", "targetTitles", "maxContacts", "autoSend", "preferredTemplate", "channel" FROM "AgentConfig" WHERE "userId" = $1 LIMIT 1`, ownerUserId);

    const config = configs[0] ?? DEFAULT_CONFIG;

    // Fetch recent agent runs with application info
    const recentRuns = await prisma.$queryRawUnsafe<Array<{
      id: string;
      status: string;
      triggerType: string;
      contactsFound: number;
      contactsEnriched: number;
      emailsDrafted: number;
      emailsSent: number;
      error: string | null;
      startedAt: string;
      completedAt: string | null;
      applicationId: string;
      company: string;
      role: string | null;
    }>>(`
      SELECT r."id", r."status", r."triggerType", r."contactsFound", r."contactsEnriched",
             r."emailsDrafted", r."emailsSent", r."error", r."startedAt"::text, r."completedAt"::text,
             r."applicationId", a."company", a."role"
      FROM "AgentRun" r
      JOIN "Application" a ON a."id" = r."applicationId"
      WHERE r."userId" = $1
      ORDER BY r."createdAt" DESC
      LIMIT 15
    `, ownerUserId);

    // Fetch steps for each run
    const runIds = recentRuns.map(r => r.id);
    const steps = runIds.length > 0
      ? await prisma.$queryRawUnsafe<Array<{
          id: string;
          runId: string;
          kind: string;
          status: string;
          summary: string | null;
          createdAt: string;
        }>>(`
          SELECT "id", "runId", "kind", "status", "summary", "createdAt"::text
          FROM "AgentRunStep"
          WHERE "runId" = ANY($1::text[])
          ORDER BY "createdAt" ASC
        `, runIds)
      : [];

    // Shape data for the client component
    const runsWithSteps = recentRuns.map(run => ({
      ...run,
      startedAt: run.startedAt ?? new Date().toISOString(),
      application: { id: run.applicationId, company: run.company, role: run.role },
      steps: steps.filter(s => s.runId === run.id),
    }));

    // Stats
    const countResult = (rows: Array<{ count: bigint }>) => Number(rows[0]?.count ?? 0);
    const [totalRuns, completed, pending, emailsSent, pendingDrafts, totalApps] = await Promise.all([
      prisma.$queryRawUnsafe<Array<{ count: bigint }>>(`SELECT count(*) FROM "AgentRun" WHERE "userId" = $1`, ownerUserId).then(countResult),
      prisma.$queryRawUnsafe<Array<{ count: bigint }>>(`SELECT count(*) FROM "AgentRun" WHERE "userId" = $1 AND "status" = 'completed'`, ownerUserId).then(countResult),
      prisma.$queryRawUnsafe<Array<{ count: bigint }>>(`SELECT count(*) FROM "AgentRun" WHERE "userId" = $1 AND "status" = 'pending_approval'`, ownerUserId).then(countResult),
      prisma.$queryRawUnsafe<Array<{ count: bigint }>>(`SELECT count(*) FROM "OutreachMessage" WHERE "userId" = $1 AND "status" = 'sent'`, ownerUserId).then(countResult),
      prisma.$queryRawUnsafe<Array<{ count: bigint }>>(`SELECT count(*) FROM "OutreachMessage" WHERE "userId" = $1 AND "status" = 'draft'`, ownerUserId).then(countResult),
      prisma.$queryRawUnsafe<Array<{ count: bigint }>>(`SELECT count(*) FROM "Application" WHERE "userId" = $1`, ownerUserId).then(countResult),
    ]);

    const stats = { totalRuns, completed, pending, emailsSent, pendingDrafts, totalApplications: totalApps };

    const recentApplications = await prisma.$queryRawUnsafe<Array<{
      id: string;
      company: string;
      role: string | null;
      stage: string;
      appliedAt: string | null;
      lastActivityAt: string;
      outreachSent: boolean;
      latestRunStatus: string | null;
      latestContactsFound: number | null;
      draftCount: number;
      sentCount: number;
    }>>(`
      SELECT
        a."id", a."company", a."role",
        a."stage"::text,
        a."appliedAt"::text,
        a."lastActivityAt"::text,
        a."outreachSent",
        (SELECT r."status" FROM "AgentRun" r WHERE r."applicationId" = a."id" ORDER BY r."createdAt" DESC LIMIT 1) AS "latestRunStatus",
        (SELECT r."contactsFound" FROM "AgentRun" r WHERE r."applicationId" = a."id" ORDER BY r."createdAt" DESC LIMIT 1) AS "latestContactsFound",
        (SELECT COUNT(*)::int FROM "OutreachMessage" om WHERE om."applicationId" = a."id" AND om."status" = 'draft') AS "draftCount",
        (SELECT COUNT(*)::int FROM "OutreachMessage" om WHERE om."applicationId" = a."id" AND om."status" = 'sent') AS "sentCount"
      FROM "Application" a
      WHERE a."userId" = $1
      ORDER BY COALESCE(a."appliedAt", a."lastActivityAt") DESC NULLS LAST
      LIMIT 50
    `, ownerUserId);

    return (
      <AgentDashboardClient
        config={config as Parameters<typeof AgentDashboardClient>[0]["config"]}
        recentRuns={runsWithSteps as Parameters<typeof AgentDashboardClient>[0]["recentRuns"]}
        recentApplications={recentApplications}
        stats={stats}
        lastInboxSyncedAtIso={lastInboxSyncedAtIso}
        gmailConnected={gmailConnected}
      />
    );
  } catch (err) {
    console.error("[agent/page]", err);
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#f0f2f7] p-10">
        <div className="max-w-lg w-full rounded-2xl border border-red-200 bg-red-50 p-8 text-center">
          <p className="text-3xl mb-4">❌</p>
          <h1 className="text-xl font-bold text-slate-900 mb-2">Error loading agent</h1>
          <p className="text-sm text-slate-600 mb-4">{String(err)}</p>
          <a
            href="/api/setup"
            className="inline-block rounded-xl bg-blue-600 px-6 py-3 text-sm font-bold text-white hover:bg-blue-700 transition-colors"
          >
            Run Setup →
          </a>
        </div>
      </div>
    );
  }
}
