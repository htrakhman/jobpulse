import { google } from "googleapis";
import { getAuthForUser } from "@/lib/gmail/client";

export interface OutreachRow {
  profileUrl: string;
  message: string;
}

/**
 * Creates a Google Sheet with one row per contact (profileUrl, message),
 * shares it with "Anyone with the link", and returns the public URL.
 * Used by PhantomBuster LinkedIn Message Sender.
 */
export async function createOutreachSheet(
  userId: string,
  rows: OutreachRow[]
): Promise<string> {
  const auth = await getAuthForUser(userId);
  const sheets = google.sheets({ version: "v4", auth });
  const drive = google.drive({ version: "v3", auth });

  const res = await sheets.spreadsheets.create({
    requestBody: {
      properties: {
        title: `JobPulse Outreach ${new Date().toISOString().slice(0, 10)}`,
      },
    },
  });

  const spreadsheetId = res.data.spreadsheetId;
  if (!spreadsheetId) throw new Error("Failed to create spreadsheet");

  const values = [
    ["profileUrl", "message"],
    ...rows.map((r) => [r.profileUrl, r.message]),
  ];

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: "Sheet1!A1",
    valueInputOption: "USER_ENTERED",
    requestBody: { values },
  });

  await drive.permissions.create({
    fileId: spreadsheetId,
    requestBody: {
      role: "reader",
      type: "anyone",
    },
  });

  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
}
