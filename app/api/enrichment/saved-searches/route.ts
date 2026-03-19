import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { requirePrisma } from "@/lib/prisma";
import type { PeopleSortMode } from "@/lib/enrichment/types";

export async function GET(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const prisma = requirePrisma();
  const { searchParams } = new URL(request.url);
  const applicationId = searchParams.get("applicationId");

  const savedSearches = await prisma.savedSearch.findMany({
    where: {
      userId,
      ...(applicationId ? { applicationId } : {}),
    },
    orderBy: [{ updatedAt: "desc" }],
    take: 30,
  });

  return NextResponse.json({ savedSearches });
}

export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const prisma = requirePrisma();
  const body = (await request.json().catch(() => ({}))) as {
    name?: string;
    applicationId?: string;
    filterPayload?: Record<string, unknown>;
    sortMode?: PeopleSortMode;
    maxResults?: number;
    pageSize?: number;
  };

  const name = body.name?.trim();
  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  if (body.applicationId) {
    const ownsApplication = await prisma.application.findFirst({
      where: { id: body.applicationId, userId },
      select: { id: true },
    });
    if (!ownsApplication) {
      return NextResponse.json({ error: "Application not found" }, { status: 404 });
    }
  }

  const savedSearch = await prisma.savedSearch.create({
    data: {
      userId,
      applicationId: body.applicationId ?? undefined,
      name,
      filterPayload: body.filterPayload ?? {},
      sortMode: body.sortMode ?? "relevance",
      maxResults: Math.min(300, Math.max(10, body.maxResults ?? 80)),
      pageSize: Math.min(100, Math.max(5, body.pageSize ?? 25)),
    },
  });

  return NextResponse.json({ savedSearch }, { status: 201 });
}
