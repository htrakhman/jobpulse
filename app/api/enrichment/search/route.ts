import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { requirePrisma } from "@/lib/prisma";
import { searchPeopleAtCompanyWorkspace } from "@/lib/enrichment/waterfall";
import type { PeopleSortMode } from "@/lib/enrichment/types";

export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const prisma = requirePrisma();
  const body = await request.json() as {
    applicationId: string;
    titleKeywords?: string[]; // legacy include titles
    includeTitles?: string[];
    excludeTitles?: string[];
    department?: string;
    seniority?: string;
    location?: string;
    includeKeywords?: string[];
    excludeKeywords?: string[];
    sortMode?: PeopleSortMode;
    page?: number;
    pageSize?: number;
    maxResults?: number;
    savedSearchId?: string;
  };

  const {
    applicationId,
    titleKeywords = [],
    includeTitles,
    excludeTitles,
    department,
    seniority,
    location,
    includeKeywords,
    excludeKeywords,
    sortMode = "relevance",
    page = 1,
    pageSize = 25,
    maxResults = 80,
    savedSearchId,
  } = body;

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
    const effectiveIncludeTitles =
      includeTitles && includeTitles.length > 0 ? includeTitles : titleKeywords;

    const searchStartedAt = Date.now();
    const searchResult = await searchPeopleAtCompanyWorkspace({
      company: application.company,
      includeTitles: effectiveIncludeTitles,
      excludeTitles,
      department,
      seniority,
      location,
      includeKeywords,
      excludeKeywords,
      page,
      pageSize,
      maxResults,
      sortMode,
    });
    const durationMs = Date.now() - searchStartedAt;

    // Save found people as EnrichedContact records
    const contacts = await Promise.all(
      searchResult.results.map(async (person) => {
        const uniqueMatchers: Array<Record<string, string>> = [];
        if (person.linkedinUrl) uniqueMatchers.push({ linkedinUrl: person.linkedinUrl });
        if (person.email) uniqueMatchers.push({ email: person.email });
        if (person.fullName) {
          uniqueMatchers.push({
            fullName: person.fullName,
            ...(person.title ? { title: person.title } : {}),
          });
        }
        const existing = await prisma.enrichedContact.findFirst({
          where: {
            applicationId,
            ...(uniqueMatchers.length > 0 ? { OR: uniqueMatchers } : {}),
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

    await prisma.searchRun.create({
      data: {
        userId,
        applicationId,
        savedSearchId: savedSearchId ?? undefined,
        filterPayload: {
          includeTitles: effectiveIncludeTitles,
          excludeTitles,
          department,
          seniority,
          location,
          includeKeywords,
          excludeKeywords,
        },
        sortMode,
        page,
        pageSize,
        resultCount: contacts.length,
        totalCount: searchResult.total,
        durationMs,
        providerSummary: searchResult.providerDiagnostics,
      },
    });

    if (savedSearchId) {
      await prisma.savedSearch.updateMany({
        where: { id: savedSearchId, userId },
        data: {
          lastRunAt: new Date(),
          lastResultCount: searchResult.total,
          filterPayload: {
            includeTitles: effectiveIncludeTitles,
            excludeTitles,
            department,
            seniority,
            location,
            includeKeywords,
            excludeKeywords,
          },
          sortMode,
          maxResults,
          pageSize,
        },
      });
    }

    return NextResponse.json({
      contacts,
      total: searchResult.total,
      page: searchResult.page,
      pageSize: searchResult.pageSize,
      providerDiagnostics: searchResult.providerDiagnostics,
    });
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
