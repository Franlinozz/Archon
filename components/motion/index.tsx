"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import { motion, useInView, useReducedMotion, type Variants } from "framer-motion";
import { fadeUp, instant, viewportOnce } from "@/lib/motion";

// Archon motion system — tasteful, fast, transform/opacity only. All non-essential motion
// is gated behind prefers-reduced-motion (framer's useReducedMotion).

const EASE = [0.22, 0.61, 0.36, 1] as const; // calm ease-out

// Scroll reveal: fades+rises its children into view once. Static under reduced motion.
export function Reveal({ children, className }: { children: ReactNode; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      variants={instant(fadeUp, reduce)}
      initial={reduce ? false : "hidden"}
      whileInView="show"
      viewport={viewportOnce}
    >
      {children}
    </motion.div>
  );
}

// Quick fade+rise used for route/section entrances.
export function FadeRise({ children, className, delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: EASE, delay }}
    >
      {children}
    </motion.div>
  );
}

// Route cross-fade: a quick 180ms opacity fade on navigation (the persistent
// chrome lives in layout.tsx). Opacity-only so there's no layout shift.
export function RouteTransition({ children }: { children: ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}

// Staggered list container + item. Use <Stagger> around mapped <StaggerItem>s.
const containerVariants: Variants = { hidden: {}, show: { transition: { staggerChildren: 0.04 } } };
const itemVariants: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.2, ease: EASE } },
};

export function Stagger({ children, className }: { children: ReactNode; className?: string }) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div className={className} variants={containerVariants} initial="hidden" animate="show">
      {children}
    </motion.div>
  );
}

export function StaggerItem({ children, className }: { children: ReactNode; className?: string }) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return <motion.div className={className} variants={itemVariants}>{children}</motion.div>;
}

// Count-up for KPI numbers. Animates 0 -> real value on first paint; renders the real value
// immediately (no animation) under reduced motion. Non-numeric values (e.g. "—") pass through.
// Parse a numeric core out of a display string so "$86", "42k", "$3.40", and
// "1,234" all count up while keeping their prefix/suffix and decimals. Returns
// null for non-numeric values (e.g. "—"), which then render instantly.
type Parsed = { prefix: string; suffix: string; target: number; decimals: number; grouped: boolean };
function parseCountValue(value: string): Parsed | null {
  const match = value.match(/^(\D*?)(-?\d[\d,]*(?:\.\d+)?)(.*)$/s);
  if (!match) return null;
  const prefix = match[1] ?? "";
  const numRaw = match[2] ?? "";
  const suffix = match[3] ?? "";
  const clean = numRaw.replace(/,/g, "");
  const target = Number(clean);
  if (!Number.isFinite(target)) return null;
  const decimals = clean.includes(".") ? (clean.split(".")[1]?.length ?? 0) : 0;
  return { prefix, suffix, target, decimals, grouped: numRaw.includes(",") };
}

export function CountUp({ value, className, duration = 900 }: { value: string; className?: string; duration?: number }) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "0px 0px -10% 0px" });
  const parsed = parseCountValue(value);
  const format = (n: number) =>
    parsed
      ? parsed.prefix +
        n.toLocaleString(undefined, {
          minimumFractionDigits: parsed.decimals,
          maximumFractionDigits: parsed.decimals,
          useGrouping: parsed.grouped,
        }) +
        parsed.suffix
      : value;
  const [display, setDisplay] = useState(() => (parsed && !reduce ? format(0) : value));
  const ranRef = useRef(false);

  useEffect(() => {
    if (!parsed || reduce) {
      setDisplay(value);
      return;
    }
    if (!inView || ranRef.current) return; // wait until scrolled into view; run once
    ranRef.current = true;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
      setDisplay(format(eased * parsed.target));
      if (t < 1) raf = requestAnimationFrame(tick);
      else setDisplay(value);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, reduce, duration, inView]);

  return <span ref={ref} className={className}>{display}</span>;
}
