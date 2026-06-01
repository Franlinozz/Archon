"use client";

import Image from "next/image";
import Link from "next/link";
import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from "framer-motion";
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
            <Link className="rounded-control border border-border-subtle px-4 py-2.5 text-sm text-body transition-colors hover:border-border-emphasis hover:text-ink" href="/proofs">View Proofs</Link>
          </motion.div>
        </motion.div>
      </div>

      <HeroSeal reduce={!!reduce} />
    </section>
  );
}

function HeroSeal({ reduce }: { reduce: boolean }) {
  // Pointer tilt: normalized -1..1, spring-smoothed, mapped to ≤8° rotate + ≤8px
  // translate. Skipped on touch / reduced-motion.
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const sx = useSpring(mx, { stiffness: 150, damping: 18 });
  const sy = useSpring(my, { stiffness: 150, damping: 18 });
  const rotateY = useTransform(sx, [-1, 1], [-8, 8]);
  const rotateX = useTransform(sy, [-1, 1], [8, -8]);
  const translateX = useTransform(sx, [-1, 1], [-8, 8]);
  const translateY = useTransform(sy, [-1, 1], [-8, 8]);

  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (reduce || (typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches)) return;
    const r = e.currentTarget.getBoundingClientRect();
    mx.set(Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width / 2)) / (r.width / 2))));
    my.set(Math.max(-1, Math.min(1, (e.clientY - (r.top + r.height / 2)) / (r.height / 2))));
  };
  const onLeave = () => { mx.set(0); my.set(0); };

  const ringDraw = reduce
    ? { pathLength: 1, opacity: 0.6 }
    : { pathLength: 1, opacity: 0.6, transition: { pathLength: { duration: 1.1, ease: EASE, delay: 0.25 }, opacity: { duration: 0.3, delay: 0.25 } } };

  return (
    <motion.div
      className="relative rounded-card border border-border-subtle bg-surface-1 p-5 shadow-card"
      initial={reduce ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: EASE, delay: reduce ? 0 : 0.15 }}
    >
      {/* "Built for Mantle Mainnet · Live" card, floats in after the mark. */}
      <motion.div
        className="absolute right-4 top-4 z-20 inline-flex items-center gap-2 rounded-pill border border-success/30 bg-success/10 px-2.5 py-1 text-xs text-success"
        initial={reduce ? false : { opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: EASE, delay: reduce ? 0 : 0.9 }}
      >
        <span className="relative flex size-1.5">
          {!reduce ? <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-75" /> : null}
          <span className="relative inline-flex size-1.5 rounded-full bg-success" />
        </span>
        Built for Mantle Mainnet · Live
      </motion.div>

      <div className="mt-10 grid place-items-center rounded-card border border-brand-500/20 bg-terminal p-8" style={{ perspective: 900 }}>
        {/* Tilt layer (pointer parallax) + entrance scale. */}
        <motion.div
          onMouseMove={onMove}
          onMouseLeave={onLeave}
          className="relative grid place-items-center"
          style={{ rotateX, rotateY, x: translateX, y: translateY, transformStyle: "preserve-3d" }}
          initial={reduce ? false : { opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: "spring", stiffness: 140, damping: 16, delay: reduce ? 0 : 0.1 }}
        >
          {/* Idle float (gentle, the whole composition). */}
          <motion.div
            className="relative grid size-52 place-items-center"
            animate={reduce ? undefined : { y: [0, -6, 0] }}
            transition={reduce ? undefined : { duration: 4, ease: "easeInOut", repeat: Infinity }}
          >
            {/* breathing brand glow */}
            {!reduce ? (
              <motion.div
                aria-hidden
                className="pointer-events-none absolute size-44 rounded-full bg-brand-500/25 blur-2xl"
                animate={{ opacity: [0.3, 0.5, 0.3] }}
                transition={{ duration: 3, ease: "easeInOut", repeat: Infinity }}
              />
            ) : null}

            {/* faint outer ring, slow rotation + entrance draw */}
            <svg width="220" height="220" viewBox="0 0 220 220" fill="none" className="absolute" aria-hidden>
              <motion.circle cx="110" cy="110" r="104" stroke="var(--brand-500)" strokeWidth="1.5" strokeDasharray="4 9" strokeLinecap="round"
                style={{ transformOrigin: "110px 110px", willChange: "transform" }}
                initial={reduce ? { pathLength: 1, opacity: 0.5 } : { pathLength: 0, opacity: 0 }}
                animate={reduce ? { rotate: 0 } : { pathLength: 1, opacity: 0.5, rotate: 360 }}
                transition={reduce ? undefined : { pathLength: { duration: 1.1, ease: EASE }, opacity: { duration: 0.3 }, rotate: { duration: 22, ease: "linear", repeat: Infinity } }} />
              {/* crisp inner ring draws around the mark */}
              <motion.circle cx="110" cy="110" r="92" stroke="var(--brand-500)" strokeWidth="2"
                initial={reduce ? false : { pathLength: 0, opacity: 0 }} animate={ringDraw} style={{ transformOrigin: "110px 110px" }} />
            </svg>

            {/* The real mark, theme-correct, clipped tile with a scan-beam sweep. */}
            <div className="relative size-36 overflow-hidden rounded-2xl shadow-card" style={{ backfaceVisibility: "hidden" }}>
              <Image src="/mark-light.png" alt="Archon" width={144} height={144} priority className="only-marble size-36 object-cover" />
              <Image src="/mark-dark.png" alt="" aria-hidden width={144} height={144} priority className="only-obsidian size-36 object-cover" />
              {!reduce ? <span className="archon-scan-beam" aria-hidden /> : null}
            </div>
          </motion.div>
        </motion.div>
      </div>
    </motion.div>
  );
}
