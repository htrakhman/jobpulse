import Anthropic from "@anthropic-ai/sdk";
import type { OutreachTemplateDefinition } from "./templates";
import { fillTemplate, extractVariablesFromTemplate } from "./templates";

const client = new Anthropic();

export interface DraftContext {
  template: OutreachTemplateDefinition;
  contact: {
    fullName: string | null;
    title: string | null;
    company: string;
    linkedinUrl?: string | null;
  };
  application: {
    role: string | null;
    company: string;
    appliedAt?: string | null;
  };
  senderName: string;
}

export async function generateDraft(ctx: DraftContext): Promise<{
  subject: string | null;
  body: string;
  filledVariables: Record<string, string>;
}> {
  const variableKeys = [
    ...extractVariablesFromTemplate(ctx.template.body),
    ...(ctx.template.subject ? extractVariablesFromTemplate(ctx.template.subject) : []),
  ];

  const prompt = `You are helping fill in variables for a job outreach message template.

Context:
- Sender name: ${ctx.senderName}
- Target contact: ${ctx.contact.fullName ?? "Unknown"}, ${ctx.contact.title ?? "Unknown title"} at ${ctx.contact.company}
- Job role applied for: ${ctx.application.role ?? "Unknown role"} at ${ctx.application.company}
- Applied: ${ctx.application.appliedAt ?? "recently"}
- Template name: ${ctx.template.name}

Variables to fill (return ONLY a JSON object):
${variableKeys.map((k) => {
  const v = ctx.template.variables.find((v) => v.key === k);
  return `- "${k}": ${v?.label ?? k} (example: "${v?.example ?? "..."}")`;
}).join("\n")}

Rules:
- "contact_name" should be the contact's first name only
- "company" should be the exact company name
- "role" should be the exact role title
- "sender_name" should be the sender's first name only
- For other variables, write 2-8 words that sound natural and specific
- Do NOT use placeholder text like "[X]" or "..."
- Return ONLY valid JSON, no other text

JSON:`;

  try {
    const response = await client.messages.create({
      model: "claude-3-5-haiku-20241022",
      max_tokens: 400,
      messages: [{ role: "user", content: prompt }],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "{}";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const filledVariables: Record<string, string> = jsonMatch ? JSON.parse(jsonMatch[0]) : {};

    // Ensure critical variables are always set
    if (!filledVariables.contact_name && ctx.contact.fullName) {
      filledVariables.contact_name = ctx.contact.fullName.split(" ")[0];
    }
    if (!filledVariables.company) filledVariables.company = ctx.contact.company;
    if (!filledVariables.role && ctx.application.role) filledVariables.role = ctx.application.role;
    if (!filledVariables.sender_name) filledVariables.sender_name = ctx.senderName.split(" ")[0];

    const body = fillTemplate(ctx.template.body, filledVariables);
    const subject = ctx.template.subject
      ? fillTemplate(ctx.template.subject, filledVariables)
      : null;

    return { subject, body, filledVariables };
  } catch {
    // Fallback: fill what we can from context
    const filledVariables: Record<string, string> = {
      contact_name: ctx.contact.fullName?.split(" ")[0] ?? "there",
      company: ctx.contact.company,
      role: ctx.application.role ?? "the position",
      sender_name: ctx.senderName.split(" ")[0],
      contact_team: ctx.contact.title ?? "the team",
    };

    const body = fillTemplate(ctx.template.body, filledVariables);
    const subject = ctx.template.subject
      ? fillTemplate(ctx.template.subject, filledVariables)
      : null;

    return { subject, body, filledVariables };
  }
}
