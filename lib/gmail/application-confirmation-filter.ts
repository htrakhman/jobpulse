import type { ParsedEmail } from "@/types";

/**
 * Phrases that indicate an application acknowledgement. Inbox sync only persists mail
 * where at least one of these appears in the subject AND at least one in the body
 * (plain/HTML-derived text, with Gmail snippet as a fallback when the body is empty).
 */
const CONFIRMATION_PHRASES: RegExp[] = [
  /\bthanks\s+for\s+applying\b/i,
  /\bthank\s+you\s+for\s+applying\b/i,
  /\bthanks\s+for\s+your\s+application\b/i,
  /\bthank\s+you\s+for\s+your\s+application\b/i,
];

export function containsApplicationConfirmationPhrase(text: string): boolean {
  if (!text?.trim()) return false;
  const normalized = text.replace(/\s+/g, " ");
  return CONFIRMATION_PHRASES.some((re) => re.test(normalized));
}

/**
 * Body match: prefer full parsed body; if it is empty or short and missing the phrase,
 * use Gmail's snippet (usually extracted from message body for HTML-heavy ATS mail).
 */
function bodyMatchesConfirmation(parsed: ParsedEmail): boolean {
  const body = parsed.bodyText ?? "";
  if (containsApplicationConfirmationPhrase(body)) return true;
  const trimmed = body.trim();
  if (trimmed.length >= 120) return false;
  return containsApplicationConfirmationPhrase(parsed.snippet ?? "");
}

/**
 * Strict gate for Gmail ingest: confirmation wording must appear in subject and in body
 * (see bodyMatchesConfirmation for HTML/snippet handling).
 */
export function passesApplicationConfirmationInboxFilter(parsed: ParsedEmail): boolean {
  if (!containsApplicationConfirmationPhrase(parsed.subject ?? "")) return false;
  return bodyMatchesConfirmation(parsed);
}
