import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { getApplicationsForUser, getDashboardStats } from "@/lib/services/application.service";
import type { ApplicationStage } from "@/types";
import { requirePrisma } from "@/lib/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";

const VALID_STAGES: ApplicationStage[] = [
  "Applied",
  "Waiting",
  "Scheduling",
  "Interviewing",
  "Assessment",
  "Offer",
  "Rejected",
  "Closed",
];

export async function GET(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const stageParam = searchParams.get("stage");
  const stagesParam = searchParams.get("stages");
  const sourceParam = searchParams.get("source");
  const methodParam = searchParams.get("method");
  const priorityParam = searchParams.get("priority");
  const resumeVersionParam = searchParams.get("resumeVersion");
  const staleStatus = searchParams.get("stale");
  const urgencyParam = searchParams.get("urgency");
  const locationTypeParam = searchParams.get("locationType");
  const salaryBandParam = searchParams.get("salaryBand");
  const searchQuery = searchParams.get("q");
  const sortBy = searchParams.get("sortBy") ?? "lastActivityAt";
  const sortDir = searchParams.get("sortDir") === "asc" ? "asc" : "desc";
  const page = Math.max(1, Number(searchParams.get("page") ?? "1"));
  const pageSize = Math.min(100, Math.max(1, Number(searchParams.get("pageSize") ?? "25")));
  const windowDays = Number(searchParams.get("windowDays") ?? "0");
  const includeStats = searchParams.get("stats") === "true";

  const stage =
    stageParam && VALID_STAGES.includes(stageParam as ApplicationStage)
      ? (stageParam as ApplicationStage)
      : undefined;
  const stages =
    stagesParam
      ?.split(",")
      .map((value) => value.trim())
      .filter((value): value is ApplicationStage => VALID_STAGES.includes(value as ApplicationStage)) ?? [];

  const hasAdvancedFilters =
    stages.length > 0 ||
    !!sourceParam ||
    !!methodParam ||
    !!priorityParam ||
    !!resumeVersionParam ||
    !!staleStatus ||
    !!urgencyParam ||
    !!locationTypeParam ||
    !!salaryBandParam ||
    !!searchQuery ||
    searchParams.has("page") ||
    searchParams.has("pageSize") ||
    searchParams.has("sortBy") ||
    searchParams.has("sortDir");

  if (hasAdvancedFilters) {
    const prisma = requirePrisma();
    const now = new Date();
    const staleCutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const dateWindow =
      Number.isFinite(windowDays) && windowDays > 0
        ? new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000)
        : null;
    const where: Prisma.ApplicationWhereInput = {
      userId,
      ...(stage ? { stage } : {}),
      ...(stages.length > 0 ? { stage: { in: stages } } : {}),
      ...(sourceParam ? { source: sourceParam as never } : {}),
      ...(methodParam ? { method: methodParam as never } : {}),
      ...(priorityParam ? { targetPriority: priorityParam as never } : {}),
      ...(resumeVersionParam ? { resumeVersion: resumeVersionParam } : {}),
      ...(urgencyParam ? { followUpUrgency: urgencyParam as never } : {}),
      ...(locationTypeParam ? { workModelPreference: locationTypeParam as never } : {}),
      ...(salaryBandParam ? { salaryBand: salaryBandParam } : {}),
      ...(staleStatus === "true" ? { lastActivityAt: { lt: staleCutoff } } : {}),
      ...(dateWindow
        ? {
            OR: [{ appliedAt: { gte: dateWindow } }, { lastActivityAt: { gte: dateWindow } }],
          }
        : {}),
      ...(searchQuery
        ? {
            OR: [
              { company: { contains: searchQuery, mode: "insensitive" } },
              { role: { contains: searchQuery, mode: "insensitive" } },
              { nextAction: { contains: searchQuery, mode: "insensitive" } },
              { resumeVersion: { contains: searchQuery, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const orderBy: Prisma.ApplicationOrderByWithRelationInput =
      sortBy === "company"
        ? { company: sortDir }
        : sortBy === "role"
        ? { role: sortDir }
        : sortBy === "appliedAt"
        ? { appliedAt: sortDir }
        : sortBy === "nextActionDate"
        ? { nextActionDate: sortDir }
        : { lastActivityAt: sortDir };

    const [totalCount, applications, stats] = await Promise.all([
      prisma.application.count({ where }),
      prisma.application.findMany({
        where,
        include: {
          recruiter: true,
          contacts: {
            include: {
              emails: {
                orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
                take: 4,
              },
            },
            orderBy: [{ confidence: "desc" }, { updatedAt: "desc" }],
            take: 3,
          },
          events: { orderBy: { occurredAt: "desc" }, take: 2 },
          _count: { select: { emails: true, events: true } },
          emails: {
            select: { id: true, threadId: true, receivedAt: true },
            orderBy: { receivedAt: "desc" },
            take: 1,
          },
        },
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      includeStats ? getDashboardStats(userId) : null,
    ]);

    const applicationRows = applications.map((app) => {
      const primaryContact = app.contacts[0];
      return {
        ...app,
        contactSummary: primaryContact
          ? {
              contactPerson: primaryContact.fullName,
              inferredPosition: primaryContact.inferredTitle,
              additionalEmails: primaryContact.emails
                .filter((email: { isPrimary: boolean }) => !email.isPrimary)
                .map((email: { email: string }) => email.email)
                .slice(0, 3),
              webProfileUrl: primaryContact.webProfileUrl,
              confidence: primaryContact.confidence,
            }
          : null,
      };
    });

    return NextResponse.json({
      applications: applicationRows,
      stats,
      pagination: {
        page,
        pageSize,
        totalCount,
        totalPages: Math.max(1, Math.ceil(totalCount / pageSize)),
      },
    });
  }

  const [applications, stats] = await Promise.all([
    getApplicationsForUser(userId, stage ? { stage } : undefined),
    includeStats ? getDashboardStats(userId) : null,
  ]);

  const applicationRows = applications.map((app) => {
    const primaryContact = app.contacts[0];
    return {
      ...app,
      contactSummary: primaryContact
        ? {
            contactPerson: primaryContact.fullName,
            inferredPosition: primaryContact.inferredTitle,
            additionalEmails: primaryContact.emails
              .filter((email: { isPrimary: boolean }) => !email.isPrimary)
              .map((email: { email: string }) => email.email)
              .slice(0, 3),
            webProfileUrl: primaryContact.webProfileUrl,
            confidence: primaryContact.confidence,
          }
        : null,
    };
  });

  return NextResponse.json({ applications: applicationRows, stats });
}
