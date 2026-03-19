import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DashboardOSPayload } from "@/lib/services/os-metrics.types";

interface FunnelMetricsProps {
  funnel: DashboardOSPayload["funnel"];
}

export function FunnelMetrics({ funnel }: FunnelMetricsProps) {
  return (
    <Card className="border border-gray-200 shadow-none mb-4">
      <CardHeader className="border-b border-gray-100">
        <CardTitle>Funnel + Conversion Metrics</CardTitle>
      </CardHeader>
      <CardContent className="pt-4">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b border-gray-100">
                <th className="py-2">Transition</th>
                <th className="py-2">Count</th>
                <th className="py-2">Conversion</th>
                <th className="py-2">vs prior window</th>
              </tr>
            </thead>
            <tbody>
              {funnel.steps.map((step) => (
                <tr key={step.key} className="border-b border-gray-50">
                  <td className="py-2 text-gray-800">{step.from} → {step.to}</td>
                  <td className="py-2 text-gray-700">{step.count}/{step.denominator}</td>
                  <td className="py-2 font-medium text-gray-900">{step.conversionPct.toFixed(1)}%</td>
                  <td className={`py-2 ${step.deltaPct >= 0 ? "text-green-700" : "text-red-700"}`}>
                    {step.deltaPct >= 0 ? "+" : ""}
                    {step.deltaPct.toFixed(1)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-gray-500 mt-3">
          Offer rate per 100 applications: <span className="font-semibold text-gray-900">{funnel.offerRatePer100.toFixed(1)}</span>
        </p>
      </CardContent>
    </Card>
  );
}

