"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StageBadge } from "./StageBadge";
import type { ApplicationStage } from "@/types";

interface Application {
  id: string;
  company: string;
  role: string | null;
  stage: ApplicationStage;
  appliedAt: string | null;
  lastActivityAt: string;
  interviewRound: 0 | 1 | 2 | 3;
  interviewRoundLabel: string | null;
  atsProvider: string | null;
  contactPerson: string | null;
  contactPosition: string | null;
  contactWebProfileUrl: string | null;
  latestThreadId: string | null;
  additionalEmails: string[];
  recruiter: {
    name: string | null;
    email: string | null;
  } | null;
  events: Array<{
    summary: string | null;
    occurredAt: string;
  }>;
}

interface ApplicationTableProps {
  applications: Application[];
  windowDays: number;
}

type SortKey =
  | "company"
  | "role"
  | "stage"
  | "contactPerson"
  | "contactPosition"
  | "additionalEmails"
  | "appliedAt"
  | "lastActivityAt"
  | "latestUpdate";

const STAGE_ORDER: ApplicationStage[] = [
  "Applied",
  "Waiting",
  "Scheduling",
  "Assessment",
  "Interviewing",
  "Offer",
  "Rejected",
  "Closed",
];
const RENDER_REFERENCE_MS = Date.now();

const STAGE_LABELS: Record<ApplicationStage, string> = {
  Applied: "applied",
  Waiting: "awaiting response waiting",
  Scheduling: "scheduling interview scheduling",
  Assessment: "assessment test challenge",
  Interviewing: "interviewing interview",
  Offer: "offer offer received",
  Rejected: "rejected rejection",
  Closed: "closed",
};

function toTime(value: string | null): number {
  if (!value) return 0;
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : 0;
}

function windowDaysToMs(days: number): number {
  return days * 24 * 60 * 60 * 1000;
}

function normalizeCompanyKey(company: string): string {
  return company
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ");
}

const COMPANY_STOP_WORDS = new Set([
  "inc",
  "llc",
  "ltd",
  "corp",
  "co",
  "company",
  "recruiting",
  "recruitment",
  "careers",
  "career",
  "jobs",
  "job",
  "team",
  "the",
]);

function canonicalCompanyTokens(company: string): string[] {
  return normalizeCompanyKey(company)
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length > 1 && !COMPANY_STOP_WORDS.has(token));
}

function isSameCompanyName(a: string, b: string): boolean {
  const na = normalizeCompanyKey(a);
  const nb = normalizeCompanyKey(b);
  if (!na || !nb) return false;
  if (na === nb) return true;

  // Handle common variants like "Vertice Recruiting" vs "Vertice".
  if ((na.includes(nb) || nb.includes(na)) && Math.min(na.length, nb.length) >= 5) {
    return true;
  }

  const ta = canonicalCompanyTokens(a);
  const tb = canonicalCompanyTokens(b);
  if (ta.length === 0 || tb.length === 0) return false;

  const setB = new Set(tb);
  const intersection = ta.filter((token) => setB.has(token)).length;
  const union = new Set([...ta, ...tb]).size;
  const jaccard = union > 0 ? intersection / union : 0;
  return jaccard >= 0.75;
}

function pickPreferredCompanyRow(current: Application, candidate: Application): Application {
  const currentActivity = toTime(current.lastActivityAt);
  const candidateActivity = toTime(candidate.lastActivityAt);
  if (candidateActivity !== currentActivity) {
    return candidateActivity > currentActivity ? candidate : current;
  }

  const currentStageRank = STAGE_ORDER.indexOf(current.stage);
  const candidateStageRank = STAGE_ORDER.indexOf(candidate.stage);
  if (candidateStageRank !== currentStageRank) {
    return candidateStageRank > currentStageRank ? candidate : current;
  }

  const currentRound = current.interviewRound ?? 0;
  const candidateRound = candidate.interviewRound ?? 0;
  if (candidateRound !== currentRound) {
    return candidateRound > currentRound ? candidate : current;
  }

  const currentContactScore =
    (current.contactPerson ? 2 : 0) +
    (current.contactPosition ? 1 : 0) +
    (current.additionalEmails.length > 0 ? 1 : 0);
  const candidateContactScore =
    (candidate.contactPerson ? 2 : 0) +
    (candidate.contactPosition ? 1 : 0) +
    (candidate.additionalEmails.length > 0 ? 1 : 0);
  if (candidateContactScore !== currentContactScore) {
    return candidateContactScore > currentContactScore ? candidate : current;
  }

  return candidate;
}

export function ApplicationTable({ applications, windowDays }: ApplicationTableProps) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [companyFilter, setCompanyFilter] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [contactFilter, setContactFilter] = useState("");
  const [positionFilter, setPositionFilter] = useState("");
  const [emailFilter, setEmailFilter] = useState("");
  const [stageFilter, setStageFilter] = useState("");
  const [latestFilter, setLatestFilter] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("lastActivityAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDir(
      key === "company" ||
        key === "role" ||
        key === "stage" ||
        key === "contactPerson" ||
        key === "contactPosition" ||
        key === "additionalEmails"
        ? "asc"
        : "desc"
    );
  }

  const filteredAndSorted = useMemo(() => {
    const now = RENDER_REFERENCE_MS;
    const windowMs = windowDaysToMs(windowDays);
    const byCompany = new Map<string, Application>();
    for (const app of applications) {
      const normalizedKey = normalizeCompanyKey(app.company);
      const existingEntry = [...byCompany.entries()].find(([, existingApp]) =>
        isSameCompanyName(existingApp.company, app.company)
      );
      const key = existingEntry?.[0] ?? normalizedKey;
      const existing = existingEntry?.[1] ?? byCompany.get(key);
      if (!existing) {
        byCompany.set(key, app);
        continue;
      }
      byCompany.set(key, pickPreferredCompanyRow(existing, app));
    }
    const dedupedApplications = [...byCompany.values()];
    const searchTokens = searchQuery
      .toLowerCase()
      .trim()
      .split(/\s+/)
      .filter(Boolean);

    const filtered = dedupedApplications.filter((app) => {
      const latestSummary = app.events[0]?.summary ?? "";
      const baseTime = toTime(app.appliedAt ?? app.lastActivityAt);
      const searchable = [
        app.company,
        app.role ?? "",
        app.stage,
        STAGE_LABELS[app.stage],
        app.interviewRoundLabel ?? "",
        app.contactPerson ?? "",
        app.contactPosition ?? "",
        app.additionalEmails.join(" "),
        app.contactWebProfileUrl ?? "",
        latestSummary,
        app.appliedAt ?? "",
        app.lastActivityAt,
        app.appliedAt
          ? formatDistanceToNow(new Date(app.appliedAt), { addSuffix: true })
          : "",
        formatDistanceToNow(new Date(app.lastActivityAt), { addSuffix: true }),
      ]
        .join(" ")
        .toLowerCase();

      if (searchTokens.length > 0 && !searchTokens.every((token) => searchable.includes(token))) {
        return false;
      }
      if (
        companyFilter &&
        !app.company.toLowerCase().includes(companyFilter.toLowerCase())
      ) {
        return false;
      }
      if (roleFilter && !(app.role ?? "").toLowerCase().includes(roleFilter.toLowerCase())) {
        return false;
      }
      if (
        contactFilter &&
        !(app.contactPerson ?? "").toLowerCase().includes(contactFilter.toLowerCase())
      ) {
        return false;
      }
      if (
        positionFilter &&
        !(app.contactPosition ?? "").toLowerCase().includes(positionFilter.toLowerCase())
      ) {
        return false;
      }
      if (
        emailFilter &&
        !app.additionalEmails.join(" ").toLowerCase().includes(emailFilter.toLowerCase())
      ) {
        return false;
      }
      if (stageFilter && app.stage !== stageFilter) {
        return false;
      }
      if (latestFilter && !latestSummary.toLowerCase().includes(latestFilter.toLowerCase())) {
        return false;
      }
      if (now - baseTime > windowMs) {
        return false;
      }
      return true;
    });

    const sorted = [...filtered].sort((a, b) => {
      let comp = 0;
      if (sortKey === "company") comp = a.company.localeCompare(b.company);
      if (sortKey === "role") comp = (a.role ?? "").localeCompare(b.role ?? "");
      if (sortKey === "stage") comp = STAGE_ORDER.indexOf(a.stage) - STAGE_ORDER.indexOf(b.stage);
      if (sortKey === "contactPerson") {
        comp = (a.contactPerson ?? "").localeCompare(b.contactPerson ?? "");
      }
      if (sortKey === "contactPosition") {
        comp = (a.contactPosition ?? "").localeCompare(b.contactPosition ?? "");
      }
      if (sortKey === "additionalEmails") {
        comp = a.additionalEmails.join(", ").localeCompare(b.additionalEmails.join(", "));
      }
      if (sortKey === "appliedAt") comp = toTime(a.appliedAt) - toTime(b.appliedAt);
      if (sortKey === "lastActivityAt") comp = toTime(a.lastActivityAt) - toTime(b.lastActivityAt);
      if (sortKey === "latestUpdate") {
        comp = (a.events[0]?.summary ?? "").localeCompare(b.events[0]?.summary ?? "");
      }
      return sortDir === "asc" ? comp : -comp;
    });
    return sorted;
  }, [
    applications,
    searchQuery,
    companyFilter,
    roleFilter,
    contactFilter,
    positionFilter,
    emailFilter,
    stageFilter,
    latestFilter,
    windowDays,
    sortKey,
    sortDir,
  ]);

  if (applications.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400">
        <p className="text-lg font-medium">No applications found</p>
        <p className="text-sm mt-1">Connect Gmail and sync to get started</p>
      </div>
    );
  }

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden bg-white">
      <div className="p-3 border-b border-gray-100 bg-white">
        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search anything (status, company, role, update text, date...)"
          className="h-9 w-full rounded-md border border-gray-200 px-3 text-sm"
        />
      </div>
      <Table>
        <TableHeader>
          <TableRow className="bg-gray-50 hover:bg-gray-50">
            <TableHead className="font-semibold text-gray-700 w-[210px]">
              <button onClick={() => toggleSort("company")} className="hover:text-gray-900">
                Company
              </button>
            </TableHead>
            <TableHead className="font-semibold text-gray-700">
              <button onClick={() => toggleSort("role")} className="hover:text-gray-900">
                Role
              </button>
            </TableHead>
            <TableHead className="font-semibold text-gray-700">
              <button onClick={() => toggleSort("stage")} className="hover:text-gray-900">
                Status
              </button>
            </TableHead>
            <TableHead className="font-semibold text-gray-700">
              <button onClick={() => toggleSort("contactPerson")} className="hover:text-gray-900">
                Contact Person
              </button>
            </TableHead>
            <TableHead className="font-semibold text-gray-700">
              <button onClick={() => toggleSort("contactPosition")} className="hover:text-gray-900">
                Contact Person Position
              </button>
            </TableHead>
            <TableHead className="font-semibold text-gray-700">
              <button onClick={() => toggleSort("additionalEmails")} className="hover:text-gray-900">
                Additional Emails
              </button>
            </TableHead>
            <TableHead className="font-semibold text-gray-700">People</TableHead>
            <TableHead className="font-semibold text-gray-700">
              <button onClick={() => toggleSort("appliedAt")} className="hover:text-gray-900">
                Applied
              </button>
            </TableHead>
            <TableHead className="font-semibold text-gray-700">
              <button onClick={() => toggleSort("lastActivityAt")} className="hover:text-gray-900">
                Last Activity
              </button>
            </TableHead>
            <TableHead className="font-semibold text-gray-700">
              <button onClick={() => toggleSort("latestUpdate")} className="hover:text-gray-900">
                Latest Update
              </button>
            </TableHead>
          </TableRow>
          <TableRow className="bg-white hover:bg-white">
            <TableHead>
              <input
                value={companyFilter}
                onChange={(e) => setCompanyFilter(e.target.value)}
                placeholder="Filter company"
                className="h-8 w-full rounded-md border border-gray-200 px-2 text-xs"
              />
            </TableHead>
            <TableHead>
              <input
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                placeholder="Filter role"
                className="h-8 w-full rounded-md border border-gray-200 px-2 text-xs"
              />
            </TableHead>
            <TableHead>
              <select
                value={stageFilter}
                onChange={(e) => setStageFilter(e.target.value)}
                className="h-8 w-full rounded-md border border-gray-200 px-2 text-xs bg-white"
              >
                <option value="">All statuses</option>
                <option value="Applied">Applied</option>
                <option value="Waiting">Awaiting Response</option>
                <option value="Scheduling">Scheduling</option>
                <option value="Assessment">Assessment</option>
                <option value="Interviewing">Interviewing</option>
                <option value="Offer">Offer Received</option>
                <option value="Rejected">Rejected</option>
                <option value="Closed">Closed</option>
              </select>
            </TableHead>
            <TableHead>
              <input
                value={contactFilter}
                onChange={(e) => setContactFilter(e.target.value)}
                placeholder="Filter contact"
                className="h-8 w-full rounded-md border border-gray-200 px-2 text-xs"
              />
            </TableHead>
            <TableHead>
              <input
                value={positionFilter}
                onChange={(e) => setPositionFilter(e.target.value)}
                placeholder="Filter contact position"
                className="h-8 w-full rounded-md border border-gray-200 px-2 text-xs"
              />
            </TableHead>
            <TableHead>
              <input
                value={emailFilter}
                onChange={(e) => setEmailFilter(e.target.value)}
                placeholder="Filter additional emails"
                className="h-8 w-full rounded-md border border-gray-200 px-2 text-xs"
              />
            </TableHead>
            <TableHead className="text-xs text-gray-400">Open app detail</TableHead>
            <TableHead className="text-xs text-gray-400">Global window</TableHead>
            <TableHead className="text-xs text-gray-400">Global window</TableHead>
            <TableHead>
              <input
                value={latestFilter}
                onChange={(e) => setLatestFilter(e.target.value)}
                placeholder="Filter update text"
                className="h-8 w-full rounded-md border border-gray-200 px-2 text-xs"
              />
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filteredAndSorted.map((app) => (
            <TableRow
              key={app.id}
              className="hover:bg-gray-50 cursor-pointer transition-colors"
              onClick={() => {
                if (app.latestThreadId) {
                  window.open(`https://mail.google.com/mail/u/0/#all/${app.latestThreadId}`, "_blank");
                  return;
                }
                router.push(`/applications/${app.id}`);
              }}
            >
              <TableCell className="font-medium">
                <Link
                  href={`/applications/${app.id}`}
                  className="hover:text-blue-600 transition-colors"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-md bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-600 uppercase shrink-0">
                      {app.company.charAt(0)}
                    </div>
                    <span className="truncate max-w-[140px]">{app.company}</span>
                  </div>
                </Link>
              </TableCell>
              <TableCell className="text-gray-600">
                <span className="truncate max-w-[180px] block">
                  {app.role ?? ""}
                </span>
              </TableCell>
              <TableCell>
                <div className="space-y-0.5">
                  <StageBadge stage={app.stage} />
                  {app.stage === "Interviewing" && (
                    <div className="text-[11px] text-gray-500">
                      {app.interviewRoundLabel ?? "Interview round not detected"}
                    </div>
                  )}
                </div>
              </TableCell>
              <TableCell className="text-gray-600 text-sm">
                {app.contactPerson ? (
                  <span className="truncate max-w-[170px] block">{app.contactPerson}</span>
                ) : (
                  <span className="text-gray-300">—</span>
                )}
              </TableCell>
              <TableCell className="text-gray-600 text-sm">
                {app.contactPosition ? (
                  <span className="truncate max-w-[170px] block">{app.contactPosition}</span>
                ) : (
                  <span className="text-gray-300"> </span>
                )}
              </TableCell>
              <TableCell className="text-gray-600 text-sm">
                {app.additionalEmails.length > 0 ? (
                  <span className="truncate max-w-[200px] block">
                    {app.additionalEmails.join(", ")}
                  </span>
                ) : (
                  <span className="text-gray-300">No additional emails</span>
                )}
              </TableCell>
              <TableCell className="text-gray-500 text-sm">
                <Link
                  href={`/applications/${app.id}`}
                  className="text-blue-600 hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  Find people
                </Link>
              </TableCell>
              <TableCell className="text-gray-500 text-sm">
                {app.appliedAt
                  ? formatDistanceToNow(new Date(app.appliedAt), { addSuffix: true })
                  : <span className="text-gray-300">—</span>}
              </TableCell>
              <TableCell className="text-gray-500 text-sm">
                {formatDistanceToNow(new Date(app.lastActivityAt), { addSuffix: true })}
              </TableCell>
              <TableCell className="text-gray-500 text-sm">
                <span className="truncate max-w-[200px] block">
                  {app.events[0]?.summary ?? <span className="text-gray-300">—</span>}
                </span>
              </TableCell>
            </TableRow>
          ))}
          {filteredAndSorted.length === 0 && (
            <TableRow>
              <TableCell colSpan={10} className="text-center py-8 text-gray-400 text-sm">
                No rows match the current filters.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
