"use client";

import type { WaterfallStep } from "@/lib/enrichment/types";

interface WaterfallStatusProps {
  steps: WaterfallStep[];
  running: boolean;
}

const STATUS_ICON: Record<WaterfallStep["status"], string> = {
  hit: "✓",
  miss: "–",
  error: "✕",
  skipped: "·",
};

const STATUS_COLOR: Record<WaterfallStep["status"], string> = {
  hit: "text-green-600 bg-green-50 border-green-200",
  miss: "text-gray-400 bg-gray-50 border-gray-100",
  error: "text-red-500 bg-red-50 border-red-200",
  skipped: "text-gray-300 bg-gray-50 border-gray-100",
};

const PROVIDER_LABELS: Record<string, string> = {
  apollo: "Apollo",
  hunter: "Hunter",
  pdl: "People Data Labs",
  proxycurl: "Proxycurl",
  lusha: "Lusha",
  contactout: "ContactOut",
  fullenrich: "FullEnrich",
  snovio: "Snov.io",
  icypeas: "Icypeas",
  leadmagic: "LeadMagic",
  zerobounce: "ZeroBounce",
  mixrank: "Mixrank",
};

export function WaterfallStatus({ steps, running }: WaterfallStatusProps) {
  if (steps.length === 0 && !running) return null;

  return (
    <div className="mt-3 space-y-1">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
        Enrichment Waterfall
        {running && (
          <span className="ml-2 inline-flex items-center gap-1 text-blue-600 normal-case font-normal">
            <span className="inline-block w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
            Running…
          </span>
        )}
      </p>
      <div className="flex flex-col gap-1">
        {steps.map((step, i) => (
          <div
            key={i}
            className={`flex items-center justify-between px-2.5 py-1.5 rounded-md border text-xs ${STATUS_COLOR[step.status]}`}
          >
            <div className="flex items-center gap-2">
              <span className="font-mono font-bold w-3 text-center">{STATUS_ICON[step.status]}</span>
              <span className="font-medium">{PROVIDER_LABELS[step.provider] ?? step.provider}</span>
              <span className="text-gray-400 capitalize">{step.field}</span>
              {step.result && (
                <span className="text-gray-600 truncate max-w-[160px]">{step.result}</span>
              )}
            </div>
            {step.responseMs && (
              <span className="text-gray-400">{step.responseMs}ms</span>
            )}
          </div>
        ))}
        {running && (
          <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-md border border-blue-100 bg-blue-50 text-xs text-blue-500 animate-pulse">
            <span className="font-mono w-3 text-center">…</span>
            <span>Trying next provider…</span>
          </div>
        )}
      </div>
    </div>
  );
}
