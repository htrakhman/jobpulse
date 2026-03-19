import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DashboardOSPayload } from "@/lib/services/os-metrics.types";

interface GoalsPacingPanelProps {
  goals: DashboardOSPayload["goals"];
}

export function GoalsPacingPanel({ goals }: GoalsPacingPanelProps) {
  return (
    <Card className="border border-gray-200 shadow-none mb-4">
      <CardHeader className="border-b border-gray-100">
        <CardTitle>Goals + Pacing</CardTitle>
      </CardHeader>
      <CardContent className="pt-4 grid gap-3 md:grid-cols-2">
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
      </CardContent>
    </Card>
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
      <p className={`text-xs mt-1 ${pacing === "ahead" ? "text-green-700" : pacing === "on_track" ? "text-blue-700" : "text-red-700"}`}>
        {pacing === "ahead" ? "Ahead" : pacing === "on_track" ? "On track" : "Behind"} target
      </p>
    </div>
  );
}

