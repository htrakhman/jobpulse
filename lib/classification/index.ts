import type { ClassificationResult, ParsedEmail } from "@/types";
import { classifyByRules, isJobRelated } from "./rules";
import { extractSignals } from "./extractor";
import { classifyWithClaude } from "./claude";

export async function classifyEmail(email: ParsedEmail): Promise<ClassificationResult | null> {
  const ctx = {
    subject: email.subject,
    body: email.bodyText,
    fromEmail: email.fromEmail ?? "",
    receivedAt: email.receivedAt,
  };

  // Deterministic rules first. Do NOT gate these behind `isJobRelated` — short ATS auto-replies
  // often only match one keyword (e.g. "apply" inside "applying") and were skipped entirely.
  const ruleResult = classifyByRules(ctx);
  const signals = extractSignals(
    email,
    ruleResult ? { emailType: ruleResult.emailType, stage: ruleResult.stage } : undefined
  );
  if (ruleResult) {
    return {
      ...ruleResult,
      ...signals,
      confidence: "deterministic",
    };
  }

  if (!isJobRelated(ctx)) return null;

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
