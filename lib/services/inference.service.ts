import { requirePrisma } from "@/lib/prisma";

export interface InferenceResult {
  source: string;
  method: string;
  inferredPosition: string | null;
  confidence: number;
  signals: string[];
  webSearchUrl: string | null;
}

const cache = new Map<string, { result: InferenceResult; expiresAt: number }>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function inferSourceAndMethod(text: string): { source: string; method: string; confidence: number; signals: string[] } {
  const lower = text.toLowerCase();
  const signals: string[] = [];
  let source = "unknown";
  let method = "unknown";
  let confidence = 0.3;
  if (lower.includes("linkedin")) {
    source = "linkedin";
    confidence += 0.25;
    signals.push("linkedin keyword");
  }
  if (lower.includes("indeed")) {
    source = "indeed";
    confidence += 0.25;
    signals.push("indeed keyword");
  }
  if (lower.includes("referral")) {
    source = "referral";
    method = "referral";
    confidence += 0.3;
    signals.push("referral keyword");
  }
  if (lower.includes("recruiter") || lower.includes("talent acquisition")) {
    method = "recruiter_inbound";
    confidence += 0.2;
    signals.push("recruiter wording");
  }
  if (method === "unknown" && (lower.includes("applied") || lower.includes("application"))) {
    method = "cold_apply";
    confidence += 0.15;
    signals.push("application confirmation wording");
  }
  return { source, method, confidence: Math.min(0.95, confidence), signals };
}

function inferPositionFromContact(name: string | null, title: string | null): string | null {
  if (title && title.length >= 3) return title;
  if (!name) return null;
  return null;
}

export async function inferApplicationMetadata(userId: string, applicationId: string): Promise<InferenceResult> {
  const cacheKey = `${userId}:${applicationId}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.result;

  const prisma = requirePrisma();
  const application = await prisma.application.findFirst({
    where: { id: applicationId, userId },
    include: {
      emails: {
        orderBy: { receivedAt: "desc" },
        take: 20,
      },
      contacts: {
        orderBy: [{ confidence: "desc" }, { updatedAt: "desc" }],
        take: 1,
      },
    },
  });
  if (!application) {
    return {
      source: "unknown",
      method: "unknown",
      inferredPosition: null,
      confidence: 0,
      signals: [],
      webSearchUrl: null,
    };
  }

  const aggregateText = [
    application.company,
    application.role ?? "",
    ...application.emails.map((m) => `${m.subject ?? ""} ${m.snippet ?? ""}`),
  ].join(" ");
  const inferred = inferSourceAndMethod(aggregateText);
  const primaryContact = application.contacts[0];
  const inferredPosition = inferPositionFromContact(
    primaryContact?.fullName ?? null,
    primaryContact?.inferredTitle ?? null
  );
  const webSearchUrl = primaryContact?.fullName
    ? `https://www.google.com/search?q=${encodeURIComponent(`${primaryContact.fullName} ${application.company} linkedin`)}` 
    : null;

  const result: InferenceResult = {
    source: inferred.source,
    method: inferred.method,
    inferredPosition,
    confidence: inferred.confidence,
    signals: inferred.signals,
    webSearchUrl,
  };
  cache.set(cacheKey, { result, expiresAt: Date.now() + CACHE_TTL_MS });
  return result;
}

export async function applyInferenceToApplication(userId: string, applicationId: string): Promise<InferenceResult> {
  const prisma = requirePrisma();
  const inferred = await inferApplicationMetadata(userId, applicationId);
  await prisma.application.updateMany({
    where: { id: applicationId, userId },
    data: {
      source: inferred.source as never,
      method: inferred.method as never,
    },
  });
  return inferred;
}

