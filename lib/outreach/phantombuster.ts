const PHANTOMBUSTER_API = "https://api.phantombuster.com/api/v2";

function headers() {
  return {
    "Content-Type": "application/json",
    "X-Phantombuster-Key": process.env.PHANTOMBUSTER_API_KEY ?? "",
  };
}

export interface LinkedInMessageJob {
  /** Google Sheet URL with profileUrl + message columns (one row per contact) */
  spreadsheetUrl: string;
  /** Fallback message if sheet has no message column; used for single-contact sheets */
  message?: string;
  agentId?: string;
}

export interface PhantomBusterJobResult {
  jobId: string;
  status: "queued" | "running" | "finished" | "error";
  output?: string;
  error?: string;
}

// Launch the LinkedIn Message Sender phantom with a Google Sheet
export async function sendLinkedInMessage(params: LinkedInMessageJob): Promise<PhantomBusterJobResult | null> {
  if (!process.env.PHANTOMBUSTER_API_KEY) return null;

  try {
    const agentId = params.agentId ?? process.env.PHANTOMBUSTER_LINKEDIN_AGENT_ID;

    if (!agentId) {
      console.warn("[PhantomBuster] No agent ID configured. Set PHANTOMBUSTER_LINKEDIN_AGENT_ID.");
      return null;
    }

    const argument: Record<string, unknown> = {
      spreadsheetUrl: params.spreadsheetUrl,
      numberOfProfilesToProcess: 10,
      onlyVisitNewProfiles: false,
    };
    if (params.message) argument.message = params.message;

    const res = await fetch(`${PHANTOMBUSTER_API}/agents/launch`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        id: agentId,
        argument: JSON.stringify(argument),
      }),
    });

    if (!res.ok) {
      const error = await res.text();
      console.error("[PhantomBuster] Launch failed:", error);
      return null;
    }

    const data = await res.json() as { containerId?: string };
    if (!data.containerId) return null;

    return {
      jobId: data.containerId,
      status: "queued",
    };
  } catch (err) {
    console.error("[PhantomBuster] Error:", err);
    return null;
  }
}

// Poll job status
export async function getJobStatus(jobId: string): Promise<PhantomBusterJobResult | null> {
  if (!process.env.PHANTOMBUSTER_API_KEY) return null;

  try {
    const res = await fetch(`${PHANTOMBUSTER_API}/containers/fetch-output?id=${jobId}`, {
      headers: headers(),
    });

    if (!res.ok) return null;
    const data = await res.json() as {
      status?: string;
      output?: string;
      exitCode?: number;
    };

    const status =
      data.status === "finished" && data.exitCode === 0
        ? "finished"
        : data.status === "running"
        ? "running"
        : data.status === "finished"
        ? "error"
        : "queued";

    return {
      jobId,
      status: status as PhantomBusterJobResult["status"],
      output: data.output,
    };
  } catch {
    return null;
  }
}

// List available agents (to find LinkedIn Message Sender agent ID)
export async function listAgents(): Promise<Array<{ id: string; name: string }>> {
  if (!process.env.PHANTOMBUSTER_API_KEY) return [];

  try {
    const res = await fetch(`${PHANTOMBUSTER_API}/agents/fetch-all`, {
      headers: headers(),
    });

    if (!res.ok) return [];
    const data = await res.json() as { agents?: Array<{ id: string; name: string }> };
    return data.agents ?? [];
  } catch {
    return [];
  }
}
