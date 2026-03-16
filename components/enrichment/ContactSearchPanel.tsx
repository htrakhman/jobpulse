"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ContactCard } from "./ContactCard";
import { PhantomBusterBulkModal } from "./PhantomBusterBulkModal";

const TITLE_PRESETS = [
  "Head of Recruiting",
  "Head of Talent",
  "Talent Acquisition",
  "VP Engineering",
  "VP of Product",
  "Head of HR",
  "Chief People Officer",
  "Hiring Manager",
  "Engineering Manager",
  "CEO",
  "CFO",
  "CTO",
  "COO",
];

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

interface ContactSearchPanelProps {
  open: boolean;
  onClose: () => void;
  applicationId: string;
  company: string;
  role: string | null;
  onDraftMessage: (contact: Contact) => void;
}

export function ContactSearchPanel({
  open,
  onClose,
  applicationId,
  company,
  role,
  onDraftMessage,
}: ContactSearchPanelProps) {
  const [titleKeywords, setTitleKeywords] = useState<string[]>([
    "Head of Recruiting",
    "Hiring Manager",
  ]);
  const [customTitle, setCustomTitle] = useState("");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [phantomBulkOpen, setPhantomBulkOpen] = useState(false);

  // Load existing contacts when panel opens
  useEffect(() => {
    if (open && applicationId) {
      fetch(`/api/enrichment/search?applicationId=${applicationId}`)
        .then((r) => r.json())
        .then((data: { contacts?: Contact[] }) => {
          if (data.contacts?.length) {
            setContacts(data.contacts);
            setSearched(true);
          }
        })
        .catch(() => {});
    }
  }, [open, applicationId]);

  function toggleTitle(title: string) {
    setTitleKeywords((prev) =>
      prev.includes(title) ? prev.filter((t) => t !== title) : [...prev, title]
    );
  }

  function addCustomTitle() {
    const t = customTitle.trim();
    if (t && !titleKeywords.includes(t)) {
      setTitleKeywords((prev) => [...prev, t]);
    }
    setCustomTitle("");
  }

  async function handleSearch() {
    setSearching(true);
    setError(null);

    try {
      const res = await fetch("/api/enrichment/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          applicationId,
          titleKeywords,
          maxResults: 15,
        }),
      });

      const data = await res.json() as { contacts?: Contact[]; error?: string };

      if (!res.ok) {
        setError(data.error ?? "Search failed");
        return;
      }

      setContacts(data.contacts ?? []);
      setSearched(true);
    } catch {
      setError("Search failed. Check your API keys.");
    } finally {
      setSearching(false);
    }
  }

  function updateContact(id: string, updates: Partial<Contact>) {
    setContacts((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ...updates } : c))
    );
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const selectedContacts = contacts.filter((c) => selectedIds.has(c.id) && c.linkedinUrl);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col p-0">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">
            Find Contacts at {company}
          </h2>
          {role && (
            <p className="text-sm text-gray-500 mt-0.5">
              You applied for <span className="font-medium text-gray-700">{role}</span>
            </p>
          )}
        </div>

        {/* Filter section */}
        <div className="px-6 py-4 border-b border-gray-100 space-y-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            Target titles
          </p>

          {/* Preset chips */}
          <div className="flex flex-wrap gap-2">
            {TITLE_PRESETS.map((t) => (
              <button
                key={t}
                onClick={() => toggleTitle(t)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors border ${
                  titleKeywords.includes(t)
                    ? "bg-gray-900 text-white border-gray-900"
                    : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          {/* Custom title input */}
          <div className="flex gap-2">
            <input
              type="text"
              value={customTitle}
              onChange={(e) => setCustomTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addCustomTitle()}
              placeholder="Add custom title…"
              className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
            />
            <Button
              size="sm"
              variant="outline"
              onClick={addCustomTitle}
              disabled={!customTitle.trim()}
              className="text-xs"
            >
              Add
            </Button>
          </div>

          {/* Selected */}
          {titleKeywords.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {titleKeywords.map((t) => (
                <span
                  key={t}
                  className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-full text-xs"
                >
                  {t}
                  <button
                    onClick={() => toggleTitle(t)}
                    className="hover:text-blue-900 font-bold ml-0.5"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}

          <Button
            onClick={handleSearch}
            disabled={searching || titleKeywords.length === 0}
            className="w-full bg-gray-900 hover:bg-gray-700 text-white text-sm"
          >
            {searching ? (
              <span className="flex items-center gap-2 justify-center">
                <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Searching across providers…
              </span>
            ) : (
              `Search People at ${company}`
            )}
          </Button>

          {error && (
            <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-200">
              {error}
            </p>
          )}
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {!searched && !searching && (
            <div className="text-center py-12 text-gray-400">
              <p className="text-sm">Select titles above and search to find contacts</p>
            </div>
          )}

          {searched && contacts.length === 0 && (
            <div className="text-center py-12 text-gray-400">
              <p className="text-sm font-medium">No contacts found</p>
              <p className="text-xs mt-1">
                Try different title keywords, or add an API key (Apollo is recommended)
              </p>
            </div>
          )}

          {contacts.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs text-gray-500">
                  {contacts.length} contact{contacts.length !== 1 ? "s" : ""} found
                </p>
                {selectedContacts.length > 0 && (
                  <Button
                    size="sm"
                    onClick={() => setPhantomBulkOpen(true)}
                    className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white h-7 px-3"
                  >
                    Send {selectedContacts.length} via PhantomBuster
                  </Button>
                )}
              </div>
              {contacts.map((contact) => (
                <ContactCard
                  key={contact.id}
                  contact={contact}
                  onEnriched={(updates) => updateContact(contact.id, updates)}
                  onDraftMessage={(c) => {
                    onClose();
                    onDraftMessage(c);
                  }}
                  selectable
                  selected={selectedIds.has(contact.id)}
                  onToggleSelect={toggleSelect}
                />
              ))}
            </div>
          )}
        </div>

        <PhantomBusterBulkModal
          open={phantomBulkOpen}
          onClose={() => {
            setPhantomBulkOpen(false);
            setSelectedIds(new Set());
          }}
          contacts={selectedContacts}
          applicationId={applicationId}
          company={company}
        />
      </DialogContent>
    </Dialog>
  );
}
