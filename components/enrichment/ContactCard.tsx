"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { WaterfallStatus } from "./WaterfallStatus";
import type { WaterfallStep } from "@/lib/enrichment/types";

interface Contact {
  id: string;
  fullName: string | null;
  firstName: string | null;
  title: string | null;
  department: string | null;
  email: string | null;
  emailVerified: boolean;
  linkedinUrl: string | null;
  enrichmentStatus: string;
  company: string;
}

interface ContactCardProps {
  contact: Contact;
  onEnriched: (updated: Partial<Contact>) => void;
  onDraftMessage: (contact: Contact) => void;
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: (id: string) => void;
}

export function ContactCard({
  contact,
  onEnriched,
  onDraftMessage,
  selectable,
  selected,
  onToggleSelect,
}: ContactCardProps) {
  const [enriching, setEnriching] = useState(false);
  const [steps, setSteps] = useState<WaterfallStep[]>([]);
  const [showWaterfall, setShowWaterfall] = useState(false);

  async function handleEnrich() {
    setEnriching(true);
    setShowWaterfall(true);
    setSteps([]);

    try {
      const eventSource = new EventSource(`/api/enrichment/enrich/${contact.id}`);

      eventSource.onmessage = (e) => {
        const data = JSON.parse(e.data) as {
          type: "step" | "done" | "error";
          step?: WaterfallStep;
          result?: { contact: Partial<Contact> };
          message?: string;
        };

        if (data.type === "step" && data.step) {
          setSteps((prev) => [...prev, data.step!]);
        }

        if (data.type === "done" && data.result) {
          onEnriched(data.result.contact);
          setEnriching(false);
          eventSource.close();
        }

        if (data.type === "error") {
          setEnriching(false);
          eventSource.close();
        }
      };

      eventSource.onerror = () => {
        setEnriching(false);
        eventSource.close();
      };
    } catch {
      setEnriching(false);
    }
  }

  const hasEmail = !!contact.email;
  const hasLinkedIn = !!contact.linkedinUrl;
  const initials = contact.fullName
    ? contact.fullName.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()
    : "?";

  return (
    <div
      className={`border rounded-xl p-4 bg-white transition-colors ${
        selected ? "border-blue-400 bg-blue-50/30" : "border-gray-200 hover:border-gray-300"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          {selectable && (
            <input
              type="checkbox"
              checked={selected ?? false}
              onChange={() => onToggleSelect?.(contact.id)}
              disabled={!contact.linkedinUrl}
              className="mt-2 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
          )}
          {/* Avatar */}
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white text-sm font-semibold shrink-0">
            {initials}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-gray-900 text-sm">{contact.fullName ?? "Unknown"}</p>
            {contact.title && (
              <p className="text-xs text-gray-500 truncate">{contact.title}</p>
            )}

            {/* Contact indicators */}
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              {hasEmail ? (
                <span className="inline-flex items-center gap-1 text-xs text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">
                  <span>✉</span>
                  <span className="truncate max-w-[160px]">{contact.email}</span>
                  {contact.emailVerified && <span title="Verified">✓</span>}
                </span>
              ) : (
                <span className="text-xs text-gray-400 bg-gray-50 border border-gray-200 px-2 py-0.5 rounded-full">
                  No email
                </span>
              )}

              {hasLinkedIn ? (
                <a
                  href={contact.linkedinUrl!}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-blue-600 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full hover:bg-blue-100 transition-colors"
                >
                  <span>in</span> LinkedIn
                </a>
              ) : (
                <span className="text-xs text-gray-400 bg-gray-50 border border-gray-200 px-2 py-0.5 rounded-full">
                  No LinkedIn
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0">
          {(!hasEmail || !hasLinkedIn) && (
            <Button
              size="sm"
              variant="outline"
              className="text-xs h-7 px-2.5"
              onClick={handleEnrich}
              disabled={enriching}
            >
              {enriching ? (
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 border border-gray-400 border-t-transparent rounded-full animate-spin" />
                  Finding…
                </span>
              ) : (
                "Enrich"
              )}
            </Button>
          )}
          <Button
            size="sm"
            className="text-xs h-7 px-2.5 bg-gray-900 hover:bg-gray-700 text-white"
            onClick={() => onDraftMessage(contact)}
          >
            Message
          </Button>
        </div>
      </div>

      {/* Waterfall progress */}
      {showWaterfall && steps.length > 0 && (
        <WaterfallStatus steps={steps} running={enriching} />
      )}
    </div>
  );
}
