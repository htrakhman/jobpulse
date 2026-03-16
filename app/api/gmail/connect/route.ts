import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getAuthUrl } from "@/lib/gmail/client";
import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return redirect("/sign-in");
    }

    if (!prisma) {
      return redirect("/dashboard?error=db_required");
    }

    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      return redirect("/dashboard?error=google_oauth_missing");
    }

    const user = await currentUser();
    const { searchParams } = new URL(request.url);
    const auto = searchParams.get("auto") === "1";
    const returnTo = searchParams.get("returnTo") ?? "/dashboard";

    // Track first time we request Gmail access
    await prisma.user.upsert({
      where: { id: userId },
      create: {
        id: userId,
        email: user?.emailAddresses[0]?.emailAddress ?? "",
        gmailAccessRequestedAt: new Date(),
      },
      update: {
        gmailAccessRequestedAt: new Date(),
      },
    });

    const state = Buffer.from(
      JSON.stringify({ auto, returnTo })
    ).toString("base64url");

    const url = getAuthUrl({
      state,
      loginHint: user?.emailAddresses[0]?.emailAddress,
    });
    return redirect(url);
  } catch (err) {
    console.error("[gmail/connect] Error:", err);
    return redirect("/dashboard?error=gmail_connect_failed");
  }
}
