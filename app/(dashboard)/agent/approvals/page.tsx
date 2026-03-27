import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { requirePrisma } from "@/lib/prisma";
import ApprovalsClient from "@/components/agent/ApprovalsClient";

export default async function ApprovalsPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const prisma = requirePrisma();

  const drafts = await prisma.outreachMessage.findMany({
    where: { userId, status: "draft" },
    include: {
      contact: {
        select: {
          id: true,
          fullName: true,
          title: true,
          email: true,
          linkedinUrl: true,
          company: true,
        },
      },
      application: {
        select: { id: true, company: true, role: true },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return <ApprovalsClient drafts={JSON.parse(JSON.stringify(drafts))} />;
}
