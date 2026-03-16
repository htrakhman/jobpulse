export type ApplicationStage =
  | "Applied"
  | "Waiting"
  | "Interviewing"
  | "Assessment"
  | "Offer"
  | "Rejected"
  | "Closed";

export type EmailType =
  | "application_confirmation"
  | "interview_request"
  | "interview_scheduled"
  | "assessment"
  | "rejection"
  | "offer"
  | "general_update"
  | "unknown";

export interface ClassificationResult {
  emailType: EmailType;
  stage: ApplicationStage;
  company: string | null;
  role: string | null;
  recruiterName: string | null;
  recruiterEmail: string | null;
  atsProvider: string | null;
  confidence: "deterministic" | "ai" | "unknown";
}

export interface ParsedEmail {
  id: string;
  threadId: string;
  subject: string;
  fromName: string | null;
  fromEmail: string | null;
  snippet: string;
  bodyText: string;
  receivedAt: Date;
}

export interface ApplicationWithDetails {
  id: string;
  company: string;
  role: string | null;
  stage: ApplicationStage;
  appliedAt: Date | null;
  lastActivityAt: Date;
  atsProvider: string | null;
  recruiter: {
    name: string | null;
    email: string | null;
  } | null;
  events: ApplicationEventSummary[];
  _count?: {
    emails: number;
    events: number;
  };
}

export interface ApplicationEventSummary {
  id: string;
  stage: ApplicationStage;
  emailType: EmailType;
  summary: string | null;
  occurredAt: Date;
  email?: {
    subject: string | null;
    fromName: string | null;
    fromEmail: string | null;
  } | null;
}

export interface DashboardStats {
  total: number;
  active: number;
  interviewing: number;
  offers: number;
  rejected: number;
  pendingFollowUps: number;
}
