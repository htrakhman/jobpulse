import { Badge } from "@/components/ui/badge";
import type { ApplicationStage } from "@/types";

const STAGE_CONFIG: Record<
  ApplicationStage,
  { label: string; className: string }
> = {
  Applied: {
    label: "Applied",
    className: "bg-blue-50 text-blue-700 border-blue-200",
  },
  Waiting: {
    label: "Awaiting Response",
    className: "bg-gray-50 text-gray-600 border-gray-200",
  },
  Scheduling: {
    label: "Scheduling",
    className: "bg-indigo-50 text-indigo-700 border-indigo-200",
  },
  Interviewing: {
    label: "Interviewing",
    className: "bg-purple-50 text-purple-700 border-purple-200",
  },
  Assessment: {
    label: "Assessment",
    className: "bg-orange-50 text-orange-700 border-orange-200",
  },
  Offer: {
    label: "Offer Received",
    className: "bg-green-50 text-green-700 border-green-200",
  },
  Rejected: {
    label: "Rejected",
    className: "bg-red-50 text-red-600 border-red-200",
  },
  Closed: {
    label: "Closed",
    className: "bg-gray-50 text-gray-400 border-gray-100",
  },
};

export function StageBadge({ stage }: { stage: ApplicationStage }) {
  const config = STAGE_CONFIG[stage] ?? STAGE_CONFIG.Waiting;
  return (
    <Badge variant="outline" className={`text-xs font-medium ${config.className}`}>
      {config.label}
    </Badge>
  );
}
