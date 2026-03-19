import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { getApplicationsForUser, getDashboardStats } from "@/lib/services/application.service";
import type { ApplicationStage } from "@/types";

const VALID_STAGES: ApplicationStage[] = [
  "Applied",
  "Waiting",
  "Scheduling",
  "Interviewing",
  "Assessment",
  "Offer",
  "Rejected",
  "Closed",
];

export async function GET(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const stageParam = searchParams.get("stage");
  const includeStats = searchParams.get("stats") === "true";

  const stage =
    stageParam && VALID_STAGES.includes(stageParam as ApplicationStage)
      ? (stageParam as ApplicationStage)
      : undefined;

  const [applications, stats] = await Promise.all([
    getApplicationsForUser(userId, stage ? { stage } : undefined),
    includeStats ? getDashboardStats(userId) : null,
  ]);

  const applicationRows = applications.map((app) => {
    const primaryContact = app.contacts[0];
    return {
      ...app,
      contactSummary: primaryContact
        ? {
            contactPerson: primaryContact.fullName,
            inferredPosition: primaryContact.inferredTitle,
            additionalEmails: primaryContact.emails
              .filter((email) => !email.isPrimary)
              .map((email) => email.email)
              .slice(0, 3),
            webProfileUrl: primaryContact.webProfileUrl,
            confidence: primaryContact.confidence,
          }
        : null,
    };
  });

  return NextResponse.json({ applications: applicationRows, stats });
}
