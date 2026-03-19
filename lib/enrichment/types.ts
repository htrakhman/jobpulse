export interface PersonResult {
  firstName: string | null;
  lastName: string | null;
  fullName: string | null;
  title: string | null;
  department: string | null;
  seniority: string | null;
  email: string | null;
  emailVerified: boolean;
  linkedinUrl: string | null;
  twitterHandle: string | null;
  phone: string | null;
  company: string;
  companyDomain: string | null;
  companyLinkedinUrl: string | null;
  source: ProviderName;
}

export interface RankedPersonResult extends PersonResult {
  score: number;
  matchedSignals: string[];
  sources: ProviderName[];
}

export interface EmailResult {
  email: string;
  verified: boolean;
  confidence: number; // 0-100
  source: ProviderName;
}

export interface LinkedInResult {
  linkedinUrl: string;
  source: ProviderName;
}

export type ProviderName =
  | "apollo"
  | "hunter"
  | "pdl"
  | "proxycurl"
  | "lusha"
  | "contactout"
  | "fullenrich"
  | "snovio"
  | "zerobounce"
  | "mixrank"
  | "icypeas"
  | "leadmagic";

export interface ProviderSearchParams {
  company: string;
  companyDomain?: string;
  titleKeywords?: string[];
  department?: string;
  maxResults?: number;
}

export interface ProviderEmailParams {
  firstName: string;
  lastName: string;
  domain: string;
  linkedinUrl?: string;
}

export interface ProviderLinkedInParams {
  firstName: string;
  lastName: string;
  company: string;
}

export interface EnrichmentProvider {
  name: ProviderName;
  searchPeople(params: ProviderSearchParams): Promise<PersonResult[]>;
  findEmail(params: ProviderEmailParams): Promise<EmailResult | null>;
  findLinkedIn(params: ProviderLinkedInParams): Promise<LinkedInResult | null>;
}

export interface WaterfallStep {
  provider: ProviderName;
  field: "email" | "linkedin" | "search";
  status: "hit" | "miss" | "error" | "skipped";
  responseMs?: number;
  result?: string;
  error?: string;
}

export interface WaterfallResult {
  contact: Partial<PersonResult>;
  steps: WaterfallStep[];
  emailFound: boolean;
  linkedinFound: boolean;
}

export type PeopleSortMode =
  | "relevance"
  | "name_asc"
  | "name_desc"
  | "title_asc"
  | "title_desc";

export interface PeopleSearchFilters {
  includeTitles?: string[];
  excludeTitles?: string[];
  department?: string;
  seniority?: string;
  location?: string;
  includeKeywords?: string[];
  excludeKeywords?: string[];
}

export interface PeopleSearchOptions extends PeopleSearchFilters {
  company: string;
  companyDomain?: string;
  page?: number;
  pageSize?: number;
  maxResults?: number;
  sortMode?: PeopleSortMode;
}

export interface ProviderSearchDiagnostic {
  provider: ProviderName;
  available: boolean;
  attempted: boolean;
  status: "hit" | "miss" | "error" | "skipped";
  resultCount: number;
  responseMs?: number;
  error?: string;
}

export interface PeopleSearchResponse {
  results: RankedPersonResult[];
  total: number;
  page: number;
  pageSize: number;
  providerDiagnostics: ProviderSearchDiagnostic[];
}
