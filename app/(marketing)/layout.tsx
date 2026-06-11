import Link from "next/link";
import { ArchonLogo, MainnetBadge } from "@/components/archon";
import { SiteFooter } from "@/components/marketing/SiteFooter";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { MobileNav } from "@/components/nav/MobileNav";
import { TopNav } from "@/components/nav/TopNav";

// Single source of the public-site header. The landing page must NOT render its own nav.
export default function MarketingLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-screen flex-col text-text-hi">
      <header className="sticky top-0 z-30 border-b border-border-subtle bg-canvas/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-6 px-6">
          <ArchonLogo />
          <TopNav />
          <div className="flex items-center gap-3">
            <span className="hidden sm:block"><MainnetBadge /></span>
            <ThemeToggle />
            <Link
              href="/app/audit/new"
              className="hidden rounded-control bg-green-400 px-3.5 py-2 text-sm font-semibold text-on-green transition-colors hover:bg-green-300 sm:block"
            >
              Start Audit
            </Link>
            <MobileNav />
          </div>
        </div>
      </header>
      <div className="flex-1">{children}</div>
      <SiteFooter />
    </div>
  );
}
