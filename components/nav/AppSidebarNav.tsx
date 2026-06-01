"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import {
  BadgeCheck,
  FileCode2,
  FileSearch,
  FileText,
  FlaskConical,
  Gauge,
  LayoutDashboard,
  type LucideIcon,
  Settings,
  ShieldAlert,
  ListChecks,
} from "lucide-react";

type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Prefix used for active-matching (defaults to href). Lets "Reports" light on
   *  /app/reports/* while its click target stays the Overview at /app. */
  match?: string;
};

const nav: NavItem[] = [
  { label: "Overview", href: "/app", icon: LayoutDashboard },
  { label: "Audit Studio", href: "/app/audit/new", icon: FileCode2, match: "/app/audit" },
  { label: "Contract Context", href: "/app/context", icon: FileSearch },
  { label: "Reports", href: "/app", icon: FileText, match: "/app/reports" },
  { label: "Findings", href: "/app/findings", icon: ShieldAlert },
  { label: "Generated Tests", href: "/app/tests", icon: FlaskConical },
  { label: "Cost Guard", href: "/app/cost-guard", icon: Gauge },
  { label: "On-chain Proof", href: "/app/proofs", icon: BadgeCheck },
  { label: "Validation", href: "/app/validation", icon: ListChecks },
  { label: "Settings", href: "/app/settings", icon: Settings },
];

function matches(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(prefix + "/");
}

/**
 * Picks the single active item by longest-prefix match, so nested routes light
 * the most specific item (e.g. /app/cost-guard → Cost Guard, not Overview) and
 * /app/reports/123/findings/9 → Reports.
 */
function activeIndex(pathname: string): number {
  let best = -1;
  let bestLen = -1;
  nav.forEach((item, i) => {
    const prefix = item.match ?? item.href;
    if (matches(pathname, prefix) && prefix.length > bestLen) {
      best = i;
      bestLen = prefix.length;
    }
  });
  return best;
}

export function AppSidebarNav() {
  const pathname = usePathname() ?? "";
  const reduce = useReducedMotion();
  const active = activeIndex(pathname);

  return (
    <nav className="mt-3 flex gap-1 overflow-x-auto md:mt-8 md:block md:space-y-0.5">
      {nav.map((item, i) => {
        const isActive = i === active;
        const Icon = item.icon;
        return (
          <Link
            key={item.label}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            className={`relative flex shrink-0 items-center gap-2.5 rounded-control px-3 py-1.5 text-sm transition-colors ${
              isActive
                ? "bg-brand-100 font-semibold text-brand-700"
                : "text-body hover:bg-surface-2 hover:text-ink"
            }`}
          >
            {isActive ? (
              <motion.span
                layoutId="sidebar-active"
                className="absolute inset-y-1 left-0 w-[3px] rounded-pill bg-brand-500"
                transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 500, damping: 38 }}
              />
            ) : null}
            <Icon size={16} className={isActive ? "text-brand-600" : "text-muted"} aria-hidden />
            <span className="truncate">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
