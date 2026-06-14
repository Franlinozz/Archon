"use client";

import { useEffect, useState } from "react";

// C — client-light relative time for the Observatory "Recent samples" table.
// Renders "2m ago" with the absolute UTC on hover, self-refreshing every 30s so
// the feed feels live. No new data fetch — formats timestamps already in the snapshot.
function relative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 45) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function RelativeTime({ iso, className }: { iso: string; className?: string }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);
  return (
    <time dateTime={iso} title={new Date(iso).toUTCString()} className={className}>
      {relative(iso)}
    </time>
  );
}
