"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import { motion, useReducedMotion, type Variants } from "framer-motion";

// Archon motion system — tasteful, fast, transform/opacity only. All non-essential motion
// is gated behind prefers-reduced-motion (framer's useReducedMotion).

const EASE = [0.22, 0.61, 0.36, 1] as const; // calm ease-out

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
export function CountUp({ value, className, duration = 900 }: { value: string; className?: string; duration?: number }) {
  const reduce = useReducedMotion();
  const target = Number(value);
  const isNumeric = value.trim() !== "" && Number.isFinite(target);
  const [display, setDisplay] = useState(() => (isNumeric && !reduce ? "0" : value));
  const ranRef = useRef(false);

  useEffect(() => {
    if (!isNumeric || reduce || ranRef.current) {
      setDisplay(value);
      return;
    }
    ranRef.current = true;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
      setDisplay(String(Math.round(eased * target)));
      if (t < 1) raf = requestAnimationFrame(tick);
      else setDisplay(value);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, target, isNumeric, reduce, duration]);

  return <span className={className}>{display}</span>;
}
