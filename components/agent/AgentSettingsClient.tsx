"use client";

import { useState, useCallback } from "react";

interface AgentConfig {
  enabled: boolean;
  targetTitles: string[];
  maxContacts: number;
  autoSend: boolean;
  preferredTemplate: string | null;
  channel: string;
}

const TEMPLATE_OPTIONS = [
  { id: "executive-intro", label: "Executive / Leadership Intro" },
  { id: "hiring-manager", label: "Hiring Manager Reach" },
  { id: "recruiter-intro", label: "Recruiter Intro" },
  { id: "follow-up-after-apply", label: "Follow-Up After Applying" },
  { id: "referral-ask", label: "Referral Request (LinkedIn)" },
];

const SUGGESTED_TITLES = [
  "CEO", "CTO", "CPO", "COO", "CFO",
  "Founder", "Co-Founder", "President",
  "VP Engineering", "VP of Engineering",
  "VP Product", "VP of Product",
  "VP Sales", "VP Marketing",
  "Head of Engineering", "Head of Product", "Head of Talent",
  "Director of Engineering", "Engineering Manager",
  "Chief of Staff",
];

export default function AgentSettingsClient({ config: initial }: { config: AgentConfig }) {
  const [config, setConfig] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [newTitle, setNewTitle] = useState("");

  const save = useCallback(async () => {
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch("/api/agent/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      if (res.ok) setSaved(true);
    } finally {
      setSaving(false);
      setTimeout(() => setSaved(false), 3000);
    }
  }, [config]);

  const addTitle = () => {
    const t = newTitle.trim();
    if (t && !config.targetTitles.includes(t)) {
      setConfig((c) => ({ ...c, targetTitles: [...c.targetTitles, t] }));
    }
    setNewTitle("");
  };

  const removeTitle = (title: string) => {
    setConfig((c) => ({ ...c, targetTitles: c.targetTitles.filter((t) => t !== title) }));
  };

  return (
    <div className="flex flex-col min-h-screen">
      <header className="border-b border-slate-200 bg-white px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-slate-900">Agent Settings</h1>
          <p className="text-xs text-slate-500 mt-0.5">Configure how the agent finds and reaches out to contacts</p>
        </div>
        <button
          onClick={save}
          disabled={saving}
          className={`rounded-lg px-4 py-2 text-sm font-semibold transition-all shadow-sm ${
            saved
              ? "bg-emerald-600 text-white"
              : "bg-blue-600 text-white hover:bg-blue-700"
          } disabled:opacity-60`}
        >
          {saving ? "Saving…" : saved ? "✓ Saved" : "Save Changes"}
        </button>
      </header>

      <main className="flex-1 px-6 py-6 max-w-2xl space-y-8">

        {/* Agent On/Off */}
        <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
          <h2 className="text-sm font-bold text-slate-800">Agent Status</h2>
          <label className="flex items-center justify-between cursor-pointer">
            <div>
              <p className="text-sm font-medium text-slate-700">Enable agent</p>
              <p className="text-xs text-slate-500 mt-0.5">
                When enabled, the agent automatically runs whenever you get a &quot;thank you for applying&quot; email
              </p>
            </div>
            <button
              onClick={() => setConfig((c) => ({ ...c, enabled: !c.enabled }))}
              className={`relative shrink-0 ml-4 h-6 w-11 rounded-full transition-colors ${
                config.enabled ? "bg-blue-600" : "bg-slate-300"
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                  config.enabled ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </label>
        </section>

        {/* Target Contacts */}
        <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
          <h2 className="text-sm font-bold text-slate-800">Who to target</h2>

          <div>
            <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">
              Max contacts per application
            </label>
            <div className="flex items-center gap-3 mt-2">
              {[1, 2, 3, 5].map((n) => (
                <button
                  key={n}
                  onClick={() => setConfig((c) => ({ ...c, maxContacts: n }))}
                  className={`w-10 h-10 rounded-lg text-sm font-semibold border transition-colors ${
                    config.maxContacts === n
                      ? "bg-blue-600 text-white border-blue-600"
                      : "bg-white text-slate-700 border-slate-300 hover:border-blue-400"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">
              Target titles
            </label>
            <p className="text-xs text-slate-400 mt-0.5 mb-2">The agent will search for people with these titles at the company</p>

            {/* Current titles */}
            <div className="flex flex-wrap gap-2 mb-3">
              {config.targetTitles.map((title) => (
                <span
                  key={title}
                  className="flex items-center gap-1 rounded-full bg-blue-50 border border-blue-200 px-2.5 py-1 text-xs font-medium text-blue-700"
                >
                  {title}
                  <button
                    onClick={() => removeTitle(title)}
                    className="ml-0.5 text-blue-400 hover:text-blue-700 leading-none"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>

            {/* Add custom */}
            <div className="flex gap-2">
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addTitle()}
                placeholder="Add a title…"
                className="flex-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={addTitle}
                className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Add
              </button>
            </div>

            {/* Quick-add suggestions */}
            <div className="mt-2 flex flex-wrap gap-1.5">
              {SUGGESTED_TITLES.filter((t) => !config.targetTitles.includes(t)).map((t) => (
                <button
                  key={t}
                  onClick={() => setConfig((c) => ({ ...c, targetTitles: [...c.targetTitles, t] }))}
                  className="rounded-full border border-slate-200 px-2 py-0.5 text-xs text-slate-500 hover:border-blue-400 hover:text-blue-600 transition-colors"
                >
                  + {t}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Outreach config */}
        <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
          <h2 className="text-sm font-bold text-slate-800">Outreach settings</h2>

          <div>
            <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Channel</label>
            <div className="flex gap-2 mt-2">
              {[
                { value: "email", label: "📧 Email" },
                { value: "linkedin", label: "🔗 LinkedIn" },
              ].map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setConfig((c) => ({ ...c, channel: opt.value }))}
                  className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                    config.channel === opt.value
                      ? "bg-blue-600 text-white border-blue-600"
                      : "bg-white text-slate-700 border-slate-300 hover:border-blue-400"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Email template</label>
            <select
              value={config.preferredTemplate ?? "executive-intro"}
              onChange={(e) => setConfig((c) => ({ ...c, preferredTemplate: e.target.value }))}
              className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {TEMPLATE_OPTIONS.map((t) => (
                <option key={t.id} value={t.id}>{t.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="flex items-center justify-between cursor-pointer">
              <div>
                <p className="text-sm font-medium text-slate-700">Auto-send emails</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  If off, the agent drafts emails for you to review and approve before sending
                </p>
              </div>
              <button
                onClick={() => setConfig((c) => ({ ...c, autoSend: !c.autoSend }))}
                className={`relative shrink-0 ml-4 h-6 w-11 rounded-full transition-colors ${
                  config.autoSend ? "bg-blue-600" : "bg-slate-300"
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                    config.autoSend ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </label>
            {config.autoSend && (
              <p className="mt-2 rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700">
                ⚠️ Auto-send is on — emails will be sent immediately without your review
              </p>
            )}
          </div>
        </section>

        <div className="pb-10">
          <button
            onClick={save}
            disabled={saving}
            className={`w-full rounded-xl py-3 text-sm font-bold transition-all shadow-sm ${
              saved ? "bg-emerald-600 text-white" : "bg-blue-600 text-white hover:bg-blue-700"
            } disabled:opacity-60`}
          >
            {saving ? "Saving…" : saved ? "✓ Saved" : "Save Changes"}
          </button>
        </div>
      </main>
    </div>
  );
}
