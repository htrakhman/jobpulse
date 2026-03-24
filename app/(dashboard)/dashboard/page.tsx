import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { unstable_noStore as noStore } from "next/cache";
import { prisma } from "@/lib/prisma";
import {
  getApplicationsForUser,
  getApplicationConfirmationInsightData,
  getDashboardStats,
  getInterviewRoundsByApplicationIds,
  getInterviewRoundMetrics,
} from "@/lib/services/application.service";
import { StatsBar } from "@/components/dashboard/StatsBar";
import { ApplicationTable } from "@/components/dashboard/ApplicationTable";
import { StatusFilter } from "@/components/dashboard/StatusFilter";
import { SyncButton } from "@/components/dashboard/SyncButton";
import { DashboardInsights } from "@/components/dashboard/DashboardInsights";
import { ConnectGmailBanner } from "@/components/dashboard/ConnectGmailBanner";
import { getDashboardOSPayload } from "@/lib/services/dashboard-metrics.service";
import { SimplifiedOverview } from "@/components/dashboard/SimplifiedOverview";
import { FunnelMetrics } from "@/components/dashboard/FunnelMetrics";
import { FollowupIntelligencePanel } from "@/components/dashboard/FollowupIntelligencePanel";
import { GoalsPacingPanel } from "@/components/dashboard/GoalsPacingPanel";
import { TimeToEventPanel } from "@/components/dashboard/TimeToEventPanel";
import type { ApplicationStage } from "@/types";
import type { DashboardOSPayload } from "@/lib/services/os-metrics.types";

const VALID_STAGES: ApplicationStage[] = [
  "Applied", "Waiting", "Scheduling", "Interviewing", "Assessment", "Offer", "Rejected", "Closed",
];
const VALID_WINDOWS = new Set([30, 90, 180, 365]);
const EMPTY_OS_PAYLOAD: DashboardOSPayload = {
  actionCenter: {
    followUpsDueToday: 0,
    interviewsToPrep: 0,
    staleApplications: 0,
    targetRemainingToday: 0,
    targetRemainingThisWeek: 0,
    items: [],
  },
  funnel: { steps: [], offerRatePer100: 0 },
  followup: { buckets: { urgent: 0, high: 0, normal: 0, low: 0 }, rows: [] },
  attribution: {
    bySource: [],
    byMethod: [],
    byResumeVersion: [],
    bestSource: null,
    bestResumeVersion: null,
    referralsOutperformCold: false,
  },
  timeToEvent: {
    avgDaysApplicationToFirstResponse: 0,
    avgDaysApplicationToInterview: 0,
    avgDaysInterviewToDecision: 0,
    avgDaysLastTouchToFollowup: 0,
    staleBuckets: [],
  },
  goals: {
    dailyApplicationGoal: 0,
    weeklyApplicationGoal: 0,
    weeklyInterviewGoal: 0,
    weeklyNetworkingGoal: 0,
    weeklyFollowupGoal: 0,
    applicationsThisWeek: 0,
    interviewsThisWeek: 0,
    followupsCompletedThisWeek: 0,
    projectedApplicationsByWeekEnd: 0,
    projectedInterviewsByWeekEnd: 0,
    applicationPacing: "on_track",
    interviewPacing: "on_track",
  },
  insights: [],
};

interface DashboardPageProps {
  searchParams: Promise<{
    stage?: string;
    stages?: string;
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
  noStore();
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const clerkUser = await currentUser();
  const params = await searchParams;
  const selectedStages = (
    params.stages
      ? params.stages.split(",")
      : params.stage
      ? [params.stage]
      : []
  ).filter((value): value is ApplicationStage =>
    VALID_STAGES.includes(value as ApplicationStage)
  );
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

  // Stale OAuth error in URL after Gmail is connected — strip it so logs/address bar stay clean.
  const oauthErrorsClearWhenConnected = new Set([
    "gmail_connect_failed",
    "redirect_uri_mismatch",
    "gmail_access_denied",
    "google_oauth_missing",
  ]);
  if (isConnected && params.error && oauthErrorsClearWhenConnected.has(params.error)) {
    const sp = new URLSearchParams();
    if (selectedWindow !== 30) sp.set("window", String(selectedWindow));
    if (selectedStages.length > 0) sp.set("stages", selectedStages.join(","));
    if (params.connected) sp.set("connected", params.connected);
    if (params.scan) sp.set("scan", params.scan);
    if (params.range) sp.set("range", params.range);
    if (params.applications) sp.set("applications", params.applications);
    if (params.gmailPrompted === "1") sp.set("gmailPrompted", "1");
    const q = sp.toString();
    redirect(q ? `/dashboard?${q}` : "/dashboard");
  }

  const [applications, insightApplications, stats, roundMetrics, osPayload, inboxInsightData] =
    isConnected
      ? await Promise.all([
          getApplicationsForUser(
            ownerUserId,
            selectedStages.length > 0 ? { stages: selectedStages } : undefined
          ),
          getApplicationsForUser(ownerUserId),
          getDashboardStats(ownerUserId, selectedWindow),
          getInterviewRoundMetrics(ownerUserId, selectedWindow, selectedStages),
          getDashboardOSPayload(ownerUserId, selectedWindow),
          getApplicationConfirmationInsightData(ownerUserId, selectedWindow),
        ])
      : [
          [] as Awaited<ReturnType<typeof getApplicationsForUser>>,
          [] as Awaited<ReturnType<typeof getApplicationsForUser>>,
          emptyStats,
          {
            total: 0,
            firstRoundCount: 0,
            secondRoundCount: 0,
            thirdRoundCount: 0,
            firstRoundRate: 0,
            secondRoundRate: 0,
            thirdRoundRate: 0,
          },
          EMPTY_OS_PAYLOAD,
          { perApplication: [] as { applicationId: string; firstConfirmationAt: string }[] },
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
      source: app.source,
      method: app.method,
      resumeVersion: app.resumeVersion,
      coverLetterVersion: app.coverLetterVersion,
      targetPriority: app.targetPriority,
      salaryBand: app.salaryBand,
      targetCompMin: app.targetCompMin,
      targetCompMax: app.targetCompMax,
      nextAction: app.nextAction,
      nextActionDate: app.nextActionDate?.toISOString() ?? null,
      followUpUrgency: app.followUpUrgency,
      workModelPreference: app.workModelPreference,
      outreachSent: app.outreachSent,
      contactedRecruiter: app.contactedRecruiter,
      appliedAt: app.appliedAt?.toISOString() ?? null,
      lastActivityAt: app.lastActivityAt.toISOString(),
      atsProvider: app.atsProvider,
      recruiter: app.recruiter,
      interviewRound: interviewRoundByAppId[app.id]?.round ?? 0,
      interviewRoundLabel: interviewRoundByAppId[app.id]?.label ?? null,
      contactPerson: primaryContact?.fullName ?? null,
      contactPosition: primaryContact?.inferredTitle ?? null,
      contactWebProfileUrl: primaryContact?.webProfileUrl ?? null,
      latestThreadId: app.emails[0]?.threadId ?? null,
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
  const windowMs = selectedWindow * 24 * 60 * 60 * 1000;
  const nowMs = Date.now();
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
          <SyncButton
            selectedWindow={selectedWindow}
            scannedWindow={scannedWindow}
            lastInboxSyncedAtIso={
              user?.lastInboxSyncedAt?.toISOString() ??
              user?.initialScanCompletedAt?.toISOString() ??
              null
            }
          />
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

      <SimplifiedOverview
        stats={stats}
        windowDays={selectedWindow}
        osPayload={osPayload}
        roundMetrics={roundMetrics}
        applications={serializedApps.map((a) => ({
          company: a.company,
          stage: a.stage,
          lastActivityAt: a.lastActivityAt,
        }))}
        inboxInsightData={{ perApplication: inboxInsightData.perApplication }}
      />
      <DashboardInsights
        applications={serializedInsightApps}
        windowDays={selectedWindow}
        selectedStages={selectedStages}
        inboxInsightData={{ perApplication: inboxInsightData.perApplication }}
      />
      <FunnelMetrics funnel={osPayload.funnel} />
      <FollowupIntelligencePanel followup={osPayload.followup} />
      <GoalsPacingPanel goals={osPayload.goals} roundMetrics={roundMetrics} />
      <TimeToEventPanel timeToEvent={osPayload.timeToEvent} />
      <StatsBar stats={stats} selectedStages={selectedStages} />

      {/* Filter + Table */}
      <div className="flex items-center justify-between mb-4">
        <Suspense fallback={null}>
          <StatusFilter />
        </Suspense>
        <span className="text-sm text-gray-500">
          {windowedApps.length} application{windowedApps.length !== 1 ? "s" : ""} in last {selectedWindow}d
        </span>
      </div>

      <ApplicationTable applications={serializedApps} windowDays={selectedWindow} osPayload={osPayload} />
    </div>
  );
}
