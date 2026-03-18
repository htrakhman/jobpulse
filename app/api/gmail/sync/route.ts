import { auth, currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncInbox } from "@/lib/gmail/sync";
import { generateFollowUpSuggestions } from "@/lib/services/followup.service";

export async function POST() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    if (!prisma) {
      return NextResponse.json({ error: "Database not configured" }, { status: 500 });
    }

    let ownerUserId = userId;
    const dbUser = await prisma.user.findUnique({ where: { id: userId } });
    if (!dbUser) {
      const clerk = await currentUser();
      const clerkEmail = clerk?.emailAddresses[0]?.emailAddress ?? "";
      if (clerkEmail) {
        const fallback = await prisma.user.findUnique({ where: { email: clerkEmail } });
        if (fallback) ownerUserId = fallback.id;
      }
    }

    const result = await syncInbox(ownerUserId);
    await generateFollowUpSuggestions(ownerUserId);

    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    console.error("[api/gmail/sync] Error:", err);
    return NextResponse.json({ error: "Sync failed" }, { status: 500 });
  }
}
