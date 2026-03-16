import { auth } from "@clerk/nextjs/server";
import { redirect, notFound } from "next/navigation";
import { getApplicationById } from "@/lib/services/application.service";
import { ApplicationDetailClient } from "@/components/application/ApplicationDetailClient";
import type { ApplicationStage, EmailType } from "@/types";

interface ApplicationDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function ApplicationDetailPage({ params }: ApplicationDetailPageProps) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const { id } = await params;
  const application = await getApplicationById(userId, id);

  if (!application) notFound();

  const events = application!.events.map((e) => ({
    id: e.id,
    stage: e.stage as ApplicationStage,
    emailType: e.emailType as EmailType,
    summary: e.summary,
    occurredAt: e.occurredAt.toISOString(),
    email: e.email
      ? {
          subject: e.email.subject,
          fromName: e.email.fromName,
          fromEmail: e.email.fromEmail,
          snippet: e.email.snippet,
        }
      : null,
  }));

  return (
    <ApplicationDetailClient
      application={application!}
      events={events}
    />
  );
}
