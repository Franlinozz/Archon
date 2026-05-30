"use client";

import { FadeRise } from "@/components/motion";

// Re-mounts on every in-workspace navigation, so page content fades+rises while the
// sidebar/header (in layout.tsx) persist. Reduced-motion is handled inside FadeRise.
export default function AppTemplate({ children }: { children: React.ReactNode }) {
  return <FadeRise>{children}</FadeRise>;
}
