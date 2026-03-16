"use client";

import { format } from "date-fns";
import type { ApplicationStage, EmailType } from "@/types";

interface TimelineEvent {
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
}

interface TimelineProps {
  events: TimelineEvent[];
}

const EMAIL_TYPE_ICON: Record<EmailType, string> = {
  application_confirmation: "📋",
  interview_request: "📅",
  interview_scheduled: "🗓️",
  assessment: "📝",
  rejection: "✕",
  offer: "🎉",
  general_update: "💬",
  unknown: "📧",
};

const EMAIL_TYPE_COLOR: Record<EmailType, string> = {
  application_confirmation: "bg-blue-100 text-blue-700 border-blue-200",
  interview_request: "bg-purple-100 text-purple-700 border-purple-200",
  interview_scheduled: "bg-purple-100 text-purple-700 border-purple-200",
  assessment: "bg-orange-100 text-orange-700 border-orange-200",
  rejection: "bg-red-100 text-red-600 border-red-200",
  offer: "bg-green-100 text-green-700 border-green-200",
  general_update: "bg-gray-100 text-gray-600 border-gray-200",
  unknown: "bg-gray-100 text-gray-500 border-gray-200",
};

export function Timeline({ events }: TimelineProps) {
  if (events.length === 0) {
    return (
      <p className="text-gray-400 text-sm py-8 text-center">No events recorded yet.</p>
    );
  }

  return (
    <div className="relative">
      {/* Vertical line */}
      <div className="absolute left-5 top-0 bottom-0 w-px bg-gray-200" />

      <div className="flex flex-col gap-6">
        {events.map((event, idx) => (
          <div key={event.id} className="relative flex gap-4 pl-14">
            {/* Icon bubble */}
            <div
              className={`absolute left-0 w-10 h-10 rounded-full border-2 flex items-center justify-center text-base z-10 bg-white ${EMAIL_TYPE_COLOR[event.emailType]}`}
            >
              {EMAIL_TYPE_ICON[event.emailType]}
            </div>

            {/* Content */}
            <div className="flex-1 pb-1">
              <div className="flex items-start justify-between gap-2 mb-1">
                <div>
                  <p className="text-sm font-semibold text-gray-900">
                    {event.summary ?? "Email received"}
                  </p>
                  {event.email?.fromName && (
                    <p className="text-xs text-gray-500 mt-0.5">
                      From {event.email.fromName}
                      {event.email.fromEmail && ` <${event.email.fromEmail}>`}
                    </p>
                  )}
                </div>
                <time className="text-xs text-gray-400 shrink-0 mt-0.5">
                  {format(new Date(event.occurredAt), "MMM d, yyyy")}
                </time>
              </div>

              {event.email?.subject && (
                <p className="text-xs text-gray-500 italic mb-1">
                  Subject: {event.email.subject}
                </p>
              )}

              {event.email?.snippet && idx === events.length - 1 && (
                <p className="text-xs text-gray-400 bg-gray-50 rounded-lg p-3 border border-gray-100 line-clamp-3">
                  {event.email.snippet}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
