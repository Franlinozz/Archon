"use client";

import { FadeRise } from "@/components/motion";

// Quick fade+rise on public-site navigation; the marketing header (layout.tsx) persists.
export default function MarketingTemplate({ children }: { children: React.ReactNode }) {
  return <FadeRise>{children}</FadeRise>;
}
