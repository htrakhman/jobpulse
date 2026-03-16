import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import {
  getFollowUpSuggestions,
  dismissFollowUp,
  completeFollowUp,
} from "@/lib/services/followup.service";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const suggestions = await getFollowUpSuggestions(userId);
  return NextResponse.json({ suggestions });
}

export async function PATCH(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, action } = await request.json();
  if (!id || !action) {
    return NextResponse.json({ error: "Missing id or action" }, { status: 400 });
  }

  if (action === "dismiss") {
    await dismissFollowUp(userId, id);
  } else if (action === "complete") {
    await completeFollowUp(userId, id);
  } else {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
