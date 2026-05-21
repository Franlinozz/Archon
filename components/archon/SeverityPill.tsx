import { cn } from "@/lib/utils";
import { severityStyles, type Severity } from "./severity";

const sizes = { sm: "px-2 py-0.5 text-[11px]", md: "px-3 py-1 text-xs" } as const;
export function SeverityPill({ severity, size = "md" }: { severity: Severity; size?: keyof typeof sizes }) {
  return <span className={cn("inline-flex items-center rounded-pill border font-mono font-semibold uppercase tracking-[0.12em]", severityStyles[severity], sizes[size])}>{severity}</span>;
}
