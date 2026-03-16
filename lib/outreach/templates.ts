export interface TemplateVariable {
  key: string;
  label: string;
  example: string;
}

export interface OutreachTemplateDefinition {
  id: string;
  name: string;
  channel: "email" | "linkedin" | "both";
  subject?: string;
  body: string;
  variables: TemplateVariable[];
  description: string;
}

export const DEFAULT_TEMPLATES: OutreachTemplateDefinition[] = [
  {
    id: "recruiter-intro",
    name: "Recruiter Intro",
    channel: "both",
    subject: "Re: {{role}} Application at {{company}}",
    body: `Hi {{contact_name}},

I recently applied for the {{role}} role at {{company}} and wanted to reach out directly. I'm really excited about the opportunity — {{company}}'s work on {{company_focus}} resonates strongly with my background.

I'd love to connect and learn more about the team and what you're looking for. Would you be open to a quick chat?

Best,
{{sender_name}}`,
    variables: [
      { key: "contact_name", label: "Contact first name", example: "Sarah" },
      { key: "role", label: "Job title", example: "Head of Growth" },
      { key: "company", label: "Company name", example: "Stripe" },
      { key: "company_focus", label: "What the company does", example: "payment infrastructure" },
      { key: "sender_name", label: "Your name", example: "Alex" },
    ],
    description: "A warm intro to the recruiter or talent team referencing your application.",
  },
  {
    id: "hiring-manager",
    name: "Hiring Manager Reach",
    channel: "both",
    subject: "{{role}} at {{company}} — Quick Note",
    body: `Hi {{contact_name}},

I came across your profile and noticed you lead {{contact_team}} at {{company}}. I recently applied for the {{role}} position and wanted to connect directly with the hiring team.

My background in {{candidate_background}} seems closely aligned with what you're building. I'd welcome any chance to discuss — even a 15-minute call would be helpful.

Thanks for your time,
{{sender_name}}`,
    variables: [
      { key: "contact_name", label: "Contact first name", example: "Mike" },
      { key: "contact_team", label: "Their team/department", example: "the engineering org" },
      { key: "role", label: "Job title", example: "Senior Engineer" },
      { key: "company", label: "Company name", example: "Notion" },
      { key: "candidate_background", label: "Your relevant background", example: "B2B SaaS product growth" },
      { key: "sender_name", label: "Your name", example: "Alex" },
    ],
    description: "Reach out directly to the likely hiring manager.",
  },
  {
    id: "follow-up-after-apply",
    name: "Follow-Up After Applying",
    channel: "both",
    subject: "Following up — {{role}} Application",
    body: `Hi {{contact_name}},

I submitted my application for the {{role}} role at {{company}} about a week ago and wanted to follow up to reiterate my interest.

I'm genuinely excited about this opportunity — particularly {{specific_reason}}. I believe my experience in {{candidate_background}} would be a strong fit.

Is there anything else you need from my side? Happy to provide references, samples, or jump on a quick call.

Thanks,
{{sender_name}}`,
    variables: [
      { key: "contact_name", label: "Contact first name", example: "Jordan" },
      { key: "role", label: "Job title", example: "Product Manager" },
      { key: "company", label: "Company name", example: "Linear" },
      { key: "specific_reason", label: "Specific thing you're excited about", example: "the focus on developer experience" },
      { key: "candidate_background", label: "Your relevant background", example: "developer tools and B2B products" },
      { key: "sender_name", label: "Your name", example: "Alex" },
    ],
    description: "A polite follow-up message after applying with no response.",
  },
  {
    id: "referral-ask",
    name: "Referral Request",
    channel: "linkedin",
    body: `Hi {{contact_name}},

I hope you don't mind the cold message — I noticed you work at {{company}} and I'm currently applying for the {{role}} position there.

I'd love to learn more about the culture and team from someone inside. If you're open to it, even a 10-minute chat would mean a lot. And if you felt comfortable referring me after our chat, that would be incredible.

No pressure at all — thanks for reading!

{{sender_name}}`,
    variables: [
      { key: "contact_name", label: "Contact first name", example: "Chris" },
      { key: "company", label: "Company name", example: "Figma" },
      { key: "role", label: "Job title", example: "Designer" },
      { key: "sender_name", label: "Your name", example: "Alex" },
    ],
    description: "Ask someone at the company for a referral or informational chat.",
  },
  {
    id: "executive-intro",
    name: "Executive / Leadership Intro",
    channel: "email",
    subject: "{{role}} Opportunity — Brief Note",
    body: `Hi {{contact_name}},

I hope this note finds you well. I'm reaching out because I'm very interested in the {{role}} role at {{company}} and wanted to connect with the leadership team directly.

I've spent the last {{years_experience}} years {{candidate_background}}, and I see a compelling overlap with what {{company}} is building. I'd be grateful for 15 minutes of your time to introduce myself.

Thank you for considering this,
{{sender_name}}`,
    variables: [
      { key: "contact_name", label: "Contact first name", example: "Taylor" },
      { key: "role", label: "Job title", example: "VP of Sales" },
      { key: "company", label: "Company name", example: "Rippling" },
      { key: "years_experience", label: "Years of experience", example: "8" },
      { key: "candidate_background", label: "Brief summary of your work", example: "scaling sales teams at Series A–C SaaS companies" },
      { key: "sender_name", label: "Your name", example: "Alex" },
    ],
    description: "A professional note to C-suite or VP-level contacts.",
  },
];

export function fillTemplate(
  template: string,
  variables: Record<string, string>
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return variables[key] ?? match;
  });
}

export function extractVariablesFromTemplate(template: string): string[] {
  const matches = template.match(/\{\{(\w+)\}\}/g) ?? [];
  return [...new Set(matches.map((m) => m.slice(2, -2)))];
}
