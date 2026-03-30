import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { requirePrisma } from "@/lib/prisma";
import ApplicationsClient from "@/components/agent/ApplicationsClient";

export default async function ApplicationsPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const prisma = requirePrisma();
  const clerkUser = await currentUser();
  const clerkEmail = clerkUser?.emailAddresses[0]?.emailAddress ?? "";

  let ownerUserId = userId;
  const userById = await prisma.user.findUnique({ where: { id: userId } });
  if (!userById && clerkEmail) {
    const userByEmail = await prisma.user.findUnique({ where: { email: clerkEmail } });
    if (userByEmail) ownerUserId = userByEmail.id;
  }

  const applications = await prisma.application.findMany({
    where: { userId: ownerUserId },
    include: {
      agentRuns: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { id: true, status: true, emailsDrafted: true, emailsSent: true, contactsFound: true, createdAt: true },
      },
      outreachMessages: {
        where: { status: { in: ["draft", "sent"] } },
        select: { id: true, status: true },
      },
    },
    orderBy: { lastActivityAt: "desc" },
    take: 100,
  });

  return <ApplicationsClient applications={JSON.parse(JSON.stringify(applications))} />;
}
