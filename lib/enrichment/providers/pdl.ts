import type {
  EnrichmentProvider,
  PersonResult,
  EmailResult,
  LinkedInResult,
  ProviderSearchParams,
  ProviderEmailParams,
  ProviderLinkedInParams,
} from "../types";

const BASE = "https://api.peopledatalabs.com/v5";

function headers() {
  return {
    "Content-Type": "application/json",
    "X-Api-Key": process.env.PDL_API_KEY ?? "",
  };
}

function mapPerson(p: Record<string, unknown>, company: string): PersonResult {
  const emails = (p.emails as Array<{ address: string }>) ?? [];
  const phones = (p.phone_numbers as string[]) ?? [];
  const linkedins = (p.linkedin_url as string) ?? null;
  const experiences = (p.experience as Array<{ company?: { name?: string; website?: string; linkedin_url?: string }; title?: { name?: string }; is_primary?: boolean }>) ?? [];
  const currentExp = experiences.find((e) => e.is_primary) ?? experiences[0];

  return {
    firstName: (p.first_name as string) ?? null,
    lastName: (p.last_name as string) ?? null,
    fullName: (p.full_name as string) ?? null,
    title: (p.job_title as string) ?? currentExp?.title?.name ?? null,
    department: (p.job_company_industry as string) ?? null,
    seniority: (p.job_title_role as string) ?? null,
    email: emails[0]?.address ?? null,
    emailVerified: emails.length > 0,
    linkedinUrl: linkedins,
    twitterHandle: (p.twitter_url as string) ?? null,
    phone: phones[0] ?? null,
    company: currentExp?.company?.name ?? company,
    companyDomain: currentExp?.company?.website ?? null,
    companyLinkedinUrl: currentExp?.company?.linkedin_url ?? null,
    source: "pdl",
  };
}

export const pdlProvider: EnrichmentProvider = {
  name: "pdl",

  async searchPeople(params: ProviderSearchParams): Promise<PersonResult[]> {
    if (!process.env.PDL_API_KEY) return [];

    const esQuery: Record<string, unknown> = {
      query: {
        bool: {
          must: [
            { term: { "job_company_name": params.company.toLowerCase() } },
          ],
        },
      },
    };

    if (params.titleKeywords?.length) {
      (esQuery.query as Record<string, unknown>).bool = {
        ...((esQuery.query as Record<string, unknown>).bool as Record<string, unknown>),
        should: params.titleKeywords.map((kw) => ({
          match: { job_title: kw },
        })),
        minimum_should_match: 1,
      };
    }

    try {
      const res = await fetch(`${BASE}/person/search`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({
          query: esQuery,
          size: params.maxResults ?? 10,
          dataset: "all",
        }),
      });

      if (!res.ok) return [];
      const data = await res.json() as { data?: Record<string, unknown>[] };
      return (data.data ?? []).map((p) => mapPerson(p, params.company));
    } catch {
      return [];
    }
  },

  async findEmail(params: ProviderEmailParams): Promise<EmailResult | null> {
    if (!process.env.PDL_API_KEY) return null;

    try {
      const qs = new URLSearchParams({
        first_name: params.firstName,
        last_name: params.lastName,
        company: params.domain,
        min_likelihood: "6",
      });

      const res = await fetch(`${BASE}/person/enrich?${qs}`, {
        headers: headers(),
      });

      if (!res.ok) return null;
      const data = await res.json() as {
        data?: { emails?: Array<{ address: string }> };
        likelihood?: number;
      };
      const email = data.data?.emails?.[0]?.address;
      if (!email) return null;

      return {
        email,
        verified: (data.likelihood ?? 0) > 7,
        confidence: (data.likelihood ?? 0) * 10,
        source: "pdl",
      };
    } catch {
      return null;
    }
  },

  async findLinkedIn(params: ProviderLinkedInParams): Promise<LinkedInResult | null> {
    if (!process.env.PDL_API_KEY) return null;

    try {
      const qs = new URLSearchParams({
        first_name: params.firstName,
        last_name: params.lastName,
        company: params.company,
        min_likelihood: "5",
      });

      const res = await fetch(`${BASE}/person/enrich?${qs}`, {
        headers: headers(),
      });

      if (!res.ok) return null;
      const data = await res.json() as { data?: { linkedin_url?: string } };
      if (!data.data?.linkedin_url) return null;

      return { linkedinUrl: data.data.linkedin_url, source: "pdl" };
    } catch {
      return null;
    }
  },
};
