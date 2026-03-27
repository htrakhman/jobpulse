"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";

interface Draft {
  id: string;
  channel: string;
  subject: string | null;
  body: string;
  status: string;
  createdAt: string;
  contact: {
    id: string;
    fullName: string | null;
    title: string | null;
    email: string | null;
    linkedinUrl: string | null;
    company: string;
  };
  application: {
    id: string;
    company: string;
    role: string | null;
  };
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

export default function ApprovalsClient({ drafts: initialDrafts }: { drafts: Draft[] }) {
  const router = useRouter();
  const [drafts, setDrafts] = useState(initialDrafts);
  const [editing, setEditing] = useState<string | null>(null);
  const [editBody, setEditBody] = useState<Record<string, string>>({});
  const [editSubject, setEditSubject] = useState<Record<string, string>>({});
  const [sending, setSending] = useState<string | null>(null);
  const [discarding, setDiscarding] = useState<string | null>(null);

  const startEdit = (draft: Draft) => {
    setEditing(draft.id);
    setEditBody((b) => ({ ...b, [draft.id]: draft.body }));
    setEditSubject((s) => ({ ...s, [draft.id]: draft.subject ?? "" }));
  };

  const sendDraft = useCallback(async (draft: Draft) => {
    setSending(draft.id);
    try {
      const res = await fetch("/api/outreach/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messageId: draft.id,
          subject: editing === draft.id ? editSubject[draft.id] : draft.subject,
          body: editing === draft.id ? editBody[draft.id] : draft.body,
        }),
      });

      if (res.ok) {
        setDrafts((prev) => prev.filter((d) => d.id !== draft.id));
        setEditing(null);
      } else {
        const data = await res.json();
        alert(`Failed to send: ${data.error ?? "Unknown error"}`);
      }
    } finally {
      setSending(null);
    }
  }, [editing, editBody, editSubject]);

  const discardDraft = useCallback(async (draftId: string) => {
    if (!confirm("Discard this draft? This cannot be undone.")) return;
    setDiscarding(draftId);
    try {
      // Mark as failed (soft discard) by calling a PATCH
      const res = await fetch(`/api/outreach/discard`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId: draftId }),
      });
      if (res.ok) {
        setDrafts((prev) => prev.filter((d) => d.id !== draftId));
      }
    } finally {
      setDiscarding(null);
    }
  }, []);

  if (drafts.length === 0) {
    return (
      <div className="flex flex-col min-h-screen">
        <header className="border-b border-slate-200 bg-white px-6 py-4">
          <h1 className="text-lg font-bold text-slate-900">Pending Approvals</h1>
          <p className="text-xs text-slate-500 mt-0.5">Review and send outreach drafted by the agent</p>
        </header>
        <main className="flex-1 flex items-center justify-center p-10">
          <div className="text-center">
            <p className="text-3xl mb-3">✅</p>
            <p className="text-base font-semibold text-slate-700">All caught up</p>
            <p className="text-sm text-slate-500 mt-1">No drafts waiting for your approval.</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen">
      <header className="border-b border-slate-200 bg-white px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-slate-900">Pending Approvals</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {drafts.length} draft{drafts.length !== 1 ? "s" : ""} waiting for your review
          </p>
        </div>
        <button
          onClick={() => router.refresh()}
          className="text-xs text-slate-500 hover:text-slate-700 border border-slate-200 rounded-md px-3 py-1.5"
        >
          ↻ Refresh
        </button>
      </header>

      <main className="flex-1 px-6 py-6 space-y-4">
        {drafts.map((draft) => (
          <div key={draft.id} className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            {/* Card header */}
            <div className="flex items-start gap-3 px-5 py-4 border-b border-slate-100">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {draft.channel === "email" ? "📧 Email" : "🔗 LinkedIn"}
                  </span>
                  <span className="text-slate-300">·</span>
                  <span className="text-xs text-slate-400">{timeAgo(draft.createdAt)}</span>
                </div>
                <p className="font-semibold text-slate-900">
                  {draft.contact.fullName ?? "Unknown contact"}
                </p>
                <p className="text-xs text-slate-500">
                  {draft.contact.title ? `${draft.contact.title} · ` : ""}{draft.contact.company}
                  {draft.contact.email && <span className="ml-1 text-blue-600">{draft.contact.email}</span>}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-xs font-medium text-slate-700">{draft.application.company}</p>
                {draft.application.role && (
                  <p className="text-xs text-slate-400">{draft.application.role}</p>
                )}
              </div>
            </div>

            {/* Message body */}
            <div className="px-5 py-4">
              {draft.channel === "email" && (
                <div className="mb-3">
                  {editing === draft.id ? (
                    <input
                      type="text"
                      value={editSubject[draft.id] ?? draft.subject ?? ""}
                      onChange={(e) => setEditSubject((s) => ({ ...s, [draft.id]: e.target.value }))}
                      className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Subject…"
                    />
                  ) : (
                    <p className="text-sm font-medium text-slate-700">
                      Subject: {draft.subject ?? "(no subject)"}
                    </p>
                  )}
                </div>
              )}

              {editing === draft.id ? (
                <textarea
                  value={editBody[draft.id] ?? draft.body}
                  onChange={(e) => setEditBody((b) => ({ ...b, [draft.id]: e.target.value }))}
                  rows={8}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-800 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
                />
              ) : (
                <pre className="whitespace-pre-wrap text-sm text-slate-700 font-sans leading-relaxed max-h-48 overflow-y-auto">
                  {draft.body}
                </pre>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex items-center justify-between px-5 py-3 bg-slate-50 border-t border-slate-100">
              <div className="flex items-center gap-2">
                {editing === draft.id ? (
                  <button
                    onClick={() => setEditing(null)}
                    className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100"
                  >
                    Cancel
                  </button>
                ) : (
                  <button
                    onClick={() => startEdit(draft)}
                    className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100"
                  >
                    ✏️ Edit
                  </button>
                )}
                <button
                  onClick={() => discardDraft(draft.id)}
                  disabled={discarding === draft.id}
                  className="rounded-md border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                >
                  {discarding === draft.id ? "Discarding…" : "🗑️ Discard"}
                </button>
              </div>

              <button
                onClick={() => sendDraft(draft)}
                disabled={sending === draft.id}
                className="rounded-md bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60 shadow-sm"
              >
                {sending === draft.id ? "Sending…" : "Send →"}
              </button>
            </div>
          </div>
        ))}
      </main>
    </div>
  );
}
