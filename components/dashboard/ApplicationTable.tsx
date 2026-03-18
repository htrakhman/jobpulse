"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
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
  atsProvider: string | null;
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
  | "appliedAt"
  | "lastActivityAt"
  | "latestUpdate";

const STAGE_ORDER: ApplicationStage[] = [
  "Applied",
  "Waiting",
  "Assessment",
  "Interviewing",
  "Offer",
  "Rejected",
  "Closed",
];

function toTime(value: string | null): number {
  if (!value) return 0;
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : 0;
}

function windowDaysToMs(days: number): number {
  return days * 24 * 60 * 60 * 1000;
}

export function ApplicationTable({ applications, windowDays }: ApplicationTableProps) {
  const [companyFilter, setCompanyFilter] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
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
    setSortDir(key === "company" || key === "role" || key === "stage" ? "asc" : "desc");
  }

  const filteredAndSorted = useMemo(() => {
    const now = Date.now();
    const windowMs = windowDaysToMs(windowDays);

    const filtered = applications.filter((app) => {
      const latestSummary = app.events[0]?.summary ?? "";
      const baseTime = toTime(app.appliedAt ?? app.lastActivityAt);
      if (
        companyFilter &&
        !app.company.toLowerCase().includes(companyFilter.toLowerCase())
      ) {
        return false;
      }
      if (roleFilter && !(app.role ?? "").toLowerCase().includes(roleFilter.toLowerCase())) {
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
    companyFilter,
    roleFilter,
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
                <option value="Assessment">Assessment</option>
                <option value="Interviewing">Interviewing</option>
                <option value="Offer">Offer Received</option>
                <option value="Rejected">Rejected</option>
                <option value="Closed">Closed</option>
              </select>
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
            >
              <TableCell className="font-medium">
                <Link
                  href={`/applications/${app.id}`}
                  className="hover:text-blue-600 transition-colors"
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
                  {app.role ?? <span className="text-gray-400 italic">Unknown role</span>}
                </span>
              </TableCell>
              <TableCell>
                <StageBadge stage={app.stage} />
              </TableCell>
              <TableCell className="text-gray-500 text-sm">
                <Link href={`/applications/${app.id}`} className="text-blue-600 hover:underline">
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
              <TableCell colSpan={7} className="text-center py-8 text-gray-400 text-sm">
                No rows match the current filters.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
