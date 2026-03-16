import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { requirePrisma } from "@/lib/prisma";
import { sendLinkedInMessage } from "@/lib/outreach/phantombuster";
import { createOutreachSheet } from "@/lib/sheets/outreach-sheet";

/**
 * POST /api/outreach/phantombuster-bulk
 * Body: { applicationId, contactIds: string[], message: string }
 * Creates a Google Sheet with one row per contact (profileUrl, message),
 * launches PhantomBuster, returns jobId and spreadsheetUrl.
 */
export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json() as {
    applicationId: string;
    contactIds: string[];
    message: string;
  };

  const { applicationId, contactIds, message } = body;

  if (!applicationId || !contactIds?.length || !message?.trim()) {
    return NextResponse.json(
      { error: "applicationId, contactIds, and message are required" },
      { status: 400 }
    );
  }

  const prisma = requirePrisma();
  const contacts = await prisma.enrichedContact.findMany({
    where: {
      id: { in: contactIds },
      applicationId,
      userId,
      linkedinUrl: { not: null },
    },
  });

  if (contacts.length === 0) {
    return NextResponse.json(
      { error: "No contacts with LinkedIn URLs found" },
      { status: 400 }
    );
  }

  const rows = contacts.map((c) => ({
    profileUrl: c.linkedinUrl!,
    message: message.trim(),
  }));

  let spreadsheetUrl: string;
  try {
    spreadsheetUrl = await createOutreachSheet(userId, rows);
  } catch (err) {
    console.error("[phantombuster-bulk] Failed to create sheet:", err);
    return NextResponse.json(
      {
        error: "Could not create Google Sheet. Reconnect Gmail with Sheets access.",
      },
      { status: 500 }
    );
  }

  const job = await sendLinkedInMessage({
    spreadsheetUrl,
    message: message.trim(),
  });

  if (!job) {
    return NextResponse.json({
      success: false,
      spreadsheetUrl,
      note: "PhantomBuster not configured. Sheet created — add PHANTOMBUSTER_API_KEY and PHANTOMBUSTER_LINKEDIN_AGENT_ID.",
    });
  }

  return NextResponse.json({
    success: true,
    jobId: job.jobId,
    spreadsheetUrl,
    contactsProcessed: contacts.length,
  });
}
