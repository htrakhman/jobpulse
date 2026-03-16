const ATS_DOMAIN_MAP: Record<string, string> = {
  "ashbyhq.com": "Ashby",
  "lever.co": "Lever",
  "jobs.lever.co": "Lever",
  "greenhouse.io": "Greenhouse",
  "boards.greenhouse.io": "Greenhouse",
  "workday.com": "Workday",
  "myworkdayjobs.com": "Workday",
  "smartrecruiters.com": "SmartRecruiters",
  "icims.com": "iCIMS",
  "taleo.net": "Taleo",
  "jobvite.com": "Jobvite",
  "breezy.hr": "Breezy HR",
  "bamboohr.com": "BambooHR",
  "rippling.com": "Rippling",
  "apply.workable.com": "Workable",
  "workable.com": "Workable",
  "recruitee.com": "Recruitee",
  "welcometothejungle.com": "Welcome to the Jungle",
  "linkedin.com": "LinkedIn",
  "indeed.com": "Indeed",
  "glassdoor.com": "Glassdoor",
  "ziprecruiter.com": "ZipRecruiter",
  "angel.co": "AngelList",
  "wellfound.com": "Wellfound",
  "ycombinator.com": "Y Combinator",
};

export function detectAtsFromDomain(email: string): string | null {
  if (!email) return null;
  const domain = email.split("@")[1]?.toLowerCase();
  if (!domain) return null;

  if (ATS_DOMAIN_MAP[domain]) return ATS_DOMAIN_MAP[domain];

  // Check for partial domain matches (e.g. subdomain.greenhouse.io)
  for (const [key, value] of Object.entries(ATS_DOMAIN_MAP)) {
    if (domain.endsWith(`.${key}`) || domain === key) {
      return value;
    }
  }

  return null;
}

export function detectAtsFromBody(body: string): string | null {
  const lower = body.toLowerCase();
  for (const [domain, ats] of Object.entries(ATS_DOMAIN_MAP)) {
    if (lower.includes(domain)) return ats;
  }
  return null;
}
