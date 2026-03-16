import type { ClassificationResult, ParsedEmail } from "@/types";
import { classifyByRules, isJobRelated } from "./rules";
import { extractSignals } from "./extractor";
import { classifyWithClaude } from "./claude";

export async function classifyEmail(email: ParsedEmail): Promise<ClassificationResult | null> {
  const ctx = {
    subject: email.subject,
    body: email.bodyText,
    fromEmail: email.fromEmail ?? "",
  };

  // Quick pre-filter: is this even job-related?
  if (!isJobRelated(ctx)) return null;

  const signals = extractSignals(email);

  // Try deterministic rules first
  const ruleResult = classifyByRules(ctx);
  if (ruleResult) {
    return {
      ...ruleResult,
      ...signals,
      // Rule result overrides extracted confidence
      confidence: "deterministic",
    };
  }

  // Fall back to Claude
  const aiResult = await classifyWithClaude({
    subject: email.subject,
    fromName: email.fromName,
    fromEmail: email.fromEmail,
    bodySnippet: email.bodyText,
  });

  if (!aiResult) return null;

  return {
    ...aiResult,
    // Prefer extracted signals for structured fields when AI didn't find them
    company: aiResult.company ?? signals.company,
    role: aiResult.role ?? signals.role,
    recruiterName: aiResult.recruiterName ?? signals.recruiterName,
    recruiterEmail: aiResult.recruiterEmail ?? signals.recruiterEmail,
    atsProvider: signals.atsProvider,
  };
}

export { isJobRelated } from "./rules";
