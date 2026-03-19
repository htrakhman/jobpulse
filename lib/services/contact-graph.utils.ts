const ATS_OR_GENERIC_DOMAINS = [
  "gmail.com",
  "yahoo.com",
  "hotmail.com",
  "outlook.com",
  "icloud.com",
  "ashbyhq.com",
  "lever.co",
  "greenhouse.io",
  "workday.com",
  "myworkdayjobs.com",
  "smartrecruiters.com",
  "jobvite.com",
  "bamboohr.com",
  "icims.com",
];

export function normalizeName(name: string | null): string {
  return (name ?? "")
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildCompanyToken(company: string): string {
  return company.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function isLikelyCompanyDomain(domain: string, company: string): boolean {
  if (!domain || ATS_OR_GENERIC_DOMAINS.some((d) => domain.includes(d))) return false;
  const root = domain.split(".")[0] ?? "";
  const token = buildCompanyToken(company);
  if (!root || !token) return false;
  return root.includes(token) || token.includes(root);
}

export function buildGoogleSearchUrl(
  name: string | null,
  company: string,
  email: string | null
): string | null {
  const queryParts = [name ?? "", company, email ?? "", "linkedin"];
  const query = queryParts.filter(Boolean).join(" ").trim();
  if (!query) return null;
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}

