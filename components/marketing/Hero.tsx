"use client";

import Link from "next/link";
import { motion, useMotionValue, useReducedMotion, useSpring } from "framer-motion";
import { EASE, fadeUp, instant, wordContainer, wordItem } from "@/lib/motion";

// "Mantle Mainnet" (the last two words) carries the brand accent.
const HEADLINE = ["AI-Powered", "Safety", "Layer", "for", "Mantle", "Mainnet"];
const BRAND_FROM = 4;
const CHIPS = ["Mantle Mainnet Native", "ERC-8004 Trustless", "AI Risk Detection", "On-chain Proof"];

export function Hero() {
  const reduce = useReducedMotion();

  return (
    <section className="archon-arch mx-auto grid max-w-7xl gap-8 px-6 py-14 lg:grid-cols-[1fr_420px] lg:items-center">
      <div>
        <motion.p
          className="font-mono text-xs uppercase tracking-[0.16em] text-brand-500"
          variants={instant(fadeUp, reduce)}
          initial={reduce ? false : "hidden"}
          animate="show"
        >
          ERC-8004 trustless auditor · Mantle Mainnet
        </motion.p>

        {/* Word-by-word headline reveal. */}
        <motion.h1
          className="mt-3 font-display text-5xl leading-[1.05] tracking-[-0.04em] text-ink md:text-7xl"
          variants={instant(wordContainer, reduce)}
          initial={reduce ? false : "hidden"}
          animate="show"
        >
          {HEADLINE.map((word, i) => (
            <motion.span
              key={`${word}-${i}`}
              variants={instant(wordItem, reduce)}
              className={`mr-[0.25em] inline-block ${i >= BRAND_FROM ? "text-brand-600" : ""}`}
            >
              {word}
            </motion.span>
          ))}
        </motion.h1>

        {/* Subhead + chips + CTAs stagger in after the headline. */}
        <motion.div
          variants={instant({ hidden: {}, show: { transition: { staggerChildren: 0.06, delayChildren: 0.35 } } }, reduce)}
          initial={reduce ? false : "hidden"}
          animate="show"
        >
          <motion.p variants={instant(fadeUp, reduce)} className="mt-4 max-w-xl text-lg leading-relaxed text-body">
            Archon is an ERC-8004 trustless audit agent: it scans smart contracts, explains Mantle-specific risk, generates tests, and anchors reviewed reports as verifiable on-chain reputation.
          </motion.p>
          <motion.div variants={instant(fadeUp, reduce)} className="mt-5 flex flex-wrap gap-2">
            {CHIPS.map((chip) => (
              <span key={chip} className="rounded-pill border border-brand-500/30 bg-brand-50 px-3 py-1 text-xs text-brand-600">{chip}</span>
            ))}
          </motion.div>
          <motion.div variants={instant(fadeUp, reduce)} className="mt-6 flex flex-wrap gap-3">
            <Link className="archon-sheen rounded-control bg-green-400 px-4 py-2.5 text-sm font-semibold text-on-green transition-colors hover:bg-green-300" href="/app/audit/new">Start Mainnet Audit</Link>
            <Link className="rounded-control border border-border-subtle px-4 py-2.5 text-sm text-body transition-colors hover:border-border-emphasis hover:text-ink" href="/app/proofs">View Proofs</Link>
          </motion.div>
        </motion.div>
      </div>

      <HeroSeal reduce={!!reduce} />
    </section>
  );
}

function HeroSeal({ reduce }: { reduce: boolean }) {
  // Pointer parallax, clamped to ±8px and spring-smoothed.
  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const x = useSpring(px, { stiffness: 120, damping: 20 });
  const y = useSpring(py, { stiffness: 120, damping: 20 });

  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (reduce) return;
    const r = e.currentTarget.getBoundingClientRect();
    const dx = ((e.clientX - (r.left + r.width / 2)) / (r.width / 2)) * 8;
    const dy = ((e.clientY - (r.top + r.height / 2)) / (r.height / 2)) * 8;
    px.set(Math.max(-8, Math.min(8, dx)));
    py.set(Math.max(-8, Math.min(8, dy)));
  };
  const onLeave = () => {
    px.set(0);
    py.set(0);
  };

  const draw = reduce
    ? { pathLength: 1, opacity: 1 }
    : { pathLength: 1, opacity: 1, transition: { pathLength: { duration: 1.1, ease: EASE }, opacity: { duration: 0.2 } } };

  return (
    <motion.div
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      className="relative rounded-card border border-border-subtle bg-surface-1 p-5 shadow-card"
      initial={reduce ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: EASE, delay: reduce ? 0 : 0.2 }}
    >
      {/* "Built for Mantle Mainnet · Live" card with a pulsing dot. */}
      <div className="absolute right-4 top-4 z-10 inline-flex items-center gap-2 rounded-pill border border-success/30 bg-success/10 px-2.5 py-1 text-xs text-success">
        <span className="relative flex size-1.5">
          {!reduce ? <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-75" /> : null}
          <span className="relative inline-flex size-1.5 rounded-full bg-success" />
        </span>
        Built for Mantle Mainnet · Live
      </div>

      <div className="mt-10 grid place-items-center rounded-card border border-brand-500/20 bg-terminal p-8">
        <motion.div style={{ x, y }} className="relative">
          {/* breathing glow */}
          {!reduce ? (
            <motion.div
              aria-hidden
              className="pointer-events-none absolute left-1/2 top-1/2 size-40 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-500/25 blur-2xl"
              animate={{ opacity: [0.25, 0.55, 0.25], scale: [0.9, 1.05, 0.9] }}
              transition={{ duration: 4, ease: "easeInOut", repeat: Infinity }}
            />
          ) : null}

          <svg width="208" height="208" viewBox="0 0 240 240" fill="none" className="relative text-brand-500">
            {/* outer ring draws on */}
            <motion.circle cx="120" cy="120" r="110" stroke="var(--brand-500)" strokeOpacity="0.5" strokeWidth="2"
              initial={reduce ? false : { pathLength: 0, opacity: 0 }} animate={draw} />
            {/* cross guides draw on */}
            <motion.line x1="120" y1="14" x2="120" y2="226" stroke="var(--brand-500)" strokeOpacity="0.35" strokeWidth="1.5"
              initial={reduce ? false : { pathLength: 0, opacity: 0 }} animate={draw} />
            <motion.line x1="14" y1="120" x2="226" y2="120" stroke="var(--brand-500)" strokeOpacity="0.35" strokeWidth="1.5"
              initial={reduce ? false : { pathLength: 0, opacity: 0 }} animate={draw} />
            {/* inner square draws on */}
            <motion.rect x="58" y="58" width="124" height="124" rx="10" stroke="var(--border-emphasis)" strokeWidth="1.5"
              initial={reduce ? false : { pathLength: 0, opacity: 0 }} animate={draw} />
            {/* slowly rotating dashed seal ring */}
            <motion.circle cx="120" cy="120" r="86" stroke="var(--brand-500)" strokeOpacity="0.6" strokeWidth="2" strokeDasharray="6 10" strokeLinecap="round"
              style={{ transformOrigin: "120px 120px" }}
              animate={reduce ? undefined : { rotate: 360 }}
              transition={reduce ? undefined : { duration: 28, ease: "linear", repeat: Infinity }} />
            <text x="120" y="146" textAnchor="middle" className="fill-brand-600 font-display" style={{ fontSize: 84 }}>Α</text>
          </svg>
        </motion.div>
      </div>
    </motion.div>
  );
}
