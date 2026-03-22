"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Settings2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export interface GoalsFormValues {
  dailyApplicationGoal: number;
  weeklyApplicationGoal: number;
  weeklyInterviewGoal: number;
  weeklyNetworkingGoal: number;
  weeklyFollowupGoal: number;
}

interface EditGoalsDialogProps {
  initialGoals: GoalsFormValues;
}

function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, Math.round(n)));
}

export function EditGoalsDialog({ initialGoals }: EditGoalsDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [dailyApplicationGoal, setDailyApplicationGoal] = useState(
    initialGoals.dailyApplicationGoal
  );
  const [weeklyApplicationGoal, setWeeklyApplicationGoal] = useState(
    initialGoals.weeklyApplicationGoal
  );
  const [weeklyInterviewGoal, setWeeklyInterviewGoal] = useState(
    initialGoals.weeklyInterviewGoal
  );
  const [weeklyNetworkingGoal, setWeeklyNetworkingGoal] = useState(
    initialGoals.weeklyNetworkingGoal
  );
  const [weeklyFollowupGoal, setWeeklyFollowupGoal] = useState(
    initialGoals.weeklyFollowupGoal
  );

  function resetFromProps() {
    setDailyApplicationGoal(initialGoals.dailyApplicationGoal);
    setWeeklyApplicationGoal(initialGoals.weeklyApplicationGoal);
    setWeeklyInterviewGoal(initialGoals.weeklyInterviewGoal);
    setWeeklyNetworkingGoal(initialGoals.weeklyNetworkingGoal);
    setWeeklyFollowupGoal(initialGoals.weeklyFollowupGoal);
    setError(null);
  }

  function handleOpenChange(next: boolean) {
    if (next) {
      resetFromProps();
    }
    setOpen(next);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dailyApplicationGoal: clampInt(dailyApplicationGoal, 0, 200),
          weeklyApplicationGoal: clampInt(weeklyApplicationGoal, 0, 500),
          weeklyInterviewGoal: clampInt(weeklyInterviewGoal, 0, 100),
          weeklyNetworkingGoal: clampInt(weeklyNetworkingGoal, 0, 200),
          weeklyFollowupGoal: clampInt(weeklyFollowupGoal, 0, 200),
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? "Could not save goals");
        return;
      }
      setOpen(false);
      router.refresh();
    } catch {
      setError("Could not save goals");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="shrink-0 gap-1.5 border-gray-300 text-gray-700"
        onClick={() => handleOpenChange(true)}
        aria-label="Edit weekly goals"
      >
        <Settings2 className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Edit goals</span>
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-md" showCloseButton>
          <DialogHeader>
            <DialogTitle>Edit goals</DialogTitle>
            <DialogDescription>
              Targets used for pacing on the dashboard and in the action center. Changes apply
              immediately after you save.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 py-1">
            <GoalField
              id="daily-app"
              label="Applications per day"
              value={dailyApplicationGoal}
              onChange={setDailyApplicationGoal}
              min={0}
              max={200}
            />
            <GoalField
              id="weekly-app"
              label="Applications per week"
              value={weeklyApplicationGoal}
              onChange={setWeeklyApplicationGoal}
              min={0}
              max={500}
            />
            <GoalField
              id="weekly-int"
              label="Interviews per week"
              value={weeklyInterviewGoal}
              onChange={setWeeklyInterviewGoal}
              min={0}
              max={100}
            />
            <GoalField
              id="weekly-net"
              label="Networking touches per week"
              value={weeklyNetworkingGoal}
              onChange={setWeeklyNetworkingGoal}
              min={0}
              max={200}
            />
            <GoalField
              id="weekly-fu"
              label="Follow-ups per week"
              value={weeklyFollowupGoal}
              onChange={setWeeklyFollowupGoal}
              min={0}
              max={200}
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : "Save goals"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function GoalField({
  id,
  label,
  value,
  onChange,
  min,
  max,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (n: number) => void;
  min: number;
  max: number;
}) {
  return (
    <div>
      <label htmlFor={id} className="text-xs font-medium text-gray-600 block mb-1">
        {label}
      </label>
      <input
        id={id}
        type="number"
        min={min}
        max={max}
        value={Number.isFinite(value) ? value : 0}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-9 rounded-md border border-gray-200 px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900/20"
      />
    </div>
  );
}
