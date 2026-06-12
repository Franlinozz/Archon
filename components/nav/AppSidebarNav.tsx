"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import {
  BadgeCheck,
  FileCode2,
  FileSearch,
  FileText,
  Fingerprint,
  FlaskConical,
  Gauge,
  LayoutDashboard,
  Radar,
  type LucideIcon,
  Settings,
  ShieldAlert,
  Sparkles,
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

type NavGroup = { title: string; items: NavItem[] };

const navGroups: NavGroup[] = [
  { title: "Command", items: [
    { label: "Overview", href: "/app", icon: LayoutDashboard },
    { label: "Creator Workspace", href: "/app/creator", icon: Sparkles, match: "/app/creator" },
    { label: "Contract Context", href: "/app/context", icon: FileSearch },
    { label: "Reports", href: "/app/reports", icon: FileText, match: "/app/reports" },
  ] },
  { title: "Analysis", items: [
    { label: "Audit Studio", href: "/app/audit/new", icon: FileCode2, match: "/app/audit" },
    { label: "Findings", href: "/app/findings", icon: ShieldAlert },
    { label: "Generated Tests", href: "/app/tests", icon: FlaskConical },
    { label: "Gas Optimizer", href: "/app/gas", icon: Gauge, match: "/app/gas" },
    { label: "Cost Guard", href: "/app/cost-guard", icon: Gauge },
    { label: "Sentinel", href: "/app/sentinel", icon: Radar },
  ] },
  { title: "Attestation", items: [
    { label: "On-chain Proof", href: "/app/proofs", icon: BadgeCheck },
    { label: "Verified Builds", href: "/app/attest", icon: Fingerprint, match: "/app/attest" },
    { label: "Validation", href: "/app/validation", icon: ListChecks },
  ] },
  { title: "Control", items: [
    { label: "Settings", href: "/app/settings", icon: Settings },
  ] },
];

const nav = navGroups.flatMap((group) => group.items);

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

export function AppSidebarNav({ variant = "sidebar", onNavigate }: { variant?: "sidebar" | "sheet"; onNavigate?: () => void } = {}) {
  const pathname = usePathname() ?? "";
  const reduce = useReducedMotion();
  const active = activeIndex(pathname);
  const sheet = variant === "sheet";

  return (
    <nav className={sheet ? "block space-y-6" : "mt-8 block space-y-5"}>
      {navGroups.map((group) => <div key={group.title} className="block space-y-1">
        <p className="block px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">{group.title}</p>
        {group.items.map((item) => {
        const i = nav.indexOf(item);
        const isActive = i === active;
        const Icon = item.icon;
        return (
          <Link
            key={item.label}
            href={item.href}
            onClick={onNavigate}
            aria-current={isActive ? "page" : undefined}
            className={`relative flex items-center gap-2.5 rounded-control px-3 text-sm transition-colors ${sheet ? "py-2.5 text-base" : "py-1.5"} ${
              isActive
                ? "bg-brand-100 font-semibold text-brand-700"
                : "text-body hover:bg-surface-2 hover:text-ink"
            }`}
          >
            {isActive ? (
              <motion.span
                layoutId={`sidebar-active-${variant}`}
                className="absolute inset-y-1 left-0 w-[3px] rounded-pill bg-brand-500"
                transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 500, damping: 38 }}
              />
            ) : null}
            <Icon size={16} className={isActive ? "text-brand-600" : "text-muted"} aria-hidden />
            <span className="truncate">{item.label}</span>
          </Link>
        );
      })}
      </div>)}
    </nav>
  );
}
