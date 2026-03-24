import type { ApplicationStage } from "@/types";

export interface ActionCenterItem {
  id: string;
  title: string;
  description: string;
  priority: "urgent" | "high" | "normal" | "low";
  applicationId?: string;
  company?: string;
  stage?: ApplicationStage;
  dueAt?: string | null;
}

export interface FunnelStepMetric {
  key: string;
  from: string;
  to: string;
  count: number;
  denominator: number;
  conversionPct: number;
  priorCount: number;
  priorDenominator: number;
  deltaPct: number;
  companies: Array<{
    id: string;
    company: string;
    role: string | null;
    stage: ApplicationStage;
    lastActivityAt: string;
  }>;
}

export interface FollowupIntelligenceRow {
  id: string;
  applicationId: string;
  company: string;
  role: string | null;
  stage: ApplicationStage;
  urgency: "urgent" | "high" | "normal" | "low";
  recommendedAction: string;
  recommendationReason: string;
  daysSinceLastTouch: number;
  suggestedNextDate: string;
}

export interface AttributionSummary {
  key: string;
  applications: number;
  interviews: number;
  offers: number;
  conversionToInterviewPct: number;
  conversionToOfferPct: number;
}

export interface TimeToEventMetrics {
  avgDaysApplicationToFirstResponse: number;
  avgDaysApplicationToInterview: number;
  avgDaysInterviewToDecision: number;
  avgDaysLastTouchToFollowup: number;
  staleBuckets: Array<{ label: string; count: number }>;
}

export interface GoalsPacingMetrics {
  dailyApplicationGoal: number;
  weeklyApplicationGoal: number;
  weeklyInterviewGoal: number;
  weeklyNetworkingGoal: number;
  weeklyFollowupGoal: number;
  applicationsThisWeek: number;
  interviewsThisWeek: number;
  followupsCompletedThisWeek: number;
  projectedApplicationsByWeekEnd: number;
  projectedInterviewsByWeekEnd: number;
  applicationPacing: "ahead" | "behind" | "on_track";
  interviewPacing: "ahead" | "behind" | "on_track";
}

export interface SmartInsight {
  id: string;
  severity: "info" | "warning" | "critical";
  text: string;
}

export interface DashboardOSPayload {
  actionCenter: {
    followUpsDueToday: number;
    interviewsToPrep: number;
    staleApplications: number;
    targetRemainingToday: number;
    targetRemainingThisWeek: number;
    items: ActionCenterItem[];
  };
  funnel: {
    steps: FunnelStepMetric[];
    offerRatePer100: number;
  };
  followup: {
    buckets: Record<"urgent" | "high" | "normal" | "low", number>;
    rows: FollowupIntelligenceRow[];
  };
  attribution: {
    bySource: AttributionSummary[];
    byMethod: AttributionSummary[];
    byResumeVersion: AttributionSummary[];
    bestSource: string | null;
    bestResumeVersion: string | null;
    referralsOutperformCold: boolean;
  };
  timeToEvent: TimeToEventMetrics;
  goals: GoalsPacingMetrics;
  insights: SmartInsight[];
}

