"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";

const STAGES = [
  { value: "", label: "All" },
  { value: "Applied", label: "Applied" },
  { value: "Waiting", label: "Awaiting Response" },
  { value: "Scheduling", label: "Scheduling" },
  { value: "Interviewing", label: "Interviewing" },
  { value: "Assessment", label: "Assessment" },
  { value: "Offer", label: "Offer Received" },
  { value: "Rejected", label: "Rejected" },
  { value: "Closed", label: "Closed" },
];

export function StatusFilter() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentStagesRaw = searchParams.get("stages");
  const currentLegacy = searchParams.get("stage");
  const currentStages = new Set(
    (currentStagesRaw
      ? currentStagesRaw.split(",")
      : currentLegacy
      ? [currentLegacy]
      : []
    ).filter(Boolean)
  );

  function handleSelect(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (!value) {
      params.delete("stage");
      params.delete("stages");
      router.push(`${pathname}?${params.toString()}`);
      return;
    }
    const next = new Set(currentStages);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    params.delete("stage");
    if (next.size > 0) {
      params.set("stages", [...next].join(","));
    } else {
      params.delete("stages");
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {STAGES.map((s) => (
        <button
          key={s.value}
          onClick={() => handleSelect(s.value)}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            s.value === ""
              ? currentStages.size === 0
                ? "bg-gray-900 text-white"
                : "bg-white text-gray-600 border border-gray-200 hover:border-gray-400"
              : currentStages.has(s.value)
              ? "bg-gray-900 text-white"
              : "bg-white text-gray-600 border border-gray-200 hover:border-gray-400"
          }`}
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}
