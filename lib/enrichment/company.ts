// Resolve a company name to its primary domain
// Uses Hunter domain search + common patterns as fallback

const COMMON_PATTERNS = [
  (name: string) => `${slug(name)}.com`,
  (name: string) => `${slug(name)}.io`,
  (name: string) => `${slug(name)}.co`,
  (name: string) => `${slug(name)}.ai`,
];

function slug(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+(inc|llc|ltd|corp|corporation|technologies|tech|group|labs|studio|studios|ai|co|company)\.?$/i, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

export async function resolveCompanyDomain(companyName: string): Promise<string | null> {
  if (!companyName) return null;

  // Try Hunter domain search first
  if (process.env.HUNTER_API_KEY) {
    try {
      const qs = new URLSearchParams({
        company: companyName,
        api_key: process.env.HUNTER_API_KEY,
      });
      const res = await fetch(`https://api.hunter.io/v2/domain-search?${qs}`);
      if (res.ok) {
        const data = await res.json() as { data?: { domain?: string } };
        if (data.data?.domain) return data.data.domain;
      }
    } catch {
      // fall through
    }
  }

  // Try Apollo company enrichment
  if (process.env.APOLLO_API_KEY) {
    try {
      const res = await fetch("https://api.apollo.io/v1/organizations/enrich", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Api-Key": process.env.APOLLO_API_KEY,
        },
        body: JSON.stringify({ name: companyName }),
      });
      if (res.ok) {
        const data = await res.json() as { organization?: { website_url?: string } };
        const url = data.organization?.website_url;
        if (url) {
          const domain = url.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
          if (domain) return domain;
        }
      }
    } catch {
      // fall through
    }
  }

  // Fall back to common pattern guesses
  return COMMON_PATTERNS[0](companyName);
}
