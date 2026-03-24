"use client";

import type { DashboardStats } from "@/types";
import type { ApplicationStage } from "@/types";
import type { DashboardOSPayload } from "@/lib/services/os-metrics.types";
import type { InterviewRoundMetrics } from "@/lib/services/application.service";

type SimplifiedOverviewProps = {
  stats: DashboardStats;
  windowDays: number;
  osPayload: DashboardOSPayload;
  roundMetrics: InterviewRoundMetrics;
  applications: Array<{
    company: string;
    stage: ApplicationStage;
    lastActivityAt: string;
  }>;
  inboxInsightData: { perApplication: Array<{ applicationId: string; firstConfirmationAt: string }> };
};

function dayKeyLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function SimplifiedOverview({
  stats,
  windowDays,
  osPayload,
  roundMetrics,
  applications = [],
  inboxInsightData,
}: SimplifiedOverviewProps) {
  const days = Math.max(7, Math.min(90, windowDays));
  const now = new Date();
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  const buckets: Array<{ key: string; label: string; count: number }> = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    buckets.push({
      key: dayKeyLocal(d),
      label: d.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      count: 0,
    });
  }
  const bucketMap = new Map(buckets.map((b, idx) => [b.key, idx]));
  for (const row of inboxInsightData.perApplication) {
    const key = dayKeyLocal(new Date(row.firstConfirmationAt));
    const idx = bucketMap.get(key);
    if (idx !== undefined) buckets[idx].count += 1;
  }

  const max = Math.max(1, ...buckets.map((b) => b.count));
  const points = buckets.map((b, i) => {
    const x = (i / Math.max(1, buckets.length - 1)) * 100;
    const y = 100 - (b.count / max) * 100;
    return `${x},${y}`;
  });
  const polyline = points.join(" ");
  const area = `0,100 ${polyline} 100,100`;
  const totalInWindow = buckets.reduce((sum, b) => sum + b.count, 0);
  const todayCount = buckets[buckets.length - 1]?.count ?? 0;

  const stageRows = [
    { label: "Applied", value: stats.applied },
    { label: "Awaiting", value: stats.waiting },
    { label: "Interviewing", value: stats.interviewing + stats.scheduling + stats.assessment },
    { label: "Offers", value: stats.offers },
    { label: "Rejected", value: stats.rejected },
  ];
  const stageTotal = stageRows.reduce((sum, r) => sum + r.value, 0) || 1;
  const stageGradient = (() => {
    let offset = 0;
    const colors = ["#60a5fa", "#22d3ee", "#a78bfa", "#34d399", "#fb7185"];
    return stageRows
      .map((row, idx) => {
        const start = Math.round((offset / stageTotal) * 100);
        offset += row.value;
        const end = Math.round((offset / stageTotal) * 100);
        return `${colors[idx]} ${start}% ${end}%`;
      })
      .join(", ");
  })();

  const safeApplications = Array.isArray(applications) ? applications : [];
  const recentLeaders = [...safeApplications]
    .sort((a, b) => new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime())
    .slice(0, 5);

  return (
    <section className="mb-6 grid gap-4 md:grid-cols-12">
      <div className="md:col-span-5 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500">
              New Conversations
            </p>
            <p className="mt-1 text-3xl font-semibold tabular-nums text-slate-900">{stats.total}</p>
            <p className="mt-0.5 text-xs text-slate-500">Rolling {windowDays}-day window</p>
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-right">
            <p className="text-[10px] uppercase tracking-wide text-slate-500">Today</p>
            <p className="text-lg font-semibold tabular-nums text-slate-900">{todayCount}</p>
          </div>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Applied {stats.applied} · Follow-ups {stats.pendingFollowUps} · Offers {stats.offers}
        </p>
        <svg viewBox="0 0 100 36" preserveAspectRatio="none" className="mt-3 h-20 w-full rounded bg-slate-50">
          {[0, 1, 2, 3].map((i) => (
            <line key={i} x1="0" y1={i * 12} x2="100" y2={i * 12} stroke="#e2e8f0" strokeWidth="0.4" />
          ))}
          <polyline
            points={buckets
              .map((b, i) => {
                const x = (i / Math.max(1, buckets.length - 1)) * 100;
                const y = 36 - (b.count / max) * 30 - 3;
                return `${x},${y}`;
              })
              .join(" ")}
            fill="none"
            stroke="#2563eb"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      <div className="md:col-span-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500">
          Confirmation Volume (Recent)
        </p>
        <div className="mt-3 grid grid-cols-10 gap-1.5">
          {buckets.slice(-20).map((b) => {
            const h = Math.max(10, Math.round((b.count / max) * 68));
            return (
              <div key={b.key} className="rounded-sm bg-slate-100">
                <div className="w-full rounded-sm bg-gradient-to-t from-blue-600 to-cyan-400" style={{ height: `${h}px` }} />
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Today {todayCount} · Last {days}d total {totalInWindow}
        </p>
      </div>

      <div className="md:col-span-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500">Open by Stage</p>
        <div className="mt-4 flex items-center gap-4">
          <div
            className="h-24 w-24 rounded-full border-4 border-slate-100"
            style={{ background: `conic-gradient(${stageGradient})` }}
          />
          <div>
            <p className="text-3xl font-semibold tabular-nums text-slate-900">{stats.total}</p>
            <p className="text-xs text-slate-500">Total tracked</p>
          </div>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Interview pipeline: {roundMetrics.firstRoundCount} first-round, {roundMetrics.secondRoundCount} second-round+
        </p>
      </div>

      <div className="md:col-span-3 rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
        <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500">Follow-ups</p>
        <p className="mt-1.5 text-3xl font-semibold tabular-nums text-slate-900">{stats.pendingFollowUps}</p>
        <p className="mt-1 text-xs text-slate-500">Due now</p>
      </div>
      <div className="md:col-span-3 rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
        <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500">Stale apps</p>
        <p className="mt-1.5 text-3xl font-semibold tabular-nums text-slate-900">{osPayload.actionCenter.staleApplications}</p>
        <p className="mt-1 text-xs text-slate-500">Need touchpoint</p>
      </div>
      <div className="md:col-span-3 rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
        <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500">Interviews to prep</p>
        <p className="mt-1.5 text-3xl font-semibold tabular-nums text-slate-900">{osPayload.actionCenter.interviewsToPrep}</p>
        <p className="mt-1 text-xs text-slate-500">Scheduling stage</p>
      </div>
      <div className="md:col-span-3 rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
        <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500">Apply goal left today</p>
        <p className="mt-1.5 text-3xl font-semibold tabular-nums text-slate-900">{osPayload.actionCenter.targetRemainingToday}</p>
        <p className="mt-1 text-xs text-slate-500">Daily pace</p>
      </div>

      <div className="md:col-span-12 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-semibold tracking-wide text-slate-800">Top active opportunities</p>
          <p className="text-xs text-slate-500">Latest activity</p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-slate-500 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left py-2 pr-4">#</th>
                <th className="text-left py-2 pr-4">Company</th>
                <th className="text-left py-2 pr-4">Stage</th>
                <th className="text-right py-2">Last activity</th>
              </tr>
            </thead>
            <tbody>
              {recentLeaders.length === 0 ? (
                <tr className="border-t border-slate-100">
                  <td colSpan={4} className="py-4 text-center text-slate-500">
                    No recent activity in this window.
                  </td>
                </tr>
              ) : recentLeaders.map((row, idx) => (
                <tr key={`${row.company}-${idx}`} className="border-t border-slate-100">
                  <td className="py-2.5 pr-4 text-slate-500">{idx + 1}</td>
                  <td className="py-2.5 pr-4 font-medium text-slate-900">{row.company}</td>
                  <td className="py-2.5 pr-4 text-slate-700">{row.stage}</td>
                  <td className="py-2.5 text-right text-slate-600">
                    {new Date(row.lastActivityAt).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
