"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Pause, Play, Plus, Radar, Trash2 } from "lucide-react";
import { FadeRise } from "@/components/motion";

// Sentinel console: watchlist with drift status + audit freshness, recent
// events, and the webhook setting. All data is real; empty states are honest.

type Freshness = { level: "unaudited" | "stale" | "attention" | "aging" | "fresh"; reason: string; days?: number };
type Watch = {
  id: string; address: string; label: string | null; mode: string; sourceVerified: boolean; status: string;
  lastCheckedAt: string | null; lastDriftAt: string | null; pendingScanId: string | null;
  reportId: string | null; riskScore: number | null; reportAt: string | null; anchored: boolean;
  driftsSinceReport: number; eventCount: number; freshness: Freshness;
};
type SentinelEvent = { id: string; watchId: string; type: string; detail: Record<string, unknown>; reportId: string | null; createdAt: string; address: string; label: string | null };

const FRESHNESS_STYLE: Record<Freshness["level"], string> = {
  fresh: "border-success/30 bg-success/10 text-success",
  aging: "border-warning/30 bg-warning/10 text-warning",
  attention: "border-high/40 bg-warning/10 text-high",
  stale: "border-danger/30 bg-danger/10 text-danger",
  unaudited: "border-border-subtle bg-surface-2 text-text-low",
};

const short = (v: string) => (v.length > 14 ? `${v.slice(0, 8)}…${v.slice(-4)}` : v);
const ago = (iso: string | null) => {
  if (!iso) return "—";
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 90) return `${s}s ago`;
  if (s < 5400) return `${Math.floor(s / 60)}m ago`;
  if (s < 129600) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};

export function SentinelClient() {
  const [watches, setWatches] = useState<Watch[] | null>(null);
  const [events, setEvents] = useState<SentinelEvent[]>([]);
  const [address, setAddress] = useState("");
  const [label, setLabel] = useState("");
  const [webhook, setWebhook] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [w, e, s] = await Promise.all([
      fetch("/api/sentinel/watches", { cache: "no-store" }).then((r) => r.json()),
      fetch("/api/sentinel/events", { cache: "no-store" }).then((r) => r.json()),
      fetch("/api/sentinel/settings", { cache: "no-store" }).then((r) => r.json()),
    ]);
    setWatches(w.watches ?? []);
    setEvents(e.events ?? []);
    if (typeof s.webhookUrl === "string") setWebhook(s.webhookUrl);
  }, []);

  useEffect(() => { refresh().catch(() => setError("Could not load Sentinel data.")); }, [refresh]);

  const add = async () => {
    setBusy(true); setError(null); setNotice(null);
    try {
      const res = await fetch("/api/sentinel/watches", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ address: address.trim(), label: label.trim() || undefined }) });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Could not add watch.");
      setNotice(body.verified ? "Watching (full mode — verified source)." : "Watching in reduced mode: bytecode + admin-slot drift only until the source is verified on MantleScan.");
      setAddress(""); setLabel("");
      await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };

  const setStatus = async (watch: Watch, status: "active" | "paused") => {
    await fetch(`/api/sentinel/watches/${watch.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status }) });
    await refresh();
  };
  const remove = async (watch: Watch) => {
    if (!window.confirm(`Stop watching ${watch.label ?? watch.address}? Event history is removed too.`)) return;
    await fetch(`/api/sentinel/watches/${watch.id}`, { method: "DELETE" });
    await refresh();
  };
  const saveWebhook = async () => {
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/sentinel/settings", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ webhookUrl: webhook.trim() || null }) });
      if (!res.ok) throw new Error((await res.json()).error ?? "Could not save webhook.");
      setNotice("Webhook saved. Drift and re-scan alerts will POST there (Discord/Slack compatible).");
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };

  return (
    <FadeRise>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-green-400">Sentinel · continuous audit</p>
          <h1 className="mt-2 text-4xl font-bold tracking-tight text-text-hi">Your contracts, watched.</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-text-mid">Sentinel checks watched Mantle addresses every cycle for bytecode drift, proxy implementation/admin changes, and owner changes — then re-scans changed code automatically and diffs the findings against your last report. Read-only; it never sends a transaction.</p>
        </div>
      </div>

      <section className="mt-6 rounded-card border border-border-subtle bg-surface-1 p-5 shadow-card">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex-1 min-w-[280px] text-xs text-text-low">Contract address (Mantle Mainnet)
            <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="0x…" className="mt-1 w-full rounded-control border border-border-subtle bg-terminal px-3 py-2 font-mono text-sm text-text-code outline-none focus:border-green-400/50" />
          </label>
          <label className="w-56 text-xs text-text-low">Label (optional)
            <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Treasury vault" className="mt-1 w-full rounded-control border border-border-subtle bg-terminal px-3 py-2 text-sm text-text-hi outline-none focus:border-green-400/50" />
          </label>
          <button onClick={add} disabled={busy || !address.trim()} className="inline-flex items-center gap-2 rounded-control bg-green-400 px-4 py-2 text-sm font-semibold text-on-green transition-colors hover:bg-green-300 disabled:opacity-50"><Plus size={15}/> Watch address</button>
        </div>
        {error ? <p className="mt-3 rounded-control border border-danger/30 bg-danger-bg px-3 py-2 text-sm text-danger">{error}</p> : null}
        {notice ? <p className="mt-3 rounded-control border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">{notice}</p> : null}
      </section>

      <section className="mt-6 overflow-x-auto rounded-card border border-border-subtle bg-surface-1 shadow-card">
        <table className="w-full min-w-[860px] text-sm">
          <thead><tr className="border-b border-border-subtle text-left text-xs uppercase tracking-[0.12em] text-text-low">
            <th className="px-4 py-3">Contract</th><th className="px-4 py-3">Risk</th><th className="px-4 py-3">Audit freshness</th><th className="px-4 py-3">Last checked</th><th className="px-4 py-3">Drift</th><th className="px-4 py-3">Mode</th><th className="px-4 py-3 text-right">Actions</th>
          </tr></thead>
          <tbody>
            {watches === null ? <tr><td colSpan={7} className="px-4 py-8 text-center text-text-low">Loading…</td></tr> : null}
            {watches?.length === 0 ? <tr><td colSpan={7} className="px-4 py-10 text-center text-text-mid"><Radar className="mx-auto mb-2 text-text-low" size={22}/>No watched contracts yet. Add a deployed Mantle address above — verified source gets full re-scans; unverified bytecode is watched in reduced mode.</td></tr> : null}
            {watches?.map((w) => (
              <tr key={w.id} className="border-b border-border-subtle last:border-0">
                <td className="px-4 py-3">
                  <p className="font-semibold text-text-hi">{w.label ?? short(w.address)}</p>
                  <p className="font-mono text-[11px] text-text-low"><Link href={`/address/${w.address}`} className="hover:text-green-400" title="Archon address profile">{short(w.address)}</Link>{w.status === "paused" ? " · paused" : ""}</p>
                </td>
                <td className="px-4 py-3">{w.riskScore !== null ? <Link href={`/r/${w.reportId}`} className="font-mono text-text-hi hover:text-green-400">{w.riskScore}/100{w.anchored ? " ⚓" : ""}</Link> : <span className="text-text-low">—</span>}</td>
                <td className="px-4 py-3"><span title={w.freshness.reason} className={`inline-flex rounded-pill border px-2.5 py-0.5 text-xs ${FRESHNESS_STYLE[w.freshness.level]}`}>{w.freshness.level}{typeof w.freshness.days === "number" ? ` · ${w.freshness.days}d` : ""}</span></td>
                <td className="px-4 py-3 text-text-mid">{ago(w.lastCheckedAt)}{w.pendingScanId ? <span className="ml-2 text-xs text-warning">re-scan running…</span> : null}</td>
                <td className="px-4 py-3 text-text-mid">{w.lastDriftAt ? `${ago(w.lastDriftAt)} (${w.driftsSinceReport} since report)` : "none"}</td>
                <td className="px-4 py-3"><span className={`rounded-pill border px-2 py-0.5 text-[11px] ${w.mode === "full" ? "border-green-400/30 bg-green-400/10 text-green-400" : "border-border-subtle bg-surface-2 text-text-low"}`}>{w.mode === "full" ? "full" : "reduced"}</span></td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => setStatus(w, w.status === "active" ? "paused" : "active")} title={w.status === "active" ? "Pause" : "Resume"} className="mr-1 rounded-control border border-border-subtle p-1.5 text-text-low hover:text-text-hi">{w.status === "active" ? <Pause size={13}/> : <Play size={13}/>}</button>
                  <button onClick={() => remove(w)} title="Remove" className="rounded-control border border-border-subtle p-1.5 text-text-low hover:text-danger"><Trash2 size={13}/></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <div className="mt-6 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <section className="rounded-card border border-border-subtle bg-surface-1 p-5 shadow-card">
          <h2 className="text-lg font-semibold text-text-hi">Recent events</h2>
          {events.length === 0 ? <p className="mt-3 text-sm text-text-mid">No Sentinel events yet. Events appear here when drift is detected, re-scans finish, or risk changes.</p> : (
            <ul className="mt-3 space-y-2">
              {events.map((e) => (
                <li key={e.id} className="rounded-control border border-border-subtle bg-terminal px-3 py-2 text-sm">
                  <span className="font-mono text-xs text-text-low">{ago(e.createdAt)}</span>{" "}
                  <span className="text-text-hi">{e.label ?? short(e.address)}</span>{" "}
                  <span className="text-text-mid">— {e.type.replace(/_/g, " ")}</span>
                  {e.type === "rescan_complete" && e.detail ? <span className="text-text-mid"> · risk {String(e.detail.riskBefore ?? "—")} → {String(e.detail.riskAfter ?? "—")}, {String(e.detail.newFindings ?? 0)} new / {String(e.detail.resolvedFindings ?? 0)} resolved</span> : null}
                  {e.reportId ? <Link href={`/r/${e.reportId}`} className="ml-2 inline-flex items-center gap-0.5 text-green-400 hover:text-green-300">report <ArrowUpRight size={11}/></Link> : null}
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="rounded-card border border-border-subtle bg-surface-1 p-5 shadow-card">
          <h2 className="text-lg font-semibold text-text-hi">Alert webhook</h2>
          <p className="mt-2 text-sm leading-6 text-text-mid">Drift and re-scan alerts POST a JSON payload compatible with Discord (<span className="font-mono text-xs">content</span>) and Slack (<span className="font-mono text-xs">text</span>) webhooks. In-app alerts always appear in the notification bell.</p>
          <input value={webhook} onChange={(e) => setWebhook(e.target.value)} placeholder="https://discord.com/api/webhooks/…" className="mt-3 w-full rounded-control border border-border-subtle bg-terminal px-3 py-2 font-mono text-xs text-text-code outline-none focus:border-green-400/50" />
          <button onClick={saveWebhook} disabled={busy} className="mt-3 rounded-control border border-green-400/35 bg-green-400/10 px-4 py-2 text-sm font-semibold text-green-400 transition-colors hover:bg-green-400/20 disabled:opacity-50">Save webhook</button>
        </section>
      </div>
    </FadeRise>
  );
}
