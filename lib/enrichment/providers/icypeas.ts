import type {
  EnrichmentProvider,
  PersonResult,
  EmailResult,
  LinkedInResult,
  ProviderSearchParams,
  ProviderEmailParams,
  ProviderLinkedInParams,
} from "../types";

const BASE = "https://app.icypeas.com/api";

function headers() {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${process.env.ICYPEAS_API_KEY ?? ""}`,
  };
}

export const icypeasProvider: EnrichmentProvider = {
  name: "icypeas",

  async searchPeople(_params: ProviderSearchParams): Promise<PersonResult[]> {
    return [];
  },

  async findEmail(params: ProviderEmailParams): Promise<EmailResult | null> {
    if (!process.env.ICYPEAS_API_KEY) return null;

    try {
      const res = await fetch(`${BASE}/email-search`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({
          firstname: params.firstName,
          lastname: params.lastName,
          domainOrCompany: params.domain,
        }),
      });

      if (!res.ok) return null;
      const data = await res.json() as {
        item?: { emails?: Array<{ email?: string; score?: number }> };
      };
      const found = data.item?.emails?.[0];
      if (!found?.email) return null;

      return {
        email: found.email,
        verified: (found.score ?? 0) > 70,
        confidence: found.score ?? 60,
        source: "icypeas",
      };
    } catch {
      return null;
    }
  },

  async findLinkedIn(_params: ProviderLinkedInParams): Promise<LinkedInResult | null> {
    return null;
  },
};
