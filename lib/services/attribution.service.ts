import { getDashboardOSPayload } from "./dashboard-metrics.service";

export async function getAttributionMetrics(userId: string, windowDays: number) {
  const payload = await getDashboardOSPayload(userId, windowDays);
  return payload.attribution;
}

