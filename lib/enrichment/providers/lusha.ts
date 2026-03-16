import type {
  EnrichmentProvider,
  PersonResult,
  EmailResult,
  LinkedInResult,
  ProviderSearchParams,
  ProviderEmailParams,
  ProviderLinkedInParams,
} from "../types";

const BASE = "https://api.lusha.com/v2";

function headers() {
  return {
    "Content-Type": "application/json",
    api_key: process.env.LUSHA_API_KEY ?? "",
  };
}

export const lushaProvider: EnrichmentProvider = {
  name: "lusha",

  async searchPeople(params: ProviderSearchParams): Promise<PersonResult[]> {
    if (!process.env.LUSHA_API_KEY) return [];

    try {
      const res = await fetch(`${BASE}/people/search`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({
          company: { name: params.company },
          ...(params.titleKeywords?.length
            ? { jobTitle: params.titleKeywords.join(" OR ") }
            : {}),
          limit: params.maxResults ?? 10,
        }),
      });

      if (!res.ok) return [];
      const data = await res.json() as {
        data?: Array<{
          firstName?: string;
          lastName?: string;
          jobTitle?: string;
          company?: { name?: string; website?: string };
          emailAddress?: string;
          linkedInUrl?: string;
        }>;
      };

      return (data.data ?? []).map((p) => ({
        firstName: p.firstName ?? null,
        lastName: p.lastName ?? null,
        fullName: p.firstName && p.lastName ? `${p.firstName} ${p.lastName}` : null,
        title: p.jobTitle ?? null,
        department: null,
        seniority: null,
        email: p.emailAddress ?? null,
        emailVerified: !!p.emailAddress,
        linkedinUrl: p.linkedInUrl ?? null,
        twitterHandle: null,
        phone: null,
        company: p.company?.name ?? params.company,
        companyDomain: p.company?.website ?? null,
        companyLinkedinUrl: null,
        source: "lusha" as const,
      }));
    } catch {
      return [];
    }
  },

  async findEmail(params: ProviderEmailParams): Promise<EmailResult | null> {
    if (!process.env.LUSHA_API_KEY) return null;

    try {
      const res = await fetch(`${BASE}/person`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({
          firstName: params.firstName,
          lastName: params.lastName,
          company: { website: params.domain },
        }),
      });

      if (!res.ok) return null;
      const data = await res.json() as {
        data?: { emailAddresses?: Array<{ emailAddress?: string }> };
      };
      const email = data.data?.emailAddresses?.[0]?.emailAddress;
      if (!email) return null;

      return { email, verified: true, confidence: 88, source: "lusha" };
    } catch {
      return null;
    }
  },

  async findLinkedIn(_params: ProviderLinkedInParams): Promise<LinkedInResult | null> {
    return null;
  },
};
