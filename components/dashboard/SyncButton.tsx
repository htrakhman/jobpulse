"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function SyncButton() {
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const router = useRouter();

  async function handleSync() {
    setSyncing(true);
    setResult(null);
    try {
      const res = await fetch("/api/gmail/sync", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        setResult(`Found ${data.applications} application${data.applications !== 1 ? "s" : ""}`);
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
        <span className="text-sm text-gray-500">{result}</span>
      )}
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
          "Sync inbox"
        )}
      </Button>
    </div>
  );
}
