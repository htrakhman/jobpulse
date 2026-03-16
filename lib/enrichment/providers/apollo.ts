import type {
  EnrichmentProvider,
  PersonResult,
  EmailResult,
  LinkedInResult,
  ProviderSearchParams,
  ProviderEmailParams,
  ProviderLinkedInParams,
} from "../types";

const BASE = "https://api.apollo.io/v1";

function headers() {
  return {
    "Content-Type": "application/json",
    "X-Api-Key": process.env.APOLLO_API_KEY ?? "",
  };
}

interface ApolloOrg {
  name?: string;
  website_url?: string;
  linkedin_url?: string;
}

interface ApolloPerson {
  first_name?: string;
  last_name?: string;
  name?: string;
  title?: string;
  departments?: string[];
  seniority?: string;
  email?: string;
  linkedin_url?: string;
  twitter_url?: string;
  phone_numbers?: Array<{ sanitized_number: string }>;
  organization?: ApolloOrg;
}

function mapPerson(p: ApolloPerson, company: string): PersonResult {
  return {
    firstName: p.first_name ?? null,
    lastName: p.last_name ?? null,
    fullName: p.name ?? null,
    title: p.title ?? null,
    department: p.departments?.[0] ?? null,
    seniority: p.seniority ?? null,
    email: p.email ?? null,
    emailVerified: !!p.email,
    linkedinUrl: p.linkedin_url ?? null,
    twitterHandle: p.twitter_url ?? null,
    phone: p.phone_numbers?.[0]?.sanitized_number ?? null,
    company: p.organization?.name ?? company,
    companyDomain: p.organization?.website_url ?? null,
    companyLinkedinUrl: p.organization?.linkedin_url ?? null,
    source: "apollo",
  };
}

export const apolloProvider: EnrichmentProvider = {
  name: "apollo",

  async searchPeople(params: ProviderSearchParams): Promise<PersonResult[]> {
    if (!process.env.APOLLO_API_KEY) return [];

    const body: Record<string, unknown> = {
      q_organization_name: params.company,
      page: 1,
      per_page: params.maxResults ?? 10,
    };

    if (params.titleKeywords?.length) {
      body.person_titles = params.titleKeywords;
    }
    if (params.department) {
      body.person_departments = [params.department];
    }

    try {
      const res = await fetch(`${BASE}/mixed_people/search`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify(body),
      });

      if (!res.ok) return [];
      const data = await res.json() as { people?: ApolloPerson[] };
      return (data.people ?? []).map((p) => mapPerson(p, params.company));
    } catch {
      return [];
    }
  },

  async findEmail(params: ProviderEmailParams): Promise<EmailResult | null> {
    if (!process.env.APOLLO_API_KEY) return null;

    try {
      const res = await fetch(`${BASE}/people/match`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({
          first_name: params.firstName,
          last_name: params.lastName,
          domain: params.domain,
          linkedin_url: params.linkedinUrl,
          reveal_personal_emails: false,
        }),
      });

      if (!res.ok) return null;
      const data = await res.json() as { person?: { email?: string } };
      if (!data.person?.email) return null;

      return {
        email: data.person.email,
        verified: true,
        confidence: 90,
        source: "apollo",
      };
    } catch {
      return null;
    }
  },

  async findLinkedIn(params: ProviderLinkedInParams): Promise<LinkedInResult | null> {
    if (!process.env.APOLLO_API_KEY) return null;

    try {
      const res = await fetch(`${BASE}/people/match`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({
          first_name: params.firstName,
          last_name: params.lastName,
          organization_name: params.company,
        }),
      });

      if (!res.ok) return null;
      const data = await res.json() as { person?: { linkedin_url?: string } };
      if (!data.person?.linkedin_url) return null;

      return { linkedinUrl: data.person.linkedin_url, source: "apollo" };
    } catch {
      return null;
    }
  },
};
