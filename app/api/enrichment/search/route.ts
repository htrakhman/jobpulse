import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { requirePrisma } from "@/lib/prisma";
import { searchPeopleAtCompany } from "@/lib/enrichment/waterfall";

export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const prisma = requirePrisma();
  const body = await request.json() as {
    applicationId: string;
    titleKeywords?: string[];
    department?: string;
    maxResults?: number;
  };

  const { applicationId, titleKeywords = [], maxResults = 10 } = body;

  if (!applicationId) {
    return NextResponse.json({ error: "applicationId required" }, { status: 400 });
  }

  // Verify this application belongs to the user
  const application = await prisma.application.findFirst({
    where: { id: applicationId, userId },
    select: { id: true, company: true },
  });

  if (!application) {
    return NextResponse.json({ error: "Application not found" }, { status: 404 });
  }

  try {
    const people = await searchPeopleAtCompany(
      application.company,
      titleKeywords,
      maxResults
    );

    // Save found people as EnrichedContact records
    const contacts = await Promise.all(
      people.map(async (person) => {
        // Check if already exists
        const existing = await prisma.enrichedContact.findFirst({
          where: {
            applicationId,
            fullName: person.fullName ?? undefined,
          },
        });

        if (existing) return existing;

        return prisma.enrichedContact.create({
          data: {
            applicationId,
            userId,
            firstName: person.firstName ?? undefined,
            lastName: person.lastName ?? undefined,
            fullName: person.fullName ?? undefined,
            title: person.title ?? undefined,
            department: person.department ?? undefined,
            seniority: person.seniority ?? undefined,
            email: person.email ?? undefined,
            emailVerified: person.emailVerified,
            emailSource: person.email ? (person.source as never) : undefined,
            linkedinUrl: person.linkedinUrl ?? undefined,
            linkedinSource: person.linkedinUrl ? (person.source as never) : undefined,
            phone: person.phone ?? undefined,
            company: person.company,
            companyDomain: person.companyDomain ?? undefined,
            companyLinkedinUrl: person.companyLinkedinUrl ?? undefined,
            enrichmentStatus: person.email && person.linkedinUrl
              ? "enriched"
              : person.email || person.linkedinUrl
              ? "partial"
              : "pending",
          },
        });
      })
    );

    return NextResponse.json({ contacts, total: contacts.length });
  } catch (err) {
    console.error("[enrichment/search]", err);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const prisma = requirePrisma();
  const { searchParams } = new URL(request.url);
  const applicationId = searchParams.get("applicationId");

  if (!applicationId) {
    return NextResponse.json({ error: "applicationId required" }, { status: 400 });
  }

  const contacts = await prisma.enrichedContact.findMany({
    where: { applicationId, userId },
    include: {
      messages: {
        select: { id: true, channel: true, status: true, sentAt: true },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({ contacts });
}
