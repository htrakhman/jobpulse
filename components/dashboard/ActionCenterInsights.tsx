import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DashboardOSPayload } from "@/lib/services/os-metrics.types";

interface ActionCenterInsightsProps {
  actionCenter: DashboardOSPayload["actionCenter"];
  insights: DashboardOSPayload["insights"];
  weightedPipelineScore: number;
}

const PRIORITY_CLASS = {
  urgent: "text-red-800 bg-red-50/80 border-red-100",
  high: "text-amber-900 bg-amber-50/80 border-amber-100",
  normal: "text-blue-900 bg-blue-50/80 border-blue-100",
  low: "text-gray-800 bg-gray-50 border-gray-100",
};

const SEVERITY_CLASS = {
  info: "border-blue-100 bg-blue-50/60 text-blue-900",
  warning: "border-amber-100 bg-amber-50/60 text-amber-900",
  critical: "border-red-100 bg-red-50/60 text-red-900",
};

export function ActionCenterInsights({
  actionCenter,
  insights,
  weightedPipelineScore,
}: ActionCenterInsightsProps) {
  return (
    <Card className="border border-gray-200 shadow-none mb-4 overflow-hidden">
      <CardHeader className="border-b border-gray-100 bg-gray-50/50 pb-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="text-lg">Today</CardTitle>
            <p className="text-sm text-gray-500 mt-1 font-normal">
              Next moves and signals from your pipeline
            </p>
          </div>
          <div className="flex items-baseline gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 shrink-0">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              Pipeline score
            </span>
            <span className="text-xl font-semibold text-gray-900 tabular-nums">
              {weightedPipelineScore}
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-5 space-y-6">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-3">
            At a glance
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3">
            <Stat label="High-priority follow-ups" value={actionCenter.followUpsDueToday} />
            <Stat label="Interviews to prep" value={actionCenter.interviewsToPrep} />
            <Stat label="Stale applications" value={actionCenter.staleApplications} />
            <Stat label="Apply goal left (today)" value={actionCenter.targetRemainingToday} />
            <Stat label="Apply goal left (week)" value={actionCenter.targetRemainingThisWeek} />
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-12 lg:gap-8">
          <div className="lg:col-span-6 space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
              Priority actions
            </p>
            <div className="space-y-2">
              {actionCenter.items.map((item) => (
                <div
                  key={item.id}
                  className={`rounded-lg border px-3 py-2.5 ${PRIORITY_CLASS[item.priority]}`}
                >
                  <p className="text-sm font-semibold leading-snug">{item.title}</p>
                  <p className="text-xs mt-0.5 opacity-90 leading-relaxed">{item.description}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="lg:col-span-6 space-y-3 pt-2 lg:pt-0 border-t lg:border-t-0 lg:border-l border-gray-100 lg:pl-8">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
              Smart insights
            </p>
            <div className="space-y-2">
              {insights.map((insight) => (
                <div
                  key={insight.id}
                  className={`rounded-lg border px-3 py-2 text-sm leading-relaxed ${SEVERITY_CLASS[insight.severity]}`}
                >
                  {insight.text}
                </div>
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-gray-100 bg-white p-2.5 sm:p-3">
      <p className="text-[10px] sm:text-xs text-gray-500 leading-tight">{label}</p>
      <p className="text-lg sm:text-xl font-semibold text-gray-900 tabular-nums mt-1">{value}</p>
    </div>
  );
}
