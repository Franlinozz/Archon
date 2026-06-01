import { ArchonAssistant, ArchonLogo, MainnetBadge, NotificationBell, WalletChip } from "@/components/archon";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { AppSidebarNav } from "@/components/nav/AppSidebarNav";
import { WorkspaceMenu } from "@/components/workspace/WorkspaceMenu";
import { CommandPalette } from "@/components/search/CommandPalette";
import { erc8004Addresses } from "@/lib/chain/mantle";

export default function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const cfg = erc8004Addresses();
  const agentId = cfg.agentIdentityRef?.split(":").at(-1) ?? "—";
  return <div className="min-h-screen bg-canvas text-text-hi">
    <aside className="fixed inset-x-0 top-0 z-20 border-b border-border-subtle bg-surface-1 p-3 md:inset-y-0 md:left-0 md:w-[232px] md:border-b-0 md:border-r md:p-4"><ArchonLogo/><AppSidebarNav/></aside>
    <div className="pt-32 md:pl-[232px] md:pt-0"><header className="sticky top-0 z-10 flex h-14 items-center gap-3 border-b border-border-subtle bg-canvas/90 px-4 backdrop-blur md:px-6"><WorkspaceMenu agentId={agentId} identityRegistry={cfg.identityRegistry ?? null}/><CommandPalette/><MainnetBadge/><ThemeToggle/><NotificationBell/><WalletChip/></header><main className="p-4 md:p-6">{children}</main></div>
    <ArchonAssistant/>
  </div>;
}
