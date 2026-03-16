import type {
  EnrichmentProvider,
  PersonResult,
  EmailResult,
  LinkedInResult,
  ProviderSearchParams,
  ProviderEmailParams,
} from "../types";

const BASE = "https://api.hunter.io/v2";

function params(extra: Record<string, string> = {}) {
  return new URLSearchParams({ api_key: process.env.HUNTER_API_KEY ?? "", ...extra });
}

export const hunterProvider: EnrichmentProvider = {
  name: "hunter",

  async searchPeople(searchParams: ProviderSearchParams): Promise<PersonResult[]> {
    if (!process.env.HUNTER_API_KEY) return [];
    if (!searchParams.companyDomain) return [];

    try {
      const url = `${BASE}/domain-search?${params({
        domain: searchParams.companyDomain,
        limit: String(searchParams.maxResults ?? 10),
        ...(searchParams.department ? { department: searchParams.department } : {}),
      })}`;

      const res = await fetch(url);
      if (!res.ok) return [];
      const data = await res.json() as {
        data?: {
          emails?: Array<{
            first_name: string;
            last_name: string;
            value: string;
            position: string;
            department: string;
            confidence: number;
            linkedin: string;
            twitter: string;
          }>;
          organization?: string;
          domain?: string;
        };
      };

      return (data.data?.emails ?? []).map((e) => ({
        firstName: e.first_name ?? null,
        lastName: e.last_name ?? null,
        fullName: e.first_name && e.last_name ? `${e.first_name} ${e.last_name}` : null,
        title: e.position ?? null,
        department: e.department ?? null,
        seniority: null,
        email: e.value,
        emailVerified: (e.confidence ?? 0) > 70,
        linkedinUrl: e.linkedin ?? null,
        twitterHandle: e.twitter ?? null,
        phone: null,
        company: data.data?.organization ?? searchParams.company,
        companyDomain: data.data?.domain ?? searchParams.companyDomain ?? null,
        companyLinkedinUrl: null,
        source: "hunter",
      }));
    } catch {
      return [];
    }
  },

  async findEmail(emailParams: ProviderEmailParams): Promise<EmailResult | null> {
    if (!process.env.HUNTER_API_KEY) return null;

    try {
      const url = `${BASE}/email-finder?${params({
        domain: emailParams.domain,
        first_name: emailParams.firstName,
        last_name: emailParams.lastName,
      })}`;

      const res = await fetch(url);
      if (!res.ok) return null;
      const data = await res.json() as {
        data?: { email?: string; score?: number };
      };
      if (!data.data?.email) return null;

      return {
        email: data.data.email,
        verified: (data.data.score ?? 0) > 70,
        confidence: data.data.score ?? 50,
        source: "hunter",
      };
    } catch {
      return null;
    }
  },

  async findLinkedIn(): Promise<LinkedInResult | null> {
    // Hunter doesn't support LinkedIn lookup
    return null;
  },
};
