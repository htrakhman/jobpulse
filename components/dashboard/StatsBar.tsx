"use client";

import { Card, CardContent } from "@/components/ui/card";
import type { DashboardStats } from "@/types";

interface StatsBarProps {
  stats: DashboardStats;
}

export function StatsBar({ stats }: StatsBarProps) {
  const items = [
    { label: "Total Applications", value: stats.total, color: "text-gray-900" },
    { label: "Active", value: stats.active, color: "text-blue-600" },
    { label: "Interviewing", value: stats.interviewing, color: "text-purple-600" },
    { label: "Offers", value: stats.offers, color: "text-green-600" },
    { label: "Follow-ups Due", value: stats.pendingFollowUps, color: "text-amber-600" },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
      {items.map((item) => (
        <Card key={item.label} className="shadow-none border border-gray-200">
          <CardContent className="p-4">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
              {item.label}
            </p>
            <p className={`text-2xl font-bold ${item.color}`}>{item.value}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
