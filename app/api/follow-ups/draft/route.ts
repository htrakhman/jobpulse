import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { requirePrisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const prisma = requirePrisma();
  const body = await request.json();
  const suggestionId = body.suggestionId as string | undefined;
  if (!suggestionId) {
    return NextResponse.json({ error: "Missing suggestionId" }, { status: 400 });
  }
  const suggestion = await prisma.followUpSuggestion.findFirst({
    where: { id: suggestionId, userId, dismissed: false, completed: false },
    include: { application: true },
  });
  if (!suggestion) {
    return NextResponse.json({ error: "Suggestion not found" }, { status: 404 });
  }

  const draft = `Hi ${suggestion.application.company} team,\n\nFollowing up on my application${suggestion.application.role ? ` for ${suggestion.application.role}` : ""}. I remain very interested and would appreciate any update on timeline and next steps.\n\nThank you,\n`;
  return NextResponse.json({
    subject: `Follow-up on application${suggestion.application.role ? ` - ${suggestion.application.role}` : ""}`,
    body: draft,
    placeholder: true,
  });
}

