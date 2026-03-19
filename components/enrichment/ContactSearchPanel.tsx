"use client";

import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
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
  titleScore?: number;
  sources?: string[];
  matchedSignals?: string[];
  contactPerson?: string | null;
  inferredPosition?: string | null;
  additionalEmails?: string[];
  webProfileUrl?: string | null;
  mailboxConfidence?: number;
}

interface ProviderDiagnostic {
  provider: string;
  available: boolean;
  attempted: boolean;
  status: "hit" | "miss" | "error" | "skipped";
  resultCount: number;
  responseMs?: number;
  error?: string;
}

interface SavedSearch {
  id: string;
  name: string;
  filterPayload: {
    includeTitles?: string[];
    excludeTitles?: string[];
    department?: string;
    seniority?: string;
    location?: string;
    includeKeywords?: string[];
    excludeKeywords?: string[];
  };
  sortMode: string | null;
  pageSize: number;
  maxResults: number;
}

interface ContactSearchPanelProps {
  open: boolean;
  onClose: () => void;
  applicationId: string;
  company: string;
  role: string | null;
  onDraftMessage: (contact: Contact) => void;
}

type SortMode = "relevance" | "name_asc" | "name_desc" | "title_asc" | "title_desc";

function splitKeywords(input: string): string[] {
  return input
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

export function ContactSearchPanel({
  open,
  onClose,
  applicationId,
  company,
  role,
  onDraftMessage,
}: ContactSearchPanelProps) {
  const [includeTitles, setIncludeTitles] = useState<string[]>([
    "Head of Recruiting",
    "Hiring Manager",
  ]);
  const [excludeTitles, setExcludeTitles] = useState<string[]>([]);
  const [customTitle, setCustomTitle] = useState("");
  const [excludeTitleInput, setExcludeTitleInput] = useState("");
  const [department, setDepartment] = useState("");
  const [seniority, setSeniority] = useState("");
  const [location, setLocation] = useState("");
  const [includeKeywords, setIncludeKeywords] = useState("");
  const [excludeKeywords, setExcludeKeywords] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("relevance");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [maxResults, setMaxResults] = useState(80);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [total, setTotal] = useState(0);
  const [providerDiagnostics, setProviderDiagnostics] = useState<ProviderDiagnostic[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enrichingIds, setEnrichingIds] = useState<Record<string, boolean>>({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [phantomBulkOpen, setPhantomBulkOpen] = useState(false);
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);
  const [selectedSavedSearchId, setSelectedSavedSearchId] = useState("");
  const [searchName, setSearchName] = useState("My people search");

  useEffect(() => {
    if (!open || !applicationId) return;

    Promise.all([
      fetch(`/api/enrichment/search?applicationId=${applicationId}`),
      fetch(`/api/enrichment/saved-searches?applicationId=${applicationId}`),
    ])
      .then(async ([contactsRes, searchesRes]) => {
        const contactsData = (await contactsRes.json()) as { contacts?: Contact[] };
        const searchesData = (await searchesRes.json()) as { savedSearches?: SavedSearch[] };
        if (contactsData.contacts?.length) {
          setContacts(contactsData.contacts);
          setTotal(contactsData.contacts.length);
          setSearched(true);
        } else {
          setContacts([]);
          setTotal(0);
        }
        setSavedSearches(searchesData.savedSearches ?? []);
      })
      .catch(() => {});
  }, [open, applicationId]);

  const selectedContacts = useMemo(
    () => contacts.filter((c) => selectedIds.has(c.id) && c.linkedinUrl),
    [contacts, selectedIds]
  );

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  function applySavedSearch(saved: SavedSearch) {
    setSelectedSavedSearchId(saved.id);
    const payload = saved.filterPayload ?? {};
    setIncludeTitles(payload.includeTitles ?? []);
    setExcludeTitles(payload.excludeTitles ?? []);
    setDepartment(payload.department ?? "");
    setSeniority(payload.seniority ?? "");
    setLocation(payload.location ?? "");
    setIncludeKeywords((payload.includeKeywords ?? []).join(", "));
    setExcludeKeywords((payload.excludeKeywords ?? []).join(", "));
    setSortMode((saved.sortMode as SortMode) ?? "relevance");
    setPageSize(saved.pageSize ?? 25);
    setMaxResults(saved.maxResults ?? 80);
    setSearchName(saved.name);
  }

  function clearFilters() {
    setIncludeTitles([]);
    setExcludeTitles([]);
    setDepartment("");
    setSeniority("");
    setLocation("");
    setIncludeKeywords("");
    setExcludeKeywords("");
    setSortMode("relevance");
    setPage(1);
    setSelectedSavedSearchId("");
  }

  function toggleTitle(title: string) {
    setIncludeTitles((prev) =>
      prev.includes(title) ? prev.filter((t) => t !== title) : [...prev, title]
    );
  }

  function addCustomTitle() {
    const t = customTitle.trim();
    if (t && !includeTitles.includes(t)) {
      setIncludeTitles((prev) => [...prev, t]);
    }
    setCustomTitle("");
  }

  function addExcludeTitle() {
    const t = excludeTitleInput.trim();
    if (t && !excludeTitles.includes(t)) {
      setExcludeTitles((prev) => [...prev, t]);
    }
    setExcludeTitleInput("");
  }

  async function refreshSavedSearches() {
    const refreshed = await fetch(`/api/enrichment/saved-searches?applicationId=${applicationId}`);
    const refreshedData = (await refreshed.json()) as { savedSearches?: SavedSearch[] };
    setSavedSearches(refreshedData.savedSearches ?? []);
  }

  async function handleSaveSearch() {
    setError(null);
    const payload = {
      name: searchName.trim() || `Search at ${company}`,
      applicationId,
      filterPayload: {
        includeTitles,
        excludeTitles,
        department: department || undefined,
        seniority: seniority || undefined,
        location: location || undefined,
        includeKeywords: splitKeywords(includeKeywords),
        excludeKeywords: splitKeywords(excludeKeywords),
      },
      sortMode,
      pageSize,
      maxResults,
    };

    const endpoint = selectedSavedSearchId
      ? `/api/enrichment/saved-searches/${selectedSavedSearchId}`
      : "/api/enrichment/saved-searches";
    const method = selectedSavedSearchId ? "PATCH" : "POST";

    const res = await fetch(endpoint, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Failed to save search");
      return;
    }
    await refreshSavedSearches();
    if (!selectedSavedSearchId && data.savedSearch?.id) {
      setSelectedSavedSearchId(data.savedSearch.id);
    }
  }

  async function handleDeleteSavedSearch() {
    if (!selectedSavedSearchId) return;
    await fetch(`/api/enrichment/saved-searches/${selectedSavedSearchId}`, {
      method: "DELETE",
    });
    setSelectedSavedSearchId("");
    await refreshSavedSearches();
  }

  async function runSearch(targetPage: number) {
    setSearching(true);
    setError(null);
    try {
      const res = await fetch("/api/enrichment/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          applicationId,
          includeTitles,
          excludeTitles,
          department: department || undefined,
          seniority: seniority || undefined,
          location: location || undefined,
          includeKeywords: splitKeywords(includeKeywords),
          excludeKeywords: splitKeywords(excludeKeywords),
          sortMode,
          page: targetPage,
          pageSize,
          maxResults,
          savedSearchId: selectedSavedSearchId || undefined,
        }),
      });

      const data = (await res.json()) as {
        contacts?: Contact[];
        total?: number;
        page?: number;
        pageSize?: number;
        providerDiagnostics?: ProviderDiagnostic[];
        error?: string;
      };

      if (!res.ok) {
        setError(data.error ?? "Search failed");
        return;
      }

      setContacts(data.contacts ?? []);
      setTotal(data.total ?? 0);
      setPage(data.page ?? targetPage);
      setPageSize(data.pageSize ?? pageSize);
      setProviderDiagnostics(data.providerDiagnostics ?? []);
      setSearched(true);
    } catch {
      setError("Search failed. Check your API keys.");
    } finally {
      setSearching(false);
    }
  }

  async function handleSearch() {
    await runSearch(1);
  }

  async function handleEnrich(contactId: string) {
    setEnrichingIds((prev) => ({ ...prev, [contactId]: true }));
    setError(null);
    try {
      const res = await fetch(`/api/enrichment/enrich/${contactId}`, { method: "POST" });
      const data = (await res.json()) as {
        result?: { contact?: Partial<Contact> };
        error?: string;
      };
      if (!res.ok) {
        setError(data.error ?? "Enrichment failed");
        return;
      }
      if (data.result?.contact) {
        setContacts((prev) =>
          prev.map((c) => (c.id === contactId ? { ...c, ...data.result?.contact } : c))
        );
      }
    } catch {
      setError("Enrichment failed");
    } finally {
      setEnrichingIds((prev) => ({ ...prev, [contactId]: false }));
    }
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-6xl h-[88vh] overflow-hidden p-0">
        <div className="px-6 py-4 border-b border-gray-100">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-gray-900">Find People at {company}</h2>
              {role && (
                <p className="text-sm text-gray-500 mt-0.5">
                  Context role: <span className="font-medium text-gray-700">{role}</span>
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <select
                value={selectedSavedSearchId}
                onChange={(e) => {
                  const id = e.target.value;
                  setSelectedSavedSearchId(id);
                  const selected = savedSearches.find((s) => s.id === id);
                  if (selected) applySavedSearch(selected);
                }}
                className="h-8 rounded-md border border-gray-200 px-2 text-xs bg-white"
              >
                <option value="">Saved searches</option>
                {savedSearches.map((saved) => (
                  <option key={saved.id} value={saved.id}>
                    {saved.name}
                  </option>
                ))}
              </select>
              <Button
                size="sm"
                variant="outline"
                onClick={handleDeleteSavedSearch}
                disabled={!selectedSavedSearchId}
              >
                Delete
              </Button>
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-1">
            Clay-style workspace with provider waterfall, ranking, and saved filters.
          </p>
        </div>

        <div className="grid grid-cols-12 h-[calc(88vh-66px)]">
          <div className="col-span-3 border-r border-gray-100 p-4 overflow-y-auto space-y-4">
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Include titles
              </p>
              <div className="flex flex-wrap gap-2">
                {TITLE_PRESETS.map((t) => (
                  <button
                    key={t}
                    onClick={() => toggleTitle(t)}
                    className={`px-2 py-1 rounded-lg text-xs font-medium transition-colors border ${
                      includeTitles.includes(t)
                        ? "bg-gray-900 text-white border-gray-900"
                        : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
              <div className="flex gap-2 mt-2">
                <input
                  type="text"
                  value={customTitle}
                  onChange={(e) => setCustomTitle(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addCustomTitle()}
                  placeholder="Add title"
                  className="flex-1 text-xs border border-gray-200 rounded-lg px-2 py-1.5"
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={addCustomTitle}
                  disabled={!customTitle.trim()}
                >
                  Add
                </Button>
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Exclude titles
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={excludeTitleInput}
                  onChange={(e) => setExcludeTitleInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addExcludeTitle()}
                  placeholder="Exclude title"
                  className="flex-1 text-xs border border-gray-200 rounded-lg px-2 py-1.5"
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={addExcludeTitle}
                  disabled={!excludeTitleInput.trim()}
                >
                  Add
                </Button>
              </div>
              {excludeTitles.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {excludeTitles.map((t) => (
                    <span
                      key={t}
                      className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[11px] text-rose-700"
                    >
                      {t}
                      <button onClick={() => setExcludeTitles((prev) => prev.filter((x) => x !== t))}>
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 gap-2">
              <input
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                placeholder="Department (e.g. Recruiting)"
                className="text-xs border border-gray-200 rounded-lg px-2 py-1.5"
              />
              <input
                value={seniority}
                onChange={(e) => setSeniority(e.target.value)}
                placeholder="Seniority (e.g. Director)"
                className="text-xs border border-gray-200 rounded-lg px-2 py-1.5"
              />
              <input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Location (e.g. SF, Remote)"
                className="text-xs border border-gray-200 rounded-lg px-2 py-1.5"
              />
            </div>

            <div className="grid grid-cols-1 gap-2">
              <input
                value={includeKeywords}
                onChange={(e) => setIncludeKeywords(e.target.value)}
                placeholder="Include keywords (comma-separated)"
                className="text-xs border border-gray-200 rounded-lg px-2 py-1.5"
              />
              <input
                value={excludeKeywords}
                onChange={(e) => setExcludeKeywords(e.target.value)}
                placeholder="Exclude keywords (comma-separated)"
                className="text-xs border border-gray-200 rounded-lg px-2 py-1.5"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <select
                value={sortMode}
                onChange={(e) => setSortMode(e.target.value as SortMode)}
                className="h-8 rounded-md border border-gray-200 px-2 text-xs bg-white"
              >
                <option value="relevance">Sort: Relevance</option>
                <option value="name_asc">Name A→Z</option>
                <option value="name_desc">Name Z→A</option>
                <option value="title_asc">Title A→Z</option>
                <option value="title_desc">Title Z→A</option>
              </select>
              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                className="h-8 rounded-md border border-gray-200 px-2 text-xs bg-white"
              >
                <option value={10}>10 rows</option>
                <option value={25}>25 rows</option>
                <option value={50}>50 rows</option>
              </select>
            </div>

            <div>
              <input
                type="range"
                min={20}
                max={300}
                step={10}
                value={maxResults}
                onChange={(e) => setMaxResults(Number(e.target.value))}
                className="w-full"
              />
              <p className="text-[11px] text-gray-500 mt-1">Result depth: {maxResults}</p>
            </div>

            <div className="grid grid-cols-1 gap-2">
              <input
                value={searchName}
                onChange={(e) => setSearchName(e.target.value)}
                placeholder="Saved search name"
                className="text-xs border border-gray-200 rounded-lg px-2 py-1.5"
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={handleSaveSearch} variant="outline" className="flex-1">
                  Save search
                </Button>
                <Button size="sm" onClick={clearFilters} variant="outline">
                  Reset
                </Button>
              </div>
              <Button
                onClick={handleSearch}
                disabled={searching}
                className="w-full bg-gray-900 hover:bg-gray-700 text-white text-sm"
              >
                {searching ? "Searching..." : `Search ${company}`}
              </Button>
            </div>

            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Provider status
              </p>
              <div className="space-y-1.5">
                {providerDiagnostics.length === 0 && (
                  <p className="text-xs text-gray-400">Run a search to view diagnostics.</p>
                )}
                {providerDiagnostics.map((d) => (
                  <div
                    key={d.provider}
                    className="flex items-center justify-between text-xs border border-gray-100 rounded-md px-2 py-1"
                  >
                    <span className="capitalize text-gray-600">{d.provider}</span>
                    <span
                      className={
                        d.status === "hit"
                          ? "text-green-600"
                          : d.status === "error"
                          ? "text-rose-600"
                          : d.status === "skipped"
                          ? "text-gray-400"
                          : "text-gray-500"
                      }
                    >
                      {d.status} ({d.resultCount})
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="col-span-9 flex flex-col">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <p className="text-xs text-gray-500">{searched ? `${total} total results` : "Run a search to start"}</p>
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

            {error && (
              <p className="mx-4 mt-3 text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-200">
                {error}
              </p>
            )}

            <div className="flex-1 overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white border-b border-gray-100">
                  <tr className="text-left text-gray-500 text-xs uppercase">
                    <th className="px-4 py-2 w-10">#</th>
                    <th className="px-4 py-2">Name</th>
                    <th className="px-4 py-2">Contact Person</th>
                    <th className="px-4 py-2">Position</th>
                    <th className="px-4 py-2">Additional Emails</th>
                    <th className="px-4 py-2">Web</th>
                    <th className="px-4 py-2">Title</th>
                    <th className="px-4 py-2">Company</th>
                    <th className="px-4 py-2">LinkedIn</th>
                    <th className="px-4 py-2">Email</th>
                    <th className="px-4 py-2">Source</th>
                    <th className="px-4 py-2">Status</th>
                    <th className="px-4 py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {!searched && (
                    <tr>
                      <td colSpan={13} className="px-4 py-14 text-center text-gray-400">
                        Configure filters and run search.
                      </td>
                    </tr>
                  )}
                  {searched && contacts.length === 0 && (
                    <tr>
                      <td colSpan={13} className="px-4 py-14 text-center text-gray-400">
                        No results. Try broadening filters or enabling more provider keys.
                      </td>
                    </tr>
                  )}
                  {contacts.map((contact, idx) => (
                    <tr key={contact.id} className="border-b border-gray-50 hover:bg-gray-50/60">
                      <td className="px-4 py-2 align-top">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(contact.id)}
                          onChange={() => toggleSelect(contact.id)}
                          disabled={!contact.linkedinUrl}
                          className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <div className="font-medium text-gray-900">
                          {contact.fullName ?? `Result ${idx + 1}`}
                        </div>
                        {contact.matchedSignals && contact.matchedSignals.length > 0 && (
                          <div className="text-[11px] text-gray-500 mt-0.5">
                            {contact.matchedSignals.slice(0, 3).join(", ")}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-2 text-gray-700">
                        {contact.contactPerson ?? <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-4 py-2 text-gray-700">
                        {contact.inferredPosition ?? <span className="text-gray-400">Not inferred yet</span>}
                      </td>
                      <td className="px-4 py-2 text-gray-700">
                        {contact.additionalEmails && contact.additionalEmails.length > 0 ? (
                          <span className="truncate max-w-[220px] block">
                            {contact.additionalEmails.join(", ")}
                          </span>
                        ) : (
                          <span className="text-gray-400">No additional emails</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-gray-700">
                        {contact.webProfileUrl ? (
                          <a
                            href={contact.webProfileUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline"
                          >
                            Search
                          </a>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-gray-700">{contact.title ?? "—"}</td>
                      <td className="px-4 py-2 text-gray-700">{contact.company}</td>
                      <td className="px-4 py-2">
                        {contact.linkedinUrl ? (
                          <a
                            href={contact.linkedinUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline"
                          >
                            View
                          </a>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        {contact.email ? (
                          <span className="text-gray-700">
                            {contact.email}
                            {contact.emailVerified ? " ✓" : ""}
                          </span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-xs text-gray-600">
                        {contact.sources && contact.sources.length > 0 ? (
                          <span className="capitalize">
                            {contact.sources.slice(0, 2).join(", ")}
                            {contact.sources.length > 2 ? "..." : ""}
                          </span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-xs">
                        <span className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-gray-600">
                          {contact.enrichmentStatus}
                        </span>
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            disabled={!!enrichingIds[contact.id]}
                            onClick={() => handleEnrich(contact.id)}
                          >
                            {enrichingIds[contact.id] ? "Enriching..." : "Enrich"}
                          </Button>
                          <Button
                            size="sm"
                            className="h-7 text-xs bg-gray-900 hover:bg-gray-700 text-white"
                            onClick={() => {
                              onClose();
                              onDraftMessage(contact);
                            }}
                          >
                            Message
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
              <span>
                Page {page} of {totalPages}
              </span>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={searching || page <= 1}
                  onClick={() => runSearch(page - 1)}
                >
                  Previous
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={searching || page >= totalPages}
                  onClick={() => runSearch(page + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          </div>
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
