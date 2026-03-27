import { Buffer } from "node:buffer";
import { requirePrisma } from "@/lib/prisma";
import { getAuthForUser } from "@/lib/gmail/client";

export interface SendGmailParams {
  userId: string;
  to: string;
  subject: string;
  body: string;
  /**
   * Optional reply-to. If omitted, reply will go to the From address.
   */
  replyTo?: string;
}

function toBase64Url(raw: string): string {
  const b64 = Buffer.from(raw, "utf8").toString("base64");
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function encodeHeaderValue(value: string): string {
  // Keep it simple: most subjects in your templates are ASCII.
  // If non-ascii shows up, Gmail will still accept UTF-8 in headers in many cases.
  return value.replace(/\r?\n/g, " ").trim();
}

function buildRawMessage(params: {
  fromEmail: string;
  to: string;
  subject: string;
  body: string;
  replyTo?: string;
}) {
  const from = params.fromEmail;
  const to = params.to;
  const subject = encodeHeaderValue(params.subject);

  // Plain-text message. Templates are already plain text; we preserve line breaks.
  const headers: string[] = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/plain; charset="UTF-8"`,
  ];

  if (params.replyTo) {
    headers.push(`Reply-To: ${encodeHeaderValue(params.replyTo)}`);
  }

  return `${headers.join("\r\n")}\r\n\r\n${params.body}`;
}

export async function sendEmailViaGmail(params: SendGmailParams): Promise<{
  success: boolean;
  messageId?: string;
  error?: string;
}> {
  const prisma = requirePrisma();

  const account = await prisma.connectedAccount.findUnique({
    where: { userId: params.userId },
    select: { email: true },
  });

  if (!account?.email) {
    return { success: false, error: "Gmail account not connected for this user." };
  }

  try {
    const oauth2Client = await getAuthForUser(params.userId);
    const { google } = await import("googleapis");
    const gmail = google.gmail({ version: "v1", auth: oauth2Client });

    const raw = buildRawMessage({
      fromEmail: account.email,
      to: params.to,
      subject: params.subject,
      body: params.body,
      replyTo: params.replyTo,
    });

    const res = await gmail.users.messages.send({
      userId: "me",
      requestBody: { raw: toBase64Url(raw) },
    });

    return { success: true, messageId: res.data.id ?? undefined };
  } catch (err) {
    const msg = String(err);
    // Common when scopes are only gmail.readonly.
    const insufficient =
      msg.includes("insufficientPermissions") ||
      msg.includes("insufficient permissions") ||
      msg.includes("403") ||
      msg.includes("forbidden");

    return {
      success: false,
      error: insufficient
        ? "Gmail sending is not authorized. Reconnect Gmail with send permission."
        : msg,
    };
  }
}

