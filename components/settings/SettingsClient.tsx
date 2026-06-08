"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { useAccount, useDisconnect, useSwitchChain } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { AlertTriangle, Check, ExternalLink, Link2, ShieldCheck, Wallet } from "lucide-react";
import { CopyButton } from "@/components/archon/CopyButton";
import { useSiwe } from "@/components/auth/SiweProvider";
import { useTheme } from "@/components/theme/ThemeProvider";
import type { ThemePreference } from "@/components/theme/theme";
import { MANTLE_CHAIN_ID, MANTLE_EXPLORER_URL } from "@/lib/chain/mantle";
import { shortenAddress } from "@/lib/chain/useWallet";

const NOTIF_KEY = "archon-notif-prefs";

type IdentityConfig = {
  agentId: string;
  identityRegistry: string | null;
  reputationRegistry: string | null;
  validationRegistry: string | null;
};

const explorerAddress = (addr: string) => `${MANTLE_EXPLORER_URL}/address/${addr}`;

export function SettingsClient({ config }: { config: IdentityConfig }) {
  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs uppercase tracking-[0.14em] text-green-400">Settings</p>
        <h1 className="mt-2 text-4xl font-bold tracking-tight text-text-hi">Workspace settings</h1>
        <p className="mt-2 text-text-mid">Configuration for this Archon workspace. Scans are read-only; the only on-chain write is user-approved proof logging.</p>
      </header>

      <section className="grid gap-3 md:grid-cols-2">
        <AppearanceCard />
        <WalletCard />
        <IdentityCard config={config} />
        <NotificationsCard />
        <WorkspaceCard />
        <PlanCard />
      </section>

      <section className="flex items-start gap-3 rounded-card border border-success/30 bg-success/10 p-4 text-sm text-text-mid">
        <ShieldCheck size={16} className="mt-0.5 shrink-0 text-success" />
        <p>Connecting your wallet signs a free message to prove ownership (no gas, no transaction). You can let Archon&rsquo;s server wallet anchor proofs for you, or log a proof yourself from your wallet for a small Mantle gas fee — your choice, per proof. Archon never stores wallet secrets in the browser.</p>
      </section>

      <DangerRow />
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="archon-card-lift rounded-card border border-border-subtle bg-surface-1 p-5"><h2 className="text-xl font-semibold text-text-hi">{title}</h2><div className="mt-4 space-y-3 text-sm">{children}</div></div>;
}
function Row({ label, value, mono, action }: { label: string; value: string; mono?: boolean; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="shrink-0 text-text-low">{label}</span>
      <span className="flex min-w-0 items-center gap-2">
        <span className={mono ? "truncate text-right font-mono text-text-hi" : "truncate text-right text-text-hi"}>{value}</span>
        {action}
      </span>
    </div>
  );
}

// ── 5.1 Appearance ──────────────────────────────────────────────────────────
const APPEARANCE_OPTIONS: { id: ThemePreference; label: string; sub: string }[] = [
  { id: "marble", label: "Marble", sub: "Light" },
  { id: "obsidian", label: "Obsidian", sub: "Dark" },
  { id: "system", label: "System", sub: "Auto" },
];

function AppearanceCard() {
  const { preference, setPreference, mounted } = useTheme();
  const reduce = useReducedMotion();
  return (
    <Card title="Appearance">
      <p className="text-text-mid">Theme applies instantly across the whole app and persists on this device.</p>
      <div className="grid grid-cols-3 gap-1 rounded-control border border-border-subtle bg-surface-2 p-1" role="radiogroup" aria-label="Theme">
        {APPEARANCE_OPTIONS.map((opt) => {
          const active = mounted && preference === opt.id;
          return (
            <button
              key={opt.id}
              role="radio"
              aria-checked={active}
              onClick={() => setPreference(opt.id)}
              className={`relative rounded-[7px] px-2 py-2 text-center transition-colors ${active ? "text-brand-700" : "text-body hover:text-ink"}`}
            >
              {active ? (
                <motion.span
                  layoutId="appearance-seg"
                  className="absolute inset-0 rounded-[7px] bg-surface-1 shadow-sm"
                  transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 500, damping: 38 }}
                />
              ) : null}
              <span className="relative block text-sm font-semibold">{opt.label}</span>
              <span className="relative block text-xs text-text-low">{opt.sub}</span>
            </button>
          );
        })}
      </div>
      {/* live preview swatches reflecting the active theme */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-text-low">Preview</span>
        <span className="h-5 w-8 rounded border border-border-subtle bg-canvas" title="canvas" />
        <span className="h-5 w-8 rounded border border-border-subtle bg-surface-1" title="surface" />
        <span className="h-5 w-8 rounded border border-border-emphasis bg-surface-3" title="raised" />
        <span className="h-5 w-8 rounded bg-brand-500" title="brand" />
        <span className="h-5 w-8 rounded bg-brand-600" title="brand strong" />
      </div>
    </Card>
  );
}

// ── 5.2 Wallet ──────────────────────────────────────────────────────────────
function WalletCard() {
  const mounted = useMounted();
  const { address, isConnected, chainId } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending } = useSwitchChain();
  const { signedIn, signIn, status: siweStatus } = useSiwe();
  const onMantle = isConnected && chainId === MANTLE_CHAIN_ID;

  return (
    <Card title="Wallet">
      {!mounted || !isConnected || !address ? (
        <>
          <p className="text-text-mid">Connect a wallet to prove ownership with a free signature (no gas) and enable proof logging. Mantle Mainnet (chain {MANTLE_CHAIN_ID}) only.</p>
          <button
            onClick={() => openConnectModal?.()}
            disabled={!mounted || !openConnectModal}
            className="inline-flex items-center gap-2 rounded-control bg-green-400 px-3.5 py-2 text-sm font-semibold text-on-green transition-colors hover:bg-green-300 disabled:opacity-50"
          >
            <Wallet size={15} /> Connect Wallet
          </button>
        </>
      ) : (
        <>
          <Row
            label="Address"
            value={shortenAddress(address)}
            mono
            action={
              <>
                <CopyButton value={address} />
                <a href={explorerAddress(address)} target="_blank" rel="noreferrer" className="rounded border border-border-subtle p-1 text-text-low transition-colors hover:text-green-400" aria-label="View on Mantle Explorer" title="View on Mantle Explorer"><ExternalLink size={12} /></a>
              </>
            }
          />
          <div className="flex items-center justify-between gap-3">
            <span className="text-text-low">Network</span>
            {onMantle ? (
              <span className="inline-flex items-center gap-1.5 rounded-pill border border-success/30 bg-success/10 px-2.5 py-1 text-xs text-success"><span className="size-1.5 rounded-full bg-success" /> Mantle {MANTLE_CHAIN_ID}</span>
            ) : (
              <button onClick={() => switchChain({ chainId: MANTLE_CHAIN_ID })} disabled={isPending} className="inline-flex items-center gap-1.5 rounded-pill border border-warning/40 bg-warning/10 px-2.5 py-1 text-xs font-medium text-warning transition-colors hover:bg-warning/15 disabled:opacity-50"><AlertTriangle size={13} /> Wrong network — switch</button>
            )}
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-text-low">Sign-in (SIWE)</span>
            {signedIn ? (
              <span className="inline-flex items-center gap-1.5 rounded-pill border border-success/30 bg-success/10 px-2.5 py-1 text-xs text-success"><Check size={13} /> Signed in</span>
            ) : (
              <button onClick={() => void signIn()} disabled={!onMantle || siweStatus === "signing"} className="rounded-pill border border-border-subtle bg-surface-2 px-2.5 py-1 text-xs text-text-mid transition-colors hover:text-green-400 disabled:opacity-50">{siweStatus === "signing" ? "Check wallet…" : "Sign in (free)"}</button>
            )}
          </div>
          <button onClick={() => disconnect()} className="inline-flex items-center gap-2 rounded-control border border-border-subtle bg-surface-2 px-3 py-1.5 text-sm text-text-mid transition-colors hover:border-danger/40 hover:text-danger">Disconnect</button>
        </>
      )}
    </Card>
  );
}

// ── 5.3 Network & ERC-8004 Identity ──────────────────────────────────────────
function IdentityCard({ config }: { config: IdentityConfig }) {
  return (
    <Card title="Network & ERC-8004 Identity">
      <Row label="Chain" value={`Mantle Mainnet · ${MANTLE_CHAIN_ID}`} />
      <Row
        label="Agent ID"
        value={config.agentId}
        mono
        action={config.agentId !== "—" ? <><CopyButton value={config.agentId} />{config.identityRegistry ? <ExplorerLink href={explorerAddress(config.identityRegistry)} /> : null}</> : undefined}
      />
      <IdentityRow label="Identity Registry" value={config.identityRegistry} />
      <IdentityRow label="Reputation Registry" value={config.reputationRegistry} />
      <div className="flex items-center justify-between gap-3">
        <span className="shrink-0 text-text-low">Validation Registry</span>
        <span aria-disabled className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-pill border border-border-subtle bg-surface-2 px-2.5 py-1 text-xs text-text-low opacity-70" title="No official Mantle Mainnet Validation Registry address is published">Disabled · no Mantle address</span>
      </div>
    </Card>
  );
}
function IdentityRow({ label, value }: { label: string; value: string | null }) {
  return (
    <Row
      label={label}
      value={value ?? "—"}
      mono
      action={value ? <><CopyButton value={value} /><ExplorerLink href={explorerAddress(value)} /></> : undefined}
    />
  );
}
function ExplorerLink({ href }: { href: string }) {
  return <a href={href} target="_blank" rel="noreferrer" className="rounded border border-border-subtle p-1 text-text-low transition-colors hover:text-green-400" aria-label="View on Mantle Explorer" title="View on Mantle Explorer"><ExternalLink size={12} /></a>;
}

// ── 5.4 Notifications ─────────────────────────────────────────────────────────
type NotifPrefs = { critical: boolean; proofVerified: boolean; webhook: string };
const DEFAULT_NOTIF: NotifPrefs = { critical: true, proofVerified: true, webhook: "" };

function NotificationsCard() {
  const [prefs, setPrefs] = useState<NotifPrefs>(DEFAULT_NOTIF);
  const [loaded, setLoaded] = useState(false);
  const [webhookDraft, setWebhookDraft] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(NOTIF_KEY);
      if (raw) {
        const parsed = { ...DEFAULT_NOTIF, ...JSON.parse(raw) } as NotifPrefs;
        setPrefs(parsed);
        setWebhookDraft(parsed.webhook);
      }
    } catch {
      /* ignore malformed prefs */
    }
    setLoaded(true);
  }, []);

  const persist = (next: NotifPrefs) => {
    setPrefs(next);
    try {
      localStorage.setItem(NOTIF_KEY, JSON.stringify(next));
    } catch {
      /* storage unavailable */
    }
  };

  const toggle = (key: "critical" | "proofVerified") => persist({ ...prefs, [key]: !prefs[key] });

  const saveWebhook = () => {
    const trimmed = webhookDraft.trim();
    if (trimmed && !isValidWebhook(trimmed)) {
      setError("Enter a valid https:// webhook URL (Discord or Slack).");
      return;
    }
    setError(null);
    persist({ ...prefs, webhook: trimmed });
    setToast("Saved");
    setTimeout(() => setToast(null), 2000);
  };

  return (
    <Card title="Notifications">
      <ToggleRow label="Alert on Critical / High findings" sub="Preference saved locally" checked={loaded && prefs.critical} onChange={() => toggle("critical")} />
      <ToggleRow label="Notify when a proof is verified" sub="Preference saved locally" checked={loaded && prefs.proofVerified} onChange={() => toggle("proofVerified")} />
      <div>
        <label htmlFor="webhook" className="block text-text-low">Webhook URL <span className="text-text-low">(Discord / Slack)</span></label>
        <div className="mt-1.5 flex gap-2">
          <input
            id="webhook"
            value={webhookDraft}
            onChange={(e) => { setWebhookDraft(e.target.value); setError(null); }}
            placeholder="https://discord.com/api/webhooks/…"
            className="min-w-0 flex-1 rounded-control border-border-subtle bg-surface-2 text-sm text-text-hi placeholder:text-text-low focus:border-green-400 focus:ring-green-400"
          />
          <button onClick={saveWebhook} className="inline-flex items-center gap-1.5 rounded-control border border-border-subtle bg-surface-2 px-3 text-sm text-text-mid transition-colors hover:text-green-400">
            {toast ? <Check size={14} className="text-success" /> : <Link2 size={14} />} {toast ?? "Save"}
          </button>
        </div>
        {error ? <p className="mt-1.5 text-xs text-danger">{error}</p> : null}
        <p className="mt-1.5 text-xs text-text-low">Notification preferences are saved on this device now.</p>
      </div>
    </Card>
  );
}
function ToggleRow({ label, sub, checked, onChange }: { label: string; sub: string; checked: boolean; onChange: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div><p className="text-text-hi">{label}</p><p className="text-xs text-text-low">{sub}</p></div>
      <button
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={onChange}
        className={`relative h-6 w-11 shrink-0 rounded-pill transition-colors ${checked ? "bg-brand-500" : "bg-surface-3"}`}
      >
        <span className={`absolute top-0.5 size-5 rounded-full bg-surface-1 shadow-sm transition-all ${checked ? "left-[22px]" : "left-0.5"}`} />
      </button>
    </div>
  );
}
function isValidWebhook(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

// ── 5.5 Plan ──────────────────────────────────────────────────────────────────
function PlanCard() {
  return (
    <Card title="Plan">
      <Row label="Tier" value="Hackathon build" />
      <Row label="Cost controls" value="Cost Guard (advisory, sample data)" />
      <span className="mt-1 inline-flex items-center gap-2 rounded-pill border border-border-subtle bg-surface-2 px-3 py-1 text-xs text-text-low">Personal workspace</span>
    </Card>
  );
}

function WorkspaceCard() {
  return (
    <Card title="Workspace">
      <Row label="Name" value="Founder workspace" />
      <Row label="Environment" value="Mantle Mainnet · production" />
      <Row label="Mode" value="Read-only scans + approved proof" />
    </Card>
  );
}

// ── 5.6 Danger / utility ──────────────────────────────────────────────────────
function DangerRow() {
  const { disconnect } = useDisconnect();
  const { isConnected } = useAccount();
  const mounted = useMounted();

  const clearLocal = () => {
    if (!window.confirm("Clear local theme and notification preferences on this device? This cannot be undone.")) return;
    try {
      localStorage.removeItem("archon-theme");
      localStorage.removeItem(NOTIF_KEY);
    } catch {
      /* ignore */
    }
    window.location.reload();
  };

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <button onClick={clearLocal} className="rounded-control border border-border-subtle bg-surface-2 px-3 py-1.5 text-text-low transition-colors hover:border-danger/40 hover:text-danger">Clear local cache &amp; preferences</button>
      {mounted && isConnected ? (
        <button onClick={() => disconnect()} className="rounded-control border border-border-subtle bg-surface-2 px-3 py-1.5 text-text-low transition-colors hover:border-danger/40 hover:text-danger">Disconnect wallet</button>
      ) : null}
    </div>
  );
}

function useMounted() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}
