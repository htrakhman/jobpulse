# JobPulse

AI-powered job application tracker. Connects to Gmail, classifies job emails automatically, and organizes your entire job search into a clean dashboard.

## Tech Stack

- **Next.js 16** (App Router, TypeScript)
- **Clerk** — authentication + Google OAuth
- **Prisma v7** + PostgreSQL — database
- **Gmail API** + Google Cloud Pub/Sub — real-time inbox sync
- **Anthropic Claude** — AI email classifier fallback
- **Tailwind CSS** + **shadcn/ui** — UI

---

## Setup

### 1. Prerequisites

- Node.js 20+
- PostgreSQL database (local or hosted)
- Google Cloud project with Gmail API + Pub/Sub enabled
- Clerk account
- Anthropic API key

### 2. Install dependencies

```bash
npm install
```

### 3. Database schema (automatic on dev)

Whenever you run **`npm run dev`**, the **`predev`** script runs **`prisma generate`** and **`prisma db push`**, so your Neon (or local) database stays aligned with `schema.prisma`—no manual migrate step for local work.

To sync the DB without starting the app: **`npm run db:sync`**.

### 4. Configure environment variables

Copy the example file and fill in values (keep secrets in `.env.local` only—never commit it):

```bash
cp .env.example .env.local
```

Required variables:

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk publishable key |
| `CLERK_SECRET_KEY` | Clerk secret key |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `GOOGLE_PUBSUB_TOPIC` | Full Pub/Sub topic path |
| `ANTHROPIC_API_KEY` | Anthropic API key (optional: if unset, only rule-based classification runs—no errors during sync) |
| `ANTHROPIC_MODEL` | Optional override for Claude model id (default: `claude-haiku-4-5`) |
| `DATABASE_URL` | PostgreSQL connection string |
| `NEXT_PUBLIC_APP_URL` | App base URL (e.g. `http://localhost:3000`) |

### 5. Set up Google OAuth

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Enable **Gmail API** and **Cloud Pub/Sub API**
3. Create OAuth 2.0 credentials (Web application)
4. Add authorized redirect URI: `http://localhost:3000/api/gmail/connect/callback`
5. In OAuth consent screen → Scopes, add `gmail.readonly`, `spreadsheets`, and `drive.file` (for PhantomBuster sheet creation)
6. Create a Pub/Sub topic named `jobpulse-gmail`
7. Create a Pub/Sub subscription (Push) pointing to `https://yourdomain.com/api/gmail/webhook`
   - For local dev, use [ngrok](https://ngrok.com) to expose localhost

### 6. Set up the database (optional manual step)

If you use **`npm run dev`**, schema is applied automatically via **`predev`**. Otherwise:

```bash
npm run db:sync
# or: npx prisma migrate dev --name init
```

### 7. Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

**Dev server:** `npm run dev` uses **Webpack** by default so Tailwind/PostCSS resolves reliably when the repo lives under a path like `cursor projects/`. For Turbopack (faster, experimental here), use **`npm run dev:turbo`** — `next.config.ts` includes `turbopack.resolveAlias` helpers for `tailwindcss`. If you still see `Can't resolve 'tailwindcss'`, remove any stray **`package-lock.json`** in parent folders that confuse the workspace root.

---

## How It Works

1. User signs up via Clerk
2. User clicks "Connect Gmail" → Google OAuth flow
3. System calls `gmail.users.watch()` to set up Pub/Sub notifications
4. **Refresh** pulls **new mail since the last import** using Gmail’s **History API** when possible; otherwise a **narrow date-bounded** delta — not a full inbox walk. The dashboard **date window** only filters how far back you *view* data; widening it does not automatically re-fetch older mail in the UI (the API still supports gap/full sync for ops if needed).
5. Each email is classified:
   - **Deterministic rules** first (subject/body pattern matching)
   - **Claude** fallback for unmatched emails
6. Classified emails are deduplicated into Application records
7. Dashboard shows all applications with stage badges, recruiter info, and timeline
8. As new emails arrive via Pub/Sub webhook, applications update automatically
9. Follow-up suggestions are generated for stale applications (7+ days no response)

---

## Clay-like People Search + PhantomBuster Outreach

From any application, click **Find Contacts** to search for people at that company (by title: Head of Recruiting, VP Engineering, etc.). Results are enriched via Apollo, Hunter, PDL, and other providers.

**Outreach options:**
- **Email** — Send via Resend (set `RESEND_API_KEY`)
- **LinkedIn via PhantomBuster** — JobPulse creates a Google Sheet with one row per contact (profileUrl, message), shares it, and launches your PhantomBuster LinkedIn Message Sender agent

**Bulk PhantomBuster:** Select multiple contacts with checkboxes, then **Send X via PhantomBuster** to create a sheet and launch in one click.

**Required for PhantomBuster:**
- `PHANTOMBUSTER_API_KEY` — Your PhantomBuster API key
- `PHANTOMBUSTER_LINKEDIN_AGENT_ID` — Your LinkedIn Message Sender phantom ID (from the Phantom URL)
- Gmail connected with Sheets scope (reconnect Gmail if you added scopes later)

---

## Email Classification

### Deterministic Rules (no AI cost)

| Pattern | Type | Stage |
|---|---|---|
| Subject/body: "thank you for applying (to …)", "thank you for your application (to …)", "application received", "we received your application", similar | `application_confirmation` | Applied |
| Subject: "availability request" + body: "interview" | `interview_request` | Interviewing |
| Body: "invite you to a ... interview" | `interview_request` | Interviewing |
| Body: "please use the link below to select a time" | `interview_scheduled` | Interviewing |
| Subject: "assessment" / "coding challenge" | `assessment` | Assessment |
| Body: "not move forward" / "adjusted our priorities" | `rejection` | Rejected |
| Subject: "offer letter" / body: "pleased to offer you" | `offer` | Offer |

### Claude Fallback

Unmatched job-related emails are sent to Claude with subject, sender, and body snippet. Returns structured JSON with email type, stage, company, role, and recruiter info.

---

## Project Structure

```
app/
  (auth)/sign-in, sign-up     Clerk auth pages
  (dashboard)/dashboard        Main dashboard
  (dashboard)/applications/[id] Application detail + timeline
  api/gmail/connect            Gmail OAuth initiation
  api/gmail/connect/callback   OAuth callback + token storage
  api/gmail/sync               Incremental refresh (History/delta); optional gap/full via JSON flags
  api/gmail/webhook            Pub/Sub push endpoint
  api/applications             List/filter applications
  api/follow-ups               Follow-up suggestion management
lib/
  gmail/client.ts              Gmail API client factory
  gmail/sync.ts                Batch + incremental sync
  gmail/parser.ts              Email parsing + body extraction
  gmail/pubsub.ts              Watch setup + renewal
  classification/rules.ts      Deterministic classification rules
  classification/extractor.ts  Signal extraction (company, role, recruiter)
  classification/ats.ts        ATS domain detection
  classification/deduplication.ts  Application deduplication
  classification/claude.ts     Claude AI fallback
  services/application.service.ts  Application upsert + queries
  services/followup.service.ts     Follow-up suggestion generation
components/
  dashboard/StatsBar           Summary stats cards
  dashboard/ApplicationTable   Filterable application list
  dashboard/StatusFilter       Stage filter buttons
  dashboard/FollowUpCard       Dismissible follow-up suggestions
  dashboard/SyncButton         Manual sync trigger
  application/Timeline         Email event timeline
prisma/schema.prisma           Database schema
```
