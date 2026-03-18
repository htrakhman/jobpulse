"use client";

import type { ApplicationStage } from "@/types";

interface InsightApplication {
  id: string;
  stage: ApplicationStage;
  appliedAt: string | null;
  lastActivityAt: string;
}

interface DashboardInsightsProps {
  applications: InsightApplication[];
}

const STAGE_GROUPS: Array<{ key: ApplicationStage; label: string; color: string }> = [
  { key: "Applied", label: "Applied", color: "bg-blue-500" },
  { key: "Waiting", label: "Awaiting Response", color: "bg-slate-500" },
  { key: "Assessment", label: "Assessment", color: "bg-orange-500" },
  { key: "Interviewing", label: "Interviewing", color: "bg-purple-500" },
  { key: "Offer", label: "Offer Received", color: "bg-green-500" },
  { key: "Rejected", label: "Rejected", color: "bg-rose-500" },
  { key: "Closed", label: "Closed", color: "bg-gray-500" },
];

function weekStart(d: Date) {
  const x = new Date(d);
  const day = x.getDay();
  const diff = (day + 6) % 7;
  x.setDate(x.getDate() - diff);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function DashboardInsights({ applications }: DashboardInsightsProps) {
  const total = applications.length;
  const byStage = new Map<ApplicationStage, number>();
  for (const stage of STAGE_GROUPS.map((s) => s.key)) byStage.set(stage, 0);
  for (const app of applications) byStage.set(app.stage, (byStage.get(app.stage) ?? 0) + 1);

  const progressedToInterview =
    (byStage.get("Interviewing") ?? 0) + (byStage.get("Offer") ?? 0);
  const offerCount = byStage.get("Offer") ?? 0;
  const responseRate = total
    ? ((total - (byStage.get("Waiting") ?? 0)) / total) * 100
    : 0;
  const interviewRate = total ? (progressedToInterview / total) * 100 : 0;
  const offerRateFromInterview = progressedToInterview
    ? (offerCount / progressedToInterview) * 100
    : 0;

  const weeks = 12;
  const now = new Date();
  const thisWeek = weekStart(now);
  const buckets: Array<{ key: string; label: string; count: number }> = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const d = new Date(thisWeek);
    d.setDate(d.getDate() - i * 7);
    const key = d.toISOString().slice(0, 10);
    buckets.push({ key, label: d.toLocaleDateString(undefined, { month: "short", day: "numeric" }), count: 0 });
  }
  const bucketMap = new Map(buckets.map((b, idx) => [b.key, idx]));
  for (const app of applications) {
    const source = app.appliedAt ? new Date(app.appliedAt) : new Date(app.lastActivityAt);
    const wk = weekStart(source).toISOString().slice(0, 10);
    const idx = bucketMap.get(wk);
    if (idx !== undefined) buckets[idx].count += 1;
  }
  const maxY = Math.max(1, ...buckets.map((b) => b.count));
  const points = buckets
    .map((b, i) => {
      const x = (i / Math.max(1, buckets.length - 1)) * 100;
      const y = 100 - (b.count / maxY) * 100;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <div className="mb-6 grid gap-4 lg:grid-cols-3">
      <div className="lg:col-span-2 border border-gray-200 rounded-xl bg-white p-4">
        <p className="text-sm font-semibold text-gray-800 mb-3">Application Trend (last 12 weeks)</p>
        <div className="w-full h-44">
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full">
            <polyline
              fill="none"
              stroke="#d1d5db"
              strokeWidth="0.4"
              points="0,100 100,100"
            />
            <polyline
              fill="none"
              stroke="#2563eb"
              strokeWidth="2"
              points={points}
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        </div>
        <div className="flex justify-between text-[10px] text-gray-400 mt-1">
          <span>{buckets[0]?.label}</span>
          <span>{buckets[buckets.length - 1]?.label}</span>
        </div>
      </div>

      <div className="border border-gray-200 rounded-xl bg-white p-4">
        <p className="text-sm font-semibold text-gray-800 mb-3">Conversion Metrics</p>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between"><span className="text-gray-500">Response rate</span><span className="font-semibold">{responseRate.toFixed(1)}%</span></div>
          <div className="flex justify-between"><span className="text-gray-500">Interview rate</span><span className="font-semibold">{interviewRate.toFixed(1)}%</span></div>
          <div className="flex justify-between"><span className="text-gray-500">Offer from interview</span><span className="font-semibold">{offerRateFromInterview.toFixed(1)}%</span></div>
          <div className="flex justify-between"><span className="text-gray-500">Total tracked</span><span className="font-semibold">{total}</span></div>
        </div>
      </div>

      <div className="lg:col-span-3 border border-gray-200 rounded-xl bg-white p-4">
        <p className="text-sm font-semibold text-gray-800 mb-3">Stage Distribution</p>
        <div className="grid md:grid-cols-2 gap-2">
          {STAGE_GROUPS.map((stage) => {
            const value = byStage.get(stage.key) ?? 0;
            const pct = total ? (value / total) * 100 : 0;
            return (
              <div key={stage.key} className="space-y-1">
                <div className="flex items-center justify-between text-xs text-gray-600">
                  <span>{stage.label}</span>
                  <span>{value} ({pct.toFixed(0)}%)</span>
                </div>
                <div className="h-2 rounded bg-gray-100 overflow-hidden">
                  <div className={`h-full ${stage.color}`} style={{ width: `${Math.max(2, pct)}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
