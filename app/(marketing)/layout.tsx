import Link from "next/link";
import { ArchonLogo, MainnetBadge } from "@/components/archon";

export default function MarketingLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <div className="min-h-screen bg-canvas text-text-hi"><header className="mx-auto flex h-16 max-w-7xl items-center justify-between border-b border-border-subtle px-6"><ArchonLogo/><nav className="flex items-center gap-6 text-sm text-text-mid"><Link href="/#thesis">Thesis</Link><Link href="/app">Launch app</Link><MainnetBadge/></nav></header>{children}</div>;
}
