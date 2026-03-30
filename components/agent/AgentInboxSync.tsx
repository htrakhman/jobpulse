"use client";

import { useCallback, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

function formatLastSync(iso: string | null): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return "—";
  }
}

interface AgentInboxSyncProps {
  lastInboxSyncedAtIso: string | null;
  gmailConnected: boolean;
}

/**
 * Pull application-confirmation mail from Gmail (subject + body must match acknowledgement phrases).
 * - Quick: incremental / recent window (fast).
 * - Full import: deep scan (~10y) for first-time or "nothing showing" — can take minutes.
 */
export function AgentInboxSync({ lastInboxSyncedAtIso, gmailConnected }: AgentInboxSyncProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [busy, setBusy] = useState<"quick" | "full" | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const returnTo = encodeURIComponent(`${pathname}${searchParams.toString() ? `?${searchParams.toString()}` : ""}`);

  const runSync = useCallback(
    async (fullRescan: boolean) => {
      setBusy(fullRescan ? "full" : "quick");
      setMessage(null);
      try {
        const res = await fetch("/api/gmail/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            fullRescan
              ? { fullRescan: true }
              : { daysBack: 365, fullRescan: false }
          ),
        });
        const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        if (!res.ok) {
          if (data.code === "gmail_reconnect_required") {
            setMessage("Gmail needs reconnect — redirecting…");
            router.push(`/api/gmail/connect?returnTo=${returnTo}`);
            return;
          }
          setMessage(typeof data.error === "string" ? data.error : `Sync failed (${res.status})`);
          return;
        }
        const processed = typeof data.processed === "number" ? data.processed : 0;
        const apps = typeof data.applications === "number" ? data.applications : 0;
        const strat = typeof data.strategy === "string" ? data.strategy : "";
        setMessage(
          fullRescan
            ? `Full import finished — processed ${processed} message(s), ${apps} application update(s). Strategy: ${strat || "full_list"}.`
            : `Synced — processed ${processed} message(s), ${apps} application update(s).`
        );
        router.refresh();
      } catch {
        setMessage("Sync failed — check network and try again.");
      } finally {
        setBusy(null);
      }
    },
    [returnTo, router]
  );

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Inbox sync</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Imports only save emails where phrases like &quot;thanks for applying&quot; or &quot;thank you for
            your application&quot; appear in <strong>both</strong> the subject and the body. Connect Gmail and
            sync — use <strong>Full import</strong> once if you joined today or see zeros everywhere.
          </p>
          <p className="text-xs text-slate-400 mt-1">
            Last successful sync:{" "}
            <time dateTime={lastInboxSyncedAtIso ?? undefined}>{formatLastSync(lastInboxSyncedAtIso)}</time>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!gmailConnected ? (
            <Link
              href={`/api/gmail/connect?returnTo=${returnTo}`}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              Connect Gmail
            </Link>
          ) : (
            <>
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => runSync(false)}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50"
              >
                {busy === "quick" ? "Syncing…" : "Quick sync (365d)"}
              </button>
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => runSync(true)}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
              >
                {busy === "full" ? "Importing…" : "Full import (all history)"}
              </button>
            </>
          )}
        </div>
      </div>
      {message && (
        <p className="mt-3 text-xs text-slate-600 border-t border-slate-100 pt-3">{message}</p>
      )}
    </div>
  );
}
