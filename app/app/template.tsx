"use client";

import { RouteTransition } from "@/components/motion";

// Re-mounts on every in-workspace navigation, so page content cross-fades (180ms)
// while the sidebar/header (in layout.tsx) persist. Reduced-motion handled inside.
export default function AppTemplate({ children }: { children: React.ReactNode }) {
  return <RouteTransition>{children}</RouteTransition>;
}
