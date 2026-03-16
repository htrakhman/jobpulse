"use client";

import { useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface Contact {
  id: string;
  fullName: string | null;
  linkedinUrl: string | null;
}

interface PhantomBusterBulkModalProps {
  open: boolean;
  onClose: () => void;
  contacts: Contact[];
  applicationId: string;
  company: string;
}

export function PhantomBusterBulkModal({
  open,
  onClose,
  contacts,
  applicationId,
  company,
}: PhantomBusterBulkModalProps) {
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{
    success?: boolean;
    spreadsheetUrl?: string;
    jobId?: string;
    contactsProcessed?: number;
    error?: string;
    note?: string;
  } | null>(null);

  async function handleSend() {
    if (!message.trim()) return;
    setSending(true);
    setResult(null);

    try {
      const res = await fetch("/api/outreach/phantombuster-bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          applicationId,
          contactIds: contacts.map((c) => c.id),
          message: message.trim(),
        }),
      });

      const data = await res.json();

      if (data.success) {
        setResult({
          success: true,
          spreadsheetUrl: data.spreadsheetUrl,
          jobId: data.jobId,
          contactsProcessed: data.contactsProcessed,
        });
      } else {
        setResult({
          success: false,
          spreadsheetUrl: data.spreadsheetUrl,
          error: data.error,
          note: data.note,
        });
      }
    } catch {
      setResult({ success: false, error: "Request failed" });
    } finally {
      setSending(false);
    }
  }

  function handleClose() {
    setMessage("");
    setResult(null);
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-lg">
        <h2 className="text-base font-semibold text-gray-900">
          Send via PhantomBuster
        </h2>
        <p className="text-sm text-gray-500">
          Creates a Google Sheet with {contacts.length} contact
          {contacts.length !== 1 ? "s" : ""} at {company} and launches PhantomBuster
          to message them on LinkedIn.
        </p>

        {!result ? (
          <>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1">
                Message (same for all)
              </label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Hi {{firstName}}, I applied to {{company}} and wanted to reach out..."
                rows={6}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-900 resize-none"
              />
              <p className="text-xs text-gray-400 mt-1">
                Use #firstName#, #company#, #jobTitle# for personalization (PhantomBuster placeholders)
              </p>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={handleClose} className="text-sm">
                Cancel
              </Button>
              <Button
                onClick={handleSend}
                disabled={!message.trim() || sending}
                className="text-sm bg-gray-900 hover:bg-gray-700 text-white"
              >
                {sending ? (
                  <span className="flex items-center gap-2">
                    <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Creating sheet & launching…
                  </span>
                ) : (
                  `Create Sheet & Launch (${contacts.length})`
                )}
              </Button>
            </div>
          </>
        ) : (
          <div className="space-y-3">
            {result.success ? (
              <div className="rounded-lg bg-green-50 text-green-800 border border-green-200 px-4 py-3 text-sm">
                <p className="font-medium">PhantomBuster launched!</p>
                <p className="text-xs mt-1">
                  {result.contactsProcessed} contact
                  {result.contactsProcessed !== 1 ? "s" : ""} added to sheet.
                </p>
                {result.spreadsheetUrl && (
                  <a
                    href={result.spreadsheetUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs underline mt-2 inline-block"
                  >
                    Open Google Sheet →
                  </a>
                )}
              </div>
            ) : (
              <div className="rounded-lg bg-amber-50 text-amber-800 border border-amber-200 px-4 py-3 text-sm">
                {result.error && <p className="font-medium">{result.error}</p>}
                {result.note && <p className="text-xs mt-1">{result.note}</p>}
                {result.spreadsheetUrl && (
                  <a
                    href={result.spreadsheetUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs underline mt-2 inline-block"
                  >
                    Sheet created — Open →
                  </a>
                )}
              </div>
            )}
            <Button onClick={handleClose} className="w-full text-sm">
              Close
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
