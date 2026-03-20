"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DashboardOSPayload } from "@/lib/services/os-metrics.types";
import { StageBadge } from "./StageBadge";

interface FunnelMetricsProps {
  funnel: DashboardOSPayload["funnel"];
}

export function FunnelMetrics({ funnel }: FunnelMetricsProps) {
  const [openStep, setOpenStep] = useState<string | null>(null);

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
              {funnel.steps.map((step) => {
                const expanded = openStep === step.key;
                return (
                  <Fragment key={step.key}>
                    <tr key={step.key} className="border-b border-gray-50">
                      <td className="py-2 text-gray-800">
                        <button
                          type="button"
                          onClick={() => setOpenStep(expanded ? null : step.key)}
                          className="text-left hover:text-gray-900"
                        >
                          {step.from} → {step.to}{" "}
                          <span className="text-xs text-blue-600">
                            ({expanded ? "hide" : "view"} companies)
                          </span>
                        </button>
                      </td>
                      <td className="py-2 text-gray-700">{step.count}/{step.denominator}</td>
                      <td className="py-2 font-medium text-gray-900">{step.conversionPct.toFixed(1)}%</td>
                      <td className={`py-2 ${step.deltaPct >= 0 ? "text-green-700" : "text-red-700"}`}>
                        {step.deltaPct >= 0 ? "+" : ""}
                        {step.deltaPct.toFixed(1)}%
                      </td>
                    </tr>
                    {expanded && (
                      <tr>
                        <td colSpan={4} className="py-2">
                          <div className="rounded-lg border border-gray-200 overflow-hidden">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="bg-gray-50 text-left text-gray-500">
                                  <th className="px-3 py-2">Company</th>
                                  <th className="px-3 py-2">Role</th>
                                  <th className="px-3 py-2">Stage</th>
                                  <th className="px-3 py-2">Last Activity</th>
                                </tr>
                              </thead>
                              <tbody>
                                {step.companies.map((app) => (
                                  <tr key={app.id} className="border-t border-gray-100">
                                    <td className="px-3 py-2 font-medium text-gray-900">
                                      <Link href={`/applications/${app.id}`} className="hover:text-blue-600">
                                        {app.company}
                                      </Link>
                                    </td>
                                    <td className="px-3 py-2 text-gray-600">{app.role ?? "—"}</td>
                                    <td className="px-3 py-2">
                                      <StageBadge stage={app.stage} />
                                    </td>
                                    <td className="px-3 py-2 text-gray-500">
                                      {formatDistanceToNow(new Date(app.lastActivityAt), { addSuffix: true })}
                                    </td>
                                  </tr>
                                ))}
                                {step.companies.length === 0 && (
                                  <tr>
                                    <td colSpan={4} className="px-3 py-4 text-center text-gray-400">
                                      No companies in this transition for the selected window.
                                    </td>
                                  </tr>
                                )}
                              </tbody>
                            </table>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
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

