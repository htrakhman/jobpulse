import { getDashboardOSPayload } from "./dashboard-metrics.service";

export async function getSmartInsights(userId: string, windowDays: number) {
  const payload = await getDashboardOSPayload(userId, windowDays);
  return {
    insights: payload.insights,
  };
}

