import type {
  EnrichmentProvider,
  PersonResult,
  EmailResult,
  LinkedInResult,
  ProviderSearchParams,
  ProviderEmailParams,
  ProviderLinkedInParams,
} from "../types";

const BASE = "https://api.contactout.com/v1";

function headers() {
  return {
    "Content-Type": "application/json",
    Authorization: `Basic ${Buffer.from(
      `${process.env.CONTACTOUT_USER ?? ""}:${process.env.CONTACTOUT_API_KEY ?? ""}`
    ).toString("base64")}`,
  };
}

export const contactoutProvider: EnrichmentProvider = {
  name: "contactout",

  async searchPeople(params: ProviderSearchParams): Promise<PersonResult[]> {
    if (!process.env.CONTACTOUT_API_KEY) return [];

    try {
      const qs = new URLSearchParams({
        company: params.company,
        limit: String(params.maxResults ?? 10),
      });
      if (params.titleKeywords?.length) {
        qs.set("title", params.titleKeywords.join(","));
      }

      const res = await fetch(`${BASE}/people/search?${qs}`, {
        headers: headers(),
      });

      if (!res.ok) return [];
      const data = await res.json() as {
        profiles?: Array<{
          first_name?: string;
          last_name?: string;
          name?: string;
          title?: string;
          department?: string;
          emails?: string[];
          linkedin?: string;
          company?: string;
        }>;
      };

      return (data.profiles ?? []).map((p) => ({
        firstName: p.first_name ?? null,
        lastName: p.last_name ?? null,
        fullName: p.name ?? null,
        title: p.title ?? null,
        department: p.department ?? null,
        seniority: null,
        email: p.emails?.[0] ?? null,
        emailVerified: !!p.emails?.length,
        linkedinUrl: p.linkedin ?? null,
        twitterHandle: null,
        phone: null,
        company: p.company ?? params.company,
        companyDomain: null,
        companyLinkedinUrl: null,
        source: "contactout" as const,
      }));
    } catch {
      return [];
    }
  },

  async findEmail(params: ProviderEmailParams): Promise<EmailResult | null> {
    if (!process.env.CONTACTOUT_API_KEY || !params.linkedinUrl) return null;

    try {
      const qs = new URLSearchParams({ linkedin: params.linkedinUrl });
      const res = await fetch(`${BASE}/people/enrich?${qs}`, { headers: headers() });
      if (!res.ok) return null;

      const data = await res.json() as {
        profile?: { emails?: string[] };
      };
      const email = data.profile?.emails?.[0];
      if (!email) return null;

      return { email, verified: true, confidence: 85, source: "contactout" };
    } catch {
      return null;
    }
  },

  async findLinkedIn(_params: ProviderLinkedInParams): Promise<LinkedInResult | null> {
    return null;
  },
};
