import type { ApplicationStage, EmailType, ClassificationResult } from "@/types";

interface RuleContext {
  subject: string;
  body: string;
  fromEmail: string;
  receivedAt: Date;
}

interface Rule {
  name: string;
  emailType: EmailType;
  stage: ApplicationStage;
  match: (ctx: RuleContext) => boolean;
}

function lower(s: string) {
  return s.toLowerCase();
}

function subjectContains(subject: string, ...terms: string[]): boolean {
  const s = lower(subject);
  return terms.some((t) => s.includes(lower(t)));
}

function bodyContains(body: string, ...terms: string[]): boolean {
  const b = lower(body);
  return terms.some((t) => b.includes(lower(t)));
}

function bodyContainsAll(body: string, ...terms: string[]): boolean {
  const b = lower(body);
  return terms.every((t) => b.includes(lower(t)));
}

function detectInterviewInviteStage(ctx: RuleContext): ApplicationStage | null {
  const combined = `${ctx.subject}\n${ctx.body}`;
  const combinedLower = lower(combined);
  const hasInterviewContext =
    /(interview|phone screen|screening call|hiring manager|panel interview|onsite|on-site)/i.test(
      combined
    );
  if (!hasInterviewContext) return null;

  const hasInviteSignals =
    /(invitation:|calendar invite|google calendar|accepted:|declined:|proposed new time|join with google meet|zoom\.us|microsoft teams|teams\.microsoft)/i.test(
      combined
    ) ||
    subjectContains(ctx.subject, "interview scheduled", "invitation", "calendar");

  const eventDate = extractLikelyEventDate(combined, ctx.receivedAt);
  if (!hasInviteSignals && !eventDate) return null;
  if (!eventDate) return "Scheduling";
  return eventDate.getTime() <= Date.now() ? "Interviewing" : "Scheduling";
}

function extractLikelyEventDate(text: string, receivedAt: Date): Date | null {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const dateFocused = lines
    .filter((line) => /(when:|date:|time:|invitation:|calendar)/i.test(line))
    .join("\n");
  const corpus = `${dateFocused}\n${text}`;
  const candidates: string[] = [];

  const isoMatches = corpus.match(
    /\b\d{4}-\d{2}-\d{2}(?:[ t]\d{1,2}:\d{2}(?::\d{2})?(?:\s?(?:am|pm))?)?(?:z|[+-]\d{2}:?\d{2})?\b/gi
  );
  if (isoMatches) candidates.push(...isoMatches);

  const monthMatches = corpus.match(
    /\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+\d{1,2}(?:st|nd|rd|th)?(?:,\s*\d{4})?(?:\s+(?:at\s+)?\d{1,2}(?::\d{2})?\s*(?:am|pm)?)?/gi
  );
  if (monthMatches) candidates.push(...monthMatches);

  const dayNameMatches = corpus.match(
    /\b(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday),?\s+(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+\d{1,2}(?:st|nd|rd|th)?(?:,\s*\d{4})?(?:\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?)?/gi
  );
  if (dayNameMatches) candidates.push(...dayNameMatches);

  let best: Date | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  const referenceMs = receivedAt.getTime();
  const maxDistanceMs = 400 * 24 * 60 * 60 * 1000;

  for (const rawCandidate of candidates) {
    const normalized = rawCandidate.replace(/\b(\d{1,2})(st|nd|rd|th)\b/gi, "$1");
    const parsedMs = Date.parse(normalized);
    if (!Number.isFinite(parsedMs)) continue;
    const distance = Math.abs(parsedMs - referenceMs);
    if (distance > maxDistanceMs) continue;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = new Date(parsedMs);
    }
  }

  return best;
}

const RULES: Rule[] = [
  // ── REJECTION ──────────────────────────────────────────────────────────────
  // Rejection rules are evaluated first to avoid misclassifying rejection
  // emails as general updates when they contain interview-related language.
  {
    name: "rejection_body_not_move_forward",
    emailType: "rejection",
    stage: "Rejected",
    match: ({ body }) =>
      bodyContains(
        body,
        "not move forward",
        "decided not to move forward",
        "will not be moving forward",
        "unfortunately, after careful consideration",
        "adjusted our priorities and will not",
        "we will not be proceeding",
        "we won't be moving forward",
        "not selected to move forward",
        "decided to move forward with other candidates",
        "we have decided to pursue other candidates",
        "chosen to pursue other applicants",
        "we're moving forward with other candidates",
        "we are moving forward with other candidates"
      ),
  },
  {
    name: "rejection_subject_pattern",
    emailType: "rejection",
    stage: "Rejected",
    match: ({ subject, body }) =>
      subjectContains(
        subject,
        "update regarding your application",
        "decision regarding your application",
        "thank you for interviewing",
        "regarding your candidacy"
      ) &&
      bodyContains(
        body,
        "unfortunately",
        "not move forward",
        "other candidates",
        "not selected",
        "decided to pursue"
      ),
  },

  // ── OFFER ────────────────────────────────────────────────────────────────
  {
    name: "offer_subject",
    emailType: "offer",
    stage: "Offer",
    match: ({ subject }) =>
      subjectContains(subject, "offer letter", "job offer", "offer of employment"),
  },
  {
    name: "offer_body",
    emailType: "offer",
    stage: "Offer",
    match: ({ body }) =>
      bodyContains(body, "pleased to offer you", "we are delighted to offer", "formal offer"),
  },

  // ── ASSESSMENT ───────────────────────────────────────────────────────────
  {
    name: "assessment_subject",
    emailType: "assessment",
    stage: "Assessment",
    match: ({ subject }) =>
      subjectContains(
        subject,
        "assessment",
        "take-home",
        "take home",
        "coding challenge",
        "technical challenge",
        "technical assessment",
        "skills assessment",
        "homework assignment"
      ),
  },
  {
    name: "assessment_body",
    emailType: "assessment",
    stage: "Assessment",
    match: ({ body }) =>
      bodyContains(
        body,
        "take-home assignment",
        "take home assignment",
        "coding challenge",
        "technical assessment",
        "complete the following assessment",
        "skills test"
      ),
  },

  // ── INTERVIEW SCHEDULED ──────────────────────────────────────────────────
  {
    name: "interview_scheduled_link",
    emailType: "interview_scheduled",
    stage: "Scheduling",
    match: ({ body }) =>
      bodyContains(
        body,
        "please use the link below to select a time",
        "schedule your interview",
        "book a time for your interview",
        "calendly.com",
        "schedule.app",
        "select a time that works for you for your interview"
      ),
  },
  {
    name: "interview_scheduled_confirmation",
    emailType: "interview_scheduled",
    stage: "Interviewing",
    match: ({ subject, body }) =>
      subjectContains(subject, "interview confirmation", "interview confirmed", "your interview is scheduled") ||
      bodyContainsAll(body, "your interview", "confirmed"),
  },

  // ── INTERVIEW REQUEST ─────────────────────────────────────────────────────
  {
    name: "interview_request_availability_subject",
    emailType: "interview_request",
    stage: "Scheduling",
    match: ({ subject, body }) =>
      subjectContains(subject, "availability request", "interview availability") &&
      bodyContains(body, "interview"),
  },
  {
    name: "interview_request_availability_body",
    emailType: "interview_request",
    stage: "Scheduling",
    match: ({ body }) =>
      bodyContains(
        body,
        "please share your availability",
        "share your availability",
        "let us know your availability",
        "send your availability",
        "time windows that work",
        "times that work for you",
        "availability for next week",
        "availability this week"
      ),
  },
  {
    name: "interview_scheduling_pending_confirmation",
    emailType: "general_update",
    stage: "Scheduling",
    match: ({ subject, body }) =>
      (subjectContains(subject, "scheduling", "schedule", "availability") ||
        bodyContains(body, "availability", "schedule")) &&
      bodyContains(
        body,
        "we will confirm",
        "we'll confirm shortly",
        "pending confirmation",
        "calendar invite to follow",
        "once confirmed",
        "team will confirm"
      ),
  },
  {
    name: "interview_request_subject",
    emailType: "interview_request",
    stage: "Scheduling",
    match: ({ subject }) =>
      subjectContains(
        subject,
        "request for interview",
        "next steps in interview",
        "interview invitation",
        "invitation to interview"
      ),
  },
  {
    name: "interview_request_body_invite",
    emailType: "interview_request",
    stage: "Scheduling",
    match: ({ body }) =>
      bodyContains(
        body,
        "invite you to a",
        "invite you to an",
        "would like to invite you",
        "move forward with the interview",
        "move forward with your interview",
        "excited to move forward with the interview",
        "progress to the interview",
        "proceed with the interview"
      ),
  },
  {
    name: "interview_request_hiring_manager",
    emailType: "interview_request",
    stage: "Scheduling",
    match: ({ body }) =>
      bodyContainsAll(body, "hiring manager", "interview") ||
      bodyContainsAll(body, "phone screen", "schedule"),
  },

  // ── APPLICATION CONFIRMATION ─────────────────────────────────────────────
  {
    name: "application_confirmation_subject",
    emailType: "application_confirmation",
    stage: "Applied",
    match: ({ subject }) =>
      subjectContains(
        subject,
        "thank you for applying",
        "application received",
        "we have received your application",
        "your application has been received",
        "thanks for applying",
        "application submitted",
        "we received your application"
      ),
  },
  {
    name: "application_confirmation_body",
    emailType: "application_confirmation",
    stage: "Applied",
    match: ({ body }) =>
      bodyContains(
        body,
        "your application has been received",
        "we have received your application",
        "we received your application",
        "thank you for applying",
        "thanks for applying"
      ),
  },

  // ── GENERAL UPDATE ───────────────────────────────────────────────────────
  {
    name: "general_update_subject",
    emailType: "general_update",
    stage: "Waiting",
    match: ({ subject }) =>
      subjectContains(
        subject,
        "update on your application",
        "application status",
        "hiring update"
      ),
  },
];

export function classifyByRules(ctx: RuleContext): Omit<ClassificationResult, "company" | "role" | "recruiterName" | "recruiterEmail" | "atsProvider"> | null {
  const inviteStage = detectInterviewInviteStage(ctx);
  if (inviteStage) {
    return {
      emailType: "interview_scheduled",
      stage: inviteStage,
      confidence: "deterministic",
    };
  }

  for (const rule of RULES) {
    if (rule.match(ctx)) {
      return {
        emailType: rule.emailType,
        stage: rule.stage,
        confidence: "deterministic",
      };
    }
  }
  return null;
}

export function isJobRelated(ctx: RuleContext): boolean {
  const combined = lower(`${ctx.subject} ${ctx.body} ${ctx.fromEmail}`);
  const jobKeywords = [
    "application",
    "apply",
    "applied",
    "interview",
    "recruiter",
    "hiring",
    "position",
    "role",
    "candidate",
    "candidacy",
    "offer",
    "rejection",
    "resume",
    "cv",
    "onboarding",
    "background check",
    "reference",
    "job",
    "career",
    "employment",
    "talent",
    "opportunity",
    "scheduling",
    "availability",
  ];

  const atsKeywords = [
    "ashbyhq.com",
    "lever.co",
    "greenhouse.io",
    "workday.com",
    "smartrecruiters.com",
    "icims.com",
    "taleo.net",
    "jobvite.com",
    "breezy.hr",
    "bamboohr.com",
    "rippling.com",
    "myworkdayjobs.com",
    "apply.workable.com",
    "jobs.lever.co",
  ];

  if (
    /(invitation:|calendar invite|google calendar|accepted:|declined:|proposed new time)/i.test(
      combined
    ) &&
    /(interview|phone screen|screening call|hiring manager|panel interview|onsite|on-site)/i.test(
      combined
    )
  ) {
    return true;
  }

  if (atsKeywords.some((k) => combined.includes(k))) return true;
  const matchCount = jobKeywords.filter((k) => combined.includes(k)).length;
  return matchCount >= 2;
}
