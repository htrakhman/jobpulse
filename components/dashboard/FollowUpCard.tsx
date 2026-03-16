"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface FollowUpSuggestion {
  id: string;
  reason: string;
  dueAt: string;
  application: {
    id: string;
    company: string;
    role: string | null;
    stage: string;
  };
}

interface FollowUpCardProps {
  suggestion: FollowUpSuggestion;
  onDismiss: (id: string) => void;
  onComplete: (id: string) => void;
}

export function FollowUpCard({ suggestion, onDismiss, onComplete }: FollowUpCardProps) {
  const [loading, setLoading] = useState(false);

  async function handleAction(action: "dismiss" | "complete") {
    setLoading(true);
    try {
      await fetch("/api/follow-ups", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: suggestion.id, action }),
      });
      if (action === "dismiss") onDismiss(suggestion.id);
      else onComplete(suggestion.id);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="border border-amber-200 bg-amber-50 shadow-none">
      <CardContent className="p-4 flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold text-amber-700 uppercase tracking-wide">
              Follow-up
            </span>
            <span className="text-xs text-amber-600">·</span>
            <Link
              href={`/applications/${suggestion.application.id}`}
              className="text-sm font-semibold text-gray-900 hover:text-blue-600 transition-colors truncate"
            >
              {suggestion.application.company}
              {suggestion.application.role && ` — ${suggestion.application.role}`}
            </Link>
          </div>
          <p className="text-sm text-gray-600">{suggestion.reason}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            className="text-xs border-amber-300 text-amber-700 hover:bg-amber-100"
            onClick={() => handleAction("dismiss")}
            disabled={loading}
          >
            Dismiss
          </Button>
          <Button
            size="sm"
            className="text-xs bg-amber-600 hover:bg-amber-700 text-white"
            onClick={() => handleAction("complete")}
            disabled={loading}
          >
            Mark done
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

interface FollowUpSectionProps {
  suggestions: FollowUpSuggestion[];
}

export function FollowUpSection({ suggestions: initial }: FollowUpSectionProps) {
  const [suggestions, setSuggestions] = useState(initial);

  function remove(id: string) {
    setSuggestions((prev) => prev.filter((s) => s.id !== id));
  }

  if (suggestions.length === 0) return null;

  return (
    <div className="mb-6">
      <h2 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">
        Follow-up Suggestions
      </h2>
      <div className="flex flex-col gap-2">
        {suggestions.map((s) => (
          <FollowUpCard
            key={s.id}
            suggestion={s}
            onDismiss={remove}
            onComplete={remove}
          />
        ))}
      </div>
    </div>
  );
}
