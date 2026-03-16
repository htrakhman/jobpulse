"use client";

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
}

export function ApplicationTable({ applications }: ApplicationTableProps) {
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
            <TableHead className="font-semibold text-gray-700 w-[200px]">Company</TableHead>
            <TableHead className="font-semibold text-gray-700">Role</TableHead>
            <TableHead className="font-semibold text-gray-700">Status</TableHead>
            <TableHead className="font-semibold text-gray-700">Recruiter</TableHead>
            <TableHead className="font-semibold text-gray-700">Applied</TableHead>
            <TableHead className="font-semibold text-gray-700">Last Activity</TableHead>
            <TableHead className="font-semibold text-gray-700">Latest Update</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {applications.map((app) => (
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
                {app.recruiter?.name ?? (
                  <span className="text-gray-300">—</span>
                )}
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
        </TableBody>
      </Table>
    </div>
  );
}
