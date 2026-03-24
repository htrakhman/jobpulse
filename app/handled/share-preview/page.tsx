import { HandledCaseShareCard } from "@/components/handled/HandledCaseShareCard";

/**
 * Public preview for the Handled share card (screenshot / design QA).
 * Open: /handled/share-preview
 *
 * Query overrides (optional): merchant, category, outcome, stake, summary, policies, highlight
 */
export default async function HandledSharePreviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const s = (k: string, fallback: string) => {
    const v = sp[k];
    if (Array.isArray(v)) return v[0] ?? fallback;
    return typeof v === "string" && v.length > 0 ? v : fallback;
  };

  const merchant = s("merchant", "Amazon");
  const category = s("category", "Shipping");
  const outcome = s("outcome", "Resolution");
  const atStakeValue = s("stake", "$189");
  const policyCount = Math.max(0, parseInt(s("policies", "4"), 10) || 4);
  const summary = s(
    "summary",
    "Clear path to resolution for a misdelivered Amazon package — aligned with published policy."
  );
  const highlight = s(
    "highlight",
    "You didn’t need to contact support to get this mapped."
  );

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center p-8">
      <p className="mb-6 text-center text-xs text-white/35 max-w-md">
        Handled share card preview · no evidence score ·{" "}
        <span className="text-white/50">Cmd+Shift+4</span> or devtools to capture
      </p>
      <HandledCaseShareCard
        merchant={merchant}
        category={category}
        outcome={outcome}
        atStakeValue={atStakeValue}
        policyCount={policyCount}
        summary={summary}
        highlight={highlight}
        standingLabel="Standing"
        standingValue="Strong"
      />
    </div>
  );
}
