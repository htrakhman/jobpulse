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
import type { DashboardOSPayload } from "@/lib/services/os-metrics.types";
import { isSameCompanyName, normalizeCompanyKey } from "@/lib/services/company-dedupe";

interface Application {
  id: string;
  company: string;
  role: string | null;
  stage: ApplicationStage;
  source: string;
  method: string;
  resumeVersion: string | null;
  coverLetterVersion: string | null;
  targetPriority: string;
  salaryBand: string | null;
  targetCompMin: number | null;
  targetCompMax: number | null;
  nextAction: string | null;
  nextActionDate: string | null;
  followUpUrgency: string | null;
  workModelPreference: string | null;
  outreachSent: boolean;
  contactedRecruiter: boolean;
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
  osPayload?: DashboardOSPayload;
}

type SortKey =
  | "company"
  | "role"
  | "stage"
  | "source"
  | "method"
  | "targetPriority"
  | "resumeVersion"
  | "followUpUrgency"
  | "nextActionDate"
  | "lastActivityAt";

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

function toTime(value: string | null): number {
  if (!value) return 0;
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : 0;
}

function windowDaysToMs(days: number): number {
  return days * 24 * 60 * 60 * 1000;
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
  const currentPriority = current.targetPriority === "dream" ? 4 : current.targetPriority === "high" ? 3 : current.targetPriority === "medium" ? 2 : 1;
  const candidatePriority = candidate.targetPriority === "dream" ? 4 : candidate.targetPriority === "high" ? 3 : candidate.targetPriority === "medium" ? 2 : 1;
  return candidatePriority > currentPriority ? candidate : current;
}

export function ApplicationTable({ applications, windowDays }: ApplicationTableProps) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [stageFilter, setStageFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [methodFilter, setMethodFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [resumeFilter, setResumeFilter] = useState("");
  const [urgencyFilter, setUrgencyFilter] = useState("");
  const [staleOnly, setStaleOnly] = useState(false);
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
        key === "source" ||
        key === "method" ||
        key === "targetPriority" ||
        key === "resumeVersion" ||
        key === "followUpUrgency"
        ? "asc"
        : "desc"
    );
  }

  const uniqueResumeVersions = useMemo(() => {
    return [...new Set(applications.map((a) => a.resumeVersion).filter(Boolean))] as string[];
  }, [applications]);

  const filteredAndSorted = useMemo(() => {
    const now = RENDER_REFERENCE_MS;
    const windowMs = windowDaysToMs(windowDays);
    const staleMs = 7 * 24 * 60 * 60 * 1000;
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
    const searchTokens = searchQuery.toLowerCase().trim().split(/\s+/).filter(Boolean);

    const filtered = dedupedApplications.filter((app) => {
      const latestSummary = app.events[0]?.summary ?? "";
      const baseTime = toTime(app.appliedAt ?? app.lastActivityAt);
      const searchable = [
        app.company,
        app.role ?? "",
        app.stage,
        app.source,
        app.method,
        app.targetPriority,
        app.resumeVersion ?? "",
        app.followUpUrgency ?? "",
        app.nextAction ?? "",
        app.contactPerson ?? "",
        app.contactPosition ?? "",
        app.additionalEmails.join(" "),
        latestSummary,
      ]
        .join(" ")
        .toLowerCase();

      if (searchTokens.length > 0 && !searchTokens.every((token) => searchable.includes(token))) return false;
      if (stageFilter && app.stage !== stageFilter) return false;
      if (sourceFilter && app.source !== sourceFilter) return false;
      if (methodFilter && app.method !== methodFilter) return false;
      if (priorityFilter && app.targetPriority !== priorityFilter) return false;
      if (resumeFilter && (app.resumeVersion ?? "") !== resumeFilter) return false;
      if (urgencyFilter && (app.followUpUrgency ?? "") !== urgencyFilter) return false;
      if (staleOnly && now - toTime(app.lastActivityAt) < staleMs) return false;
      if (now - baseTime > windowMs) return false;
      return true;
    });

    const sorted = [...filtered].sort((a, b) => {
      let comp = 0;
      if (sortKey === "company") comp = a.company.localeCompare(b.company);
      if (sortKey === "role") comp = (a.role ?? "").localeCompare(b.role ?? "");
      if (sortKey === "stage") comp = STAGE_ORDER.indexOf(a.stage) - STAGE_ORDER.indexOf(b.stage);
      if (sortKey === "source") comp = a.source.localeCompare(b.source);
      if (sortKey === "method") comp = a.method.localeCompare(b.method);
      if (sortKey === "targetPriority") comp = a.targetPriority.localeCompare(b.targetPriority);
      if (sortKey === "resumeVersion") comp = (a.resumeVersion ?? "").localeCompare(b.resumeVersion ?? "");
      if (sortKey === "followUpUrgency") comp = (a.followUpUrgency ?? "").localeCompare(b.followUpUrgency ?? "");
      if (sortKey === "nextActionDate") comp = toTime(a.nextActionDate) - toTime(b.nextActionDate);
      if (sortKey === "lastActivityAt") comp = toTime(a.lastActivityAt) - toTime(b.lastActivityAt);
      return sortDir === "asc" ? comp : -comp;
    });
    return sorted;
  }, [
    applications,
    searchQuery,
    stageFilter,
    sourceFilter,
    methodFilter,
    priorityFilter,
    resumeFilter,
    urgencyFilter,
    staleOnly,
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
      <div className="p-3 border-b border-gray-100 bg-white space-y-2">
        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search company, stage, source, method, notes, contact, urgency..."
          className="h-9 w-full rounded-md border border-gray-200 px-3 text-sm"
        />
        <div className="grid gap-2 md:grid-cols-7">
          <select value={stageFilter} onChange={(e) => setStageFilter(e.target.value)} className="h-8 rounded-md border border-gray-200 px-2 text-xs bg-white">
            <option value="">All stages</option>
            {STAGE_ORDER.map((stage) => <option key={stage} value={stage}>{stage}</option>)}
          </select>
          <input value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)} placeholder="Source" className="h-8 rounded-md border border-gray-200 px-2 text-xs" />
          <input value={methodFilter} onChange={(e) => setMethodFilter(e.target.value)} placeholder="Method" className="h-8 rounded-md border border-gray-200 px-2 text-xs" />
          <select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)} className="h-8 rounded-md border border-gray-200 px-2 text-xs bg-white">
            <option value="">All priorities</option>
            <option value="dream">dream</option>
            <option value="high">high</option>
            <option value="medium">medium</option>
            <option value="low">low</option>
          </select>
          <select value={resumeFilter} onChange={(e) => setResumeFilter(e.target.value)} className="h-8 rounded-md border border-gray-200 px-2 text-xs bg-white">
            <option value="">All resumes</option>
            {uniqueResumeVersions.map((resume) => (
              <option key={resume} value={resume}>{resume}</option>
            ))}
          </select>
          <select value={urgencyFilter} onChange={(e) => setUrgencyFilter(e.target.value)} className="h-8 rounded-md border border-gray-200 px-2 text-xs bg-white">
            <option value="">All urgency</option>
            <option value="urgent">urgent</option>
            <option value="high">high</option>
            <option value="normal">normal</option>
            <option value="low">low</option>
          </select>
          <label className="h-8 rounded-md border border-gray-200 px-2 text-xs flex items-center gap-2">
            <input type="checkbox" checked={staleOnly} onChange={(e) => setStaleOnly(e.target.checked)} />
            stale only
          </label>
        </div>
      </div>
      <Table>
        <TableHeader>
          <TableRow className="bg-gray-50 hover:bg-gray-50">
            <TableHead><button onClick={() => toggleSort("company")}>Company</button></TableHead>
            <TableHead><button onClick={() => toggleSort("role")}>Role</button></TableHead>
            <TableHead><button onClick={() => toggleSort("stage")}>Stage</button></TableHead>
            <TableHead><button onClick={() => toggleSort("source")}>Source</button></TableHead>
            <TableHead><button onClick={() => toggleSort("method")}>Method</button></TableHead>
            <TableHead><button onClick={() => toggleSort("targetPriority")}>Priority</button></TableHead>
            <TableHead><button onClick={() => toggleSort("resumeVersion")}>Resume</button></TableHead>
            <TableHead><button onClick={() => toggleSort("followUpUrgency")}>Follow-up</button></TableHead>
            <TableHead>Next Step</TableHead>
            <TableHead>Contact</TableHead>
            <TableHead><button onClick={() => toggleSort("lastActivityAt")}>Last Activity</button></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filteredAndSorted.map((app) => (
            <TableRow
              key={app.id}
              className="hover:bg-gray-50 cursor-pointer"
              onClick={() => {
                if (app.latestThreadId) {
                  window.open(`https://mail.google.com/mail/u/0/#all/${app.latestThreadId}`, "_blank");
                  return;
                }
                router.push(`/applications/${app.id}`);
              }}
            >
              <TableCell className="font-medium">
                <Link href={`/applications/${app.id}`} className="hover:text-blue-600" onClick={(e) => e.stopPropagation()}>
                  {app.company}
                </Link>
              </TableCell>
              <TableCell>{app.role ?? ""}</TableCell>
              <TableCell>
                <StageBadge stage={app.stage} />
                {app.interviewRoundLabel && <p className="text-[11px] text-gray-500 mt-1">{app.interviewRoundLabel}</p>}
              </TableCell>
              <TableCell className="text-xs text-gray-600">{app.source}</TableCell>
              <TableCell className="text-xs text-gray-600">{app.method}</TableCell>
              <TableCell className="text-xs text-gray-600">{app.targetPriority}</TableCell>
              <TableCell className="text-xs text-gray-600">{app.resumeVersion ?? "—"}</TableCell>
              <TableCell className="text-xs text-gray-600">{app.followUpUrgency ?? "—"}</TableCell>
              <TableCell className="text-xs text-gray-600">
                <p>{app.nextAction ?? "—"}</p>
                {app.nextActionDate && <p className="text-[11px] text-gray-400">{new Date(app.nextActionDate).toLocaleDateString()}</p>}
              </TableCell>
              <TableCell className="text-xs text-gray-600">
                <p>{app.contactPerson ?? "—"}</p>
                {app.contactPosition && <p className="text-[11px] text-gray-400">{app.contactPosition}</p>}
              </TableCell>
              <TableCell className="text-xs text-gray-500">
                {formatDistanceToNow(new Date(app.lastActivityAt), { addSuffix: true })}
              </TableCell>
            </TableRow>
          ))}
          {filteredAndSorted.length === 0 && (
            <TableRow>
              <TableCell colSpan={11} className="text-center py-8 text-gray-400 text-sm">
                No rows match the current filters.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

