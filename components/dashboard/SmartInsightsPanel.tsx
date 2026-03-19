import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DashboardOSPayload } from "@/lib/services/os-metrics.types";

interface SmartInsightsPanelProps {
  insights: DashboardOSPayload["insights"];
  weightedPipelineScore: number;
}

const SEVERITY_CLASS = {
  info: "border-blue-200 bg-blue-50 text-blue-800",
  warning: "border-amber-200 bg-amber-50 text-amber-800",
  critical: "border-red-200 bg-red-50 text-red-800",
};

export function SmartInsightsPanel({ insights, weightedPipelineScore }: SmartInsightsPanelProps) {
  return (
    <Card className="border border-gray-200 shadow-none mb-4">
      <CardHeader className="border-b border-gray-100">
        <CardTitle>Smart Insights</CardTitle>
      </CardHeader>
      <CardContent className="pt-4">
        <p className="text-xs text-gray-500 mb-3">
          Weighted pipeline score: <span className="font-semibold text-gray-900">{weightedPipelineScore}</span>
        </p>
        <div className="space-y-2">
          {insights.map((insight) => (
            <div key={insight.id} className={`rounded-lg border px-3 py-2 text-sm ${SEVERITY_CLASS[insight.severity]}`}>
              {insight.text}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

