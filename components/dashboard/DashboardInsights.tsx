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
  windowDays: number;
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

export function DashboardInsights({ applications, windowDays }: DashboardInsightsProps) {
  const now = new Date();
  const windowMs = windowDays * 24 * 60 * 60 * 1000;
  const filteredApps = applications.filter((app) => {
    const source = app.appliedAt ? new Date(app.appliedAt) : new Date(app.lastActivityAt);
    return now.getTime() - source.getTime() <= windowMs;
  });

  const total = filteredApps.length;
  const byStage = new Map<ApplicationStage, number>();
  for (const stage of STAGE_GROUPS.map((s) => s.key)) byStage.set(stage, 0);
  for (const app of filteredApps) byStage.set(app.stage, (byStage.get(app.stage) ?? 0) + 1);

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

  const weeks = Math.max(12, Math.min(52, Math.ceil(windowDays / 7)));
  const thisWeek = weekStart(now);
  const buckets: Array<{ key: string; label: string; count: number }> = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const d = new Date(thisWeek);
    d.setDate(d.getDate() - i * 7);
    const key = d.toISOString().slice(0, 10);
    buckets.push({ key, label: d.toLocaleDateString(undefined, { month: "short", day: "numeric" }), count: 0 });
  }
  const bucketMap = new Map(buckets.map((b, idx) => [b.key, idx]));
  for (const app of filteredApps) {
    const source = app.appliedAt ? new Date(app.appliedAt) : new Date(app.lastActivityAt);
    const wk = weekStart(source).toISOString().slice(0, 10);
    const idx = bucketMap.get(wk);
    if (idx !== undefined) buckets[idx].count += 1;
  }
  const maxY = Math.max(1, ...buckets.map((b) => b.count));
  const averagePerWeek = buckets.length
    ? buckets.reduce((sum, b) => sum + b.count, 0) / buckets.length
    : 0;
  const peak = buckets.reduce(
    (best, b) => (b.count > best.count ? b : best),
    { key: "", label: "-", count: 0 }
  );
  const yTicks = [maxY, Math.round(maxY * 0.66), Math.round(maxY * 0.33), 0];
  const chartPoints = buckets.map((b, i) => {
    const x = (i / Math.max(1, buckets.length - 1)) * 100;
    const y = 100 - (b.count / maxY) * 100;
    return { ...b, x, y };
  });
  const linePath = chartPoints.map((p) => `${p.x},${p.y}`).join(" ");
  const areaPath = `0,100 ${linePath} 100,100`;
  const latestPoint = chartPoints[chartPoints.length - 1];
  const peakPoint = chartPoints.reduce(
    (best, p) => (p.count > best.count ? p : best),
    chartPoints[0] ?? { x: 0, y: 100, count: 0, key: "", label: "" }
  );
  const monthLabels = chartPoints.filter((p, idx, arr) => {
    if (idx === 0 || idx === arr.length - 1) return true;
    const prev = new Date(arr[idx - 1].key).getMonth();
    const cur = new Date(p.key).getMonth();
    return cur !== prev;
  });

  return (
    <div className="mb-6 grid gap-4 lg:grid-cols-3">
      <div className="lg:col-span-2 border border-gray-200 rounded-xl bg-white p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-semibold text-gray-800">
            Application Trend (last {Math.round(weeks / 4.35)} month{Math.round(weeks / 4.35) === 1 ? "" : "s"})
          </p>
          <div className="text-[11px] text-gray-500 flex items-center gap-2">
            <span className="rounded bg-gray-50 px-2 py-1">Total <strong className="text-gray-700">{total}</strong></span>
            <span className="rounded bg-gray-50 px-2 py-1">Avg/wk <strong className="text-gray-700">{averagePerWeek.toFixed(1)}</strong></span>
            <span className="rounded bg-gray-50 px-2 py-1">Peak <strong className="text-gray-700">{peak.count}</strong></span>
          </div>
        </div>
        <div className="w-full h-52 relative pl-8 pr-2">
          <div className="absolute left-0 top-0 h-full w-7 text-[10px] text-gray-400 flex flex-col justify-between">
            {yTicks.map((tick, i) => (
              <span key={i}>{tick}</span>
            ))}
          </div>
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full rounded-lg bg-gradient-to-b from-blue-50/40 to-white">
            <defs>
              <linearGradient id="trendArea" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.22" />
                <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.02" />
              </linearGradient>
            </defs>
            {yTicks.map((_, idx) => {
              const y = (idx / Math.max(1, yTicks.length - 1)) * 100;
              return (
                <line key={idx} x1="0" y1={y} x2="100" y2={y} stroke="#eef2ff" strokeWidth="0.6" />
              );
            })}
            <polygon points={areaPath} fill="url(#trendArea)" />
            <polyline fill="none" stroke="#2563eb" strokeWidth="2.2" points={linePath} vectorEffect="non-scaling-stroke" />

            <circle cx={peakPoint.x} cy={peakPoint.y} r="2" fill="#1d4ed8" />
            <text x={peakPoint.x} y={Math.max(6, peakPoint.y - 4)} textAnchor="middle" fontSize="3.2" fill="#1f2937">
              {peakPoint.count}
            </text>

            <circle cx={latestPoint.x} cy={latestPoint.y} r="2.1" fill="#2563eb" />
            <text x={latestPoint.x} y={Math.max(6, latestPoint.y - 4)} textAnchor="end" fontSize="3.2" fill="#1f2937">
              {latestPoint.count}
            </text>
          </svg>
        </div>
        <div className="flex justify-between text-[10px] text-gray-400 mt-2">
          {monthLabels.map((p) => (
            <span key={p.key}>{p.label}</span>
          ))}
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
