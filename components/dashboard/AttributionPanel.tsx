import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DashboardOSPayload } from "@/lib/services/os-metrics.types";

interface AttributionPanelProps {
  attribution: DashboardOSPayload["attribution"];
}

export function AttributionPanel({ attribution }: AttributionPanelProps) {
  return (
    <Card className="border border-gray-200 shadow-none mb-4">
      <CardHeader className="border-b border-gray-100">
        <CardTitle>Channel / Source Performance</CardTitle>
      </CardHeader>
      <CardContent className="pt-4 grid gap-4 md:grid-cols-3">
        <MetricTable title="By source" rows={attribution.bySource.slice(0, 6)} />
        <MetricTable title="By method" rows={attribution.byMethod.slice(0, 6)} />
        <MetricTable title="By resume version" rows={attribution.byResumeVersion.slice(0, 6)} />
        <div className="md:col-span-3 text-xs text-gray-600">
          Best source: <span className="font-semibold text-gray-900">{attribution.bestSource ?? "n/a"}</span> ·
          Best resume: <span className="font-semibold text-gray-900"> {attribution.bestResumeVersion ?? "n/a"}</span> ·
          Referrals outperform cold apply: <span className="font-semibold text-gray-900">{attribution.referralsOutperformCold ? "yes" : "no"}</span>
        </div>
      </CardContent>
    </Card>
  );
}

function MetricTable({
  title,
  rows,
}: {
  title: string;
  rows: Array<{
    key: string;
    applications: number;
    interviews: number;
    offers: number;
    conversionToInterviewPct: number;
  }>;
}) {
  return (
    <div className="rounded-lg border border-gray-200 p-3">
      <p className="text-sm font-medium text-gray-900 mb-2">{title}</p>
      <div className="space-y-1 text-xs">
        {rows.map((row) => (
          <div key={row.key} className="flex justify-between gap-2">
            <span className="text-gray-600">{row.key}</span>
            <span className="text-gray-900">
              {row.interviews}/{row.applications} ({row.conversionToInterviewPct.toFixed(0)}%)
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

