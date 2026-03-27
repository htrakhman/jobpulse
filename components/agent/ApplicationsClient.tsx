"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";

interface AgentRun {
  id: string;
  status: string;
  emailsDrafted: number;
  emailsSent: number;
  contactsFound: number;
  createdAt: string;
}

interface Application {
  id: string;
  company: string;
  role: string | null;
  stage: string;
  appliedAt: string | null;
  lastActivityAt: string;
  agentRuns: AgentRun[];
  outreachMessages: { id: string; status: string }[];
}

function stageColor(stage: string) {
  switch (stage) {
    case "Applied": return "bg-blue-100 text-blue-700";
    case "Waiting": return "bg-slate-100 text-slate-600";
    case "Scheduling": return "bg-purple-100 text-purple-700";
    case "Interviewing": return "bg-indigo-100 text-indigo-700";
    case "Assessment": return "bg-cyan-100 text-cyan-700";
    case "Offer": return "bg-emerald-100 text-emerald-700";
    case "Rejected": return "bg-red-100 text-red-600";
    case "Closed": return "bg-slate-100 text-slate-500";
    default: return "bg-slate-100 text-slate-600";
  }
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

function agentStatusIcon(status: string) {
  switch (status) {
    case "completed": return { icon: "✅", label: "Done" };
    case "running": return { icon: "⏳", label: "Running" };
    case "pending_approval": return { icon: "📬", label: "Needs review" };
    case "failed": return { icon: "❌", label: "Failed" };
    default: return { icon: "—", label: status };
  }
}

export default function ApplicationsClient({ applications }: { applications: Application[] }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [triggering, setTriggering] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "no_agent" | "pending">("all");

  const triggerAgent = useCallback(async (applicationId: string) => {
    setTriggering(applicationId);
    try {
      await fetch("/api/agent/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ applicationId }),
      });
      router.refresh();
    } finally {
      setTriggering(null);
    }
  }, [router]);

  const filtered = applications.filter((app) => {
    const q = search.toLowerCase();
    const matchesSearch = !q || app.company.toLowerCase().includes(q) || (app.role ?? "").toLowerCase().includes(q);
    if (!matchesSearch) return false;

    if (filter === "no_agent") return app.agentRuns.length === 0;
    if (filter === "pending") return app.agentRuns[0]?.status === "pending_approval";
    return true;
  });

  return (
    <div className="flex flex-col min-h-screen">
      <header className="border-b border-slate-200 bg-white px-6 py-4">
        <h1 className="text-lg font-bold text-slate-900">Applications</h1>
        <p className="text-xs text-slate-500 mt-0.5">All tracked job applications with agent status</p>
      </header>

      <div className="border-b border-slate-200 bg-white px-6 py-3 flex items-center gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by company or role…"
          className="flex-1 max-w-sm rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <div className="flex gap-1.5">
          {(["all", "no_agent", "pending"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                filter === f ? "bg-blue-600 text-white" : "bg-white border border-slate-300 text-slate-600 hover:bg-slate-50"
              }`}
            >
              {f === "all" ? "All" : f === "no_agent" ? "No agent yet" : "Needs approval"}
            </button>
          ))}
        </div>
        <span className="ml-auto text-xs text-slate-400">{filtered.length} application{filtered.length !== 1 ? "s" : ""}</span>
      </div>

      <main className="flex-1 overflow-auto">
        {filtered.length === 0 ? (
          <div className="flex items-center justify-center h-48 text-sm text-slate-400">
            No applications found.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Company / Role</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Stage</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Agent</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Outreach</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Activity</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((app) => {
                const latestRun = app.agentRuns[0];
                const draftCount = app.outreachMessages.filter((m) => m.status === "draft").length;
                const sentCount = app.outreachMessages.filter((m) => m.status === "sent").length;
                const agentStatus = latestRun ? agentStatusIcon(latestRun.status) : null;

                return (
                  <tr key={app.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-3.5">
                      <p className="font-semibold text-slate-900">{app.company}</p>
                      {app.role && <p className="text-xs text-slate-500 mt-0.5">{app.role}</p>}
                    </td>
                    <td className="px-4 py-3.5">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${stageColor(app.stage)}`}>
                        {app.stage}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      {agentStatus ? (
                        <div className="flex items-center gap-1.5">
                          <span>{agentStatus.icon}</span>
                          <span className="text-xs text-slate-600">{agentStatus.label}</span>
                          {latestRun.contactsFound > 0 && (
                            <span className="text-xs text-slate-400">· {latestRun.contactsFound} found</span>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">Not run</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="text-xs text-slate-600">
                        {sentCount > 0 && <span className="text-emerald-600 font-medium">{sentCount} sent</span>}
                        {draftCount > 0 && <span className="text-amber-600 font-medium ml-1">{draftCount} draft{draftCount !== 1 ? "s" : ""}</span>}
                        {sentCount === 0 && draftCount === 0 && <span className="text-slate-400">—</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-xs text-slate-400">
                      {timeAgo(app.lastActivityAt)}
                    </td>
                    <td className="px-4 py-3.5">
                      <button
                        onClick={() => triggerAgent(app.id)}
                        disabled={triggering === app.id}
                        className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50"
                      >
                        {triggering === app.id ? "Running…" : latestRun ? "↻ Re-run" : "▶ Run agent"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </main>
    </div>
  );
}
