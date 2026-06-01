"use client";

import { useCallback, useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";

export type TocSection = { id: string; label: string };

/**
 * Left table-of-contents with IntersectionObserver scroll-spy. The active link
 * is the top-most section currently within the top band of the viewport
 * (rootMargin trims the bottom 70%), with a bottom-of-page fallback so the last
 * section lights up when you reach the end.
 */
export function DocsToc({ sections }: { sections: TocSection[] }) {
  const reduce = useReducedMotion();
  const [activeId, setActiveId] = useState<string>(sections[0]?.id ?? "");

  const recompute = useCallback(() => {
    // Bottom-of-page fallback: if scrolled to the end, the last section is active
    // even if it never reaches the reading line.
    if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2) {
      const last = sections[sections.length - 1]?.id;
      if (last) setActiveId(last);
      return;
    }
    // Active = the section currently under the reading line (just below the sticky
    // header): the LAST section whose top has crossed the line. Reading live rects
    // (not "top-most intersecting") avoids the off-by-one where a section you just
    // scrolled past still pokes into the band and steals the highlight.
    const LINE = 120;
    let current = sections[0]?.id ?? "";
    for (const s of sections) {
      const el = document.getElementById(s.id);
      if (el && el.getBoundingClientRect().top <= LINE) current = s.id;
    }
    if (current) setActiveId(current);
  }, [sections]);

  useEffect(() => {
    const observer = new IntersectionObserver(() => recompute(), { rootMargin: "0px 0px -40% 0px", threshold: [0, 1] });
    const nodes = sections.map((s) => document.getElementById(s.id)).filter((n): n is HTMLElement => !!n);
    nodes.forEach((n) => observer.observe(n));
    // Also recompute on scroll for the bottom-of-page fallback.
    const onScroll = () => recompute();
    window.addEventListener("scroll", onScroll, { passive: true });
    recompute();
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", onScroll);
    };
  }, [sections, recompute]);

  const onClick = (event: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    event.preventDefault();
    setActiveId(id);
    el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    history.replaceState(null, "", `#${id}`);
  };

  return (
    <nav className="sticky top-20 space-y-1 text-sm" aria-label="On this page">
      <p className="mb-2 font-mono text-xs uppercase tracking-[0.14em] text-brand-500">Documentation</p>
      {sections.map((s) => {
        const active = s.id === activeId;
        return (
          <a
            key={s.id}
            href={`#${s.id}`}
            onClick={(e) => onClick(e, s.id)}
            aria-current={active ? "true" : undefined}
            className={`relative block rounded-control py-1.5 pl-3 pr-3 transition-colors ${
              active ? "font-semibold text-brand-700" : "text-muted hover:bg-surface-2 hover:text-ink"
            }`}
          >
            {active ? (
              <motion.span
                layoutId="docs-toc-active"
                className="absolute inset-y-1 left-0 w-[3px] rounded-pill bg-brand-500"
                transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 500, damping: 38 }}
              />
            ) : null}
            {s.label}
          </a>
        );
      })}
    </nav>
  );
}

/** Thin reading-progress bar pinned just under the sticky header (0→100% scroll depth). */
export function ReadingProgress() {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      const doc = document.documentElement;
      const max = doc.scrollHeight - window.innerHeight;
      setProgress(max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return (
    <div
      className="fixed inset-x-0 top-14 z-40 h-0.5 bg-transparent"
      role="progressbar"
      aria-label="Reading progress"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(progress * 100)}
    >
      <div className="h-full origin-left bg-brand-500" style={{ transform: `scaleX(${progress})` }} />
    </div>
  );
}
