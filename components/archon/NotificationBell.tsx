"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell, CheckCircle2, FileText, ShieldCheck } from "lucide-react";

type Event = { kind: "proof" | "report" | "scan"; ref: string; label: string; detail: string; at: string };

function ago(iso: string) {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

const iconFor = { proof: ShieldCheck, report: FileText, scan: CheckCircle2 } as const;
const hrefFor = (e: Event) => (e.kind === "scan" ? `/app/scans/${e.ref}` : e.kind === "proof" ? "/app/proofs" : `/app/reports/${e.ref}`);

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [events, setEvents] = useState<Event[] | null>(null);
  const [loading, setLoading] = useState(false);
  const wrap = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open || events) return;
    setLoading(true);
    fetch("/api/activity", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setEvents(Array.isArray(d.events) ? d.events : []))
      .catch(() => setEvents([]))
      .finally(() => setLoading(false));
  }, [open, events]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => { if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onClick); document.removeEventListener("keydown", onKey); };
  }, [open]);

  return (
    <div ref={wrap} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Workspace notifications"
        aria-expanded={open}
        className="rounded-control border border-border-subtle bg-surface-2 p-1.5 text-text-mid transition-colors hover:border-border-emphasis hover:text-text-hi"
      >
        <Bell size={17} />
      </button>
      {open ? (
        <div className="absolute right-0 z-50 mt-2 w-[320px] overflow-hidden rounded-card border border-border-subtle bg-surface-1 shadow-2xl shadow-black/40">
          <div className="border-b border-border-subtle px-4 py-3"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-text-low">Recent activity</p></div>
          <div className="max-h-[360px] overflow-y-auto">
            {loading ? (
              <p className="px-4 py-6 text-center text-sm text-text-low">Loading…</p>
            ) : events && events.length ? (
              events.map((e, i) => {
                const Icon = iconFor[e.kind] ?? FileText;
                return (
                  <Link key={`${e.kind}-${e.ref}-${i}`} href={hrefFor(e)} onClick={() => setOpen(false)} className="flex items-start gap-3 border-b border-border-subtle px-4 py-3 text-sm transition-colors last:border-0 hover:bg-surface-2">
                    <Icon size={15} className="mt-0.5 shrink-0 text-green-400" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-text-hi">{e.detail}</span>
                      <span className="block truncate text-xs text-text-low">{e.label} · {ago(e.at)}</span>
                    </span>
                  </Link>
                );
              })
            ) : (
              <p className="px-4 py-8 text-center text-sm text-text-low">No activity yet. Run an audit and events will appear here.</p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
