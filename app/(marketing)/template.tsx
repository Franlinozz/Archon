"use client";

import { RouteTransition } from "@/components/motion";

// Quick 180ms cross-fade on public-site navigation; the marketing header
// (layout.tsx) persists. Reduced-motion is handled inside RouteTransition.
export default function MarketingTemplate({ children }: { children: React.ReactNode }) {
  return <RouteTransition>{children}</RouteTransition>;
}
