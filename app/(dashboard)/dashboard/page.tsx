import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { prisma } from "@/lib/prisma";
import { getApplicationsForUser, getDashboardStats } from "@/lib/services/application.service";
import { getFollowUpSuggestions } from "@/lib/services/followup.service";
import { StatsBar } from "@/components/dashboard/StatsBar";
import { ApplicationTable } from "@/components/dashboard/ApplicationTable";
import { StatusFilter } from "@/components/dashboard/StatusFilter";
import { FollowUpSection } from "@/components/dashboard/FollowUpCard";
import { SyncButton } from "@/components/dashboard/SyncButton";
import { ConnectGmailBanner } from "@/components/dashboard/ConnectGmailBanner";
import type { ApplicationStage } from "@/types";

const VALID_STAGES: ApplicationStage[] = [
  "Applied", "Waiting", "Interviewing", "Assessment", "Offer", "Rejected", "Closed",
];

interface DashboardPageProps {
  searchParams: Promise<{
    stage?: string;
    connected?: string;
    error?: string;
    scan?: string;
    range?: string;
    applications?: string;
    gmailPrompted?: string;
  }>;
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const params = await searchParams;
  const stageFilter =
    params.stage && VALID_STAGES.includes(params.stage as ApplicationStage)
      ? (params.stage as ApplicationStage)
      : undefined;

  // Ensure user record exists
  const user = await prisma.user.findUnique({ where: { id: userId } });
  const clerkUser = await currentUser();

  const connectedAccount = user
    ? await prisma.connectedAccount.findUnique({ where: { userId } })
    : null;

  const isGoogleAuthUser =
    (clerkUser?.externalAccounts?.some((account) =>
      account.provider.toLowerCase().includes("google")
    ) ?? false) ||
    (user?.email?.toLowerCase().endsWith("@gmail.com") ?? false);
  const hasAttemptedAutoPrompt = params.gmailPrompted === "1";
  const hasBlockingError = params.error === "gmail_access_denied";

  if (isGoogleAuthUser && !connectedAccount && !hasAttemptedAutoPrompt && !hasBlockingError) {
    redirect(
      "/api/gmail/connect?auto=1&returnTo=%2Fdashboard%3FgmailPrompted%3D1"
    );
  }

  const isConnected = !!connectedAccount;

  const emptyStats = { total: 0, active: 0, interviewing: 0, offers: 0, rejected: 0, pendingFollowUps: 0 };
  const [applications, stats, followUps] = isConnected
    ? await Promise.all([
        getApplicationsForUser(userId, stageFilter ? { stage: stageFilter } : undefined),
        getDashboardStats(userId),
        getFollowUpSuggestions(userId),
      ])
    : [
        [] as Awaited<ReturnType<typeof getApplicationsForUser>>,
        emptyStats,
        [] as Awaited<ReturnType<typeof getFollowUpSuggestions>>,
      ];

  // Serialize dates for client components
  const serializedApps = applications.map((app) => ({
    ...app,
    appliedAt: app.appliedAt?.toISOString() ?? null,
    lastActivityAt: app.lastActivityAt.toISOString(),
    events: app.events.map((e) => ({
      ...e,
      occurredAt: e.occurredAt.toISOString(),
    })),
  }));

  const serializedFollowUps = followUps.map((f) => ({
    ...f,
    dueAt: f.dueAt.toISOString(),
  }));

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
        {isConnected && <SyncButton />}
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
      {params.error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {params.error === "gmail_access_denied"
            ? "Gmail access was denied. Add your account as an OAuth test user in Google Cloud, then try again."
            : params.error === "gmail_connect_failed"
            ? "Failed to connect Gmail. Please try again."
            : "Something went wrong."}
        </div>
      )}

      {/* Connect banner */}
      {!isConnected && <ConnectGmailBanner />}

      {/* Stats */}
      <StatsBar stats={stats} />

      {/* Follow-up suggestions */}
      <FollowUpSection suggestions={serializedFollowUps} />

      {/* Filter + Table */}
      <div className="flex items-center justify-between mb-4">
        <Suspense fallback={null}>
          <StatusFilter />
        </Suspense>
        <span className="text-sm text-gray-500">
          {applications.length} application{applications.length !== 1 ? "s" : ""}
        </span>
      </div>

      <ApplicationTable applications={serializedApps} />
    </div>
  );
}
