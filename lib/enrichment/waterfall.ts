import { requirePrisma } from "@/lib/prisma";
import type {
  WaterfallStep,
  WaterfallResult,
  PersonResult,
  ProviderName,
  PeopleSearchOptions,
  PeopleSearchResponse,
  ProviderSearchDiagnostic,
  RankedPersonResult,
} from "./types";
import { apolloProvider } from "./providers/apollo";
import { hunterProvider } from "./providers/hunter";
import { pdlProvider } from "./providers/pdl";
import { proxycurlProvider } from "./providers/proxycurl";
import { lushaProvider } from "./providers/lusha";
import { contactoutProvider } from "./providers/contactout";
import { fullenrichProvider } from "./providers/fullenrich";
import { snovioProvider } from "./providers/snovio";
import { icypeasProvider } from "./providers/icypeas";
import { leadmagicProvider } from "./providers/leadmagic";
import { zerobounceProvider, verifyEmailZeroBounce } from "./providers/zerobounce";
import { resolveCompanyDomain } from "./company";

// Order matters: best coverage first, cheapest last
const EMAIL_WATERFALL: ProviderName[] = [
  "apollo",
  "hunter",
  "pdl",
  "proxycurl",  // only works if we have linkedinUrl
  "lusha",
  "fullenrich",
  "contactout",
  "snovio",
  "icypeas",
  "leadmagic",
];

const LINKEDIN_WATERFALL: ProviderName[] = [
  "proxycurl",
  "apollo",
  "pdl",
  "fullenrich",
];

const SEARCH_WATERFALL: ProviderName[] = [
  "apollo",
  "pdl",
  "hunter",
  "proxycurl",
  "lusha",
  "snovio",
];

const PROVIDERS: Record<string, import("./types").EnrichmentProvider> = {
  apollo: apolloProvider,
  hunter: hunterProvider,
  pdl: pdlProvider,
  proxycurl: proxycurlProvider,
  lusha: lushaProvider,
  contactout: contactoutProvider,
  fullenrich: fullenrichProvider,
  snovio: snovioProvider,
  icypeas: icypeasProvider,
  leadmagic: leadmagicProvider,
  zerobounce: zerobounceProvider,
  mixrank: apolloProvider, // placeholder
};

export type WaterfallProgressCallback = (step: WaterfallStep) => void;

const PROVIDER_ENV_CHECKS: Record<ProviderName, () => boolean> = {
  apollo: () => !!process.env.APOLLO_API_KEY,
  hunter: () => !!process.env.HUNTER_API_KEY,
  pdl: () => !!process.env.PDL_API_KEY,
  proxycurl: () => !!process.env.PROXYCURL_API_KEY,
  lusha: () => !!process.env.LUSHA_API_KEY,
  contactout: () => !!process.env.CONTACTOUT_API_KEY,
  fullenrich: () => !!process.env.FULLENRICH_API_KEY,
  snovio: () => !!process.env.SNOVIO_API_KEY,
  zerobounce: () => !!process.env.ZEROBOUNCE_API_KEY,
  mixrank: () => !!process.env.APOLLO_API_KEY,
  icypeas: () => !!process.env.ICYPEAS_API_KEY,
  leadmagic: () => !!process.env.LEADMAGIC_API_KEY,
};

function normalizeText(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function containsAny(haystack: string, needles: string[]): boolean {
  if (needles.length === 0) return true;
  return needles.some((needle) => haystack.includes(normalizeText(needle)));
}

function containsNone(haystack: string, needles: string[]): boolean {
  if (needles.length === 0) return true;
  return needles.every((needle) => !haystack.includes(normalizeText(needle)));
}

function scorePersonMatch(person: PersonResult, opts: PeopleSearchOptions): { score: number; matchedSignals: string[] } {
  const includeTitles = opts.includeTitles ?? [];
  const includeKeywords = opts.includeKeywords ?? [];
  const matchText = normalizeText(
    [person.fullName, person.title, person.department, person.seniority, person.company, person.companyDomain]
      .filter(Boolean)
      .join(" ")
  );
  const titleText = normalizeText(person.title);

  let score = 0;
  const matchedSignals: string[] = [];

  if (person.linkedinUrl) {
    score += 25;
    matchedSignals.push("has_linkedin");
  }
  if (person.email) {
    score += person.emailVerified ? 20 : 12;
    matchedSignals.push(person.emailVerified ? "verified_email" : "email_found");
  }
  if (normalizeText(person.company) === normalizeText(opts.company)) {
    score += 20;
    matchedSignals.push("company_exact");
  }
  if (includeTitles.length > 0 && containsAny(titleText, includeTitles)) {
    score += 30;
    matchedSignals.push("title_match");
  }
  if (includeKeywords.length > 0 && containsAny(matchText, includeKeywords)) {
    score += 12;
    matchedSignals.push("keyword_match");
  }
  if (opts.department && normalizeText(person.department).includes(normalizeText(opts.department))) {
    score += 8;
    matchedSignals.push("department_match");
  }
  if (opts.seniority && normalizeText(person.seniority).includes(normalizeText(opts.seniority))) {
    score += 8;
    matchedSignals.push("seniority_match");
  }
  if (opts.location && normalizeText(matchText).includes(normalizeText(opts.location))) {
    score += 5;
    matchedSignals.push("location_match");
  }

  return { score, matchedSignals };
}

function passesFilters(person: PersonResult, opts: PeopleSearchOptions): boolean {
  const text = normalizeText(
    [person.fullName, person.title, person.department, person.seniority, person.company, person.companyDomain]
      .filter(Boolean)
      .join(" ")
  );
  const titleText = normalizeText(person.title);
  const includeTitles = opts.includeTitles ?? [];
  const excludeTitles = opts.excludeTitles ?? [];
  const includeKeywords = opts.includeKeywords ?? [];
  const excludeKeywords = opts.excludeKeywords ?? [];

  if (includeTitles.length > 0 && !containsAny(titleText, includeTitles)) return false;
  if (!containsNone(titleText, excludeTitles)) return false;
  if (includeKeywords.length > 0 && !containsAny(text, includeKeywords)) return false;
  if (!containsNone(text, excludeKeywords)) return false;
  if (opts.department && !normalizeText(person.department).includes(normalizeText(opts.department))) return false;
  if (opts.seniority && !normalizeText(person.seniority).includes(normalizeText(opts.seniority))) return false;
  if (opts.location && !text.includes(normalizeText(opts.location))) return false;
  return true;
}

function dedupeKey(person: PersonResult): string {
  const name = normalizeText(person.fullName);
  const email = normalizeText(person.email);
  const linkedin = normalizeText(person.linkedinUrl);
  const company = normalizeText(person.company);
  return `${name}|${email}|${linkedin}|${company}`;
}

function sortRanked(
  people: RankedPersonResult[],
  sortMode: PeopleSearchOptions["sortMode"]
): RankedPersonResult[] {
  const sorted = [...people];
  const mode = sortMode ?? "relevance";
  if (mode === "name_asc") return sorted.sort((a, b) => normalizeText(a.fullName).localeCompare(normalizeText(b.fullName)));
  if (mode === "name_desc") return sorted.sort((a, b) => normalizeText(b.fullName).localeCompare(normalizeText(a.fullName)));
  if (mode === "title_asc") return sorted.sort((a, b) => normalizeText(a.title).localeCompare(normalizeText(b.title)));
  if (mode === "title_desc") return sorted.sort((a, b) => normalizeText(b.title).localeCompare(normalizeText(a.title)));
  return sorted.sort((a, b) => b.score - a.score);
}

export async function searchPeopleAtCompanyWorkspace(
  options: PeopleSearchOptions,
  onProgress?: WaterfallProgressCallback
): Promise<PeopleSearchResponse> {
  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.min(100, Math.max(5, options.pageSize ?? 25));
  const maxResults = Math.min(300, Math.max(pageSize, options.maxResults ?? 80));
  const domain = options.companyDomain ?? (await resolveCompanyDomain(options.company)) ?? undefined;
  const diagnostics: ProviderSearchDiagnostic[] = [];
  const rankedMap = new Map<string, RankedPersonResult>();

  for (const providerName of SEARCH_WATERFALL) {
    const provider = PROVIDERS[providerName];
    if (!provider) continue;
    const available = PROVIDER_ENV_CHECKS[providerName]?.() ?? true;
    if (!available) {
      diagnostics.push({
        provider: providerName,
        available,
        attempted: false,
        status: "skipped",
        resultCount: 0,
      });
      continue;
    }

    const start = Date.now();
    try {
      const results = await provider.searchPeople({
        company: options.company,
        companyDomain: domain,
        titleKeywords: options.includeTitles,
        department: options.department,
        maxResults,
      });
      const responseMs = Date.now() - start;
      let acceptedCount = 0;

      for (const person of results) {
        if (!passesFilters(person, options)) continue;
        acceptedCount++;
        const key = dedupeKey(person);
        const scored = scorePersonMatch(person, options);
        const existing = rankedMap.get(key);
        if (existing) {
          existing.score = Math.max(existing.score, scored.score);
          existing.matchedSignals = [...new Set([...existing.matchedSignals, ...scored.matchedSignals])];
          existing.sources = [...new Set([...existing.sources, providerName])];
        } else {
          rankedMap.set(key, {
            ...person,
            score: scored.score,
            matchedSignals: scored.matchedSignals,
            sources: [providerName],
          });
        }
      }

      diagnostics.push({
        provider: providerName,
        available,
        attempted: true,
        status: acceptedCount > 0 ? "hit" : "miss",
        resultCount: acceptedCount,
        responseMs,
      });

      onProgress?.({
        provider: providerName,
        field: "search",
        status: acceptedCount > 0 ? "hit" : "miss",
        responseMs,
        result: acceptedCount > 0 ? `${acceptedCount} matched people` : undefined,
      });
    } catch (err) {
      const responseMs = Date.now() - start;
      diagnostics.push({
        provider: providerName,
        available,
        attempted: true,
        status: "error",
        resultCount: 0,
        responseMs,
        error: String(err),
      });
      onProgress?.({
        provider: providerName,
        field: "search",
        status: "error",
        responseMs,
        error: String(err),
      });
    }
  }

  const all = sortRanked([...rankedMap.values()], options.sortMode);
  const total = all.length;
  const startIdx = (page - 1) * pageSize;
  const results = all.slice(startIdx, startIdx + pageSize);

  return {
    results,
    total,
    page,
    pageSize,
    providerDiagnostics: diagnostics,
  };
}

export async function searchPeopleAtCompany(
  company: string,
  titleKeywords: string[],
  maxResults: number = 10,
  onProgress?: WaterfallProgressCallback
): Promise<PersonResult[]> {
  const response = await searchPeopleAtCompanyWorkspace(
    {
      company,
      includeTitles: titleKeywords,
      maxResults,
      page: 1,
      pageSize: maxResults,
      sortMode: "relevance",
    },
    onProgress
  );
  return response.results.slice(0, maxResults);
}

export async function runEnrichmentWaterfall(
  contactId: string,
  onProgress?: WaterfallProgressCallback
): Promise<WaterfallResult> {
  const prisma = requirePrisma();
  const contact = await prisma.enrichedContact.findUnique({
    where: { id: contactId },
  });

  if (!contact) throw new Error("Contact not found");

  const steps: WaterfallStep[] = [];
  let email: string | null = contact.email;
  let emailVerified = contact.emailVerified;
  let linkedinUrl: string | null = contact.linkedinUrl;

  const domain = contact.companyDomain ?? (await resolveCompanyDomain(contact.company));

  const firstName = contact.firstName ?? contact.fullName?.split(" ")[0] ?? "";
  const lastName = contact.lastName ?? contact.fullName?.split(" ").slice(1).join(" ") ?? "";

  // ── LinkedIn waterfall ────────────────────────────────────────────────────
  if (!linkedinUrl) {
    for (const providerName of LINKEDIN_WATERFALL) {
      const provider = PROVIDERS[providerName];
      if (!provider) continue;

      const start = Date.now();
      try {
        const result = await provider.findLinkedIn({
          firstName,
          lastName,
          company: contact.company,
        });

        const responseMs = Date.now() - start;

        await prisma.enrichmentAttempt.create({
          data: {
            contactId,
            provider: providerName as never,
            field: "linkedin",
            status: result ? "hit" : "miss",
            responseMs,
          },
        });

        if (result) {
          linkedinUrl = result.linkedinUrl;
          const step: WaterfallStep = {
            provider: providerName,
            field: "linkedin",
            status: "hit",
            responseMs,
            result: result.linkedinUrl,
          };
          steps.push(step);
          onProgress?.(step);
          break;
        } else {
          const step: WaterfallStep = { provider: providerName, field: "linkedin", status: "miss", responseMs };
          steps.push(step);
          onProgress?.(step);
        }
      } catch (err) {
        const step: WaterfallStep = {
          provider: providerName,
          field: "linkedin",
          status: "error",
          responseMs: Date.now() - start,
          error: String(err),
        };
        steps.push(step);
        onProgress?.(step);
      }
    }
  }

  // ── Email waterfall ──────────────────────────────────────────────────────
  if (!email && domain) {
    for (const providerName of EMAIL_WATERFALL) {
      const provider = PROVIDERS[providerName];
      if (!provider) continue;

      const start = Date.now();
      try {
        const result = await provider.findEmail({
          firstName,
          lastName,
          domain,
          linkedinUrl: linkedinUrl ?? undefined,
        });

        const responseMs = Date.now() - start;

        await prisma.enrichmentAttempt.create({
          data: {
            contactId,
            provider: providerName as never,
            field: "email",
            status: result ? "hit" : "miss",
            responseMs,
          },
        });

        if (result) {
          email = result.email;
          emailVerified = result.verified;
          const step: WaterfallStep = {
            provider: providerName,
            field: "email",
            status: "hit",
            responseMs,
            result: result.email,
          };
          steps.push(step);
          onProgress?.(step);
          break;
        } else {
          const step: WaterfallStep = { provider: providerName, field: "email", status: "miss", responseMs };
          steps.push(step);
          onProgress?.(step);
        }
      } catch (err) {
        const step: WaterfallStep = {
          provider: providerName,
          field: "email",
          status: "error",
          responseMs: Date.now() - start,
          error: String(err),
        };
        steps.push(step);
        onProgress?.(step);
      }
    }
  }

  // ── ZeroBounce verification ──────────────────────────────────────────────
  if (email && !emailVerified) {
    const verification = await verifyEmailZeroBounce(email);
    if (verification) {
      emailVerified = verification.valid;
    }
  }

  // ── Persist results ──────────────────────────────────────────────────────
  const status = email && linkedinUrl
    ? "enriched"
    : email || linkedinUrl
    ? "partial"
    : "not_found";

  await prisma.enrichedContact.update({
    where: { id: contactId },
    data: {
      email: email ?? undefined,
      emailVerified,
      emailSource: email ? (steps.find((s) => s.field === "email" && s.status === "hit")?.provider as never) : undefined,
      linkedinUrl: linkedinUrl ?? undefined,
      linkedinSource: linkedinUrl ? (steps.find((s) => s.field === "linkedin" && s.status === "hit")?.provider as never) : undefined,
      companyDomain: domain ?? undefined,
      enrichmentStatus: status as never,
      enrichedAt: new Date(),
    },
  });

  const partialContact = {
    firstName: contact.firstName ?? undefined,
    lastName: contact.lastName ?? undefined,
    fullName: contact.fullName ?? undefined,
    title: contact.title ?? undefined,
    email: email ?? undefined,
    linkedinUrl: linkedinUrl ?? undefined,
    company: contact.company,
    companyDomain: domain ?? undefined,
  };

  return {
    contact: partialContact,
    steps,
    emailFound: !!email,
    linkedinFound: !!linkedinUrl,
  };
}
