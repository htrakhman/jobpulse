import type { ApplicationStage, EmailType, ParsedEmail } from "@/types";
import { detectAtsFromDomain, detectAtsFromBody } from "./ats";

export interface ExtractedSignals {
  company: string | null;
  role: string | null;
  recruiterName: string | null;
  recruiterEmail: string | null;
  atsProvider: string | null;
}

export interface ClassificationHints {
  emailType: EmailType;
  stage: ApplicationStage;
}

/** Legacy generic patterns — used as fallback only (ordered: body-first where possible). */
const ROLE_PATTERNS_GENERIC = [
  /applying to the (.+?) (?:position|role|job|opening) at/i,
  /for the (.+?) (?:position|role|opening)(?:\s+at|\s*[,\n])/i,
  /application for (?:the\s+)?(.+?)(?:\s+position)?(?:\s+at\s+|\s*[,\n])/i,
  /the\s+(.+?)\s+role(?:\s+at|\s*[,\n!.])/i,
];

const COMPANY_PATTERNS_GENERIC = [
  /thank you for applying to (.+?)[\.\,\!\?\n]/i,
  /thanks for applying to (.+?)[\.\,\!\?\n]/i,
  /thank you for your application to (.+?)[\.\,\!\?\n]/i,
  /thanks for your application to (.+?)[\.\,\!\?\n]/i,
  /thank you for your application with (.+?)[\.\,\!\?\n]/i,
  /thank you for your application at (.+?)[\.\,\!\?\n]/i,
  /position at (.+?)[\.\,\!\?\n]/i,
  /role at (.+?)[\.\,\!\?\n]/i,
  /job at (.+?)[\.\,\!\?\n]/i,
  /from (.+?) (?:recruiting|talent|hr|people)/i,
  /the (.+?) team/i,
];

const RECRUITER_NAME_PATTERNS = [
  /regards[,\s]+([A-Z][a-z]+ [A-Z][a-z]+)/,
  /sincerely[,\s]+([A-Z][a-z]+ [A-Z][a-z]+)/,
  /best[,\s]+([A-Z][a-z]+ [A-Z][a-z]+)/,
  /thanks?[,\s]+([A-Z][a-z]+ [A-Z][a-z]+)/,
  /cheers[,\s]+([A-Z][a-z]+ [A-Z][a-z]+)/,
  /my name is ([A-Z][a-z]+ [A-Z][a-z]+)/i,
  /i(?:'m| am) ([A-Z][a-z]+ [A-Z][a-z]+)/,
];

const JUNK_COMPANIES = new Set([
  "us",
  "you",
  "our",
  "the team",
  "team",
  "this",
  "we",
  "i",
  "it",
]);

function stripReplyPrefixes(s: string): string {
  return s.replace(/^(re|fw|fwd):\s*/gi, "").trim();
}

function cleanExtracted(s: string): string {
  return s.trim().replace(/[.,!?]+$/g, "").trim();
}

function isValidCompany(name: string): boolean {
  const cleaned = name.toLowerCase().trim();
  if (cleaned.length < 2 || cleaned.length > 60) return false;
  if (JUNK_COMPANIES.has(cleaned)) return false;
  return true;
}

/** Strip ATS boilerplate so role is a title, not a full sentence. */
function sanitizeExtractedRole(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let s = raw.replace(/\s+/g, " ").trim();
  s = s.replace(/\s+job\s+was\s+submitted\s+successfully\.?$/i, "").trim();
  s = s.replace(/\s+was\s+submitted\s+successfully\.?$/i, "").trim();
  s = s.replace(/^the\s+/i, "").trim();
  s = s.replace(/\s+job$/i, "").trim();
  if (/^application\s+received$/i.test(s)) return null;
  if (/^submitted\s+successfully$/i.test(s)) return null;
  if (/^(our|the)\s+member$/i.test(s)) return null;
  if (s.length < 2 || s.length > 100) return null;
  if (isStatusOnlyRole(s)) return null;
  return s;
}

function sanitizeExtractedCompany(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = cleanExtracted(raw.replace(/\s+/g, " "));
  if (!isValidCompany(s)) return null;
  return s;
}

function isStatusOnlyRole(s: string): boolean {
  const t = s.toLowerCase().trim();
  if (t.length < 3) return true;
  return (
    /^(application\s+received|application\s+submitted|confirmation|status)$/i.test(t) ||
    /application\s+received/i.test(t) ||
    /^submitted\s+successfully$/i.test(t)
  );
}

function looksLikeJobTitleFragment(s: string): boolean {
  if (s.length < 3 || s.length > 130) return false;
  if (/^(thanks?|thank\s+you|re:|fw:)/i.test(s)) return false;
  return (
    /\b(head|director|manager|lead|engineer|marketing|growth|founder|vp|v\.p\.|senior|member|analyst|designer|developer|specialist|coordinator|representative|associate|intern|officer|strategist|partnerships|gtm|sales|product|data|design|ux|recruiter)\b/i.test(
      s
    ) || (s.split(/\s+/).length <= 12 && !/was\s+submitted|received\s+your\s+application/i.test(s))
  );
}

/**
 * "Head of Growth at Acme" → split on last " at " so titles like "X at Y at Z" resolve to company Z.
 */
function parseRoleAtCompanyFromSubject(subject: string): { role: string; company: string } | null {
  const s = stripReplyPrefixes(subject);
  if (/^(thanks?|thank\s+you)\b/i.test(s)) return null;
  if (/invitation:/i.test(s)) return null;
  if (/application\s+received\s+for/i.test(s)) return null;

  const idx = s.lastIndexOf(" at ");
  if (idx === -1) return null;
  const left = s.slice(0, idx).trim();
  const right = s.slice(idx + 4).trim();
  if (left.length < 3 || right.length < 2 || right.length > 80) return null;
  if (/thank\s+you|thanks\s+for/i.test(left)) return null;
  if (!looksLikeJobTitleFragment(left)) return null;
  if (/was\s+submitted|application\s+received/i.test(left)) return null;
  return { role: left, company: right };
}

function parseApplicationReceivedSubject(subject: string): { role: string; company: string } | null {
  const s = stripReplyPrefixes(subject);
  const m = s.match(/^application\s+received\s+for\s+(.+?)\s+at\s+(.+?)$/i);
  if (!m) return null;
  return { role: m[1].trim(), company: m[2].trim() };
}

function parseThanksApplyingToCompany(subject: string): string | null {
  const s = stripReplyPrefixes(subject);
  const patterns = [
    /(?:thanks?|thank\s+you)\s+for\s+applying\s+to\s+(.+?)(?:\s*[-|—]|$)/i,
    /(?:thanks?|thank\s+you)\s+for\s+your\s+application\s+to\s+(.+?)(?:\s*[-|—]|$)/i,
    /(?:thanks?|thank\s+you)\s+for\s+your\s+application\s+with\s+(.+?)(?:\s*[-|—]|$)/i,
    /(?:thanks?|thank\s+you)\s+for\s+your\s+application\s+at\s+(.+?)(?:\s*[-|—]|$)/i,
  ];
  for (const re of patterns) {
    const m = s.match(re);
    if (m?.[1]) {
      const c = sanitizeExtractedCompany(m[1]);
      if (c) return c;
    }
  }
  return null;
}

function extractFromSenderDomain(fromEmail: string | null): string | null {
  if (!fromEmail) return null;
  const domain = fromEmail.split("@")[1];
  if (!domain) return null;

  const genericDomains = [
    "gmail.com",
    "yahoo.com",
    "hotmail.com",
    "outlook.com",
    "icloud.com",
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
    "workable.com",
    "linkedin.com",
    "indeed.com",
  ];
  if (genericDomains.some((d) => domain.includes(d))) return null;

  const base = domain.split(".")[0];
  if (base.length < 2) return null;
  return base.charAt(0).toUpperCase() + base.slice(1);
}

function extractRecruiterMeta(email: ParsedEmail): Pick<
  ExtractedSignals,
  "recruiterName" | "recruiterEmail" | "atsProvider"
> {
  const { bodyText, fromEmail, fromName } = email;
  let recruiterName: string | null = null;
  let recruiterEmail: string | null = null;

  for (const pattern of RECRUITER_NAME_PATTERNS) {
    const match = bodyText.match(pattern);
    if (match?.[1]) {
      recruiterName = cleanExtracted(match[1]);
      break;
    }
  }

  if (!recruiterName && fromName) {
    const nameParts = fromName.trim().split(/\s+/);
    if (
      nameParts.length >= 2 &&
      nameParts.length <= 4 &&
      !fromName.toLowerCase().includes("team") &&
      !fromName.toLowerCase().includes("talent") &&
      !fromName.toLowerCase().includes("recruiting") &&
      !fromName.toLowerCase().includes("careers") &&
      !fromName.toLowerCase().includes("hr") &&
      !fromName.toLowerCase().includes("noreply") &&
      !fromName.toLowerCase().includes("no-reply")
    ) {
      recruiterName = fromName.trim();
    }
  }

  if (
    fromEmail &&
    !fromEmail.includes("noreply") &&
    !fromEmail.includes("no-reply") &&
    !fromEmail.includes("donotreply") &&
    !fromEmail.includes("notifications")
  ) {
    recruiterEmail = fromEmail;
  }

  const atsProvider =
    detectAtsFromDomain(fromEmail ?? "") ||
    detectAtsFromBody(bodyText);

  return { recruiterName, recruiterEmail, atsProvider };
}

/**
 * High-precision company/role for thank-you-for-applying confirmations.
 */
function extractApplicationConfirmationFields(email: ParsedEmail): { company: string | null; role: string | null } {
  const { subject, bodyText } = email;
  const body = bodyText;
  let company: string | null = null;
  let role: string | null = null;

  const rac = parseRoleAtCompanyFromSubject(subject);
  if (rac) {
    role = sanitizeExtractedRole(rac.role);
    company = sanitizeExtractedCompany(rac.company);
  }

  const ar = parseApplicationReceivedSubject(subject);
  if (ar) {
    if (!role) role = sanitizeExtractedRole(ar.role);
    if (!company) company = sanitizeExtractedCompany(ar.company);
  }

  const thanksCo = parseThanksApplyingToCompany(subject);
  if (thanksCo && !company) company = thanksCo;

  const yaf = body.match(
    /your\s+application\s+for\s+(?:the\s+)?(.+?)\s+at\s+(.+?)(?:\.|,|\n|\s+—|\s+–|\s+Best|\s+We\s)/i
  );
  if (yaf) {
    if (!role) role = sanitizeExtractedRole(yaf[1]);
    if (!company) company = sanitizeExtractedCompany(yaf[2]);
  }

  const submitted = body.match(/the\s+(.+?)\s+job\s+was\s+submitted\s+successfully/i);
  if (submitted && !role) {
    role = sanitizeExtractedRole(submitted[1]);
  }

  const posAt = body.match(
    /application\s+for\s+(?:the\s+)?(.+?)\s+(?:position|role)\s+at\s+(.+?)(?:\.|,|\n)/i
  );
  if (posAt) {
    if (!role) role = sanitizeExtractedRole(posAt[1]);
    if (!company) company = sanitizeExtractedCompany(posAt[2]);
  }

  const recv = body.match(
    /(?:received|have\s+received)\s+your\s+application\s+for\s+(?:the\s+)?([^.!\n]+?)(?:\.|!|\n|\s+at\s+)/i
  );
  if (recv && !role) {
    role = sanitizeExtractedRole(recv[1]);
  }

  const digitalGeniusStyle = body.match(
    /application\s+for\s+the\s+(.+?)\s+at\s+([^\n.]+)/i
  );
  if (digitalGeniusStyle) {
    if (!role) role = sanitizeExtractedRole(digitalGeniusStyle[1]);
    if (!company) company = sanitizeExtractedCompany(digitalGeniusStyle[2]);
  }

  if (!role || !company) {
    const fb = extractCompanyRoleGeneric(subject, bodyText);
    if (!role) role = fb.role;
    if (!company) company = fb.company;
  }

  if (!company) {
    company = sanitizeExtractedCompany(extractFromSenderDomain(email.fromEmail));
  }

  role = sanitizeExtractedRole(role);
  company = sanitizeExtractedCompany(company);

  return { company, role };
}

function extractCompanyRoleGeneric(subject: string, bodyText: string): { company: string | null; role: string | null } {
  let company: string | null = null;
  let role: string | null = null;

  for (const pattern of ROLE_PATTERNS_GENERIC) {
    const match = bodyText.match(pattern) || subject.match(pattern);
    if (match?.[1]) {
      const candidate = cleanExtracted(match[1]);
      const cleaned = sanitizeExtractedRole(candidate);
      if (cleaned) {
        role = cleaned;
        break;
      }
    }
  }

  const subjectAndBody = `${subject}\n${bodyText}`;
  for (const pattern of COMPANY_PATTERNS_GENERIC) {
    const match = subjectAndBody.match(pattern);
    if (match?.[1]) {
      const candidate = cleanExtracted(match[1]);
      if (isValidCompany(candidate)) {
        company = candidate;
        break;
      }
    }
  }

  return { company, role };
}

/** Interview / calendar subjects and bodies — avoid using full invite lines as "role". */
function extractInterviewSchedulingFields(email: ParsedEmail): { company: string | null; role: string | null } {
  const { subject, bodyText, fromEmail } = email;
  let company: string | null = null;
  let role: string | null = null;

  const inv = subject.match(/invitation:\s*interview\s+with\s+(.+?)\s*@/i);
  if (inv?.[1]) {
    company = sanitizeExtractedCompany(inv[1]);
  }
  if (!company) {
    const inv2 = subject.match(/interview\s+with\s+(.+?)\s+(?:@|on\s)/i);
    if (inv2?.[1]) company = sanitizeExtractedCompany(inv2[1]);
  }

  const bodyRole = bodyText.match(
    /(?:^|\n)\s*(?:role|position|job|title)\s*[:—\-]\s*(.+?)(?:\n|$)/im
  );
  if (bodyRole?.[1]) {
    role = sanitizeExtractedRole(bodyRole[1]);
  }

  if (!company) {
    company = sanitizeExtractedCompany(extractFromSenderDomain(fromEmail));
  }

  return { company, role };
}

/**
 * Classify first (rules), then extract structured fields using the email type.
 */
export function extractSignals(email: ParsedEmail, hints?: ClassificationHints | null): ExtractedSignals {
  const meta = extractRecruiterMeta(email);
  const t = hints?.emailType;

  if (t === "application_confirmation") {
    const { company, role } = extractApplicationConfirmationFields(email);
    return { company, role, ...meta };
  }

  if (t === "interview_scheduled" || t === "interview_request") {
    const { company, role } = extractInterviewSchedulingFields(email);
    return { company, role, ...meta };
  }

  const generic = extractCompanyRoleGeneric(email.subject, email.bodyText);
  let company = generic.company;
  let role = generic.role;

  if (!company) {
    company = sanitizeExtractedCompany(extractFromSenderDomain(email.fromEmail));
  }

  role = sanitizeExtractedRole(role);
  company = sanitizeExtractedCompany(company);

  return { company, role, ...meta };
}
