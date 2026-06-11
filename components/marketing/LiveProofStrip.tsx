"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { CountUp, Reveal } from "@/components/motion";

// Slim band of REAL production numbers — each links to the public surface that
// proves it. Values arrive pre-formatted from the server (no client fetch, no
// layout shift: mono digits + reserved line heights).
export type StripStat = { value: string; label: string; href: string; external?: boolean };

export function LiveProofStrip({ stats }: { stats: StripStat[] }) {
  return (
    <section aria-label="Live production numbers" className="border-y border-border-subtle bg-surface-1/60">
      <Reveal className="mx-auto max-w-7xl px-6 py-7">
        <div className="grid grid-cols-2 gap-x-6 gap-y-7 md:grid-cols-4">
          {stats.map((stat) => (
            <Link key={stat.label} href={stat.href} {...(stat.external ? { target: "_blank", rel: "noreferrer" } : {})} className="group">
              <p className="font-mono text-3xl text-ink [font-variant-numeric:tabular-nums] md:text-4xl"><CountUp value={stat.value} /></p>
              <p className="mt-1.5 flex items-center gap-1 text-xs uppercase tracking-[0.14em] text-muted transition-colors group-hover:text-brand-500">
                {stat.label}
                <ArrowUpRight size={12} className="opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
              </p>
            </Link>
          ))}
        </div>
        <p className="mt-5 text-[11px] text-muted">Live from Archon&apos;s production database — refreshed every minute.</p>
      </Reveal>
    </section>
  );
}
