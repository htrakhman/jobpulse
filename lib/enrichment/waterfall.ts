import { requirePrisma } from "@/lib/prisma";
import type { WaterfallStep, WaterfallResult, PersonResult, ProviderName } from "./types";
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

export async function searchPeopleAtCompany(
  company: string,
  titleKeywords: string[],
  maxResults: number = 10,
  onProgress?: WaterfallProgressCallback
): Promise<PersonResult[]> {
  const domain = await resolveCompanyDomain(company);
  const allResults: PersonResult[] = [];
  const seen = new Set<string>();

  for (const providerName of SEARCH_WATERFALL) {
    const provider = PROVIDERS[providerName];
    if (!provider) continue;

    const start = Date.now();
    try {
      const results = await provider.searchPeople({
        company,
        companyDomain: domain ?? undefined,
        titleKeywords,
        maxResults,
      });

      const responseMs = Date.now() - start;

      if (results.length > 0) {
        // Deduplicate by name + email
        for (const r of results) {
          const key = `${r.fullName?.toLowerCase()}-${r.email ?? r.linkedinUrl ?? ""}`;
          if (!seen.has(key)) {
            seen.add(key);
            allResults.push(r);
          }
        }

        onProgress?.({
          provider: providerName,
          field: "search",
          status: "hit",
          responseMs,
          result: `${results.length} people found`,
        });

        // Stop once we have enough results
        if (allResults.length >= maxResults) break;
      } else {
        onProgress?.({
          provider: providerName,
          field: "search",
          status: "miss",
          responseMs,
        });
      }
    } catch (err) {
      onProgress?.({
        provider: providerName,
        field: "search",
        status: "error",
        responseMs: Date.now() - start,
        error: String(err),
      });
    }
  }

  return allResults.slice(0, maxResults);
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
