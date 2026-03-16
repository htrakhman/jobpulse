import { prisma } from "@/lib/prisma";
import type { ClassificationResult, ParsedEmail } from "@/types";

function normalizeCompany(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+(inc|llc|ltd|corp|corporation|co|company|technologies|tech|group|labs|studio|studios|ai|io)\.?$/i, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

function normalizeRole(role: string): string {
  return role.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
}

function isSimilar(a: string, b: string): boolean {
  const na = normalizeCompany(a);
  const nb = normalizeCompany(b);
  if (na === nb) return true;
  // Simple contains check for fuzzy match
  if (na.includes(nb) || nb.includes(na)) return true;
  return false;
}

export async function findExistingApplication(
  userId: string,
  email: ParsedEmail,
  classification: ClassificationResult
): Promise<string | null> {
  if (!classification.company) return null;

  // First: check if this thread already belongs to an application
  const threadMatch = await prisma.application.findFirst({
    where: {
      userId,
      threadIds: { has: email.threadId },
    },
    select: { id: true },
  });
  if (threadMatch) return threadMatch.id;

  // Second: find by company + role match
  const candidates = await prisma.application.findMany({
    where: {
      userId,
      company: { contains: normalizeCompany(classification.company), mode: "insensitive" },
    },
    select: { id: true, company: true, role: true, threadIds: true },
  });

  for (const candidate of candidates) {
    // Same company (fuzzy)
    if (!isSimilar(candidate.company, classification.company)) continue;

    // If both have roles, they must be similar
    if (candidate.role && classification.role) {
      if (normalizeRole(candidate.role) === normalizeRole(classification.role)) {
        return candidate.id;
      }
      // Different roles at same company = different applications
      continue;
    }

    // Same company, no role info — assume same application
    return candidate.id;
  }

  return null;
}
