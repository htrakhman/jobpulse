import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { requirePrisma } from "@/lib/prisma";
import { sendEmailViaGmail } from "@/lib/gmail/send";
import { sendLinkedInMessage } from "@/lib/outreach/phantombuster";
import { createOutreachSheet } from "@/lib/sheets/outreach-sheet";

export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const prisma = requirePrisma();
  const body = await request.json() as {
    messageId: string;
    subject?: string;
    body?: string;
  };

  const { messageId } = body;

  const message = await prisma.outreachMessage.findFirst({
    where: { id: messageId, userId },
    include: {
      contact: true,
    },
  });

  if (!message) {
    return NextResponse.json({ error: "Message not found" }, { status: 404 });
  }

  const finalSubject = body.subject ?? message.subject;
  const finalBody = body.body ?? message.body;

  if (body.subject || body.body) {
    await prisma.outreachMessage.update({
      where: { id: messageId },
      data: {
        subject: finalSubject,
        body: finalBody,
      },
    });
  }

  if (message.channel === "email") {
    const contactEmail = message.contact.email;
    if (!contactEmail) {
      return NextResponse.json(
        { error: "Contact has no email address. Enrich first." },
        { status: 400 }
      );
    }

    const result = await sendEmailViaGmail({
      userId,
      to: contactEmail,
      subject: finalSubject ?? `Reaching out — ${message.contact.company}`,
      body: finalBody,
    });

    if (!result.success) {
      await prisma.outreachMessage.update({
        where: { id: messageId },
        data: { status: "failed", errorMessage: result.error },
      });
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    await prisma.outreachMessage.update({
      where: { id: messageId },
      data: { status: "sent", sentAt: new Date() },
    });

    return NextResponse.json({ success: true, channel: "email" });
  }

  if (message.channel === "linkedin") {
    const linkedinUrl = message.contact.linkedinUrl;
    if (!linkedinUrl) {
      return NextResponse.json(
        { error: "Contact has no LinkedIn URL. Enrich first." },
        { status: 400 }
      );
    }

    let spreadsheetUrl: string;
    try {
      spreadsheetUrl = await createOutreachSheet(userId, [
        { profileUrl: linkedinUrl, message: finalBody },
      ]);
    } catch (err) {
      console.error("[outreach/send] Failed to create sheet:", err);
      return NextResponse.json(
        {
          success: false,
          manualSend: true,
          linkedinUrl,
          error: "Could not create Google Sheet. Reconnect Gmail with Sheets access.",
        },
        { status: 500 }
      );
    }

    const job = await sendLinkedInMessage({
      spreadsheetUrl,
      message: finalBody,
    });

    if (!job) {
      return NextResponse.json({
        success: false,
        manualSend: true,
        linkedinUrl,
        spreadsheetUrl,
        note: "PhantomBuster not configured. Sheet created — add PHANTOMBUSTER_API_KEY and agent ID.",
      });
    }

    await prisma.outreachMessage.update({
      where: { id: messageId },
      data: {
        status: "sent",
        sentAt: new Date(),
        phantomBusterJobId: job.jobId,
      },
    });

    return NextResponse.json({
      success: true,
      channel: "linkedin",
      jobId: job.jobId,
      spreadsheetUrl,
    });
  }

  return NextResponse.json({ error: "Invalid channel" }, { status: 400 });
}
