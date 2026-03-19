import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { requirePrisma } from "@/lib/prisma";
import type { PeopleSortMode } from "@/lib/enrichment/types";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const prisma = requirePrisma();
  const { id } = await params;

  const savedSearch = await prisma.savedSearch.findFirst({
    where: { id, userId },
  });
  if (!savedSearch) {
    return NextResponse.json({ error: "Saved search not found" }, { status: 404 });
  }
  return NextResponse.json({ savedSearch });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const prisma = requirePrisma();
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    name?: string;
    filterPayload?: Record<string, unknown>;
    sortMode?: PeopleSortMode;
    maxResults?: number;
    pageSize?: number;
  };

  const existing = await prisma.savedSearch.findFirst({
    where: { id, userId },
    select: { id: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Saved search not found" }, { status: 404 });
  }

  const savedSearch = await prisma.savedSearch.update({
    where: { id },
    data: {
      ...(typeof body.name === "string" ? { name: body.name.trim() || "Untitled search" } : {}),
      ...(body.filterPayload
        ? { filterPayload: body.filterPayload as never }
        : {}),
      ...(body.sortMode ? { sortMode: body.sortMode } : {}),
      ...(typeof body.maxResults === "number"
        ? { maxResults: Math.min(300, Math.max(10, body.maxResults)) }
        : {}),
      ...(typeof body.pageSize === "number"
        ? { pageSize: Math.min(100, Math.max(5, body.pageSize)) }
        : {}),
    },
  });

  return NextResponse.json({ savedSearch });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const prisma = requirePrisma();
  const { id } = await params;

  const existing = await prisma.savedSearch.findFirst({
    where: { id, userId },
    select: { id: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Saved search not found" }, { status: 404 });
  }

  await prisma.savedSearch.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
