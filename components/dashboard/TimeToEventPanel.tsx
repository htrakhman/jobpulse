import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DashboardOSPayload } from "@/lib/services/os-metrics.types";

interface TimeToEventPanelProps {
  timeToEvent: DashboardOSPayload["timeToEvent"];
}

export function TimeToEventPanel({ timeToEvent }: TimeToEventPanelProps) {
  return (
    <Card className="border border-gray-200 shadow-none mb-4">
      <CardHeader className="border-b border-gray-100">
        <CardTitle>Time-to-Event + Aging</CardTitle>
      </CardHeader>
      <CardContent className="pt-4 grid gap-3 md:grid-cols-4">
        <Metric label="App → first response" value={timeToEvent.avgDaysApplicationToFirstResponse} />
        <Metric label="App → interview" value={timeToEvent.avgDaysApplicationToInterview} />
        <Metric label="Interview → decision" value={timeToEvent.avgDaysInterviewToDecision} />
        <Metric label="Last touch → follow-up" value={timeToEvent.avgDaysLastTouchToFollowup} />
        <div className="md:col-span-4 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
          {timeToEvent.staleBuckets.map((bucket) => (
            <div key={bucket.label} className="rounded border border-gray-200 p-2">
              <p className="text-gray-500">{bucket.label}</p>
              <p className="text-base font-semibold text-gray-900">{bucket.count}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded border border-gray-200 p-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-lg font-semibold text-gray-900">{value.toFixed(1)}d</p>
    </div>
  );
}

