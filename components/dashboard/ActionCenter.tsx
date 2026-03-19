import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DashboardOSPayload } from "@/lib/services/os-metrics.types";

interface ActionCenterProps {
  actionCenter: DashboardOSPayload["actionCenter"];
}

const PRIORITY_CLASS = {
  urgent: "text-red-700 bg-red-50 border-red-200",
  high: "text-amber-700 bg-amber-50 border-amber-200",
  normal: "text-blue-700 bg-blue-50 border-blue-200",
  low: "text-gray-700 bg-gray-50 border-gray-200",
};

export function ActionCenter({ actionCenter }: ActionCenterProps) {
  return (
    <Card className="border border-gray-200 shadow-none mb-4">
      <CardHeader className="border-b border-gray-100">
        <CardTitle>Today - Action Center</CardTitle>
      </CardHeader>
      <CardContent className="pt-4">
        <div className="grid gap-3 md:grid-cols-5 mb-4">
          <Stat label="High-priority follow-ups" value={actionCenter.followUpsDueToday} />
          <Stat label="Interviews to prep" value={actionCenter.interviewsToPrep} />
          <Stat label="Stale applications" value={actionCenter.staleApplications} />
          <Stat label="Remaining today" value={actionCenter.targetRemainingToday} />
          <Stat label="Remaining this week" value={actionCenter.targetRemainingThisWeek} />
        </div>
        <div className="space-y-2">
          {actionCenter.items.map((item) => (
            <div key={item.id} className={`rounded-lg border px-3 py-2 ${PRIORITY_CLASS[item.priority]}`}>
              <p className="text-sm font-semibold">{item.title}</p>
              <p className="text-xs opacity-90">{item.description}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-gray-200 p-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-xl font-semibold text-gray-900">{value}</p>
    </div>
  );
}

