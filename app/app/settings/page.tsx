import { ShieldCheck } from "lucide-react";
import { WalletChip } from "@/components/archon";
import { erc8004Addresses, MANTLE_CHAIN_ID } from "@/lib/chain/mantle";

export const dynamic = "force-dynamic";

// Minimal, honest settings surface: real workspace/network/identity config (public on-chain
// values) + live wallet control. Unbuilt areas are explicit "Coming soon", not dead toggles.
export default function SettingsPage() {
  const cfg = erc8004Addresses();
  const agentId = cfg.agentIdentityRef?.split(":").at(-1) ?? "—";
  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs uppercase tracking-[0.14em] text-green-400">Settings</p>
        <h1 className="mt-2 text-4xl font-bold tracking-tight text-text-hi">Workspace settings</h1>
        <p className="mt-2 text-text-mid">Configuration for this Archon workspace. Scans are read-only; the only on-chain write is user-approved proof logging.</p>
      </header>

      <section className="grid gap-3 md:grid-cols-2">
        <Card title="Workspace">
          <Row label="Name" value="Founder workspace" />
          <Row label="Environment" value="Mantle Mainnet · production" />
          <Row label="Mode" value="Read-only scans + approved proof" />
        </Card>
        <Card title="Wallet">
          <p className="text-sm text-text-mid">Connect a wallet to enable user-approved proof logging. Mantle Mainnet (chain {MANTLE_CHAIN_ID}) only.</p>
          <div className="mt-3"><WalletChip /></div>
        </Card>
        <Card title="Network & ERC-8004 Identity">
          <Row label="Chain" value={`Mantle Mainnet · ${MANTLE_CHAIN_ID}`} />
          <Row label="Agent ID" value={agentId} mono />
          <Row label="Identity Registry" value={cfg.identityRegistry ?? "—"} mono />
          <Row label="Reputation Registry" value={cfg.reputationRegistry ?? "—"} mono />
          <Row label="Validation Registry" value={cfg.validationRegistry ?? "Disabled (no Mantle address published)"} mono />
        </Card>
        <Card title="Plan">
          <Row label="Tier" value="Hackathon build" />
          <Row label="Cost controls" value="Cost Guard (advisory, sample data)" />
          <div className="mt-2 inline-flex items-center gap-2 rounded-pill border border-warning/30 bg-warning/10 px-3 py-1 text-xs text-warning">Team management · Coming soon</div>
        </Card>
      </section>

      <section className="flex items-start gap-3 rounded-card border border-success/30 bg-success/10 p-4 text-sm text-text-mid">
        <ShieldCheck size={16} className="mt-0.5 shrink-0 text-success" />
        <p>Archon never stores wallet secrets in the browser. Proof transactions are submitted by Archon’s dedicated server-side client wallet after explicit approval; your connected wallet is used for ownership context and the Mantle network guard only.</p>
      </section>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="rounded-card border border-border-subtle bg-surface-1 p-5"><h2 className="text-xl font-semibold text-text-hi">{title}</h2><div className="mt-4 space-y-2 text-sm">{children}</div></div>;
}
function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return <div className="flex items-center justify-between gap-4"><span className="shrink-0 text-text-low">{label}</span><span className={mono ? "break-all text-right font-mono text-text-hi" : "text-right text-text-hi"}>{value}</span></div>;
}
