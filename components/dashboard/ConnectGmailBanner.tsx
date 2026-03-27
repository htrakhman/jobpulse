export function ConnectGmailBanner() {
  return (
    <div className="border border-blue-200 bg-blue-50 rounded-xl p-6 text-center mb-8">
      <h2 className="text-lg font-semibold text-gray-900 mb-2">
        Connect your Gmail to get started
      </h2>
      <p className="text-gray-500 text-sm mb-4 max-w-md mx-auto">
        JobPulse will (1) scan your inbox for job-related emails and (2) send outreach
        emails from your connected Gmail account. Only job emails are read and stored.
      </p>
      <a
        href="/api/gmail/connect"
        className="inline-flex items-center gap-2 bg-gray-900 text-white px-6 py-3 rounded-lg text-sm font-medium hover:bg-gray-700 transition-colors"
      >
        Connect Gmail
      </a>
    </div>
  );
}
