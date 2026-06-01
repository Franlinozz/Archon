import { Search } from "lucide-react";
import { ArchonAssistant, ArchonLogo, MainnetBadge, NotificationBell, WalletChip } from "@/components/archon";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { AppSidebarNav } from "@/components/nav/AppSidebarNav";

export default function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <div className="min-h-screen bg-canvas text-text-hi">
    <aside className="fixed inset-x-0 top-0 z-20 border-b border-border-subtle bg-surface-1 p-3 md:inset-y-0 md:left-0 md:w-[232px] md:border-b-0 md:border-r md:p-4"><ArchonLogo/><AppSidebarNav/></aside>
    <div className="pt-32 md:pl-[232px] md:pt-0"><header className="sticky top-0 z-10 flex h-14 items-center gap-3 border-b border-border-subtle bg-canvas/90 px-4 backdrop-blur md:px-6"><span className="hidden rounded-control border border-border-subtle bg-surface-2 px-3 py-1.5 text-sm text-text-mid sm:block">Founder workspace</span><form action="/app/findings" className="flex min-w-0 flex-1 items-center gap-2 rounded-control border border-border-subtle bg-surface-2 px-3 py-1.5 text-sm text-text-low focus-within:border-border-emphasis"><Search size={15}/><input name="q" className="w-full border-0 bg-transparent p-0 text-text-hi placeholder:text-text-low focus:ring-0" placeholder="Search findings…" /></form><MainnetBadge/><ThemeToggle/><NotificationBell/><WalletChip/></header><main className="p-4 md:p-6">{children}</main></div>
    <ArchonAssistant/>
  </div>;
}
