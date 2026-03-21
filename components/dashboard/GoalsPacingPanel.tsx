import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DashboardOSPayload } from "@/lib/services/os-metrics.types";

interface InterviewRoundMetrics {
  total: number;
  firstRoundCount: number;
  secondRoundCount: number;
  thirdRoundCount: number;
  firstRoundRate: number;
  secondRoundRate: number;
  thirdRoundRate: number;
}

interface GoalsPacingPanelProps {
  goals: DashboardOSPayload["goals"];
  roundMetrics: InterviewRoundMetrics;
}

export function GoalsPacingPanel({ goals, roundMetrics }: GoalsPacingPanelProps) {
  return (
    <Card className="border border-gray-200 shadow-none mb-4">
      <CardHeader className="border-b border-gray-100 pb-3">
        <CardTitle className="text-base">Goals & interview pipeline</CardTitle>
        <p className="text-xs text-gray-500 font-normal mt-1">
          Weekly pacing plus how far applications progress in interview rounds (from company-domain
          email threads).
        </p>
      </CardHeader>
      <CardContent className="pt-4 space-y-5">
        <div className="grid gap-3 md:grid-cols-2">
          <GoalRow
            label="Applications this week"
            actual={goals.applicationsThisWeek}
            target={goals.weeklyApplicationGoal}
            projection={goals.projectedApplicationsByWeekEnd}
            pacing={goals.applicationPacing}
          />
          <GoalRow
            label="Interviews this week"
            actual={goals.interviewsThisWeek}
            target={goals.weeklyInterviewGoal}
            projection={goals.projectedInterviewsByWeekEnd}
            pacing={goals.interviewPacing}
          />
        </div>

        <div className="rounded-lg border border-gray-100 bg-gray-50/50 p-3 sm:p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-3">
            Interview progression
          </p>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
            <RoundStat
              label="1st round"
              rate={roundMetrics.firstRoundRate}
              count={roundMetrics.firstRoundCount}
            />
            <RoundStat
              label="2nd round"
              rate={roundMetrics.secondRoundRate}
              count={roundMetrics.secondRoundCount}
            />
            <RoundStat
              label="3rd / final"
              rate={roundMetrics.thirdRoundRate}
              count={roundMetrics.thirdRoundCount}
            />
            <div className="rounded-md border border-gray-200 bg-white px-3 py-2">
              <p className="text-[11px] text-gray-500">In window</p>
              <p className="text-lg font-semibold text-gray-900 tabular-nums">{roundMetrics.total}</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function RoundStat({ label, rate, count }: { label: string; rate: number; count: number }) {
  return (
    <div className="rounded-md border border-gray-200 bg-white px-3 py-2">
      <p className="text-[11px] text-gray-500">{label}</p>
      <p className="text-lg font-semibold text-gray-900 tabular-nums">{rate.toFixed(1)}%</p>
      <p className="text-[10px] text-gray-400 mt-0.5">{count} apps</p>
    </div>
  );
}

function GoalRow({
  label,
  actual,
  target,
  projection,
  pacing,
}: {
  label: string;
  actual: number;
  target: number;
  projection: number;
  pacing: "ahead" | "behind" | "on_track";
}) {
  return (
    <div className="rounded-lg border border-gray-200 p-3">
      <p className="text-sm font-medium text-gray-900">{label}</p>
      <p className="text-xs text-gray-500 mt-1">
        Actual: {actual} / {target} · Projected: {projection}
      </p>
      <p
        className={`text-xs mt-1 ${pacing === "ahead" ? "text-green-700" : pacing === "on_track" ? "text-blue-700" : "text-red-700"}`}
      >
        {pacing === "ahead" ? "Ahead" : pacing === "on_track" ? "On track" : "Behind"} target
      </p>
    </div>
  );
}
