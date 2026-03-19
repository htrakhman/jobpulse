import type { ApplicationStage } from "@/types";

const COMPANY_STOP_WORDS = new Set([
  "inc",
  "llc",
  "ltd",
  "corp",
  "co",
  "company",
  "recruiting",
  "recruitment",
  "careers",
  "career",
  "jobs",
  "job",
  "team",
  "the",
]);

const STAGE_ORDER: ApplicationStage[] = [
  "Applied",
  "Waiting",
  "Scheduling",
  "Assessment",
  "Interviewing",
  "Offer",
  "Rejected",
  "Closed",
];

export function normalizeCompanyKey(company: string): string {
  return company
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ");
}

function canonicalCompanyTokens(company: string): string[] {
  return normalizeCompanyKey(company)
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length > 1 && !COMPANY_STOP_WORDS.has(token));
}

export function isSameCompanyName(a: string, b: string): boolean {
  const na = normalizeCompanyKey(a);
  const nb = normalizeCompanyKey(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if ((na.includes(nb) || nb.includes(na)) && Math.min(na.length, nb.length) >= 5) {
    return true;
  }
  const ta = canonicalCompanyTokens(a);
  const tb = canonicalCompanyTokens(b);
  if (ta.length === 0 || tb.length === 0) return false;
  const setB = new Set(tb);
  const intersection = ta.filter((token) => setB.has(token)).length;
  const union = new Set([...ta, ...tb]).size;
  const jaccard = union > 0 ? intersection / union : 0;
  return jaccard >= 0.75;
}

function stageRank(stage: ApplicationStage): number {
  return STAGE_ORDER.indexOf(stage);
}

export function dedupeByCompany<T extends { company: string; stage: ApplicationStage; lastActivityAt: Date }>(
  items: T[]
): T[] {
  const byCompany = new Map<string, T>();
  for (const item of items) {
    const existingEntry = [...byCompany.entries()].find(([, current]) =>
      isSameCompanyName(current.company, item.company)
    );
    const key = existingEntry?.[0] ?? normalizeCompanyKey(item.company);
    const existing = existingEntry?.[1] ?? byCompany.get(key);
    if (!existing) {
      byCompany.set(key, item);
      continue;
    }
    const existingTime = existing.lastActivityAt.getTime();
    const incomingTime = item.lastActivityAt.getTime();
    if (incomingTime > existingTime) {
      byCompany.set(key, item);
      continue;
    }
    if (incomingTime === existingTime && stageRank(item.stage) > stageRank(existing.stage)) {
      byCompany.set(key, item);
    }
  }
  return [...byCompany.values()];
}

