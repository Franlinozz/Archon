"use client";

import Link from "next/link";
import { Activity, BookOpen, FileText, Github, Terminal, Youtube, type LucideIcon } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { fadeUp, instant, staggerContainer, viewportOnce } from "@/lib/motion";

// V5.8 (A) — a calm "Developers & Resources" strip, ~35% loud, placed just above
// the final CTA. Whitepaper + API reference are the point; the rest ride along so
// it reads as a resources strip, not a whitepaper flex. Muted by default, accent
// on hover; one quiet scroll-reveal (60ms stagger), 2px lift, accent underline.

type Resource = { icon: LucideIcon; label: string; descriptor: string; href: string; external?: boolean };

const RESOURCES: Resource[] = [
  { icon: FileText, label: "Whitepaper", descriptor: "The protocol & proof model (PDF).", href: "/whitepaper.pdf", external: true },
  { icon: Youtube, label: "Demo video", descriptor: "2-min product walkthrough.", href: "https://youtu.be/d0xn5OYBENA", external: true },
  { icon: Terminal, label: "API Reference", descriptor: "Verdict & MCP endpoints for agents.", href: "/api-reference" },
  { icon: BookOpen, label: "Documentation", descriptor: "Guides for every Archon surface.", href: "/docs" },
  { icon: Activity, label: "Gas Observatory", descriptor: "Live Mantle DA economics.", href: "/observatory" },
  { icon: Github, label: "GitHub", descriptor: "Read the source, in the open.", href: "https://github.com/Franlinozz/Archon", external: true },
];

export function ResourcesStrip() {
  const reduce = useReducedMotion();

  return (
    <section className="mx-auto max-w-7xl px-6 pb-4 pt-8 md:pt-12">
      <motion.p
        className="font-mono text-xs uppercase tracking-[0.18em] text-muted"
        variants={instant(fadeUp, reduce)}
        initial={reduce ? false : "hidden"}
        whileInView="show"
        viewport={viewportOnce}
      >
        Built in the open
      </motion.p>

      <motion.div
        className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6"
        variants={instant(staggerContainer, reduce)}
        initial={reduce ? false : "hidden"}
        whileInView="show"
        viewport={viewportOnce}
      >
        {RESOURCES.map((r) => <ResourceCard key={r.label} {...r} reduce={!!reduce} />)}
      </motion.div>
    </section>
  );
}

function ResourceCard({ icon: Icon, label, descriptor, href, external, reduce }: Resource & { reduce: boolean }) {
  const className = "archon-card-lift group flex h-full flex-col rounded-card border border-border-subtle bg-surface-1/60 p-4";
  const inner = (
    <>
      <Icon size={16} className="text-muted transition-colors group-hover:text-brand-500" aria-hidden />
      <span className="mt-3 text-sm font-semibold text-body transition-colors group-hover:text-ink">{label}</span>
      <span className="mt-1 text-xs leading-5 text-muted">{descriptor}</span>
      <span className="mt-3 block h-px w-6 bg-border-emphasis transition-all duration-200 group-hover:w-full group-hover:bg-brand-500" />
    </>
  );
  return (
    <motion.div variants={instant(fadeUp, reduce)} className="h-full">
      {external
        ? <a href={href} target="_blank" rel="noreferrer" className={className}>{inner}</a>
        : <Link href={href} className={className}>{inner}</Link>}
    </motion.div>
  );
}
