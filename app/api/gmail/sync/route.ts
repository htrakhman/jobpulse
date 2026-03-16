import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { syncInbox } from "@/lib/gmail/sync";
import { generateFollowUpSuggestions } from "@/lib/services/followup.service";

export async function POST() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await syncInbox(userId);
    await generateFollowUpSuggestions(userId);

    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    console.error("[api/gmail/sync] Error:", err);
    return NextResponse.json({ error: "Sync failed" }, { status: 500 });
  }
}
