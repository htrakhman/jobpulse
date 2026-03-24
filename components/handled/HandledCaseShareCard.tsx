import { cn } from "@/lib/utils";

export type HandledCaseShareCardProps = {
  merchant: string;
  /** e.g. "Shipping" */
  category: string;
  /** e.g. "Resolution" */
  outcome: string;
  atStakeLabel?: string;
  atStakeValue: string;
  /** Omit or empty to hide the middle stat entirely */
  secondaryMetric?: { value: string; label: string };
  /** Qualitative label — not a numeric "score" */
  standingLabel?: string;
  standingValue?: string;
  summary: string;
  policyCount: number;
  /** Shown as "N policy signals aligned" — no evidence/pipeline score */
  policyLineVariant?: "signals" | "matched";
  highlight: string;
  className?: string;
};

/**
 * Shareable case summary for Handled — designed without numeric “evidence score”
 * or pipeline-style metrics; qualitative standing only.
 */
export function HandledCaseShareCard({
  merchant,
  category,
  outcome,
  atStakeLabel = "At stake",
  atStakeValue,
  secondaryMetric,
  standingLabel = "Standing",
  standingValue = "Strong",
  summary,
  policyCount,
  policyLineVariant = "signals",
  highlight,
  className,
}: HandledCaseShareCardProps) {
  const policyLine =
    policyLineVariant === "matched"
      ? `${policyCount} policies matched`
      : `${policyCount} policy signals verified`;

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl bg-[#0a0a0a] text-white",
        "border border-white/[0.08] shadow-2xl",
        "px-8 py-9 sm:px-10 sm:py-10",
        "max-w-[520px] w-full",
        className
      )}
    >
      {/* subtle grid / noise-free accent */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.07) 1px, transparent 1px)",
          backgroundSize: "24px 24px",
        }}
      />

      <div className="relative space-y-7">
        <header className="space-y-2">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <h1 className="text-2xl sm:text-[1.65rem] font-semibold tracking-tight text-white">
              {merchant}
            </h1>
            <span className="text-sm font-medium text-white/40">·</span>
            <span className="text-sm font-medium uppercase tracking-[0.14em] text-emerald-400/90">
              Case resolved
            </span>
          </div>
          <p className="text-[0.95rem] font-medium text-emerald-400">
            {category} → {outcome}
          </p>
        </header>

        {/* Primary outcome stat + optional second + qualitative standing (no scores) */}
        <div className="flex flex-wrap gap-8 gap-y-6 border-y border-white/[0.08] py-6">
          <div>
            <p className="text-3xl sm:text-[2rem] font-semibold tabular-nums tracking-tight">
              {atStakeValue}
            </p>
            <p className="mt-1 text-xs font-medium uppercase tracking-wider text-white/45">
              {atStakeLabel}
            </p>
          </div>
          {secondaryMetric ? (
            <div>
              <p className="text-3xl sm:text-[2rem] font-semibold tabular-nums tracking-tight text-white">
                {secondaryMetric.value}
              </p>
              <p className="mt-1 text-xs font-medium uppercase tracking-wider text-white/45">
                {secondaryMetric.label}
              </p>
            </div>
          ) : null}
          <div>
            <p className="text-3xl sm:text-[2rem] font-semibold tracking-tight text-white">
              {standingValue}
            </p>
            <p className="mt-1 text-xs font-medium uppercase tracking-wider text-white/45">
              {standingLabel}
            </p>
          </div>
        </div>

        <p className="text-[0.95rem] leading-relaxed text-white/85">{summary}</p>

        <p className="text-xs font-medium uppercase tracking-[0.12em] text-white/40">
          {policyLine}
        </p>

        <blockquote className="border-l-[3px] border-emerald-500/90 bg-emerald-500/[0.06] py-3 pl-4 pr-3 rounded-r-lg">
          <p className="text-sm sm:text-[0.95rem] leading-snug text-white/95 font-medium">
            {highlight}
          </p>
        </blockquote>

        <footer className="flex items-end justify-between pt-1">
          <span className="text-lg font-bold tracking-tight text-white">Handled</span>
          <span className="text-sm font-semibold text-emerald-400">handled.info</span>
        </footer>
      </div>
    </div>
  );
}
