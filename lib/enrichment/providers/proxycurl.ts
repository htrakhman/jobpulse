import type {
  EnrichmentProvider,
  PersonResult,
  EmailResult,
  LinkedInResult,
  ProviderSearchParams,
  ProviderEmailParams,
  ProviderLinkedInParams,
} from "../types";

const BASE = "https://nubela.co/proxycurl/api";

function headers() {
  return { Authorization: `Bearer ${process.env.PROXYCURL_API_KEY ?? ""}` };
}

export const proxycurlProvider: EnrichmentProvider = {
  name: "proxycurl",

  async searchPeople(params: ProviderSearchParams): Promise<PersonResult[]> {
    if (!process.env.PROXYCURL_API_KEY) return [];

    try {
      const qs = new URLSearchParams({
        company_name: params.company,
        page_size: String(params.maxResults ?? 10),
        enrich_profiles: "enrich",
      });

      if (params.titleKeywords?.length) {
        qs.set("keyword_regex", params.titleKeywords.join("|"));
      }

      const res = await fetch(`${BASE}/linkedin/company/employees/?${qs}`, {
        headers: headers(),
      });

      if (!res.ok) return [];

      const data = await res.json() as {
        employees?: Array<{
          profile_url?: string;
          profile?: {
            first_name?: string;
            last_name?: string;
            full_name?: string;
            headline?: string;
            occupation?: string;
            public_identifier?: string;
            experiences?: Array<{ company?: string; title?: string; is_current?: boolean }>;
          };
        }>;
      };

      return (data.employees ?? []).map((emp) => {
        const p = emp.profile ?? {};
        return {
          firstName: p.first_name ?? null,
          lastName: p.last_name ?? null,
          fullName: p.full_name ?? null,
          title: p.occupation ?? p.headline ?? null,
          department: null,
          seniority: null,
          email: null,
          emailVerified: false,
          linkedinUrl: emp.profile_url ?? null,
          twitterHandle: null,
          phone: null,
          company: params.company,
          companyDomain: null,
          companyLinkedinUrl: null,
          source: "proxycurl" as const,
        };
      });
    } catch {
      return [];
    }
  },

  async findEmail(params: ProviderEmailParams): Promise<EmailResult | null> {
    if (!process.env.PROXYCURL_API_KEY || !params.linkedinUrl) return null;

    try {
      const qs = new URLSearchParams({
        linkedin_profile_url: params.linkedinUrl,
        callback_url: "",
      });

      const res = await fetch(`${BASE}/linkedin/profile/email?${qs}`, {
        headers: headers(),
      });

      if (!res.ok) return null;
      const data = await res.json() as { email?: string };
      if (!data.email) return null;

      return { email: data.email, verified: true, confidence: 85, source: "proxycurl" };
    } catch {
      return null;
    }
  },

  async findLinkedIn(params: ProviderLinkedInParams): Promise<LinkedInResult | null> {
    if (!process.env.PROXYCURL_API_KEY) return null;

    try {
      const qs = new URLSearchParams({
        first_name: params.firstName,
        last_name: params.lastName,
        company_domain: params.company,
        similarity_checks: "include",
      });

      const res = await fetch(`${BASE}/linkedin/profile/resolve?${qs}`, {
        headers: headers(),
      });

      if (!res.ok) return null;
      const data = await res.json() as { url?: string };
      if (!data.url) return null;

      return { linkedinUrl: data.url, source: "proxycurl" };
    } catch {
      return null;
    }
  },
};
