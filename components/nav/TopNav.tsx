"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";

type TopNavItem = {
  label: string;
  href: string;
  /** Active-match prefix (defaults to href). Home anchor uses exact "/". */
  match: string;
  exact?: boolean;
};

export const topNavItems: TopNavItem[] = [
  { label: "Product", href: "/#product", match: "/", exact: true },
  { label: "Audit Studio", href: "/app/audit/new", match: "/app/audit" },
  { label: "Cost Guard", href: "/app/cost-guard", match: "/app/cost-guard" },
  { label: "Leaderboard", href: "/gas-leaderboard", match: "/gas-leaderboard" },
  { label: "Reports", href: "/proofs", match: "/proofs" },
  { label: "Docs", href: "/docs", match: "/docs" },
];
const items = topNavItems;

function isActive(pathname: string, item: TopNavItem): boolean {
  if (item.exact) return pathname === item.match;
  return pathname === item.match || pathname.startsWith(item.match + "/");
}

export function TopNav() {
  const pathname = usePathname() ?? "/";
  const reduce = useReducedMotion();

  return (
    <nav className="hidden items-center gap-6 text-sm md:flex">
      {items.map((item) => {
        const active = isActive(pathname, item);
        return (
          <Link
            key={item.label}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`relative py-1 transition-colors ${active ? "text-ink" : "text-body hover:text-ink"}`}
          >
            {item.label}
            {active ? (
              <motion.span
                layoutId="topnav-active"
                className="absolute -bottom-0.5 left-0 right-0 h-0.5 rounded-pill bg-brand-500"
                transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 500, damping: 38 }}
              />
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
