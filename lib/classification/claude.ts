import Anthropic from "@anthropic-ai/sdk";
import type { ClassificationResult, ApplicationStage, EmailType } from "@/types";

const client = new Anthropic();

const VALID_EMAIL_TYPES: EmailType[] = [
  "application_confirmation",
  "interview_request",
  "interview_scheduled",
  "assessment",
  "rejection",
  "offer",
  "general_update",
  "unknown",
];

const VALID_STAGES: ApplicationStage[] = [
  "Applied",
  "Waiting",
  "Scheduling",
  "Interviewing",
  "Assessment",
  "Offer",
  "Rejected",
  "Closed",
];

export async function classifyWithClaude(params: {
  subject: string;
  fromName: string | null;
  fromEmail: string | null;
  bodySnippet: string;
}): Promise<ClassificationResult | null> {
  const { subject, fromName, fromEmail, bodySnippet } = params;

  const prompt = `You are an expert at analyzing job application emails. Analyze this email and return a JSON object.

Email details:
Subject: ${subject}
From: ${fromName ?? ""} <${fromEmail ?? ""}>
Body snippet: ${bodySnippet.slice(0, 800)}

Return ONLY a valid JSON object with these exact fields:
{
  "emailType": one of: application_confirmation, interview_request, interview_scheduled, assessment, rejection, offer, general_update, unknown,
  "stage": one of: Applied, Waiting, Scheduling, Interviewing, Assessment, Offer, Rejected, Closed,
  "company": company name as string or null,
  "role": job title/role as string or null,
  "recruiterName": recruiter's full name as string or null,
  "recruiterEmail": recruiter's email as string or null,
  "isJobRelated": true or false
}

Rules:
- If the email is NOT job-related, set emailType to "unknown" and isJobRelated to false
- Extract the company name from the body or sender domain, not from ATS provider names
- Extract the specific role/position title if mentioned
- The stage should match the emailType logically`;

  try {
    const response = await client.messages.create({
      model: "claude-3-5-haiku-20241022",
      max_tokens: 300,
      messages: [{ role: "user", content: prompt }],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";

    // Extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);

    if (!parsed.isJobRelated) return null;

    const emailType: EmailType = VALID_EMAIL_TYPES.includes(parsed.emailType)
      ? parsed.emailType
      : "unknown";

    const stage: ApplicationStage = VALID_STAGES.includes(parsed.stage)
      ? parsed.stage
      : "Waiting";

    return {
      emailType,
      stage,
      company: typeof parsed.company === "string" ? parsed.company : null,
      role: typeof parsed.role === "string" ? parsed.role : null,
      recruiterName: typeof parsed.recruiterName === "string" ? parsed.recruiterName : null,
      recruiterEmail: typeof parsed.recruiterEmail === "string" ? parsed.recruiterEmail : null,
      atsProvider: null,
      confidence: "ai",
    };
  } catch (err) {
    console.error("[Claude classifier] Error:", err);
    return null;
  }
}
