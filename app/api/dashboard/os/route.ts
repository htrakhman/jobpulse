import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { getDashboardOSPayload } from "@/lib/services/dashboard-metrics.service";

export async function GET(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const windowDays = Number(new URL(request.url).searchParams.get("windowDays") ?? "30");
  const payload = await getDashboardOSPayload(userId, Number.isFinite(windowDays) && windowDays > 0 ? windowDays : 30);
  return NextResponse.json(payload);
}

