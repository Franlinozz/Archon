import Link from "next/link";
import { ArchonLogo, MainnetBadge } from "@/components/archon";
import { ThemeToggle } from "@/components/theme/ThemeToggle";

// Single source of the public-site header. The landing page must NOT render its own nav.
export default function MarketingLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="min-h-screen bg-canvas text-text-hi">
      <header className="sticky top-0 z-30 border-b border-border-subtle bg-canvas/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-6 px-6">
          <ArchonLogo />
          <nav className="hidden items-center gap-6 text-sm text-text-mid md:flex">
            <Link href="/#product" className="transition-colors hover:text-text-hi">Product</Link>
            <Link href="/app/audit/new" className="transition-colors hover:text-text-hi">Audit Studio</Link>
            <Link href="/app/cost-guard" className="transition-colors hover:text-text-hi">Cost Guard</Link>
            <Link href="/app/proofs" className="transition-colors hover:text-text-hi">Reports</Link>
            <Link href="/docs" className="transition-colors hover:text-text-hi">Docs</Link>
          </nav>
          <div className="flex items-center gap-3">
            <span className="hidden sm:block"><MainnetBadge /></span>
            <ThemeToggle />
            <Link
              href="/app/audit/new"
              className="rounded-control bg-green-400 px-3.5 py-2 text-sm font-semibold text-on-green transition-colors hover:bg-green-300"
            >
              Start Audit
            </Link>
          </div>
        </div>
      </header>
      {children}
    </div>
  );
}
