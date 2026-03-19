import { getDashboardOSPayload } from "./dashboard-metrics.service";

export async function getFollowupIntelligence(userId: string, windowDays: number) {
  const payload = await getDashboardOSPayload(userId, windowDays);
  return payload.followup;
}

