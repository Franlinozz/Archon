import type { Transition, Variant, Variants } from "framer-motion";

// Archon motion system — one cohesive language. Transform/opacity only (never
// layout properties), tuned fast, and every variant collapses to instant under
// prefers-reduced-motion via the `instant()` guard below. Concentrate motion on
// a few orchestrated moments (hero, scan pipeline, count-ups) rather than
// animating everything.

/** Calm ease-out used across the system. */
export const EASE = [0.22, 1, 0.36, 1] as const;

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: EASE } },
};

/** Container that staggers its direct <motion> children. */
export const staggerContainer: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
};

/** For popovers / menus / checkmarks. */
export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.96 },
  show: { opacity: 1, scale: 1, transition: { duration: 0.18, ease: EASE } },
};

/** Headline word-by-word reveal. */
export const wordContainer: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05, delayChildren: 0.04 } },
};
export const wordItem: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: EASE } },
};

/** Smooth spring for progress fills / sliding indicators. */
export const progressSpring: Transition = { type: "spring", stiffness: 120, damping: 24 };

/** Shared viewport config so scroll reveals fire once and don't replay. */
export const viewportOnce = { once: true, margin: "0px 0px -10% 0px" } as const;

/**
 * Collapse a variant set to instant for reduced-motion users. Pass the result of
 * useReducedMotion(); when true, returns variants whose `show` has no transition
 * and whose `hidden` equals `show` is NOT done here — instead, components should
 * also set `initial={reduce ? false : "hidden"}` so nothing ever animates in.
 */
export function instant<T extends Variants>(variants: T, reduce: boolean | null): T {
  if (!reduce) return variants;
  const stripped: Record<string, Variant> = {};
  for (const [key, value] of Object.entries(variants) as [string, Variant][]) {
    stripped[key] =
      value && typeof value === "object" && !Array.isArray(value)
        ? { ...value, transition: { duration: 0 } as Transition }
        : value;
  }
  return stripped as T;
}
