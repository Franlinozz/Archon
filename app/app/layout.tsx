import Link from "next/link";
import { Bell, Search } from "lucide-react";
import { ArchonAssistant, ArchonLogo, MainnetBadge, WalletChip } from "@/components/archon";

const nav = [
  ["Overview", "/app"], ["Audit Studio", "/app/audit/new"], ["Contract Context", "/app/context"], ["Reports", "/app"], ["Findings", "/app/findings"], ["Generated Tests", "/app/tests"], ["Cost Guard", "/app/cost-guard"], ["On-chain Proof", "/app/proofs"], ["Validation", "/app/validation"], ["Settings", "/app#settings"],
] as const;

export default function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <div className="min-h-screen bg-canvas text-text-hi">
    <aside className="fixed inset-x-0 top-0 z-20 border-b border-border-subtle bg-surface-1 p-3 md:inset-y-0 md:left-0 md:w-[232px] md:border-b-0 md:border-r md:p-4"><ArchonLogo/><nav className="mt-3 flex gap-1 overflow-x-auto md:mt-8 md:block md:space-y-0.5">{nav.map(([label,href])=><Link key={label} href={href} className="block shrink-0 rounded-control px-3 py-1.5 text-sm text-text-mid transition-colors hover:bg-surface-2 hover:text-green-400">{label}</Link>)}</nav></aside>
    <div className="pt-32 md:pl-[232px] md:pt-0"><header className="sticky top-0 z-10 flex h-14 items-center gap-3 border-b border-border-subtle bg-canvas/90 px-4 backdrop-blur md:px-6"><span className="hidden rounded-control border border-border-subtle bg-surface-2 px-3 py-1.5 text-sm text-text-mid sm:block">Founder workspace</span><label className="flex min-w-0 flex-1 items-center gap-2 rounded-control border border-border-subtle bg-surface-2 px-3 py-1.5 text-sm text-text-low"><Search size={15}/><input className="w-full border-0 bg-transparent p-0 text-text-hi placeholder:text-text-low focus:ring-0" placeholder="Search audits, contracts, findings..." /></label><MainnetBadge/><span className="rounded-control border border-warning/30 bg-warning/10 p-1.5 text-warning" aria-label="Notifications coming soon"><Bell size={17}/></span><WalletChip/></header><main className="p-4 md:p-6">{children}</main></div>
    <ArchonAssistant/>
  </div>;
}
