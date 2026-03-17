import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { NextRequest } from "next/server";
import { createOAuth2Client } from "@/lib/gmail/client";
import { setupGmailWatch } from "@/lib/gmail/pubsub";
import { syncInbox } from "@/lib/gmail/sync";
import { generateFollowUpSuggestions } from "@/lib/services/followup.service";
import { requirePrisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) return redirect("/sign-in");

  const prisma = requirePrisma();

  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");
  const stateParam = searchParams.get("state");

  let state: { auto?: boolean; returnTo?: string } = {};
  if (stateParam) {
    try {
      state = JSON.parse(Buffer.from(stateParam, "base64url").toString("utf8")) as {
        auto?: boolean;
        returnTo?: string;
      };
    } catch {
      state = {};
    }
  }

  if (error || !code) {
    const returnTo = state.returnTo ?? "/dashboard";
    const redirectUrl = new URL(returnTo, process.env.NEXT_PUBLIC_APP_URL);
    if (error === "access_denied") {
      redirectUrl.searchParams.set("error", "gmail_access_denied");
    } else if (error === "redirect_uri_mismatch") {
      redirectUrl.searchParams.set("error", "redirect_uri_mismatch");
    } else {
      redirectUrl.searchParams.set("error", "gmail_connect_failed");
    }
    return redirect(redirectUrl.pathname + "?" + redirectUrl.searchParams.toString());
  }

  let finalRedirectPath: string;

  try {
    const oauth2Client = createOAuth2Client();
    const { tokens } = await oauth2Client.getToken(code);

    // Get user's Gmail address
    oauth2Client.setCredentials(tokens);
    const { google } = await import("googleapis");
    const oauth2 = google.oauth2({ version: "v2", auth: oauth2Client });
    const userInfo = await oauth2.userinfo.get();
    const gmailEmail = userInfo.data.email ?? "";

    // Ensure user record exists
    const user = await currentUser();
    await prisma.user.upsert({
      where: { id: userId },
      create: {
        id: userId,
        email: user?.emailAddresses[0]?.emailAddress ?? gmailEmail,
        gmailAccessRequestedAt: new Date(),
      },
      update: {
        gmailAccessRequestedAt: new Date(),
      },
    });

    // Store connected account
    await prisma.connectedAccount.upsert({
      where: { userId },
      create: {
        userId,
        email: gmailEmail,
        accessToken: tokens.access_token ?? "",
        refreshToken: tokens.refresh_token ?? "",
        tokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
      },
      update: {
        email: gmailEmail,
        accessToken: tokens.access_token ?? "",
        refreshToken: tokens.refresh_token ?? tokens.refresh_token ?? "",
        tokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
      },
    });

    // Set up Gmail Pub/Sub watch
    try {
      await setupGmailWatch(userId);
    } catch (err) {
      console.warn("[gmail/connect] Could not set up Pub/Sub watch:", err);
    }

    // Start initial 90-day scan automatically
    await prisma.user.update({
      where: { id: userId },
      data: {
        initialScanStartedAt: new Date(),
        initialScanRangeDays: 90,
      },
    });

    const result = await syncInbox(userId, { daysBack: 90 });
    await generateFollowUpSuggestions(userId);

    await prisma.user.update({
      where: { id: userId },
      data: {
        initialScanCompletedAt: new Date(),
      },
    });

    const returnTo = state.returnTo ?? "/dashboard";
    const redirectUrl = new URL(returnTo, process.env.NEXT_PUBLIC_APP_URL);
    redirectUrl.searchParams.set("connected", "true");
    redirectUrl.searchParams.set("scan", "completed");
    redirectUrl.searchParams.set("range", "90");
    redirectUrl.searchParams.set("applications", String(result.applications));
    finalRedirectPath = redirectUrl.pathname + "?" + redirectUrl.searchParams.toString();
  } catch (err) {
    console.error("[gmail/connect/callback] Error:", err);
    const msg = err instanceof Error ? err.message : String(err);
    const redirectUrl = new URL("/dashboard", process.env.NEXT_PUBLIC_APP_URL);
    redirectUrl.searchParams.set("error", msg.includes("redirect_uri_mismatch") ? "redirect_uri_mismatch" : "gmail_connect_failed");
    redirectUrl.searchParams.set("gmailPrompted", "1");
    finalRedirectPath = redirectUrl.pathname + "?" + redirectUrl.searchParams.toString();
  }

  return redirect(finalRedirectPath);
}
