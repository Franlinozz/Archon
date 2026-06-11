"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu } from "lucide-react";
import { MainnetBadge } from "@/components/archon";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { MobileSheet } from "@/components/nav/MobileSheet";
import { topNavItems } from "@/components/nav/TopNav";

// Public-site mobile navigation: hamburger → full-screen sheet. Every public
// surface reachable, theme toggle included, primary CTA at the bottom.
export function MobileNav() {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <div className="md:hidden">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        aria-expanded={open}
        className="grid h-8 w-8 place-items-center rounded-control border border-border-subtle bg-surface-2 text-text-mid hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]"
      >
        <Menu size={16} />
      </button>

      <MobileSheet open={open} onClose={close} label="Site navigation">
        <nav className="flex flex-col" aria-label="Site">
          {topNavItems.map((item) => (
            <Link key={item.label} href={item.href} onClick={close} className="border-b border-border-subtle py-4 text-lg font-semibold text-ink transition-colors hover:text-brand-500">
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="mt-6 flex items-center justify-between">
          <MainnetBadge />
          <ThemeToggle />
        </div>
        <div className="mt-auto pt-8">
          <Link href="/app/audit/new" onClick={close} className="block rounded-control bg-green-400 px-4 py-3 text-center text-sm font-semibold text-on-green transition-colors hover:bg-green-300">
            Start Audit
          </Link>
        </div>
      </MobileSheet>
    </div>
  );
}
