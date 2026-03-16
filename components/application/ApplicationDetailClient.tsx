"use client";

import { useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { StageBadge } from "@/components/dashboard/StageBadge";
import { Timeline } from "@/components/application/Timeline";
import { ContactSearchPanel } from "@/components/enrichment/ContactSearchPanel";
import { OutreachComposer } from "@/components/outreach/OutreachComposer";
import { Button } from "@/components/ui/button";
import type { ApplicationStage, EmailType } from "@/types";

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

interface ApplicationDetailClientProps {
  application: {
    id: string;
    company: string;
    role: string | null;
    stage: string;
    appliedAt: Date | null;
    lastActivityAt: Date;
    atsProvider: string | null;
    recruiter: { name: string | null; email: string | null } | null;
  };
  events: Array<{
    id: string;
    stage: ApplicationStage;
    emailType: EmailType;
    summary: string | null;
    occurredAt: string;
    email?: {
      subject: string | null;
      fromName: string | null;
      fromEmail: string | null;
      snippet: string | null;
    } | null;
  }>;
}

export function ApplicationDetailClient({ application, events }: ApplicationDetailClientProps) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);

  function handleDraftMessage(contact: Contact) {
    setSelectedContact(contact);
    setComposerOpen(true);
  }

  return (
    <div className="max-w-3xl mx-auto">
      {/* Back */}
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900 mb-6 transition-colors"
      >
        ← Back to dashboard
      </Link>

      {/* Header card */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6 mb-6">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center text-xl font-bold text-gray-600 uppercase">
              {application.company.charAt(0)}
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">{application.company}</h1>
              {application.role && (
                <p className="text-gray-500 text-sm">{application.role}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <StageBadge stage={application.stage as ApplicationStage} />
            <Button
              size="sm"
              onClick={() => setSearchOpen(true)}
              className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 h-7"
            >
              Find Contacts
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t border-gray-100">
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Applied</p>
            <p className="text-sm font-medium text-gray-900">
              {application.appliedAt
                ? format(application.appliedAt, "MMM d, yyyy")
                : "Unknown"}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Last Activity</p>
            <p className="text-sm font-medium text-gray-900">
              {format(application.lastActivityAt, "MMM d, yyyy")}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Recruiter</p>
            <p className="text-sm font-medium text-gray-900">
              {application.recruiter?.name ?? (
                <span className="text-gray-400">Unknown</span>
              )}
            </p>
            {application.recruiter?.email && (
              <a
                href={`mailto:${application.recruiter.email}`}
                className="text-xs text-blue-600 hover:underline"
              >
                {application.recruiter.email}
              </a>
            )}
          </div>
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">ATS</p>
            <p className="text-sm font-medium text-gray-900">
              {application.atsProvider ?? (
                <span className="text-gray-400">Unknown</span>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Timeline */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-6">
          Activity Timeline
          <span className="ml-2 text-sm font-normal text-gray-400">
            {events.length} event{events.length !== 1 ? "s" : ""}
          </span>
        </h2>
        <Timeline events={events} />
      </div>

      {/* Modals */}
      <ContactSearchPanel
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        applicationId={application.id}
        company={application.company}
        role={application.role}
        onDraftMessage={handleDraftMessage}
      />

      <OutreachComposer
        open={composerOpen}
        onClose={() => {
          setComposerOpen(false);
          setSelectedContact(null);
        }}
        contact={selectedContact}
        applicationId={application.id}
      />
    </div>
  );
}
