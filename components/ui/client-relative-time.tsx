"use client";

import { useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";

type Props = {
  /** ISO 8601 timestamp */
  iso: string;
  className?: string;
};

/**
 * Renders "time ago" text only after mount so SSR and hydration match
 * (avoids server "8 minutes ago" vs client "9 minutes ago" mismatches).
 */
export function ClientRelativeTime({ iso, className }: Props) {
  const [label, setLabel] = useState("");

  useEffect(() => {
    const t = new Date(iso);
    if (Number.isNaN(t.getTime())) {
      setLabel("—");
      return;
    }
    function tick() {
      setLabel(formatDistanceToNow(t, { addSuffix: true }));
    }
    tick();
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, [iso]);

  return (
    <span className={className} suppressHydrationWarning>
      {label || "\u00A0"}
    </span>
  );
}
