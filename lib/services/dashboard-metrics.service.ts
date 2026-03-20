import { requirePrisma } from "@/lib/prisma";
import type { ApplicationStage } from "@/types";
import { dedupeByCompany } from "./company-dedupe";
import type {
  AttributionSummary,
  DashboardOSPayload,
  FollowupIntelligenceRow,
  FunnelStepMetric,
  GoalsPacingMetrics,
  SmartInsight,
  TimeToEventMetrics,
} from "./os-metrics.types";

const INTERVIEW_STAGES: ApplicationStage[] = ["Scheduling", "Interviewing", "Assessment", "Offer"];

function pct(numerator: number, denominator: number): number {
  if (!denominator) return 0;
  return (numerator / denominator) * 100;
}

function daysBetween(a: Date, b: Date): number {
  return Math.max(0, Math.round((a.getTime() - b.getTime()) / (24 * 60 * 60 * 1000)));
}

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function weekBounds(reference: Date): { start: Date; end: Date; progressRatio: number } {
  const start = new Date(reference);
  const day = start.getDay();
  const diffToMonday = (day + 6) % 7;
  start.setDate(start.getDate() - diffToMonday);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  const elapsed = Math.max(1, reference.getTime() - start.getTime());
  const total = end.getTime() - start.getTime();
  return { start, end, progressRatio: Math.min(1, elapsed / total) };
}

function buildFunnelSteps(params: {
  apps: Array<{
    id: string;
    company: string;
    role: string | null;
    stage: ApplicationStage;
    lastActivityAt: Date;
  }>;
  priorApps: Array<{ stage: ApplicationStage }>;
}): FunnelStepMetric[] {
  const countIn = (stages: ApplicationStage[], source: Array<{ stage: ApplicationStage }>) =>
    source.filter((a) => stages.includes(a.stage)).length;
  const totalApps = params.apps.length;
  const totalPriorApps = params.priorApps.length;
  const reachedInterviewStages: ApplicationStage[] = ["Interviewing", "Assessment", "Offer", "Rejected", "Closed"];
  const defs = [
    {
      key: "applied_waiting",
      from: "Applied",
      to: "Awaiting Response",
      denominator: totalApps,
      priorDenominator: totalPriorApps,
      toStages: ["Waiting"] as ApplicationStage[],
    },
    {
      key: "applied_scheduling",
      from: "Applied",
      to: "Scheduling",
      denominator: totalApps,
      priorDenominator: totalPriorApps,
      toStages: ["Scheduling"] as ApplicationStage[],
    },
    {
      key: "applied_interviewing",
      from: "Applied",
      to: "Interviewing+",
      denominator: totalApps,
      priorDenominator: totalPriorApps,
      toStages: ["Interviewing", "Assessment", "Offer", "Rejected", "Closed"] as ApplicationStage[],
    },
    {
      key: "interview_assessment",
      from: "Interviewing",
      to: "Assessment",
      denominator: countIn(reachedInterviewStages, params.apps),
      priorDenominator: countIn(reachedInterviewStages, params.priorApps),
      toStages: ["Assessment", "Offer", "Rejected", "Closed"] as ApplicationStage[],
    },
    {
      key: "interview_offer",
      from: "Interviewing",
      to: "Offer",
      denominator: countIn(reachedInterviewStages, params.apps),
      priorDenominator: countIn(reachedInterviewStages, params.priorApps),
      toStages: ["Offer"] as ApplicationStage[],
    },
    {
      key: "offer_closed",
      from: "Offer",
      to: "Closed/Resolved",
      denominator: countIn(["Offer", "Rejected", "Closed"], params.apps),
      priorDenominator: countIn(["Offer", "Rejected", "Closed"], params.priorApps),
      toStages: ["Rejected", "Closed"] as ApplicationStage[],
    },
  ];

  return defs.map((def) => {
    const denominator = def.denominator;
    const count = countIn(def.toStages, params.apps);
    const priorDenominator = def.priorDenominator;
    const priorCount = countIn(def.toStages, params.priorApps);
    const conversionPct = pct(count, denominator);
    const priorPct = pct(priorCount, priorDenominator);
    const companies = params.apps
      .filter((app) => def.toStages.includes(app.stage))
      .sort((a, b) => b.lastActivityAt.getTime() - a.lastActivityAt.getTime())
      .map((app) => ({
        id: app.id,
        company: app.company,
        role: app.role,
        stage: app.stage,
        lastActivityAt: app.lastActivityAt.toISOString(),
      }))
      .slice(0, 50);
    return {
      key: def.key,
      from: def.from,
      to: def.to,
      count,
      denominator,
      conversionPct,
      priorCount,
      priorDenominator,
      deltaPct: conversionPct - priorPct,
      companies,
    };
  });
}

function classifyFollowupUrgency(
  stage: ApplicationStage,
  daysSinceLastTouch: number,
  hasEngagement: boolean,
  hasOpenSchedulingLoop: boolean
): "urgent" | "high" | "normal" | "low" {
  if (hasOpenSchedulingLoop && daysSinceLastTouch >= 2) return "urgent";
  if (stage === "Offer" && daysSinceLastTouch >= 1) return "urgent";
  if ((stage === "Interviewing" || stage === "Assessment") && daysSinceLastTouch >= 3) return "high";
  if (hasEngagement && daysSinceLastTouch >= 6) return "high";
  if (daysSinceLastTouch >= 10) return "normal";
  return "low";
}

function buildAttributionRows(
  apps: Array<{ source: string; stage: ApplicationStage }>,
  keyOf: (app: { source: string; stage: ApplicationStage }) => string
): AttributionSummary[] {
  const buckets = new Map<string, { applications: number; interviews: number; offers: number }>();
  for (const app of apps) {
    const key = keyOf(app) || "unknown";
    const current = buckets.get(key) ?? { applications: 0, interviews: 0, offers: 0 };
    current.applications += 1;
    if (INTERVIEW_STAGES.includes(app.stage)) current.interviews += 1;
    if (app.stage === "Offer") current.offers += 1;
    buckets.set(key, current);
  }
  return [...buckets.entries()]
    .map(([key, value]) => ({
      key,
      applications: value.applications,
      interviews: value.interviews,
      offers: value.offers,
      conversionToInterviewPct: pct(value.interviews, value.applications),
      conversionToOfferPct: pct(value.offers, value.applications),
    }))
    .sort((a, b) => b.applications - a.applications);
}

function buildSmartInsights(payload: {
  staleApplications: number;
  bySource: AttributionSummary[];
  byResumeVersion: AttributionSummary[];
  offerRatePer100: number;
  applicationsWithInterviews: number;
  totalApplications: number;
}): SmartInsight[] {
  const insights: SmartInsight[] = [];
  if (payload.bySource.length >= 2) {
    const top = payload.bySource[0];
    const second = payload.bySource[1];
    if (top.conversionToInterviewPct > second.conversionToInterviewPct * 1.5) {
      insights.push({
        id: "best_source",
        severity: "info",
        text: `${top.key} converts ${(top.conversionToInterviewPct / Math.max(1, second.conversionToInterviewPct)).toFixed(1)}x better to interviews than ${second.key}.`,
      });
    }
  }
  if (payload.staleApplications > 0) {
    insights.push({
      id: "stale_apps",
      severity: payload.staleApplications > 10 ? "warning" : "info",
      text: `${payload.staleApplications} applications are stale and likely need follow-up.`,
    });
  }
  if (payload.offerRatePer100 === 0 && payload.applicationsWithInterviews >= 5) {
    insights.push({
      id: "interview_bottleneck",
      severity: "critical",
      text: "Interview-to-offer conversion is currently 0%. Top-of-funnel is working, but interview execution is likely the bottleneck.",
    });
  }
  if (payload.byResumeVersion.length >= 2) {
    const [a, b] = payload.byResumeVersion;
    if (a.conversionToInterviewPct > b.conversionToInterviewPct) {
      insights.push({
        id: "resume_winner",
        severity: "info",
        text: `Resume version ${a.key} is outperforming ${b.key} for interview conversion.`,
      });
    }
  }
  if (insights.length === 0) {
    insights.push({
      id: "baseline",
      severity: "info",
      text: `You have ${payload.totalApplications} active tracked opportunities. Keep applying consistently and prioritize urgent follow-ups.`,
    });
  }
  return insights.slice(0, 6);
}

export async function getDashboardOSPayload(userId: string, windowDays: number): Promise<DashboardOSPayload> {
  const prisma = requirePrisma();
  const userGoalModel = (prisma as unknown as { userGoal?: { findFirst?: (args: unknown) => Promise<{
    dailyApplicationGoal: number;
    weeklyApplicationGoal: number;
    weeklyInterviewGoal: number;
    weeklyNetworkingGoal: number;
    weeklyFollowupGoal: number;
  } | null> } }).userGoal;
  const now = new Date();
  const windowStart = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000);
  const priorWindowStart = new Date(windowStart.getTime() - windowDays * 24 * 60 * 60 * 1000);

  let appsRaw: Array<{
    id: string;
    company: string;
    role: string | null;
    stage: ApplicationStage;
    source?: string | null;
    method?: string | null;
    resumeVersion?: string | null;
    targetPriority?: string | null;
    roleDesirabilityScore?: number | null;
    companyDesirabilityScore?: number | null;
    stageEnteredAt?: Date | null;
    appliedAt: Date | null;
    lastActivityAt: Date;
    nextAction?: string | null;
    nextActionDate?: Date | null;
  }> = [];
  let priorAppsRaw: Array<{ company: string; stage: ApplicationStage; lastActivityAt: Date }> = [];
  let activeFollowups: Array<{
    id: string;
    application: {
      id: string;
      company: string;
      role: string | null;
      stage: ApplicationStage;
      lastActivityAt: Date;
    };
  }> = [];
  const goals = await (userGoalModel?.findFirst
    ? userGoalModel.findFirst({
        where: { userId, isActive: true },
        orderBy: { updatedAt: "desc" },
      })
    : Promise.resolve(null));

  try {
    [appsRaw, priorAppsRaw, activeFollowups] = await Promise.all([
      prisma.application.findMany({
        where: {
          userId,
          OR: [{ appliedAt: { gte: windowStart } }, { lastActivityAt: { gte: windowStart } }],
        },
        select: {
          id: true,
          company: true,
          role: true,
          stage: true,
          source: true,
          method: true,
          resumeVersion: true,
          targetPriority: true,
          roleDesirabilityScore: true,
          companyDesirabilityScore: true,
          stageEnteredAt: true,
          appliedAt: true,
          lastActivityAt: true,
          nextAction: true,
          nextActionDate: true,
          followUps: {
            where: { dismissed: false, completed: false },
            select: { id: true, dueAt: true, createdAt: true },
          },
          events: {
            orderBy: { occurredAt: "desc" },
            take: 1,
            select: {
              occurredAt: true,
              emailType: true,
            },
          },
        },
        orderBy: { lastActivityAt: "desc" },
      }) as never,
      prisma.application.findMany({
        where: {
          userId,
          OR: [{ appliedAt: { gte: priorWindowStart, lt: windowStart } }, { lastActivityAt: { gte: priorWindowStart, lt: windowStart } }],
        },
        select: {
          company: true,
          stage: true,
          lastActivityAt: true,
        },
      }) as never,
      prisma.followUpSuggestion.findMany({
        where: { userId, dismissed: false, completed: false },
        include: { application: { select: { id: true, company: true, role: true, stage: true, lastActivityAt: true, nextActionDate: true } } },
        orderBy: { dueAt: "asc" },
        take: 50,
      }) as never,
    ]);
  } catch {
    // Older Prisma client fallback: avoid selecting newly-added fields.
    [appsRaw, priorAppsRaw, activeFollowups] = await Promise.all([
      prisma.application.findMany({
        where: {
          userId,
          OR: [{ appliedAt: { gte: windowStart } }, { lastActivityAt: { gte: windowStart } }],
        },
        select: {
          id: true,
          company: true,
          role: true,
          stage: true,
          appliedAt: true,
          lastActivityAt: true,
        },
        orderBy: { lastActivityAt: "desc" },
      }) as never,
      prisma.application.findMany({
        where: {
          userId,
          OR: [{ appliedAt: { gte: priorWindowStart, lt: windowStart } }, { lastActivityAt: { gte: priorWindowStart, lt: windowStart } }],
        },
        select: {
          company: true,
          stage: true,
          lastActivityAt: true,
        },
      }) as never,
      prisma.followUpSuggestion.findMany({
        where: { userId, dismissed: false, completed: false },
        include: { application: { select: { id: true, company: true, role: true, stage: true, lastActivityAt: true } } },
        orderBy: { dueAt: "asc" },
        take: 50,
      }) as never,
    ]);
  }

  const apps = dedupeByCompany(appsRaw);
  const priorApps = dedupeByCompany(priorAppsRaw);

  const funnelSteps = buildFunnelSteps({
    apps: apps.map((a) => ({
      id: a.id,
      company: a.company,
      role: a.role,
      stage: a.stage as ApplicationStage,
      lastActivityAt: a.lastActivityAt,
    })),
    priorApps: priorApps.map((a) => ({ stage: a.stage as ApplicationStage })),
  });

  const offerRatePer100 = pct(
    apps.filter((a) => a.stage === "Offer").length * 100,
    Math.max(1, apps.length)
  );

  const followupRows: FollowupIntelligenceRow[] = activeFollowups.map((suggestion) => {
    const app = suggestion.application;
    const daysSinceLastTouch = daysBetween(now, app.lastActivityAt);
    const hasEngagement = app.stage !== "Applied";
    const hasOpenSchedulingLoop = app.stage === "Scheduling";
    const urgency = classifyFollowupUrgency(
      app.stage as ApplicationStage,
      daysSinceLastTouch,
      hasEngagement,
      hasOpenSchedulingLoop
    );
    const suggestedNextDate = new Date(now);
    if (urgency === "urgent") suggestedNextDate.setDate(now.getDate());
    else if (urgency === "high") suggestedNextDate.setDate(now.getDate() + 1);
    else if (urgency === "normal") suggestedNextDate.setDate(now.getDate() + 3);
    else suggestedNextDate.setDate(now.getDate() + 7);

    return {
      id: suggestion.id,
      applicationId: app.id,
      company: app.company,
      role: app.role,
      stage: app.stage as ApplicationStage,
      urgency,
      recommendedAction:
        urgency === "urgent"
          ? "Send follow-up now"
          : urgency === "high"
          ? "Queue follow-up for next 24h"
          : urgency === "normal"
          ? "Follow-up this week"
          : "Monitor for now",
      recommendationReason:
        hasOpenSchedulingLoop
          ? "Open scheduling loop detected without confirmation."
          : `No meaningful response for ${daysSinceLastTouch} days at ${app.stage} stage.`,
      daysSinceLastTouch,
      suggestedNextDate: suggestedNextDate.toISOString(),
    };
  });

  const buckets = {
    urgent: followupRows.filter((row) => row.urgency === "urgent").length,
    high: followupRows.filter((row) => row.urgency === "high").length,
    normal: followupRows.filter((row) => row.urgency === "normal").length,
    low: followupRows.filter((row) => row.urgency === "low").length,
  };

  const bySource = buildAttributionRows(
    apps.map((a) => ({ source: String(a.source ?? "unknown"), stage: a.stage as ApplicationStage })),
    (x) => x.source
  );
  const byMethod = buildAttributionRows(
    apps.map((a) => ({ source: String(a.method ?? "unknown"), stage: a.stage as ApplicationStage })),
    (x) => x.source
  );
  const byResumeVersion = buildAttributionRows(
    apps.map((a) => ({ source: String(a.resumeVersion ?? "unknown"), stage: a.stage as ApplicationStage })),
    (x) => x.source
  );

  const firstResponseDurations: number[] = [];
  const applicationToInterviewDurations: number[] = [];
  const interviewToDecisionDurations: number[] = [];
  for (const app of apps) {
    if (app.appliedAt && app.lastActivityAt) {
      firstResponseDurations.push(daysBetween(app.lastActivityAt, app.appliedAt));
    }
    if (app.appliedAt && INTERVIEW_STAGES.includes(app.stage as ApplicationStage)) {
      applicationToInterviewDurations.push(daysBetween(app.lastActivityAt, app.appliedAt));
    }
    if ((app.stage === "Offer" || app.stage === "Rejected" || app.stage === "Closed") && app.stageEnteredAt) {
      interviewToDecisionDurations.push(daysBetween(app.lastActivityAt, app.stageEnteredAt));
    }
  }
  const followupTouchDurations = followupRows.map((row) => row.daysSinceLastTouch);
  const staleBuckets = [
    { label: "3+ days", count: apps.filter((a) => daysBetween(now, a.lastActivityAt) >= 3).length },
    { label: "5+ days", count: apps.filter((a) => daysBetween(now, a.lastActivityAt) >= 5).length },
    { label: "7+ days", count: apps.filter((a) => daysBetween(now, a.lastActivityAt) >= 7).length },
    { label: "14+ days", count: apps.filter((a) => daysBetween(now, a.lastActivityAt) >= 14).length },
  ];
  const timeToEvent: TimeToEventMetrics = {
    avgDaysApplicationToFirstResponse: avg(firstResponseDurations),
    avgDaysApplicationToInterview: avg(applicationToInterviewDurations),
    avgDaysInterviewToDecision: avg(interviewToDecisionDurations),
    avgDaysLastTouchToFollowup: avg(followupTouchDurations),
    staleBuckets,
  };

  const week = weekBounds(now);
  const appsThisWeek = apps.filter((a) => {
    const ts = (a.appliedAt ?? a.lastActivityAt).getTime();
    return ts >= week.start.getTime() && ts < week.end.getTime();
  }).length;
  const interviewsThisWeek = apps.filter((a) => {
    const ts = a.lastActivityAt.getTime();
    return ts >= week.start.getTime() && ts < week.end.getTime() && INTERVIEW_STAGES.includes(a.stage as ApplicationStage);
  }).length;
  const followupsCompletedThisWeek = 0;
  const activeGoals = goals ?? {
    dailyApplicationGoal: 5,
    weeklyApplicationGoal: 25,
    weeklyInterviewGoal: 3,
    weeklyNetworkingGoal: 5,
    weeklyFollowupGoal: 10,
  };
  const projectedApplicationsByWeekEnd = Math.round(appsThisWeek / Math.max(0.15, week.progressRatio));
  const projectedInterviewsByWeekEnd = Math.round(interviewsThisWeek / Math.max(0.15, week.progressRatio));
  const goalsMetrics: GoalsPacingMetrics = {
    dailyApplicationGoal: activeGoals.dailyApplicationGoal,
    weeklyApplicationGoal: activeGoals.weeklyApplicationGoal,
    weeklyInterviewGoal: activeGoals.weeklyInterviewGoal,
    weeklyNetworkingGoal: activeGoals.weeklyNetworkingGoal,
    weeklyFollowupGoal: activeGoals.weeklyFollowupGoal,
    applicationsThisWeek: appsThisWeek,
    interviewsThisWeek,
    followupsCompletedThisWeek,
    projectedApplicationsByWeekEnd,
    projectedInterviewsByWeekEnd,
    applicationPacing:
      projectedApplicationsByWeekEnd >= activeGoals.weeklyApplicationGoal
        ? "ahead"
        : projectedApplicationsByWeekEnd >= Math.round(activeGoals.weeklyApplicationGoal * 0.9)
        ? "on_track"
        : "behind",
    interviewPacing:
      projectedInterviewsByWeekEnd >= activeGoals.weeklyInterviewGoal
        ? "ahead"
        : projectedInterviewsByWeekEnd >= Math.round(activeGoals.weeklyInterviewGoal * 0.9)
        ? "on_track"
        : "behind",
  };

  const interviewsToPrep = apps.filter((a) => a.stage === "Scheduling").length;
  const staleApplications = staleBuckets[2].count;
  const targetRemainingToday = Math.max(0, activeGoals.dailyApplicationGoal - apps.filter((a) => (a.appliedAt ?? a.lastActivityAt).toDateString() === now.toDateString()).length);
  const targetRemainingThisWeek = Math.max(0, activeGoals.weeklyApplicationGoal - appsThisWeek);
  const actionItems = [
    {
      id: "followups_due",
      title: `Follow up with ${buckets.urgent + buckets.high} companies today`,
      description: "Prioritized by urgency, inactivity, and open scheduling loops.",
      priority: buckets.urgent > 0 ? "urgent" : "high",
    },
    {
      id: "prep_interviews",
      title: `Prep for ${interviewsToPrep} interview${interviewsToPrep === 1 ? "" : "s"}`,
      description: "Scheduling-stage opportunities need prep and availability responses.",
      priority: interviewsToPrep > 0 ? "high" : "normal",
    },
    {
      id: "apply_goal",
      title: `Apply to ${targetRemainingThisWeek} more role${targetRemainingThisWeek === 1 ? "" : "s"} this week`,
      description: "Stay on pacing target to maintain top-of-funnel momentum.",
      priority: goalsMetrics.applicationPacing === "behind" ? "high" : "normal",
    },
  ] as DashboardOSPayload["actionCenter"]["items"];

  const weightedPipelineScore = Math.round(
    apps.reduce((sum, app) => {
      const stageWeight =
        app.stage === "Offer"
          ? 100
          : app.stage === "Interviewing"
          ? 70
          : app.stage === "Assessment"
          ? 60
          : app.stage === "Scheduling"
          ? 55
          : app.stage === "Waiting"
          ? 35
          : app.stage === "Applied"
          ? 25
          : 10;
      const priorityWeight =
        app.targetPriority === "dream" ? 1.4 : app.targetPriority === "high" ? 1.2 : app.targetPriority === "medium" ? 1 : 0.8;
      const desirabilityWeight = ((app.roleDesirabilityScore ?? 50) + (app.companyDesirabilityScore ?? 50)) / 100;
      return sum + stageWeight * priorityWeight * desirabilityWeight;
    }, 0)
  );

  const insights = buildSmartInsights({
    staleApplications,
    bySource,
    byResumeVersion,
    offerRatePer100,
    applicationsWithInterviews: apps.filter((a) => INTERVIEW_STAGES.includes(a.stage as ApplicationStage)).length,
    totalApplications: apps.length,
  });

  return {
    actionCenter: {
      followUpsDueToday: buckets.urgent + buckets.high,
      interviewsToPrep,
      staleApplications,
      targetRemainingToday,
      targetRemainingThisWeek,
      items: actionItems,
    },
    funnel: {
      steps: funnelSteps,
      offerRatePer100,
    },
    followup: {
      buckets,
      rows: followupRows,
    },
    attribution: {
      bySource,
      byMethod,
      byResumeVersion,
      bestSource: bySource[0]?.key ?? null,
      bestResumeVersion: byResumeVersion[0]?.key ?? null,
      referralsOutperformCold:
        (byMethod.find((x) => x.key === "referral")?.conversionToInterviewPct ?? 0) >
        (byMethod.find((x) => x.key === "cold_apply")?.conversionToInterviewPct ?? 0),
    },
    timeToEvent,
    goals: goalsMetrics,
    insights,
    weightedPipelineScore,
  };
}

