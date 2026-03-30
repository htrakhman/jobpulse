import { currentUser } from "@clerk/nextjs/server";
import { requirePrisma } from "@/lib/prisma";

type PrismaClient = ReturnType<typeof requirePrisma>;

/**
 * Clerk session userId may not equal Prisma `User.id` (e.g. data stored under an older row
 * matched by email). Returns the `User.id` that owns applications / Gmail for this session.
 */
export async function resolveOwnerUserId(prisma: PrismaClient, clerkUserId: string): Promise<string> {
  const userById = await prisma.user.findUnique({ where: { id: clerkUserId }, select: { id: true } });
  if (userById) return clerkUserId;

  const clerkUser = await currentUser();
  const email = clerkUser?.emailAddresses[0]?.emailAddress ?? "";
  if (!email) return clerkUserId;

  const userByEmail = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  return userByEmail?.id ?? clerkUserId;
}
