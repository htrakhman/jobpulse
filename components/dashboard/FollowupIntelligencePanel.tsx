"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DashboardOSPayload, FollowupIntelligenceRow } from "@/lib/services/os-metrics.types";

const PREVIEW_COUNT = 3;
/** Cap expanded list to keep the panel responsive if data grows large */
const MAX_ROWS = 40;

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

  const rows = followup.rows.slice(0, MAX_ROWS);
  const previewRows = rows.slice(0, PREVIEW_COUNT);
  const overflowRows = rows.slice(PREVIEW_COUNT);
  const hiddenCount = overflowRows.length;
  const total = followup.rows.length;
  const truncatedBeyondMax = followup.rows.length > MAX_ROWS;

  return (
    <Card className="border border-gray-200 shadow-none mb-4">
      <CardHeader className="border-b border-gray-100 py-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-base">Follow-up Intelligence</CardTitle>
          {total > 0 && (
            <p className="text-xs text-gray-500">
              Showing {Math.min(PREVIEW_COUNT, total)}
              {hiddenCount > 0 ? ` of ${total}` : ""}
              {hiddenCount > 0 ? ` · ${hiddenCount} hidden` : ""}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2 pt-1 text-xs">
          <Pill label="Urgent" value={followup.buckets.urgent} className="bg-red-50 text-red-700 border-red-200" />
          <Pill label="High" value={followup.buckets.high} className="bg-amber-50 text-amber-700 border-amber-200" />
          <Pill label="Normal" value={followup.buckets.normal} className="bg-blue-50 text-blue-700 border-blue-200" />
          <Pill label="Low" value={followup.buckets.low} className="bg-gray-50 text-gray-700 border-gray-200" />
        </div>
      </CardHeader>
      <CardContent className="pt-3 pb-4">
        {rows.length === 0 ? (
          <p className="text-sm text-gray-500">No follow-up suggestions right now.</p>
        ) : (
          <div className="space-y-2">
            {previewRows.map((row) => (
              <FollowupRow key={row.id} row={row} draftById={draftById} onGenerateDraft={generateDraft} />
            ))}

            {hiddenCount > 0 && (
              <details className="group rounded-lg border border-dashed border-gray-200 bg-gray-50/50">
                <summary className="cursor-pointer list-none px-3 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-100/80 rounded-lg [&::-webkit-details-marker]:hidden flex items-center justify-between gap-2">
                  <span>
                    Show {hiddenCount} more follow-up{hiddenCount === 1 ? "" : "s"}
                    {truncatedBeyondMax ? ` (of ${total} total)` : ""}
                  </span>
                  <ChevronDown className="h-4 w-4 shrink-0 text-gray-500 transition-transform group-open:rotate-180" aria-hidden />
                </summary>
                <div className="space-y-2 border-t border-gray-200 bg-white px-3 py-3 rounded-b-lg">
                  {overflowRows.map((row) => (
                    <FollowupRow key={row.id} row={row} draftById={draftById} onGenerateDraft={generateDraft} />
                  ))}
                  {truncatedBeyondMax && (
                    <p className="text-xs text-gray-500 pt-1">
                      List capped at {MAX_ROWS}; refine filters in Applications for the full set.
                    </p>
                  )}
                </div>
              </details>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function FollowupRow({
  row,
  draftById,
  onGenerateDraft,
}: {
  row: FollowupIntelligenceRow;
  draftById: Record<string, string>;
  onGenerateDraft: (id: string) => void;
}) {
  return (
    <div className="rounded-lg border border-gray-200 p-3 bg-white">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-gray-900">{row.company}</p>
        <span className="text-xs text-gray-500 capitalize">{row.urgency}</span>
      </div>
      <p className="text-xs text-gray-600 mt-1 line-clamp-2">
        {row.recommendedAction} — {row.recommendationReason}
      </p>
      <p className="text-xs text-gray-500 mt-1">
        {row.daysSinceLastTouch}d since touch · suggested {new Date(row.suggestedNextDate).toLocaleDateString()}
      </p>
      <button
        type="button"
        onClick={() => onGenerateDraft(row.id)}
        className="mt-2 text-xs rounded border border-gray-300 px-2 py-1 hover:bg-gray-50"
      >
        Generate follow-up draft
      </button>
      {draftById[row.id] && (
        <pre className="mt-2 rounded bg-gray-50 p-2 text-[11px] whitespace-pre-wrap max-h-40 overflow-y-auto">
          {draftById[row.id]}
        </pre>
      )}
    </div>
  );
}

function Pill({ label, value, className }: { label: string; value: number; className: string }) {
  return (
    <div className={`rounded-md border px-2 py-1 ${className}`}>
      <span className="font-medium">{label}:</span> {value}
    </div>
  );
}
