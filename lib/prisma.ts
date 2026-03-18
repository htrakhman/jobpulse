import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | null | undefined;
};

function createPrismaClient(): PrismaClient | null {
  let url = process.env.DATABASE_URL?.trim();
  if (!url) return null;
  try {
    // Use explicit sslmode=verify-full to silence pg SSL warning (prefer/require/verify-ca will change in pg v9)
    url = url.replace(/([?&])sslmode=(require|prefer|verify-ca)(&|$)/g, "$1sslmode=verify-full$3").replace(/([?&])channel_binding=require(&|$)/g, "$1channel_binding=prefer$2");
    const adapter = new PrismaPg({ connectionString: url });
    return new PrismaClient({
      adapter,
      log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    });
  } catch {
    return null;
  }
}

function getPrisma(): PrismaClient | null {
  if (globalForPrisma.prisma !== undefined) return globalForPrisma.prisma;
  const client = createPrismaClient();
  if (process.env.NODE_ENV !== "production" && client) globalForPrisma.prisma = client;
  else globalForPrisma.prisma = client;
  return client;
}

export const prisma = getPrisma();

/** Use when you need a guaranteed client - throws if DB not configured */
export function requirePrisma(): PrismaClient {
  if (!prisma) throw new Error("Database not configured. Set DATABASE_URL in .env.local");
  return prisma;
}
