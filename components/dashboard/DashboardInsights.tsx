"use client";

import { useState } from "react";
import type { ApplicationStage } from "@/types";

interface InsightApplication {
  id: string;
  stage: ApplicationStage;
  company: string;
  role: string | null;
  appliedAt: string | null;
  lastActivityAt: string;
}

export type InsightTrendMode = "inbox_confirmation" | "applied_at_record" | "activity_date";

interface DashboardInsightsProps {
  applications: InsightApplication[];
  windowDays: number;
  selectedStages?: ApplicationStage[];
  /** First application_confirmation email per application (from inbox scan). */
  inboxInsightData?: { perApplication: Array<{ applicationId: string; dayKey: string }> };
}

const TREND_MODE_OPTIONS: Array<{
  value: InsightTrendMode;
  label: string;
  description: string;
}> = [
  {
    value: "inbox_confirmation",
    label: "Applications (inbox confirmations)",
    description:
      "Per day: jobs where the first inbox confirmation landed (e.g. “thank you for applying”, “thank you for your application to …”, “application received”, and similar).",
  },
  {
    value: "applied_at_record",
    label: "Applied date (record)",
    description: "Uses stored appliedAt only; company-deduped; rolling window by applied/activity.",
  },
  {
    value: "activity_date",
    label: "Any activity date",
    description: "Uses appliedAt or lastActivity per day; company-deduped (broader than strict applies).",
  },
];

const STAGE_GROUPS: Array<{ key: ApplicationStage; label: string; color: string }> = [
  { key: "Applied", label: "Applied", color: "bg-blue-500" },
  { key: "Waiting", label: "Awaiting Response", color: "bg-slate-500" },
  { key: "Scheduling", label: "Scheduling", color: "bg-indigo-500" },
  { key: "Assessment", label: "Assessment", color: "bg-orange-500" },
  { key: "Interviewing", label: "Interviewing", color: "bg-purple-500" },
  { key: "Offer", label: "Offer Received", color: "bg-green-500" },
  { key: "Rejected", label: "Rejected", color: "bg-rose-500" },
  { key: "Closed", label: "Closed", color: "bg-gray-500" },
];

const INDUSTRY_COLORS = [
  "#2563eb",
  "#7c3aed",
  "#f97316",
  "#16a34a",
  "#db2777",
  "#14b8a6",
  "#eab308",
  "#6b7280",
];

const SIZE_COLORS = ["#2563eb", "#16a34a", "#f97316", "#6b7280"];
const STAGE_PRIORITY: ApplicationStage[] = [
  "Applied",
  "Waiting",
  "Scheduling",
  "Assessment",
  "Interviewing",
  "Offer",
  "Rejected",
  "Closed",
];

function niceAxisMax(value: number): number {
  if (value <= 1) return 2;
  const exponent = Math.floor(Math.log10(value));
  const base = 10 ** exponent;
  const fraction = value / base;
  if (fraction <= 1) return 1 * base;
  if (fraction <= 2) return 2 * base;
  if (fraction <= 5) return 5 * base;
  return 10 * base;
}

function normalizeCompanyKey(company: string): string {
  return company
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ");
}

const COMPANY_STOP_WORDS = new Set([
  "inc",
  "llc",
  "ltd",
  "corp",
  "co",
  "company",
  "recruiting",
  "recruitment",
  "careers",
  "career",
  "jobs",
  "job",
  "team",
  "the",
]);

function canonicalCompanyTokens(company: string): string[] {
  return normalizeCompanyKey(company)
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length > 1 && !COMPANY_STOP_WORDS.has(token));
}

function isSameCompanyName(a: string, b: string): boolean {
  const na = normalizeCompanyKey(a);
  const nb = normalizeCompanyKey(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if ((na.includes(nb) || nb.includes(na)) && Math.min(na.length, nb.length) >= 5) return true;
  const ta = canonicalCompanyTokens(a);
  const tb = canonicalCompanyTokens(b);
  if (ta.length === 0 || tb.length === 0) return false;
  const setB = new Set(tb);
  const intersection = ta.filter((token) => setB.has(token)).length;
  const union = new Set([...ta, ...tb]).size;
  const jaccard = union > 0 ? intersection / union : 0;
  return jaccard >= 0.75;
}

function eventTime(app: InsightApplication): number {
  return new Date(app.appliedAt ?? app.lastActivityAt).getTime();
}

function pickPreferredCompanyRow(
  current: InsightApplication,
  candidate: InsightApplication
): InsightApplication {
  const currentTime = eventTime(current);
  const candidateTime = eventTime(candidate);
  if (candidateTime !== currentTime) return candidateTime > currentTime ? candidate : current;
  const currentStageRank = STAGE_PRIORITY.indexOf(current.stage);
  const candidateStageRank = STAGE_PRIORITY.indexOf(candidate.stage);
  return candidateStageRank > currentStageRank ? candidate : current;
}

function dedupeByCompany(apps: InsightApplication[]): InsightApplication[] {
  const byCompany = new Map<string, InsightApplication>();
  for (const app of apps) {
    const existingEntry = [...byCompany.entries()].find(([, existing]) =>
      isSameCompanyName(existing.company, app.company)
    );
    const key = existingEntry?.[0] ?? normalizeCompanyKey(app.company);
    const existing = existingEntry?.[1] ?? byCompany.get(key);
    if (!existing) {
      byCompany.set(key, app);
    } else {
      byCompany.set(key, pickPreferredCompanyRow(existing, app));
    }
  }
  return [...byCompany.values()];
}

function inferIndustry(company: string, role: string | null): string {
  const text = `${company} ${role ?? ""}`.toLowerCase();
  if (/(health|care|biotech|bio|med)/i.test(text)) return "Healthcare/Biotech";
  if (/(bank|pay|fin|capital|crypto|insur)/i.test(text)) return "Fintech/Finance";
  if (/(recruit|talent|hr|people|workday|ashby|lever|greenhouse)/i.test(text))
    return "HR/Recruiting";
  if (/(shop|store|commerce|retail|marketplace)/i.test(text)) return "E-commerce/Retail";
  if (/(school|university|academy|edu)/i.test(text)) return "Education";
  if (/(media|news|content|studio|entertain)/i.test(text)) return "Media";
  if (/(ai|software|tech|cloud|data|platform|systems|labs)/i.test(text))
    return "Software/AI";
  return "Other";
}

function inferCompanySizeBucket(company: string): string {
  const c = company.toLowerCase();
  if (/(international|global|corporation|corp|holdings|group|systems|technologies)/i.test(c))
    return "Enterprise (1000+)";
  if (/(labs|studio|ventures|ai|io|startup)/i.test(c)) return "Startup (1-50)";
  return "Mid-market (51-999)";
}

function buildDistribution(
  values: string[],
  palette: string[]
): Array<{ label: string; value: number; pct: number; color: string }> {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  const total = values.length || 1;
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  return sorted.map(([label, value], idx) => ({
    label,
    value,
    pct: (value / total) * 100,
    color: palette[idx % palette.length],
  }));
}

function DonutChart({
  title,
  data,
}: {
  title: string;
  data: Array<{ label: string; value: number; pct: number; color: string }>;
}) {
  const gradient = data.length
    ? `conic-gradient(${data
        .map((d, idx) => {
          const prev = data.slice(0, idx).reduce((s, x) => s + x.pct, 0);
          return `${d.color} ${prev}% ${(prev + d.pct).toFixed(2)}%`;
        })
        .join(", ")})`
    : "conic-gradient(#e5e7eb 0% 100%)";
  const total = data.reduce((sum, d) => sum + d.value, 0);

  return (
    <div className="border border-gray-200 rounded-xl bg-white p-4">
      <p className="text-sm font-semibold text-gray-800 mb-3">{title}</p>
      <div className="flex items-center gap-4">
        <div className="relative w-28 h-28 shrink-0 rounded-full" style={{ background: gradient }}>
          <div className="absolute inset-4 rounded-full bg-white border border-gray-100 flex items-center justify-center">
            <span className="text-xs font-semibold text-gray-700">{total}</span>
          </div>
        </div>
        <div className="space-y-1.5 text-xs w-full">
          {data.slice(0, 5).map((item) => (
            <div key={item.label} className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1 text-gray-600">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
                {item.label}
              </span>
              <span className="text-gray-700">
                {item.value} ({item.pct.toFixed(0)}%)
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function DashboardInsights({
  applications,
  windowDays,
  selectedStages = [],
  inboxInsightData = { perApplication: [] },
}: DashboardInsightsProps) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [trendMode, setTrendMode] = useState<InsightTrendMode>("inbox_confirmation");

  const now = new Date();
  const windowMs = windowDays * 24 * 60 * 60 * 1000;

  const stageFiltered = applications.filter(
    (app) => selectedStages.length === 0 || selectedStages.includes(app.stage)
  );

  const firstConfirmDayByAppId = new Map(
    inboxInsightData.perApplication.map((p) => [p.applicationId, p.dayKey])
  );

  /** Cohort for inbox mode: applications with a first confirmation in the rolling window, stage-filtered. */
  const inboxCohortApps = stageFiltered.filter((app) => firstConfirmDayByAppId.has(app.id));

  const dedupedStageFiltered = dedupeByCompany(stageFiltered);

  const filteredAppliedAtRecord = dedupedStageFiltered.filter((app) => {
    if (!app.appliedAt) return false;
    const source = new Date(app.appliedAt);
    if (now.getTime() - source.getTime() > windowMs) return false;
    return true;
  });

  const filteredActivityDate = dedupedStageFiltered.filter((app) => {
    const source = app.appliedAt ? new Date(app.appliedAt) : new Date(app.lastActivityAt);
    if (now.getTime() - source.getTime() > windowMs) return false;
    return true;
  });

  let cohortForPiesAndStage: InsightApplication[];
  if (trendMode === "inbox_confirmation") {
    cohortForPiesAndStage = inboxCohortApps;
  } else if (trendMode === "applied_at_record") {
    cohortForPiesAndStage = filteredAppliedAtRecord;
  } else {
    cohortForPiesAndStage = filteredActivityDate;
  }

  const total = cohortForPiesAndStage.length;
  const byStage = new Map<ApplicationStage, number>();
  for (const stage of STAGE_GROUPS.map((s) => s.key)) byStage.set(stage, 0);
  for (const app of cohortForPiesAndStage) {
    byStage.set(app.stage, (byStage.get(app.stage) ?? 0) + 1);
  }

  const days = Math.max(30, Math.min(365, windowDays));
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const buckets: Array<{ key: string; label: string; count: number }> = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    buckets.push({
      key,
      label: d.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      count: 0,
    });
  }
  const bucketMap = new Map(buckets.map((b, idx) => [b.key, idx]));

  if (trendMode === "inbox_confirmation") {
    for (const app of inboxCohortApps) {
      const dayKey = firstConfirmDayByAppId.get(app.id);
      if (!dayKey) continue;
      const idx = bucketMap.get(dayKey);
      if (idx !== undefined) buckets[idx].count += 1;
    }
  } else if (trendMode === "applied_at_record") {
    for (const app of filteredAppliedAtRecord) {
      if (!app.appliedAt) continue;
      const source = new Date(app.appliedAt);
      source.setHours(0, 0, 0, 0);
      const dayKey = source.toISOString().slice(0, 10);
      const idx = bucketMap.get(dayKey);
      if (idx !== undefined) buckets[idx].count += 1;
    }
  } else {
    for (const app of filteredActivityDate) {
      const source = app.appliedAt ? new Date(app.appliedAt) : new Date(app.lastActivityAt);
      source.setHours(0, 0, 0, 0);
      const dayKey = source.toISOString().slice(0, 10);
      const idx = bucketMap.get(dayKey);
      if (idx !== undefined) buckets[idx].count += 1;
    }
  }

  const modeMeta = TREND_MODE_OPTIONS.find((o) => o.value === trendMode)!;
  const chartTitle =
    trendMode === "inbox_confirmation"
      ? `Application trend — inbox confirmations (daily, last ${days} days)`
      : trendMode === "applied_at_record"
        ? `Application trend — applied date (daily, last ${days} days)`
        : `Application trend — activity date (daily, last ${days} days)`;

  const rawMax = Math.max(1, ...buckets.map((b) => b.count));
  const maxY = niceAxisMax(Math.ceil(rawMax * 1.15));
  const averagePerDay = buckets.length ? buckets.reduce((sum, b) => sum + b.count, 0) / buckets.length : 0;
  const peak = buckets.reduce(
    (best, b) => (b.count > best.count ? b : best),
    { key: "", label: "-", count: 0 }
  );
  const yTicks = Array.from({ length: 5 }, (_, i) => Math.round(((4 - i) / 4) * maxY));
  const chartPoints = buckets.map((b, i) => {
    const x = (i / Math.max(1, buckets.length - 1)) * 100;
    const y = 100 - (b.count / maxY) * 100;
    return { ...b, x, y };
  });
  const linePath = chartPoints.map((p) => `${p.x},${p.y}`).join(" ");
  const areaPath = `0,100 ${linePath} 100,100`;
  const monthLabels = chartPoints.filter((p, idx, arr) => {
    if (idx === 0 || idx === arr.length - 1) return true;
    const prev = new Date(arr[idx - 1].key).getMonth();
    const cur = new Date(p.key).getMonth();
    return cur !== prev;
  });
  const activeHover = hoverIndex !== null ? chartPoints[hoverIndex] : null;

  const pieAppsForIndustry =
    trendMode === "inbox_confirmation"
      ? cohortForPiesAndStage
      : cohortForPiesAndStage.filter((a) => !!a.appliedAt).length > 0
        ? cohortForPiesAndStage.filter((a) => !!a.appliedAt)
        : cohortForPiesAndStage;

  const industryData = buildDistribution(
    pieAppsForIndustry.map((a) => inferIndustry(a.company, a.role)),
    INDUSTRY_COLORS
  );
  const companySizeData = buildDistribution(
    pieAppsForIndustry.map((a) => inferCompanySizeBucket(a.company)),
    SIZE_COLORS
  );

  return (
    <div className="mb-6 grid gap-4">
      <div className="border border-gray-200 rounded-xl bg-white p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between mb-3">
          <div>
            <p className="text-sm font-semibold text-gray-800">{chartTitle}</p>
            <p className="text-[11px] text-gray-500 mt-1 max-w-xl">{modeMeta.description}</p>
          </div>
          <div className="flex flex-col items-stretch sm:items-end gap-2 shrink-0">
            <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">
              Chart &amp; pie view
            </label>
            <select
              value={trendMode}
              onChange={(e) => setTrendMode(e.target.value as InsightTrendMode)}
              className="h-9 min-w-[220px] rounded-md border border-gray-200 bg-white px-2 text-xs text-gray-800"
            >
              {TREND_MODE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="text-[11px] text-gray-500 flex flex-wrap items-center gap-2 mb-2">
          <span className="rounded bg-gray-50 px-2 py-1">
            Total <strong className="text-gray-700">{total}</strong>
          </span>
          <span className="rounded bg-gray-50 px-2 py-1">
            Avg/day <strong className="text-gray-700">{averagePerDay.toFixed(2)}</strong>
          </span>
          <span className="rounded bg-gray-50 px-2 py-1">
            Peak day <strong className="text-gray-700">{peak.count}</strong>
          </span>
          {selectedStages.length > 0 && (
            <span className="rounded bg-gray-900 text-white px-2 py-1">
              Stage filter: <strong>{selectedStages.join(", ")}</strong>
            </span>
          )}
        </div>
        <div
          className="w-full h-52 relative pl-8 pr-2"
          onMouseMove={(e) => {
            const target = e.currentTarget.getBoundingClientRect();
            const x = Math.max(0, Math.min(target.width, e.clientX - target.left));
            const ratio = target.width > 0 ? x / target.width : 0;
            const idx = Math.round(ratio * (chartPoints.length - 1));
            setHoverIndex(Math.max(0, Math.min(chartPoints.length - 1, idx)));
          }}
          onMouseLeave={() => setHoverIndex(null)}
        >
          <div className="absolute left-0 top-0 h-full w-7 text-[10px] text-gray-400 flex flex-col justify-between">
            {yTicks.map((tick, i) => (
              <span key={i}>{tick}</span>
            ))}
          </div>
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="w-full h-full rounded-lg bg-gradient-to-b from-blue-50/40 to-white"
          >
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
            <polyline
              fill="none"
              stroke="#2563eb"
              strokeWidth="2.2"
              points={linePath}
              vectorEffect="non-scaling-stroke"
            />

            {activeHover && (
              <line
                x1={activeHover.x}
                y1="0"
                x2={activeHover.x}
                y2="100"
                stroke="#93c5fd"
                strokeDasharray="1.5 1.5"
                strokeWidth="0.8"
              />
            )}
          </svg>
          {activeHover && (
            <div
              className="absolute z-10 -translate-x-1/2 rounded-md border border-gray-200 bg-white/95 px-2 py-1 text-[11px] shadow-sm pointer-events-none"
              style={{
                left: `calc(${activeHover.x}% + 32px)`,
                top: `${Math.max(8, (activeHover.y / 100) * 208 - 8)}px`,
              }}
            >
              <div className="font-medium text-gray-700">{activeHover.label}</div>
              <div className="text-gray-500">
                {activeHover.count} application{activeHover.count === 1 ? "" : "s"}
              </div>
            </div>
          )}
        </div>
        <div className="flex justify-between text-[10px] text-gray-400 mt-2">
          {monthLabels.map((p) => (
            <span key={p.key}>{p.label}</span>
          ))}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <DonutChart title="Applications by Industry" data={industryData} />
        <DonutChart title="Applications by Company Size" data={companySizeData} />
      </div>

      <div className="border border-gray-200 rounded-xl bg-white p-4">
        <p className="text-sm font-semibold text-gray-800 mb-3">Stage Distribution</p>
        <div className="grid md:grid-cols-2 gap-2">
          {STAGE_GROUPS.map((stage) => {
            const value = byStage.get(stage.key) ?? 0;
            const pct = total ? (value / total) * 100 : 0;
            return (
              <div key={stage.key} className="space-y-1">
                <div className="flex items-center justify-between text-xs text-gray-600">
                  <span>{stage.label}</span>
                  <span>
                    {value} ({pct.toFixed(0)}%)
                  </span>
                </div>
                <div className="h-2 rounded bg-gray-100 overflow-hidden">
                  <div
                    className={`h-full ${stage.color}`}
                    style={{ width: `${pct === 0 ? 0 : Math.max(2, pct)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
