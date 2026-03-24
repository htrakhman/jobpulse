import type { ParsedEmail } from "@/types";
import { detectAtsFromDomain, detectAtsFromBody } from "./ats";

export interface ExtractedSignals {
  company: string | null;
  role: string | null;
  recruiterName: string | null;
  recruiterEmail: string | null;
  atsProvider: string | null;
}

const ROLE_PATTERNS = [
  // "applying to the [Role] position at [Company]"
  /applying to the (.+?) (?:position|role|job|opening) at/i,
  // "for the [Role] position"
  /for the (.+?) (?:position|role|opening)/i,
  // "application for [Role]"
  /application for (.+?)(?:\s+at\s+|\s*[,\n])/i,
  // "the [Role] role"
  /the (.+?) role/i,
  // Subject: "Re: [Role] - [Company]"
  /^(.+?) [-–|] .+$/i,
];

const COMPANY_PATTERNS = [
  // "applying to [Company]"
  /applying to (.+?)[\.\,\!\?]?(?:\s+we|\s+your|\s+and|\s+has|$)/i,
  // "at [Company]" after role
  /position at (.+?)[\.\,\!\?]/i,
  /role at (.+?)[\.\,\!\?]/i,
  /job at (.+?)[\.\,\!\?]/i,
  // "from [Company] Recruiting"
  /from (.+?) (?:recruiting|talent|hr|people)/i,
  // "the [Company] team"
  /the (.+?) team/i,
  // "Thank you for applying to [Company]"
  /thank you for applying to (.+?)[\.\,\!\?\n]/i,
  /thanks for applying to (.+?)[\.\,\!\?\n]/i,
  // "Thank you for your application to [Company]" (very common in ATS auto-replies)
  /thank you for your application to (.+?)[\.\,\!\?\n]/i,
  /thanks for your application to (.+?)[\.\,\!\?\n]/i,
  /thank you for your application with (.+?)[\.\,\!\?\n]/i,
  /thank you for your application at (.+?)[\.\,\!\?\n]/i,
  /applying to (.+?)[\.\,\!\?\n]/i,
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

function cleanExtracted(s: string): string {
  return s.trim().replace(/[.,!?]+$/, "").trim();
}

function isValidCompany(name: string): boolean {
  const cleaned = name.toLowerCase().trim();
  if (cleaned.length < 2 || cleaned.length > 60) return false;
  if (JUNK_COMPANIES.has(cleaned)) return false;
  return true;
}

function extractFromSenderDomain(fromEmail: string | null): string | null {
  if (!fromEmail) return null;
  const domain = fromEmail.split("@")[1];
  if (!domain) return null;

  // Skip ATS domains and generic providers
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

  // Convert domain to company name: stripe.com → Stripe
  const base = domain.split(".")[0];
  if (base.length < 2) return null;
  return base.charAt(0).toUpperCase() + base.slice(1);
}

export function extractSignals(email: ParsedEmail): ExtractedSignals {
  const { subject, bodyText, fromEmail, fromName } = email;

  let company: string | null = null;
  let role: string | null = null;
  let recruiterName: string | null = null;
  let recruiterEmail: string | null = null;

  // Extract role
  for (const pattern of ROLE_PATTERNS) {
    const match = bodyText.match(pattern) || subject.match(pattern);
    if (match?.[1]) {
      const candidate = cleanExtracted(match[1]);
      if (candidate.length > 2 && candidate.length < 80) {
        role = candidate;
        break;
      }
    }
  }

  // Extract company from body and subject (ATS receipts often put the company only in the subject)
  const subjectAndBody = `${subject}\n${bodyText}`;
  for (const pattern of COMPANY_PATTERNS) {
    const match = subjectAndBody.match(pattern);
    if (match?.[1]) {
      const candidate = cleanExtracted(match[1]);
      if (isValidCompany(candidate)) {
        company = candidate;
        break;
      }
    }
  }

  // Fall back to sender domain for company
  if (!company) {
    company = extractFromSenderDomain(fromEmail);
  }

  // Extract recruiter name from body signatures
  for (const pattern of RECRUITER_NAME_PATTERNS) {
    const match = bodyText.match(pattern);
    if (match?.[1]) {
      recruiterName = cleanExtracted(match[1]);
      break;
    }
  }

  // Use fromName as recruiter if it looks like a person
  if (!recruiterName && fromName) {
    const nameParts = fromName.trim().split(/\s+/);
    // Looks like a person (2+ words, not a company-y name)
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

  // Recruiter email: if the sender looks like a person (not noreply), use it
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

  return { company, role, recruiterName, recruiterEmail, atsProvider };
}
