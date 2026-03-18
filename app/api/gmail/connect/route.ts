import { auth, currentUser } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { getAuthUrl } from "@/lib/gmail/client";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.redirect(new URL("/sign-in", request.url));
    }

    if (!prisma) {
      return NextResponse.redirect(new URL("/dashboard?error=db_required", request.url));
    }

    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      return NextResponse.redirect(
        new URL("/dashboard?error=google_oauth_missing", request.url)
      );
    }

    const user = await currentUser();
    const { searchParams } = new URL(request.url);
    const auto = searchParams.get("auto") === "1";
    const returnTo = searchParams.get("returnTo") ?? "/dashboard";

    // Track first time we request Gmail access
    const userEmail = user?.emailAddresses[0]?.emailAddress ?? "";
    const existingById = await prisma.user.findUnique({ where: { id: userId } });
    if (existingById) {
      await prisma.user.update({
        where: { id: userId },
        data: {
          email: userEmail || existingById.email,
          gmailAccessRequestedAt: new Date(),
        },
      });
    } else {
      const existingByEmail = userEmail
        ? await prisma.user.findUnique({ where: { email: userEmail } })
        : null;
      if (existingByEmail) {
        await prisma.user.update({
          where: { id: existingByEmail.id },
          data: {
            email: userEmail || existingByEmail.email,
            gmailAccessRequestedAt: new Date(),
          },
        });
      } else {
        await prisma.user.create({
          data: { id: userId, email: userEmail, gmailAccessRequestedAt: new Date() },
        });
      }
    }

    const state = Buffer.from(
      JSON.stringify({ auto, returnTo })
    ).toString("base64url");

    const url = getAuthUrl({
      state,
      loginHint: user?.emailAddresses[0]?.emailAddress,
    });
    return NextResponse.redirect(url);
  } catch (err) {
    console.error("[gmail/connect] Error:", err);
    return NextResponse.redirect(new URL("/dashboard?error=gmail_connect_failed", request.url));
  }
}
