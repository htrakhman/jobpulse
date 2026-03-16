import type {
  EnrichmentProvider,
  PersonResult,
  EmailResult,
  LinkedInResult,
  ProviderSearchParams,
  ProviderEmailParams,
  ProviderLinkedInParams,
} from "../types";

const BASE = "https://api.leadmagic.io";

function headers() {
  return {
    "Content-Type": "application/json",
    "X-LEAD-MAGIC-API-KEY": process.env.LEADMAGIC_API_KEY ?? "",
  };
}

export const leadmagicProvider: EnrichmentProvider = {
  name: "leadmagic",

  async searchPeople(_params: ProviderSearchParams): Promise<PersonResult[]> {
    return [];
  },

  async findEmail(params: ProviderEmailParams): Promise<EmailResult | null> {
    if (!process.env.LEADMAGIC_API_KEY || !params.linkedinUrl) return null;

    try {
      const res = await fetch(`${BASE}/profile-finder`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ linkedin_url: params.linkedinUrl }),
      });

      if (!res.ok) return null;
      const data = await res.json() as {
        work_email?: string;
        email_status?: string;
      };
      if (!data.work_email) return null;

      return {
        email: data.work_email,
        verified: data.email_status === "valid",
        confidence: data.email_status === "valid" ? 90 : 60,
        source: "leadmagic",
      };
    } catch {
      return null;
    }
  },

  async findLinkedIn(_params: ProviderLinkedInParams): Promise<LinkedInResult | null> {
    return null;
  },
};
