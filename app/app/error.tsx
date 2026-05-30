"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RefreshCw } from "lucide-react";

// Segment-level boundary for the whole /app workspace. The /app layout is data-free, so
// this renders inside the sidebar/header chrome: a child page that throws degrades to a
// recoverable inline state instead of a full server-side 500.
export default function AppSegmentError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("app segment error:", error.digest ?? error.message);
  }, [error]);

  return (
    <div className="mx-auto max-w-xl rounded-card border border-warning/30 bg-warning/10 p-8 text-center">
      <span className="mx-auto mb-4 grid size-12 place-items-center rounded-full border border-warning/40 text-warning">
        <AlertTriangle size={22} />
      </span>
      <h2 className="text-xl font-semibold text-text-hi">Workspace data is temporarily unavailable</h2>
      <p className="mt-2 text-sm text-text-mid">
        A backend service (database or queue) didn’t respond in time. Your data is safe and no scan or
        on-chain action was affected — this view recovers automatically once the connection returns.
      </p>
      {error.digest ? <p className="mt-3 font-mono text-xs text-text-low">ref: {error.digest}</p> : null}
      <div className="mt-6 flex items-center justify-center gap-3">
        <button
          onClick={reset}
          className="inline-flex items-center gap-2 rounded-control border border-green-400/40 px-4 py-2 text-sm text-green-400 transition hover:bg-green-400/10"
        >
          <RefreshCw size={15} /> Retry
        </button>
        <Link
          href="/app"
          className="rounded-control border border-border-subtle px-4 py-2 text-sm text-text-mid transition hover:text-green-400"
        >
          Reload workspace
        </Link>
      </div>
    </div>
  );
}
