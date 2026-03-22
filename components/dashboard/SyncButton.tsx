"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";

const LAST_SYNC_STORAGE_KEY = "jobpulse_lastInboxSyncIso";

function parseIsoMs(iso: string | null | undefined): number {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? 0 : t;
}

function newestIso(
  ...candidates: (string | null | undefined)[]
): string | null {
  let best: string | null = null;
  let bestMs = 0;
  for (const c of candidates) {
    const ms = parseIsoMs(c ?? null);
    if (ms > bestMs) {
      bestMs = ms;
      best = c ?? null;
    }
  }
  return best;
}

const WINDOW_OPTIONS = [
  { value: 30, label: "30 days" },
  { value: 90, label: "90 days" },
  { value: 180, label: "180 days" },
  { value: 365, label: "365 days" },
];

interface SyncButtonProps {
  selectedWindow: number;
  scannedWindow: number;
  /** ISO timestamp from last successful inbox sync (server). */
  lastInboxSyncedAtIso: string | null;
}

function formatLastSync(iso: string | null): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "medium",
    });
  } catch {
    return "—";
  }
}

export function SyncButton({ selectedWindow, scannedWindow, lastInboxSyncedAtIso }: SyncButtonProps) {
  const [syncing, setSyncing] = useState(false);
  const [syncMode, setSyncMode] = useState<"quick" | "window" | "full">("quick");
  const [result, setResult] = useState<string | null>(null);
  const [clientLastSyncIso, setClientLastSyncIso] = useState<string | null>(null);
  const [storedLastSyncIso, setStoredLastSyncIso] = useState<string | null>(null);

  useEffect(() => {
    try {
      const s = sessionStorage.getItem(LAST_SYNC_STORAGE_KEY);
      if (s) setStoredLastSyncIso(s);
    } catch {
      /* private mode */
    }
  }, []);

  // Server caught up after a prior client-only timestamp
  useEffect(() => {
    if (!lastInboxSyncedAtIso || !storedLastSyncIso) return;
    if (parseIsoMs(lastInboxSyncedAtIso) >= parseIsoMs(storedLastSyncIso)) {
      try {
        sessionStorage.removeItem(LAST_SYNC_STORAGE_KEY);
      } catch {
        /* ignore */
      }
      setStoredLastSyncIso(null);
    }
  }, [lastInboxSyncedAtIso, storedLastSyncIso]);

  const displayLastSyncIso = useMemo(
    () => newestIso(clientLastSyncIso, storedLastSyncIso, lastInboxSyncedAtIso),
    [clientLastSyncIso, storedLastSyncIso, lastInboxSyncedAtIso]
  );
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const needsRescan = selectedWindow > scannedWindow;

  function handleWindowChange(nextWindow: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("window", String(nextWindow));
    router.push(`${pathname}?${params.toString()}`);
  }

  async function handleSync(mode: "quick" | "window" | "full") {
    setSyncing(true);
    setSyncMode(mode);
    setResult(null);
    try {
      const fullRescan = mode === "full";
      const res = await fetch("/api/gmail/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          fullRescan
            ? { fullRescan: true, daysBack: selectedWindow }
            : mode === "window"
              ? {
                  daysBack: selectedWindow,
                  fullRescan: false,
                  previousScannedDays: scannedWindow,
                }
              : { daysBack: selectedWindow, fullRescan: false }
        ),
      });
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) {
        const err =
          typeof data.error === "string"
            ? data.error
            : `HTTP ${res.status}`;
        setResult(`Sync failed: ${err}`);
        return;
      }
      if (data.success) {
        const strat = typeof data.strategy === "string" ? data.strategy : "";
        let msg: string;
        if (data.fullRescan) {
          msg = `Deep rescan complete: ${data.applications} application${
            data.applications !== 1 ? "s" : ""
          } processed`;
        } else if (mode === "window") {
          msg = `Synced older mail (${scannedWindow}d→${selectedWindow}d): ${data.applications} application${
            data.applications !== 1 ? "s" : ""
          }`;
        } else if (strat === "gmail_history" || strat === "delta_query") {
          const n = data.applications ?? 0;
          msg =
            n > 0
              ? `Up to date — ${n} new application update${n !== 1 ? "s" : ""} (${strat === "gmail_history" ? "instant sync" : "quick scan"})`
              : `Up to date — no new job mail (${strat === "gmail_history" ? "instant sync" : "quick scan"})`;
        } else {
          msg = `Scanned last ${data.daysBack} days: ${data.applications} application${
            data.applications !== 1 ? "s" : ""
          }`;
        }
        if (data.lastInboxSyncedAtPersisted === false) {
          msg +=
            " — Warning: \"last refresh\" time was not saved (user id mismatch in DB). Try signing out/in or check DATABASE_URL.";
        }
        setResult(msg);
        if (typeof data.lastInboxSyncedAt === "string") {
          setClientLastSyncIso(data.lastInboxSyncedAt);
          setStoredLastSyncIso(data.lastInboxSyncedAt);
          try {
            sessionStorage.setItem(LAST_SYNC_STORAGE_KEY, data.lastInboxSyncedAt);
          } catch {
            /* private mode */
          }
        }
        router.refresh();
        // Drop stale OAuth error query so the banner/URL don't imply Gmail is still broken.
        if (searchParams.get("error")) {
          const p = new URLSearchParams(searchParams.toString());
          p.delete("error");
          const q = p.toString();
          router.replace(q ? `${pathname}?${q}` : pathname);
        }
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
    <>
      {syncing && (
        <div className="fixed inset-0 z-[100] bg-gray-900/35 backdrop-blur-[1px] flex items-center justify-center">
          <div className="rounded-xl bg-white px-6 py-5 shadow-xl border border-gray-200 min-w-[300px]">
            <div className="flex items-center gap-3">
              <span className="inline-block w-4 h-4 border-2 border-gray-500 border-t-transparent rounded-full animate-spin" />
              <div>
                <p className="text-sm font-semibold text-gray-900">
                  {syncMode === "full"
                    ? "Deep scanning your inbox..."
                    : syncMode === "window"
                      ? "Fetching older messages..."
                      : "Checking for new mail..."}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  {syncMode === "full"
                    ? "This can take several minutes for large mailboxes."
                    : syncMode === "window"
                      ? "Only loading the new date range — not the whole inbox."
                      : "Uses Gmail’s change feed when possible — usually a few seconds."}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
      <div className="flex flex-col items-end gap-0">
      <div className="flex flex-wrap items-center justify-end gap-3">
      {result && (
        <span className="text-sm text-gray-500 hidden md:inline">{result}</span>
      )}
      <label className="text-xs text-gray-500 hidden md:flex items-center gap-2">
        Date window
        <select
          value={selectedWindow}
          onChange={(e) => handleWindowChange(Number(e.target.value))}
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
        onClick={() => handleSync("quick")}
        disabled={syncing}
        size="sm"
        className="bg-gray-900 hover:bg-gray-700 text-white"
      >
        {syncing && syncMode === "quick" ? "Refreshing..." : "Refresh"}
      </Button>
      {needsRescan && (
        <Button
          onClick={() => handleSync("window")}
          disabled={syncing}
          variant="outline"
          size="sm"
          className="border-gray-300"
        >
          {syncing && syncMode === "window" ? (
            <span className="flex items-center gap-2">
              <span className="inline-block w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
              Syncing…
            </span>
          ) : (
            `Load mail to ${selectedWindow}d`
          )}
        </Button>
      )}
      <Button
        onClick={() => handleSync("full")}
        disabled={syncing}
        variant="outline"
        size="sm"
        className="border-gray-400 text-gray-700"
      >
        {syncing && syncMode === "full" ? "Scanning…" : "Deep rescan (slow)"}
      </Button>
      <span className="hidden lg:inline text-xs text-gray-400 whitespace-nowrap">
        Scanned so far: {scannedWindow}d
      </span>
      <span
        className="hidden md:inline text-xs text-gray-500 max-w-[220px] lg:max-w-none truncate lg:whitespace-nowrap"
        title={displayLastSyncIso ? `Last inbox sync (local time): ${formatLastSync(displayLastSyncIso)}` : undefined}
      >
        Last refresh:{" "}
        <time
          dateTime={displayLastSyncIso ?? undefined}
          suppressHydrationWarning
        >
          {formatLastSync(displayLastSyncIso)}
        </time>
      </span>
      </div>
      <p
        className="md:hidden text-xs text-gray-500 mt-1.5 text-right w-full"
        title={displayLastSyncIso ? `Last inbox sync (local time): ${formatLastSync(displayLastSyncIso)}` : undefined}
      >
        Last refresh:{" "}
        <time dateTime={displayLastSyncIso ?? undefined} suppressHydrationWarning>
          {formatLastSync(displayLastSyncIso)}
        </time>
      </p>
      </div>
    </>
  );
}
