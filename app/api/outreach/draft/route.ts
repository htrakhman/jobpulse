import { auth, currentUser } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { DEFAULT_TEMPLATES } from "@/lib/outreach/templates";
import { generateDraft } from "@/lib/outreach/ai-draft";

export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json() as {
    contactId: string;
    templateId: string;
    channel: "email" | "linkedin";
  };

  const { contactId, templateId, channel } = body;

  const contact = await prisma.enrichedContact.findFirst({
    where: { id: contactId, userId },
    include: {
      application: {
        select: { company: true, role: true, appliedAt: true },
      },
    },
  });

  if (!contact) {
    return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  }

  // Find template (built-in or custom)
  const builtIn = DEFAULT_TEMPLATES.find((t) => t.id === templateId);
  let template = builtIn;

  if (!template) {
    const custom = await prisma.outreachTemplate.findFirst({
      where: { id: templateId, userId },
    });
    if (custom) {
      template = {
        id: custom.id,
        name: custom.name,
        channel: custom.channel as "email" | "linkedin",
        subject: custom.subject ?? undefined,
        body: custom.body,
        variables: [],
        description: "",
      };
    }
  }

  if (!template) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }

  const user = await currentUser();
  const senderName = user?.fullName ?? user?.emailAddresses[0]?.emailAddress ?? "Me";

  const draft = await generateDraft({
    template,
    contact: {
      fullName: contact.fullName,
      title: contact.title,
      company: contact.company,
      linkedinUrl: contact.linkedinUrl,
    },
    application: {
      role: contact.application.role,
      company: contact.application.company,
      appliedAt: contact.application.appliedAt?.toISOString() ?? null,
    },
    senderName,
  });

  // Save draft to DB
  const message = await prisma.outreachMessage.create({
    data: {
      contactId,
      applicationId: contact.applicationId,
      userId,
      templateId: builtIn ? null : templateId,
      channel,
      subject: draft.subject,
      body: draft.body,
      status: "draft",
    },
  });

  return NextResponse.json({ message, draft });
}
