import { google } from "googleapis";
import { requirePrisma } from "@/lib/prisma";

function getAppUrl(): string {
  const raw = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
  return `https://${raw}`;
}

export function createOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID!,
    process.env.GOOGLE_CLIENT_SECRET!,
    `${getAppUrl()}/api/gmail/connect/callback`
  );
}

export function getAuthUrl(options?: {
  state?: string;
  loginHint?: string;
}): string {
  const oauth2Client = createOAuth2Client();
  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: true,
    scope: [
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/userinfo.email",
      "https://www.googleapis.com/auth/spreadsheets",
      "https://www.googleapis.com/auth/drive.file",
    ],
    ...(options?.state ? { state: options.state } : {}),
    ...(options?.loginHint ? { login_hint: options.loginHint } : {}),
  });
}

export async function getAuthForUser(userId: string) {
  const prisma = requirePrisma();
  const account = await prisma.connectedAccount.findUnique({
    where: { userId },
  });

  if (!account) throw new Error("No connected Gmail account found");

  const oauth2Client = createOAuth2Client();
  oauth2Client.setCredentials({
    access_token: account.accessToken,
    refresh_token: account.refreshToken,
    expiry_date: account.tokenExpiry?.getTime(),
  });

  // Auto-refresh if token is expired or close to expiry
  oauth2Client.on("tokens", async (tokens) => {
    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (tokens.access_token) updateData.accessToken = tokens.access_token;
    if (tokens.expiry_date) updateData.tokenExpiry = new Date(tokens.expiry_date);
    await prisma.connectedAccount.update({
      where: { userId },
      data: updateData,
    });
  });

  return oauth2Client;
}

export async function getGmailClientForUser(userId: string) {
  const auth = await getAuthForUser(userId);
  return google.gmail({ version: "v1", auth });
}
