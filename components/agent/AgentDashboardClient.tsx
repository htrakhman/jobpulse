"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

// ── Types ─────────────────────────────────────────────────────────────────────

interface AgentConfig {
  enabled: boolean;
  targetTitles: string[];
  maxContacts: number;
  autoSend: boolean;
  preferredTemplate: string | null;
  channel: string;
}

interface AgentRunStep {
  id: string;
  kind: string;
  status: string;
  summary: string | null;
  createdAt: string;
}

interface AgentRun {
  id: string;
  status: string;
  triggerType: string;
  contactsFound: number;
  contactsEnriched: number;
  emailsDrafted: number;
  emailsSent: number;
  error: string | null;
  startedAt: string;
  completedAt: string | null;
  steps: AgentRunStep[];
  application: {
    id: string;
    company: string;
    role: string | null;
  };
}

interface Stats {
  totalRuns: number;
  completed: number;
  pending: number;
  emailsSent: number;
  pendingDrafts: number;
  totalApplications: number;
}

interface Props {
  config: AgentConfig;
  recentRuns: AgentRun[];
  stats: Stats;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function statusColor(status: string) {
  switch (status) {
    case "completed": return "bg-emerald-100 text-emerald-700";
    case "running": return "bg-blue-100 text-blue-700 animate-pulse";
    case "pending_approval": return "bg-amber-100 text-amber-700";
    case "failed": return "bg-red-100 text-red-700";
    default: return "bg-slate-100 text-slate-600";
  }
}

function statusLabel(status: string) {
  switch (status) {
    case "completed": return "Done";
    case "running": return "Running…";
    case "pending_approval": return "Awaiting Approval";
    case "failed": return "Failed";
    default: return status;
  }
}

function stepIcon(kind: string, status: string) {
  if (status === "error") return "❌";
  if (status === "skipped") return "⏭️";
  if (status === "running") return "⏳";
  switch (kind) {
    case "search": return "🔍";
    case "enrich": return "💡";
    case "draft": return "✉️";
    case "send": return "🚀";
    default: return "•";
  }
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function AgentDashboardClient({ config, recentRuns, stats }: Props) {
  const router = useRouter();
  const [expandedRun, setExpandedRun] = useState<string | null>(null);
  const [isToggling, setIsToggling] = useState(false);
  const [agentEnabled, setAgentEnabled] = useState(config.enabled);
  const [triggeringId, setTriggeringId] = useState<string | null>(null);

  const toggleAgent = useCallback(async () => {
    setIsToggling(true);
    try {
      const res = await fetch("/api/agent/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !agentEnabled }),
      });
      if (res.ok) setAgentEnabled((v) => !v);
    } finally {
      setIsToggling(false);
    }
  }, [agentEnabled]);

  const triggerAgent = useCallback(async (applicationId: string) => {
    setTriggeringId(applicationId);
    try {
      await fetch("/api/agent/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ applicationId }),
      });
      router.refresh();
    } finally {
      setTriggeringId(null);
    }
  }, [router]);

  return (
    <div className="flex flex-col min-h-screen">
      {/* ── Header ── */}
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-slate-900">Job Search Agent</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Automatically finds and reaches out to decision-makers after you apply
          </p>
        </div>
        <div className="flex items-center gap-3">
          {stats.pendingDrafts > 0 && (
            <Link
              href="/agent/approvals"
              className="flex items-center gap-1.5 rounded-full bg-amber-50 border border-amber-200 px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-100 transition-colors"
            >
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500"></span>
              {stats.pendingDrafts} draft{stats.pendingDrafts !== 1 ? "s" : ""} pending
            </Link>
          )}
          {/* Agent on/off toggle */}
          <button
            onClick={toggleAgent}
            disabled={isToggling}
            className={`relative flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-all ${
              agentEnabled
                ? "bg-blue-600 text-white shadow-md hover:bg-blue-700"
                : "bg-slate-200 text-slate-600 hover:bg-slate-300"
            }`}
          >
            <span className={`inline-block w-2 h-2 rounded-full ${agentEnabled ? "bg-white animate-pulse" : "bg-slate-400"}`}></span>
            {agentEnabled ? "Agent Active" : "Agent Paused"}
          </button>
        </div>
      </header>

      <main className="flex-1 px-6 py-6 space-y-6">

        {/* ── Stats row ── */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {[
            { label: "Applications", value: stats.totalApplications, icon: "📋" },
            { label: "Agent Runs", value: stats.totalRuns, icon: "🤖" },
            { label: "Completed", value: stats.completed, icon: "✅" },
            { label: "Pending", value: stats.pending, icon: "⏳" },
            { label: "Emails Sent", value: stats.emailsSent, icon: "📧" },
            { label: "Drafts Waiting", value: stats.pendingDrafts, icon: "📬", highlight: stats.pendingDrafts > 0 },
          ].map((s) => (
            <div
              key={s.label}
              className={`rounded-xl border p-4 ${s.highlight ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-white"}`}
            >
              <p className="text-xl">{s.icon}</p>
              <p className={`mt-1 text-2xl font-bold ${s.highlight ? "text-amber-700" : "text-slate-900"}`}>{s.value}</p>
              <p className="text-xs text-slate-500 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        {/* ── How it works (empty state) ── */}
        {recentRuns.length === 0 && (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
            <p className="text-4xl mb-3">🤖</p>
            <h2 className="text-lg font-semibold text-slate-800 mb-2">Agent is ready</h2>
            <p className="text-sm text-slate-500 max-w-md mx-auto mb-6">
              As soon as you get a &quot;Thank you for applying&quot; email, the agent will
              automatically find decision-makers at that company, enrich their contact info,
              and draft personalized outreach emails for you.
            </p>
            <div className="flex justify-center gap-3">
              <Link
                href="/agent/settings"
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Configure Agent
              </Link>
            </div>
          </div>
        )}

        {/* ── Agent Activity Feed ── */}
        {recentRuns.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Agent Activity</h2>
              <Link href="/agent/settings" className="text-xs text-blue-600 hover:underline">
                Configure →
              </Link>
            </div>

            <div className="space-y-3">
              {recentRuns.map((run) => (
                <div key={run.id} className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                  {/* Run header */}
                  <div
                    className="flex items-center gap-3 px-4 py-3.5 cursor-pointer hover:bg-slate-50 transition-colors"
                    onClick={() => setExpandedRun(expandedRun === run.id ? null : run.id)}
                  >
                    {/* Status badge */}
                    <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusColor(run.status)}`}>
                      {statusLabel(run.status)}
                    </span>

                    {/* Company + role */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-900 truncate">
                        {run.application.company}
                      </p>
                      {run.application.role && (
                        <p className="text-xs text-slate-500 truncate">{run.application.role}</p>
                      )}
                    </div>

                    {/* Metrics */}
                    <div className="flex items-center gap-4 shrink-0 text-xs text-slate-500">
                      {run.contactsFound > 0 && (
                        <span>👥 {run.contactsFound} found</span>
                      )}
                      {run.emailsDrafted > 0 && (
                        <span>✉️ {run.emailsDrafted} drafted</span>
                      )}
                      {run.emailsSent > 0 && (
                        <span>🚀 {run.emailsSent} sent</span>
                      )}
                      <span className="text-slate-400">{timeAgo(run.startedAt)}</span>
                      {run.triggerType === "email_webhook" ? (
                        <span title="Auto-triggered by email" className="text-slate-400">⚡ auto</span>
                      ) : (
                        <span title="Manually triggered" className="text-slate-400">👆 manual</span>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 ml-2">
                      {run.status === "pending_approval" && (
                        <Link
                          href="/agent/approvals"
                          className="rounded-md bg-amber-500 px-2.5 py-1 text-xs font-medium text-white hover:bg-amber-600"
                          onClick={(e) => e.stopPropagation()}
                        >
                          Review
                        </Link>
                      )}
                      <Link
                        href={`/applications/${run.application.id}`}
                        className="text-xs text-blue-600 hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        App →
                      </Link>
                      <span className="text-slate-300">{expandedRun === run.id ? "▲" : "▼"}</span>
                    </div>
                  </div>

                  {/* Expanded steps */}
                  {expandedRun === run.id && (
                    <div className="border-t border-slate-100 px-4 py-3 bg-slate-50">
                      {run.steps.length === 0 ? (
                        <p className="text-xs text-slate-400">No steps recorded.</p>
                      ) : (
                        <div className="space-y-1.5">
                          {run.steps.map((step) => (
                            <div key={step.id} className="flex items-start gap-2 text-xs">
                              <span className="shrink-0 mt-0.5">{stepIcon(step.kind, step.status)}</span>
                              <span className={`${step.status === "error" ? "text-red-600" : step.status === "skipped" ? "text-slate-400" : "text-slate-700"}`}>
                                {step.summary ?? `${step.kind} — ${step.status}`}
                              </span>
                              <span className="ml-auto shrink-0 text-slate-400">{timeAgo(step.createdAt)}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {run.error && (
                        <div className="mt-2 rounded-md bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
                          {run.error}
                        </div>
                      )}

                      {/* Re-run button */}
                      <div className="mt-3 flex justify-end">
                        <button
                          onClick={() => triggerAgent(run.application.id)}
                          disabled={triggeringId === run.application.id}
                          className="rounded-md border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                        >
                          {triggeringId === run.application.id ? "Running…" : "↻ Re-run agent"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
