import type {
  EnrichmentProvider,
  PersonResult,
  EmailResult,
  LinkedInResult,
  ProviderSearchParams,
  ProviderEmailParams,
  ProviderLinkedInParams,
} from "../types";

const BASE = "https://api.snov.io/v1";

async function getAccessToken(): Promise<string | null> {
  if (!process.env.SNOVIO_USER_ID || !process.env.SNOVIO_API_KEY) return null;

  try {
    const res = await fetch(`${BASE}/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "client_credentials",
        client_id: process.env.SNOVIO_USER_ID,
        client_secret: process.env.SNOVIO_API_KEY,
      }),
    });
    const data = await res.json() as { access_token?: string };
    return data.access_token ?? null;
  } catch {
    return null;
  }
}

export const snovioProvider: EnrichmentProvider = {
  name: "snovio",

  async searchPeople(params: ProviderSearchParams): Promise<PersonResult[]> {
    if (!process.env.SNOVIO_API_KEY) return [];
    const token = await getAccessToken();
    if (!token) return [];

    try {
      const res = await fetch(`${BASE}/get-domain-emails-with-info`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          domain: params.companyDomain ?? params.company,
          type: "all",
          limit: params.maxResults ?? 10,
          lastId: 0,
        }),
      });

      if (!res.ok) return [];
      const data = await res.json() as {
        emails?: Array<{
          firstName?: string;
          lastName?: string;
          email?: string;
          position?: string;
          sourcePage?: string;
        }>;
      };

      return (data.emails ?? []).map((e) => ({
        firstName: e.firstName ?? null,
        lastName: e.lastName ?? null,
        fullName: e.firstName && e.lastName ? `${e.firstName} ${e.lastName}` : null,
        title: e.position ?? null,
        department: null,
        seniority: null,
        email: e.email ?? null,
        emailVerified: false,
        linkedinUrl: null,
        twitterHandle: null,
        phone: null,
        company: params.company,
        companyDomain: params.companyDomain ?? null,
        companyLinkedinUrl: null,
        source: "snovio" as const,
      }));
    } catch {
      return [];
    }
  },

  async findEmail(params: ProviderEmailParams): Promise<EmailResult | null> {
    if (!process.env.SNOVIO_API_KEY) return null;
    const token = await getAccessToken();
    if (!token) return null;

    try {
      const res = await fetch(`${BASE}/get-emails-from-names`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          firstName: params.firstName,
          lastName: params.lastName,
          domain: params.domain,
        }),
      });

      if (!res.ok) return null;
      const data = await res.json() as {
        emails?: Array<{ email?: string; emailStatus?: string }>;
      };
      const found = data.emails?.[0];
      if (!found?.email) return null;

      return {
        email: found.email,
        verified: found.emailStatus === "Valid",
        confidence: found.emailStatus === "Valid" ? 85 : 50,
        source: "snovio",
      };
    } catch {
      return null;
    }
  },

  async findLinkedIn(_params: ProviderLinkedInParams): Promise<LinkedInResult | null> {
    return null;
  },
};
