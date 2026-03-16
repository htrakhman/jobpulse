"use client";

import { useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { DEFAULT_TEMPLATES } from "@/lib/outreach/templates";

interface Contact {
  id: string;
  fullName: string | null;
  title: string | null;
  email: string | null;
  linkedinUrl: string | null;
  company: string;
}

interface OutreachComposerProps {
  open: boolean;
  onClose: () => void;
  contact: Contact | null;
  applicationId: string;
}

type Channel = "email" | "linkedin";

export function OutreachComposer({
  open,
  onClose,
  contact,
  applicationId,
}: OutreachComposerProps) {
  const [channel, setChannel] = useState<Channel>("email");
  const [selectedTemplateId, setSelectedTemplateId] = useState(DEFAULT_TEMPLATES[0].id);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);
  const [messageId, setMessageId] = useState<string | null>(null);
  const [result, setResult] = useState<{
    success?: boolean;
    manualSend?: boolean;
    linkedinUrl?: string;
    spreadsheetUrl?: string;
    jobId?: string;
    error?: string;
  } | null>(null);

  const availableTemplates = DEFAULT_TEMPLATES.filter(
    (t) => t.channel === channel || t.channel === "both"
  );

  async function handleGenerateDraft() {
    if (!contact) return;
    setGenerating(true);
    setResult(null);

    try {
      const res = await fetch("/api/outreach/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactId: contact.id,
          templateId: selectedTemplateId,
          channel,
        }),
      });

      const data = await res.json() as {
        message?: { id: string };
        draft?: { subject: string | null; body: string };
        error?: string;
      };

      if (data.draft) {
        setSubject(data.draft.subject ?? "");
        setBody(data.draft.body);
        setMessageId(data.message?.id ?? null);
      } else {
        setResult({ error: data.error ?? "Draft generation failed" });
      }
    } catch {
      setResult({ error: "Failed to generate draft" });
    } finally {
      setGenerating(false);
    }
  }

  async function handleSend() {
    if (!messageId && !body) return;
    setSending(true);
    setResult(null);

    try {
      // If no messageId yet, generate draft first then send
      let mid = messageId;
      if (!mid) {
        const draftRes = await fetch("/api/outreach/draft", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contactId: contact!.id,
            templateId: selectedTemplateId,
            channel,
          }),
        });
        const draftData = await draftRes.json() as { message?: { id: string } };
        mid = draftData.message?.id ?? null;
      }

      if (!mid) {
        setResult({ error: "Could not create draft" });
        setSending(false);
        return;
      }

      const res = await fetch("/api/outreach/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId: mid, subject, body }),
      });

      const data = await res.json() as {
        success?: boolean;
        manualSend?: boolean;
        linkedinUrl?: string;
        spreadsheetUrl?: string;
        error?: string;
      };

      setResult(data);
    } catch {
      setResult({ error: "Send failed" });
    } finally {
      setSending(false);
    }
  }

  function handleClose() {
    setBody("");
    setSubject("");
    setMessageId(null);
    setResult(null);
    onClose();
  }

  if (!contact) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-xl flex flex-col gap-0 p-0 max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">
            Message {contact.fullName ?? "Contact"}
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {contact.title} · {contact.company}
          </p>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-4 space-y-4">
          {/* Channel picker */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Channel
            </p>
            <div className="flex gap-2">
              {(["email", "linkedin"] as Channel[]).map((c) => {
                const disabled = c === "email" ? !contact.email : !contact.linkedinUrl;
                return (
                  <button
                    key={c}
                    onClick={() => !disabled && setChannel(c)}
                    disabled={disabled}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                      channel === c
                        ? "bg-gray-900 text-white border-gray-900"
                        : disabled
                        ? "text-gray-300 border-gray-100 bg-gray-50 cursor-not-allowed"
                        : "text-gray-600 border-gray-200 bg-white hover:border-gray-400"
                    }`}
                  >
                    {c === "email" ? "✉ Email" : "in LinkedIn"}
                    {disabled && (
                      <span className="ml-1 text-xs opacity-60">(not found)</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Template picker */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Template
            </p>
            <div className="space-y-1">
              {availableTemplates.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setSelectedTemplateId(t.id)}
                  className={`w-full text-left px-3 py-2.5 rounded-lg border text-sm transition-colors ${
                    selectedTemplateId === t.id
                      ? "bg-blue-50 border-blue-300 text-blue-800"
                      : "bg-white border-gray-200 text-gray-700 hover:border-gray-400"
                  }`}
                >
                  <span className="font-medium">{t.name}</span>
                  <span className="text-xs text-gray-400 ml-2">{t.description}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Generate draft button */}
          <Button
            onClick={handleGenerateDraft}
            disabled={generating}
            variant="outline"
            className="w-full text-sm border-gray-300"
          >
            {generating ? (
              <span className="flex items-center gap-2 justify-center">
                <span className="w-3.5 h-3.5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                Writing with AI…
              </span>
            ) : body ? (
              "Regenerate Draft"
            ) : (
              "Generate Draft with AI"
            )}
          </Button>

          {/* Message editor */}
          {body && (
            <div className="space-y-3">
              {channel === "email" && (
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1">
                    Subject
                  </label>
                  <input
                    type="text"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-900"
                  />
                </div>
              )}
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1">
                  Message
                </label>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={10}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-900 resize-none leading-relaxed"
                />
              </div>
            </div>
          )}

          {/* Result */}
          {result && (
            <div
              className={`text-sm rounded-lg px-4 py-3 border ${
                result.success
                  ? "bg-green-50 text-green-700 border-green-200"
                  : result.manualSend
                  ? "bg-amber-50 text-amber-700 border-amber-200"
                  : "bg-red-50 text-red-700 border-red-200"
              }`}
            >
              {result.success && (
                <div>
                  <p>
                    {channel === "email"
                      ? "Email sent successfully!"
                      : "LinkedIn message queued via PhantomBuster!"}
                  </p>
                  {channel === "linkedin" && result.spreadsheetUrl && (
                    <a
                      href={result.spreadsheetUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs underline mt-1 inline-block"
                    >
                      View Google Sheet →
                    </a>
                  )}
                </div>
              )}
              {result.manualSend && (
                <div>
                  <p className="font-medium mb-2">PhantomBuster not configured yet.</p>
                  {result.spreadsheetUrl && (
                    <p className="text-xs mb-2">Sheet created — add to PhantomBuster manually:</p>
                  )}
                  {result.spreadsheetUrl && (
                    <a
                      href={result.spreadsheetUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline font-medium text-xs block mb-1"
                    >
                      Open Google Sheet →
                    </a>
                  )}
                  {result.linkedinUrl && (
                    <a
                      href={result.linkedinUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline font-medium text-xs"
                    >
                      Open LinkedIn Profile →
                    </a>
                  )}
                </div>
              )}
              {result.error && <p>{result.error}</p>}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
          <Button
            variant="outline"
            onClick={handleClose}
            className="flex-1 text-sm border-gray-300"
          >
            {result?.success ? "Close" : "Cancel"}
          </Button>
          <Button
            onClick={handleSend}
            disabled={!body || sending || !!result?.success}
            className="flex-1 text-sm bg-gray-900 hover:bg-gray-700 text-white"
          >
            {sending ? (
              <span className="flex items-center gap-2 justify-center">
                <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Sending…
              </span>
            ) : channel === "email" ? (
              "Send Email"
            ) : (
              "Send via LinkedIn"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
