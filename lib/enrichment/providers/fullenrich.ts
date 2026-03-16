import type {
  EnrichmentProvider,
  PersonResult,
  EmailResult,
  LinkedInResult,
  ProviderSearchParams,
  ProviderEmailParams,
  ProviderLinkedInParams,
} from "../types";

const BASE = "https://api.fullenrich.com/v1";

function headers() {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${process.env.FULLENRICH_API_KEY ?? ""}`,
  };
}

// FullEnrich is a waterfall aggregator itself — best for email lookups
export const fullenrichProvider: EnrichmentProvider = {
  name: "fullenrich",

  async searchPeople(_params: ProviderSearchParams): Promise<PersonResult[]> {
    // FullEnrich focuses on enrichment, not search
    return [];
  },

  async findEmail(params: ProviderEmailParams): Promise<EmailResult | null> {
    if (!process.env.FULLENRICH_API_KEY) return null;

    try {
      const body: Record<string, string> = {
        first_name: params.firstName,
        last_name: params.lastName,
        company_domain: params.domain,
      };
      if (params.linkedinUrl) body.linkedin_url = params.linkedinUrl;

      const res = await fetch(`${BASE}/enrich/person`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify(body),
      });

      if (!res.ok) return null;
      const data = await res.json() as {
        email?: string;
        email_confidence?: number;
        email_verified?: boolean;
      };

      if (!data.email) return null;

      return {
        email: data.email,
        verified: data.email_verified ?? false,
        confidence: (data.email_confidence ?? 0) * 100,
        source: "fullenrich",
      };
    } catch {
      return null;
    }
  },

  async findLinkedIn(params: ProviderLinkedInParams): Promise<LinkedInResult | null> {
    if (!process.env.FULLENRICH_API_KEY) return null;

    try {
      const res = await fetch(`${BASE}/enrich/person`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({
          first_name: params.firstName,
          last_name: params.lastName,
          company_name: params.company,
        }),
      });

      if (!res.ok) return null;
      const data = await res.json() as { linkedin_url?: string };
      if (!data.linkedin_url) return null;

      return { linkedinUrl: data.linkedin_url, source: "fullenrich" };
    } catch {
      return null;
    }
  },
};
