import { Resend } from "resend";

let _resend: Resend | null = null;
function getResend(): Resend {
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY ?? "placeholder");
  return _resend;
}

export interface SendEmailParams {
  to: string;
  subject: string;
  body: string;
  fromName?: string;
  fromEmail?: string;
  replyTo?: string;
}

export interface SendEmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export async function sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
  if (!process.env.RESEND_API_KEY) {
    return { success: false, error: "RESEND_API_KEY not configured" };
  }

  const from = params.fromName && params.fromEmail
    ? `${params.fromName} <${params.fromEmail}>`
    : params.fromEmail ?? "JobPulse <outreach@jobpulse.app>";

  try {
    const { data, error } = await getResend().emails.send({
      from,
      to: params.to,
      subject: params.subject,
      text: params.body,
      ...(params.replyTo ? { replyTo: params.replyTo } : {}),
    });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, messageId: data?.id };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}
