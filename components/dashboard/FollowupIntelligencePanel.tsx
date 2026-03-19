"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DashboardOSPayload } from "@/lib/services/os-metrics.types";

interface FollowupIntelligencePanelProps {
  followup: DashboardOSPayload["followup"];
}

export function FollowupIntelligencePanel({ followup }: FollowupIntelligencePanelProps) {
  const [draftById, setDraftById] = useState<Record<string, string>>({});

  async function generateDraft(suggestionId: string) {
    const response = await fetch("/api/follow-ups/draft", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ suggestionId }),
    });
    if (!response.ok) return;
    const payload = await response.json();
    setDraftById((prev) => ({ ...prev, [suggestionId]: payload.body ?? "" }));
  }

  return (
    <Card className="border border-gray-200 shadow-none mb-4">
      <CardHeader className="border-b border-gray-100">
        <CardTitle>Follow-up Intelligence</CardTitle>
      </CardHeader>
      <CardContent className="pt-4">
        <div className="grid grid-cols-4 gap-2 mb-4 text-xs">
          <Pill label="Urgent" value={followup.buckets.urgent} className="bg-red-50 text-red-700 border-red-200" />
          <Pill label="High" value={followup.buckets.high} className="bg-amber-50 text-amber-700 border-amber-200" />
          <Pill label="Normal" value={followup.buckets.normal} className="bg-blue-50 text-blue-700 border-blue-200" />
          <Pill label="Low" value={followup.buckets.low} className="bg-gray-50 text-gray-700 border-gray-200" />
        </div>
        <div className="space-y-3">
          {followup.rows.slice(0, 12).map((row) => (
            <div key={row.id} className="rounded-lg border border-gray-200 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-gray-900">{row.company}</p>
                <span className="text-xs text-gray-500">{row.urgency}</span>
              </div>
              <p className="text-xs text-gray-600 mt-1">{row.recommendedAction} - {row.recommendationReason}</p>
              <p className="text-xs text-gray-500 mt-1">
                {row.daysSinceLastTouch}d since touch · suggested {new Date(row.suggestedNextDate).toLocaleDateString()}
              </p>
              <button
                type="button"
                onClick={() => generateDraft(row.id)}
                className="mt-2 text-xs rounded border border-gray-300 px-2 py-1 hover:bg-gray-50"
              >
                Generate follow-up draft
              </button>
              {draftById[row.id] && (
                <pre className="mt-2 rounded bg-gray-50 p-2 text-[11px] whitespace-pre-wrap">{draftById[row.id]}</pre>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function Pill({ label, value, className }: { label: string; value: number; className: string }) {
  return (
    <div className={`rounded-md border px-2 py-1 ${className}`}>
      <span className="font-medium">{label}:</span> {value}
    </div>
  );
}

