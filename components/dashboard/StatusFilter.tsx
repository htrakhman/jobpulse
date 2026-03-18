"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";

const STAGES = [
  { value: "", label: "All" },
  { value: "Applied", label: "Applied" },
  { value: "Waiting", label: "Awaiting Response" },
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
  const current = searchParams.get("stage") ?? "";

  function handleSelect(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set("stage", value);
    } else {
      params.delete("stage");
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
            current === s.value
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
