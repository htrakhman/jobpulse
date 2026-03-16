import type {
  EnrichmentProvider,
  PersonResult,
  EmailResult,
  LinkedInResult,
  ProviderSearchParams,
  ProviderEmailParams,
  ProviderLinkedInParams,
} from "../types";

// ZeroBounce is email verification only — used as the final step
export const zerobounceProvider: EnrichmentProvider = {
  name: "zerobounce",

  async searchPeople(_params: ProviderSearchParams): Promise<PersonResult[]> {
    return [];
  },

  async findEmail(_params: ProviderEmailParams): Promise<EmailResult | null> {
    // ZeroBounce verifies emails, it doesn't find them
    // Call verifyEmail() separately after another provider finds the email
    return null;
  },

  async findLinkedIn(_params: ProviderLinkedInParams): Promise<LinkedInResult | null> {
    return null;
  },
};

export async function verifyEmailZeroBounce(email: string): Promise<{
  valid: boolean;
  status: string;
  subStatus: string;
} | null> {
  if (!process.env.ZEROBOUNCE_API_KEY) return null;

  try {
    const qs = new URLSearchParams({
      api_key: process.env.ZEROBOUNCE_API_KEY,
      email,
    });

    const res = await fetch(`https://api.zerobounce.net/v2/validate?${qs}`);
    if (!res.ok) return null;

    const data = await res.json() as {
      status?: string;
      sub_status?: string;
    };

    return {
      valid: data.status === "valid",
      status: data.status ?? "unknown",
      subStatus: data.sub_status ?? "",
    };
  } catch {
    return null;
  }
}
