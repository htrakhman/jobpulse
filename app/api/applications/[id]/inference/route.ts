import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { applyInferenceToApplication, inferApplicationMetadata } from "@/lib/services/inference.service";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const result = await inferApplicationMetadata(userId, id);
  return NextResponse.json({ inference: result });
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const result = await applyInferenceToApplication(userId, id);
  return NextResponse.json({ inference: result, applied: true });
}

