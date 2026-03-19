import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

export default async function LandingPage() {
  const { userId } = await auth();
  if (userId) redirect("/dashboard");

  const coreFeatures = [
    {
      title: "Inbox To Structured Pipeline",
      description:
        "Deterministic rules plus AI fallback classify your emails into Applied, Interviewing, Assessment, Offer, Rejected, and Closed.",
    },
    {
      title: "Clay-Style Contact Discovery",
      description:
        "Search people at each company by role title and department, then enrich work emails and LinkedIn profiles with a provider waterfall.",
    },
    {
      title: "Outreach From One Workspace",
      description:
        "Generate personalized templates, message via LinkedIn (PhantomBuster) or email, and track every draft/sent status per contact.",
    },
  ];

  const enrichmentStack = [
    "Apollo",
    "Hunter",
    "People Data Labs",
    "Proxycurl",
    "Lusha",
    "ContactOut",
    "FullEnrich",
    "Snov.io",
    "Icypeas",
    "LeadMagic",
    "ZeroBounce",
  ];

  return (
    <main className="min-h-screen bg-white">
      {/* Nav */}
      <nav className="border-b border-gray-100 px-6 py-4 flex items-center justify-between max-w-6xl mx-auto">
        <span className="text-xl font-bold text-gray-900">JobPulse</span>
        <div className="flex items-center gap-4">
          <Link href="/sign-in" className="text-sm text-gray-600 hover:text-gray-900">
            Sign in
          </Link>
          <Link
            href="/sign-up"
            className="text-sm bg-gray-900 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors"
          >
            Get started
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-4xl mx-auto px-6 pt-24 pb-16 text-center">
        <div className="inline-flex items-center gap-2 bg-blue-50 text-blue-700 text-sm px-3 py-1 rounded-full mb-6 font-medium">
          AI-Powered · Gmail Integration · Enrichment · Outreach
        </div>
        <h1 className="text-5xl font-bold text-gray-900 leading-tight mb-6">
          Your job search,
          <br />
          <span className="text-blue-600">tracked and actioned.</span>
        </h1>
        <p className="text-xl text-gray-500 mb-10 max-w-2xl mx-auto leading-relaxed">
          JobPulse connects to your Gmail and automatically detects every job application,
          then helps you find the right people at each company and reach out with high-quality
          personalized messages.
        </p>
        <div className="flex items-center justify-center gap-3">
          <Link
            href="/sign-up"
            className="inline-flex items-center gap-2 bg-gray-900 text-white px-8 py-4 rounded-xl text-lg font-medium hover:bg-gray-700 transition-colors"
          >
            Start Free →
          </Link>
          <Link
            href="/sign-in"
            className="inline-flex items-center gap-2 border border-gray-300 text-gray-700 px-8 py-4 rounded-xl text-lg font-medium hover:border-gray-500 transition-colors"
          >
            View Dashboard
          </Link>
        </div>
      </section>

      {/* Core Features */}
      <section className="max-w-5xl mx-auto px-6 py-16 grid grid-cols-1 md:grid-cols-3 gap-8">
        {coreFeatures.map((f) => (
          <div key={f.title} className="p-6 border border-gray-100 rounded-2xl">
            <h3 className="font-semibold text-gray-900 mb-2">{f.title}</h3>
            <p className="text-gray-500 text-sm leading-relaxed">{f.description}</p>
          </div>
        ))}
      </section>

      {/* Workflow */}
      <section className="max-w-5xl mx-auto px-6 py-10">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">How JobPulse Works</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[
            "1. Connect Gmail and auto-import your application history.",
            "2. Track every stage update from incoming email threads.",
            "3. Open any application and click Find People.",
            "4. Filter by titles like Head of Recruiting, CFO, VP Engineering.",
            "5. Run waterfall enrichment for work email and LinkedIn.",
            "6. Send personalized outreach via email or LinkedIn.",
          ].map((step) => (
            <div key={step} className="p-4 border border-gray-100 rounded-xl text-sm text-gray-600">
              {step}
            </div>
          ))}
        </div>
      </section>

      {/* Enrichment */}
      <section className="max-w-5xl mx-auto px-6 py-10">
        <div className="p-6 border border-blue-100 bg-blue-50 rounded-2xl">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Waterfall Enrichment Engine</h3>
          <p className="text-sm text-gray-600 mb-4">
            JobPulse uses a Clay-style enrichment waterfall: it tries multiple providers in sequence
            and stops as soon as it finds a high-confidence result.
          </p>
          <div className="flex flex-wrap gap-2">
            {enrichmentStack.map((provider) => (
              <span
                key={provider}
                className="text-xs bg-white border border-blue-200 text-blue-700 px-2.5 py-1 rounded-full"
              >
                {provider}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Outreach */}
      <section className="max-w-5xl mx-auto px-6 py-10">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">Outreach Intelligence</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-5 border border-gray-100 rounded-xl">
            <h4 className="font-semibold text-gray-900 mb-2">Template Library</h4>
            <p className="text-sm text-gray-600">
              Built-in templates for recruiter intro, follow-up, hiring manager reach-out,
              referral ask, and executive outreach.
            </p>
          </div>
          <div className="p-5 border border-gray-100 rounded-xl">
            <h4 className="font-semibold text-gray-900 mb-2">AI Variable Fill</h4>
            <p className="text-sm text-gray-600">
              AI fills personalization variables from application and contact context before
              sending, while keeping you in control of final edits.
            </p>
          </div>
          <div className="p-5 border border-gray-100 rounded-xl">
            <h4 className="font-semibold text-gray-900 mb-2">LinkedIn + Email</h4>
            <p className="text-sm text-gray-600">
              Reach contacts via email or LinkedIn automation through PhantomBuster, all tracked
              inside the same application record.
            </p>
          </div>
        </div>
      </section>

      {/* Privacy */}
      <section className="max-w-5xl mx-auto px-6 py-10 mb-10">
        <div className="p-6 border border-gray-100 rounded-2xl">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Built With Privacy In Mind</h3>
          <ul className="text-sm text-gray-600 space-y-1.5">
            <li>Only job-related emails are processed.</li>
            <li>OAuth scopes are minimized and access can be revoked anytime.</li>
            <li>Email content is stored as trimmed snippets, not full inbox archives.</li>
            <li>You can disconnect accounts and remove synced data at any time.</li>
          </ul>
        </div>
      </section>
    </main>
  );
}
