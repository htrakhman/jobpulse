import { auth, currentUser } from "@clerk/nextjs/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { prisma } from "@/lib/prisma";
import {
  getApplicationsForUser,
  getDashboardStats,
  getInterviewRoundsByApplicationIds,
  getInterviewRoundMetrics,
} from "@/lib/services/application.service";
import { getFollowUpSuggestions } from "@/lib/services/followup.service";
import { StatsBar } from "@/components/dashboard/StatsBar";
import { ApplicationTable } from "@/components/dashboard/ApplicationTable";
import { StatusFilter } from "@/components/dashboard/StatusFilter";
import { FollowUpSection } from "@/components/dashboard/FollowUpCard";
import { SyncButton } from "@/components/dashboard/SyncButton";
import { DashboardInsights } from "@/components/dashboard/DashboardInsights";
import { ConnectGmailBanner } from "@/components/dashboard/ConnectGmailBanner";
import type { ApplicationStage } from "@/types";

const VALID_STAGES: ApplicationStage[] = [
  "Applied", "Waiting", "Scheduling", "Interviewing", "Assessment", "Offer", "Rejected", "Closed",
];
const VALID_WINDOWS = new Set([30, 90, 180, 365]);
const RENDER_REFERENCE_MS = Date.now();

interface DashboardPageProps {
  searchParams: Promise<{
    stage?: string;
    connected?: string;
    error?: string;
    scan?: string;
    range?: string;
    applications?: string;
    gmailPrompted?: string;
    window?: string;
  }>;
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const clerkUser = await currentUser();
  const params = await searchParams;
  const stageFilter =
    params.stage && VALID_STAGES.includes(params.stage as ApplicationStage)
      ? (params.stage as ApplicationStage)
      : undefined;
  const selectedWindow = VALID_WINDOWS.has(Number(params.window))
    ? Number(params.window)
    : 30;

  const emptyStats = {
    total: 0,
    applied: 0,
    waiting: 0,
    scheduling: 0,
    assessment: 0,
    interviewing: 0,
    offers: 0,
    rejected: 0,
    pendingFollowUps: 0,
  };
  const emptyApps: Awaited<ReturnType<typeof getApplicationsForUser>> = [];
  const emptyFollowUps: Awaited<ReturnType<typeof getFollowUpSuggestions>> = [];

  // No database — show personal dashboard with empty state (Clerk data only)
  if (!prisma) {
    const firstName = clerkUser?.firstName ?? clerkUser?.emailAddresses[0]?.emailAddress?.split("@")[0] ?? "there";
    return (
      <div>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Welcome back, {firstName}
            </h1>
            <p className="text-gray-500 text-sm mt-0.5">
              Connect Gmail to start tracking your job applications
            </p>
          </div>
        </div>
        <ConnectGmailBanner />
        {params.error === "db_required" && (
          <div className="mb-6 p-6 bg-amber-50 border border-amber-200 rounded-xl">
            <h3 className="font-semibold text-amber-900 mb-2">Database setup (required for Gmail)</h3>
            <p className="text-amber-800 text-sm mb-3">Run these commands in your terminal:</p>
            <pre className="bg-amber-100 p-4 rounded-lg text-sm overflow-x-auto">
{`# 1. Get free DB at neon.tech → New Project → Copy connection string

# 2. Add to .env.local (in project root):
DATABASE_URL=postgresql://your-connection-string

# 3. Create tables:
npx prisma db push

# 4. Restart dev server (Ctrl+C then):
npm run dev`}
            </pre>
          </div>
        )}
        {(params.error === "redirect_uri_mismatch" || params.error === "gmail_connect_failed") && (
          <div className="mb-6 p-6 bg-amber-50 border border-amber-200 rounded-xl">
            <h3 className="font-semibold text-amber-900 mb-2">Fix Gmail connection</h3>
            <ol className="text-amber-800 text-sm space-y-2 list-decimal list-inside mb-3">
              <li>Go to <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer" className="underline">Google Cloud Credentials</a></li>
              <li>Click your OAuth 2.0 Client ID (Web application)</li>
              <li>Under <strong>Authorized redirect URIs</strong>, add exactly: <code className="bg-amber-100 px-1 rounded block mt-1">http://localhost:3000/api/gmail/connect/callback</code></li>
              <li>If your app runs on port 3001, also add: <code className="bg-amber-100 px-1 rounded block mt-1">http://localhost:3001/api/gmail/connect/callback</code></li>
              <li>Save, wait 1–2 minutes, then try Connect Gmail again</li>
            </ol>
          </div>
        )}
        {params.error === "google_oauth_missing" && (
          <div className="mb-6 p-6 bg-amber-50 border border-amber-200 rounded-xl">
            <h3 className="font-semibold text-amber-900 mb-2">Google OAuth setup (required for Gmail)</h3>
            <ol className="text-amber-800 text-sm space-y-2 list-decimal list-inside mb-3">
              <li>Go to <a href="https://console.cloud.google.com" target="_blank" rel="noopener noreferrer" className="underline">Google Cloud Console</a></li>
              <li>APIs & Services → Credentials → Create Credentials → OAuth 2.0 Client ID</li>
              <li>Application type: Web application</li>
              <li>Authorized redirect URI: <code className="bg-amber-100 px-1 rounded">http://localhost:3000/api/gmail/connect/callback</code></li>
              <li>Copy Client ID and Client Secret</li>
              <li>Add to .env.local: <code className="bg-amber-100 px-1 rounded">GOOGLE_CLIENT_ID=...</code> and <code className="bg-amber-100 px-1 rounded">GOOGLE_CLIENT_SECRET=...</code></li>
              <li>Restart dev server</li>
            </ol>
          </div>
        )}
        <StatsBar stats={emptyStats} />
        <FollowUpSection suggestions={[]} />
        <div className="flex items-center justify-between mb-4">
          <Suspense fallback={null}>
            <StatusFilter />
          </Suspense>
          <span className="text-sm text-gray-500">0 applications</span>
        </div>
        <ApplicationTable applications={[]} windowDays={selectedWindow} />
      </div>
    );
  }

  let user, connectedAccount;
  let ownerUserId = userId;
  const clerkEmail = clerkUser?.emailAddresses[0]?.emailAddress ?? "";
  try {
    user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user && clerkEmail) {
      user = await prisma.user.findUnique({ where: { email: clerkEmail } });
      if (user) ownerUserId = user.id;
    }
    connectedAccount = user
      ? await prisma.connectedAccount.findUnique({ where: { userId: ownerUserId } })
      : null;
  } catch {
    // DB connection failed — still show personal dashboard with empty state
    const firstName = clerkUser?.firstName ?? clerkUser?.emailAddresses[0]?.emailAddress?.split("@")[0] ?? "there";
    return (
      <div>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Welcome back, {firstName}
            </h1>
            <p className="text-gray-500 text-sm mt-0.5">
              Connect Gmail to start tracking your job applications
            </p>
          </div>
        </div>
        <ConnectGmailBanner />
        <StatsBar stats={emptyStats} />
        <FollowUpSection suggestions={[]} />
        <div className="flex items-center justify-between mb-4">
          <Suspense fallback={null}>
            <StatusFilter />
          </Suspense>
          <span className="text-sm text-gray-500">0 applications</span>
        </div>
        <ApplicationTable applications={[]} windowDays={selectedWindow} />
      </div>
    );
  }

  const isGoogleAuthUser =
    (clerkUser?.externalAccounts?.some((account) =>
      account.provider.toLowerCase().includes("google")
    ) ?? false) ||
    (user?.email?.toLowerCase().endsWith("@gmail.com") ?? false);
  const hasAttemptedAutoPrompt = params.gmailPrompted === "1";
  const hasBlockingError = [
    "gmail_access_denied",
    "gmail_connect_failed",
    "redirect_uri_mismatch",
    "google_oauth_missing",
  ].includes(params.error ?? "");

  if (isGoogleAuthUser && !connectedAccount && !hasAttemptedAutoPrompt && !hasBlockingError) {
    redirect(
      "/api/gmail/connect?auto=1&returnTo=%2Fdashboard%3FgmailPrompted%3D1"
    );
  }

  const isConnected = !!connectedAccount;

  const [applications, insightApplications, stats, followUps, roundMetrics] = isConnected
    ? await Promise.all([
        getApplicationsForUser(ownerUserId, stageFilter ? { stage: stageFilter } : undefined),
        getApplicationsForUser(ownerUserId),
        getDashboardStats(ownerUserId),
        getFollowUpSuggestions(ownerUserId),
        getInterviewRoundMetrics(ownerUserId, selectedWindow),
      ])
    : [
        [] as Awaited<ReturnType<typeof getApplicationsForUser>>,
        [] as Awaited<ReturnType<typeof getApplicationsForUser>>,
        emptyStats,
        [] as Awaited<ReturnType<typeof getFollowUpSuggestions>>,
        {
          total: 0,
          firstRoundCount: 0,
          secondRoundCount: 0,
          thirdRoundCount: 0,
          firstRoundRate: 0,
          secondRoundRate: 0,
          thirdRoundRate: 0,
        },
      ];

  const interviewRoundByAppId = isConnected
    ? await getInterviewRoundsByApplicationIds(
        ownerUserId,
        applications.map((a) => a.id)
      )
    : {};

  // Serialize dates for client components
  const serializedApps = applications.map((app) => {
    const primaryContact = app.contacts[0];
    const additionalEmails =
      primaryContact?.emails
        ?.filter((email) => !email.isPrimary)
        .map((email) => email.email)
        .slice(0, 3) ?? [];

    return {
      id: app.id,
      company: app.company,
      role: app.role,
      stage: app.stage,
      appliedAt: app.appliedAt?.toISOString() ?? null,
      lastActivityAt: app.lastActivityAt.toISOString(),
      atsProvider: app.atsProvider,
      recruiter: app.recruiter,
      interviewRound: interviewRoundByAppId[app.id]?.round ?? 0,
      interviewRoundLabel: interviewRoundByAppId[app.id]?.label ?? null,
      contactPerson: primaryContact?.fullName ?? null,
      contactPosition: primaryContact?.inferredTitle ?? null,
      contactWebProfileUrl: primaryContact?.webProfileUrl ?? null,
      additionalEmails,
      events: app.events.map((e) => ({
        summary: e.summary,
        occurredAt: e.occurredAt.toISOString(),
      })),
    };
  });
  const serializedInsightApps = insightApplications.map((app) => ({
    id: app.id,
    stage: app.stage,
    company: app.company,
    role: app.role,
    appliedAt: app.appliedAt?.toISOString() ?? null,
    lastActivityAt: app.lastActivityAt.toISOString(),
  }));

  const serializedFollowUps = followUps.map((f) => ({
    ...f,
    dueAt: f.dueAt.toISOString(),
  }));
  const windowMs = selectedWindow * 24 * 60 * 60 * 1000;
  const nowMs = RENDER_REFERENCE_MS;
  const windowedApps = serializedApps.filter((app) => {
    const base = app.appliedAt ? new Date(app.appliedAt).getTime() : new Date(app.lastActivityAt).getTime();
    return nowMs - base <= windowMs;
  });
  const scannedWindow = user?.initialScanRangeDays ?? 90;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Job Applications</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {isConnected
              ? "Tracking your inbox automatically"
              : "Connect Gmail to start tracking"}
          </p>
        </div>
        {isConnected && (
          <SyncButton selectedWindow={selectedWindow} scannedWindow={scannedWindow} />
        )}
      </div>

      {/* Notifications */}
      {params.connected && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
          Gmail connected successfully.
        </div>
      )}
      {params.scan === "completed" && (
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-blue-700 text-sm">
          Scan complete for the last {params.range ?? "90"} days. Found{" "}
          {params.applications ?? "0"} job application
          {params.applications === "1" ? "" : "s"}.
        </div>
      )}
      {/* Connect banner */}
      {!isConnected && <ConnectGmailBanner />}

      {/* Stats */}
      <StatsBar stats={stats} />

      {/* Insights */}
      <DashboardInsights
        applications={serializedInsightApps}
        windowDays={selectedWindow}
        roundMetrics={roundMetrics}
      />

      {/* Follow-up suggestions */}
      <FollowUpSection suggestions={serializedFollowUps} />

      {applications.length > 0 && (
        <div className="mb-6 border border-blue-200 bg-blue-50 rounded-xl p-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-blue-900">People Enrichment (Clay-style)</p>
            <p className="text-xs text-blue-700 mt-0.5">
              Open any application and click <strong>Find People</strong> to search and enrich people.
            </p>
          </div>
          <Link
            href={`/applications/${applications[0].id}`}
            className="text-sm bg-blue-600 text-white px-3 py-2 rounded-lg hover:bg-blue-700 whitespace-nowrap"
          >
            Open enrichment
          </Link>
        </div>
      )}

      {/* Filter + Table */}
      <div className="flex items-center justify-between mb-4">
        <Suspense fallback={null}>
          <StatusFilter />
        </Suspense>
        <span className="text-sm text-gray-500">
          {windowedApps.length} application{windowedApps.length !== 1 ? "s" : ""} in last {selectedWindow}d
        </span>
      </div>

      <ApplicationTable applications={serializedApps} windowDays={selectedWindow} />
    </div>
  );
}
