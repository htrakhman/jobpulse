"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

const WINDOW_OPTIONS = [
  { value: 30, label: "30 days" },
  { value: 90, label: "90 days" },
  { value: 180, label: "180 days" },
  { value: 365, label: "365 days" },
];

export function SyncButton() {
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [daysBack, setDaysBack] = useState(180);
  const router = useRouter();

  async function handleSync() {
    setSyncing(true);
    setResult(null);
    try {
      const res = await fetch("/api/gmail/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ daysBack }),
      });
      const data = await res.json();
      if (data.success) {
        setResult(
          `Scanned last ${data.daysBack} days: ${data.applications} application${
            data.applications !== 1 ? "s" : ""
          }`
        );
        router.refresh();
      } else {
        setResult("Sync failed");
      }
    } catch {
      setResult("Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      {result && (
        <span className="text-sm text-gray-500 hidden md:inline">{result}</span>
      )}
      <label className="text-xs text-gray-500 hidden md:flex items-center gap-2">
        Scan window
        <select
          value={daysBack}
          onChange={(e) => setDaysBack(Number(e.target.value))}
          className="border border-gray-300 rounded-md px-2 py-1 text-xs bg-white text-gray-700"
          disabled={syncing}
        >
          {WINDOW_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <Button
        onClick={handleSync}
        disabled={syncing}
        variant="outline"
        size="sm"
        className="border-gray-300"
      >
        {syncing ? (
          <span className="flex items-center gap-2">
            <span className="inline-block w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
            Syncing…
          </span>
        ) : (
          "Rescan inbox"
        )}
      </Button>
    </div>
  );
}
