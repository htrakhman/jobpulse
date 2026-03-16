import type { ParsedEmail } from "@/types";
import type { gmail_v1 } from "googleapis";

function decodeBase64(encoded: string): string {
  try {
    const normalized = encoded.replace(/-/g, "+").replace(/_/g, "/");
    return Buffer.from(normalized, "base64").toString("utf-8");
  } catch {
    return "";
  }
}

function extractTextFromPayload(payload: gmail_v1.Schema$MessagePart): string {
  if (!payload) return "";

  const mimeType = payload.mimeType ?? "";

  if (mimeType === "text/plain" && payload.body?.data) {
    return decodeBase64(payload.body.data);
  }

  if (mimeType.startsWith("multipart/") && payload.parts) {
    // Prefer text/plain, fall back to text/html
    const textPart = payload.parts.find((p) => p.mimeType === "text/plain");
    if (textPart?.body?.data) return decodeBase64(textPart.body.data);

    // Recurse into parts
    for (const part of payload.parts) {
      const text = extractTextFromPayload(part);
      if (text) return text;
    }
  }

  return "";
}

function getHeader(headers: gmail_v1.Schema$MessagePartHeader[], name: string): string {
  return headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? "";
}

function parseNameAndEmail(raw: string): { name: string | null; email: string | null } {
  if (!raw) return { name: null, email: null };

  // "Name <email@domain.com>"
  const match = raw.match(/^(.+?)\s*<([^>]+)>$/);
  if (match) {
    return {
      name: match[1].replace(/^["']|["']$/g, "").trim() || null,
      email: match[2].trim().toLowerCase(),
    };
  }

  // Just an email address
  if (raw.includes("@")) {
    return { name: null, email: raw.trim().toLowerCase() };
  }

  return { name: raw.trim() || null, email: null };
}

export function parseGmailMessage(message: gmail_v1.Schema$Message): ParsedEmail | null {
  if (!message.id || !message.threadId) return null;

  const headers = message.payload?.headers ?? [];
  const subject = getHeader(headers, "Subject");
  const fromRaw = getHeader(headers, "From");
  const dateRaw = getHeader(headers, "Date");

  const { name: fromName, email: fromEmail } = parseNameAndEmail(fromRaw);
  const bodyText = extractTextFromPayload(message.payload ?? {});
  const snippet = message.snippet ?? "";

  const receivedAt = dateRaw ? new Date(dateRaw) : new Date(Number(message.internalDate));

  return {
    id: message.id,
    threadId: message.threadId,
    subject,
    fromName,
    fromEmail,
    snippet,
    bodyText,
    receivedAt: isNaN(receivedAt.getTime()) ? new Date() : receivedAt,
  };
}
