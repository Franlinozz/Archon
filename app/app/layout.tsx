import { ArchonAssistant, ArchonLogo, MainnetBadge, NotificationBell, WalletChip } from "@/components/archon";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { AppMobileNav } from "@/components/nav/AppMobileNav";
import { AppSidebarNav } from "@/components/nav/AppSidebarNav";
import { WorkspaceMenu } from "@/components/workspace/WorkspaceMenu";
import { CommandPalette } from "@/components/search/CommandPalette";
import { erc8004Addresses } from "@/lib/chain/mantle";

export default function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const cfg = erc8004Addresses();
  const agentId = cfg.agentIdentityRef?.split(":").at(-1) ?? "—";
  return <div className="min-h-screen text-text-hi">
    {/* Desktop sidebar; phones get the full taxonomy via the header sheet instead. */}
    <aside className="fixed inset-y-0 left-0 z-20 hidden w-[232px] border-r border-border-subtle bg-surface-1 p-4 md:block"><ArchonLogo size="app"/><AppSidebarNav/></aside>
    <div className="md:pl-[232px]"><header className="sticky top-0 z-10 flex h-14 items-center gap-3 border-b border-border-subtle bg-canvas/90 px-4 backdrop-blur md:px-6"><AppMobileNav/><span className="md:hidden"><ArchonLogo size="app" compact/></span><WorkspaceMenu agentId={agentId} identityRegistry={cfg.identityRegistry ?? null}/><CommandPalette/><span className="hidden sm:block"><MainnetBadge/></span><ThemeToggle/><NotificationBell/><WalletChip/></header><main className="p-4 md:p-6">{children}</main></div>
    <ArchonAssistant/>
  </div>;
}
