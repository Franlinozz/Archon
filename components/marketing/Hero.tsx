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

      <div className="relative mt-8 grid min-h-[300px] place-items-center overflow-hidden rounded-card" style={{ perspective: 900 }}>
        {/* soft ambient stage backdrop (no border, no panel) */}
        <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(60% 60% at 50% 45%, var(--brand-100), transparent 70%)" }} />

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
          {/* Idle float. */}
          <motion.div
            className="relative grid place-items-center"
            animate={reduce ? undefined : { y: [0, -7, 0] }}
            transition={reduce ? undefined : { duration: 4.2, ease: "easeInOut", repeat: Infinity }}
          >
            {/* breathing brand glow behind the mark */}
            {!reduce ? (
              <motion.div
                aria-hidden
                className="pointer-events-none absolute size-56 rounded-full bg-brand-500/30 blur-3xl"
                animate={{ opacity: [0.3, 0.55, 0.3], scale: [0.92, 1.04, 0.92] }}
                transition={{ duration: 3.2, ease: "easeInOut", repeat: Infinity }}
              />
            ) : null}

            {/* The real mark — transparent, floating, no square/rings. A brand sheen
                sweeps across the glyph itself (masked to its exact shape). */}
            <div className="relative" style={{ backfaceVisibility: "hidden" }}>
              <Image src="/mark-light-cut.png" alt="Archon" width={474} height={611} priority className="only-marble h-60 w-auto object-contain drop-shadow-[0_14px_34px_rgba(22,160,107,0.30)]" />
              <Image src="/mark-dark-cut.png" alt="" aria-hidden width={462} height={590} priority className="only-obsidian h-60 w-auto object-contain drop-shadow-[0_14px_38px_rgba(39,181,103,0.35)]" />
              {!reduce ? (
                <>
                  <span aria-hidden className="archon-mark-sheen only-marble" style={{ WebkitMaskImage: "url(/mark-light-cut.png)", maskImage: "url(/mark-light-cut.png)" }} />
                  <span aria-hidden className="archon-mark-sheen only-obsidian" style={{ WebkitMaskImage: "url(/mark-dark-cut.png)", maskImage: "url(/mark-dark-cut.png)" }} />
                </>
              ) : null}
            </div>
          </motion.div>
        </motion.div>
      </div>
    </motion.div>
  );
}
