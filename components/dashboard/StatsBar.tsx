"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import type { ApplicationStage } from "@/types";
import type { DashboardStats } from "@/types";

interface StatsBarProps {
  stats: DashboardStats;
  selectedStages?: ApplicationStage[];
}

export function StatsBar({ stats, selectedStages = [] }: StatsBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function applyStage(stage: ApplicationStage | null) {
    const params = new URLSearchParams(searchParams.toString());
    const next = new Set(selectedStages);
    if (stage) {
      if (next.has(stage)) next.delete(stage);
      else next.add(stage);
      if (next.size > 0) params.set("stages", [...next].join(","));
      else params.delete("stages");
    } else {
      params.delete("stages");
    }
    params.delete("stage");
    router.push(`${pathname}?${params.toString()}`);
  }

  const items = [
    {
      label: "Total Applications",
      value: stats.total,
      color: "text-gray-900",
      stage: null as ApplicationStage | null,
      info: "All tracked job applications from classified inbox threads.",
    },
    {
      label: "Applied",
      value: stats.applied,
      color: "text-blue-600",
      stage: "Applied" as ApplicationStage,
      info:
        'Detected from application-confirmation patterns: "thank you for applying (to …)", "thank you for your application (to …)", "application received", "we received your application", and similar ATS auto-replies.',
    },
    {
      label: "Awaiting Response",
      value: stats.waiting,
      color: "text-slate-600",
      stage: "Waiting" as ApplicationStage,
      info:
        'General status/update emails without interview/offer/rejection signals, e.g. "update on your application" and "application status".',
    },
    {
      label: "Scheduling",
      value: stats.scheduling,
      color: "text-indigo-600",
      stage: "Scheduling" as ApplicationStage,
      info:
        "Interview booking phase. Looks for availability requests, scheduling language, and invite/calendar signals where the interview date is upcoming or not yet confirmed.",
    },
    {
      label: "Assessment",
      value: stats.assessment,
      color: "text-orange-600",
      stage: "Assessment" as ApplicationStage,
      info:
        'Assessment/test stage from inbox patterns like "coding challenge", "take-home assignment", "technical assessment", and related subject/body terms.',
    },
    {
      label: "Interviewing",
      value: stats.interviewing,
      color: "text-purple-600",
      stage: "Interviewing" as ApplicationStage,
      info:
        "Active interview stage. Includes confirmed interview emails and meeting invite signals where the detected interview date has already passed.",
    },
    {
      label: "Offers",
      value: stats.offers,
      color: "text-green-600",
      stage: "Offer" as ApplicationStage,
      info:
        'Offer-stage emails identified by terms such as "offer letter", "job offer", and "pleased to offer you".',
    },
    {
      label: "Rejected",
      value: stats.rejected,
      color: "text-rose-600",
      stage: "Rejected" as ApplicationStage,
      info:
        'Rejection emails with signals like "not moving forward", "other candidates", and decision-style rejection wording.',
    },
    {
      label: "Follow-ups Due",
      value: stats.pendingFollowUps,
      color: "text-amber-600",
      stage: null as ApplicationStage | null,
      clickable: false,
      info:
        "Open follow-up reminders generated from inactivity windows (typically Applied/Waiting with no new activity past follow-up thresholds).",
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 xl:grid-cols-9 gap-4 mb-6">
      {items.map((item) => (
        <Card
          key={item.label}
          className={`relative overflow-visible shadow-none border border-gray-200 transition-colors ${
            (item.stage && selectedStages.includes(item.stage)) ||
            (!item.stage && item.label === "Total Applications" && selectedStages.length === 0)
              ? "ring-2 ring-gray-900 border-gray-900"
              : ""
          }`}
        >
          <CardContent className="p-4">
            <button
              type="button"
              onClick={() => applyStage(item.stage)}
              className="w-full text-left"
              disabled={item.clickable === false}
              title={
                item.clickable === false
                  ? `Info about ${item.label}`
                  : item.stage
                  ? `Toggle ${item.label} filter`
                  : "Show all stages"
              }
            >
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
              <span className="inline-flex items-center gap-1.5">
                {item.label}
                <span className="relative group cursor-help select-none">
                  <span
                    aria-label={`Info about ${item.label}`}
                    className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-gray-300 text-[10px] font-semibold text-gray-500 bg-white"
                  >
                    i
                  </span>
                  <span className="pointer-events-none absolute left-1/2 top-full z-50 mt-2 hidden w-72 max-w-[22rem] -translate-x-1/2 rounded-md border border-gray-200 bg-white px-2.5 py-2 text-[11px] normal-case leading-relaxed text-gray-600 shadow-lg whitespace-normal group-hover:block">
                    {item.info}
                  </span>
                </span>
              </span>
              </p>
              <p className={`text-2xl font-bold ${item.color}`}>{item.value}</p>
            </button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
