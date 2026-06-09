import Link from "next/link";
import { ArrowDownRight, BarChart3, ExternalLink, Filter, Search, ShieldCheck, Trophy, Zap } from "lucide-react";
import { db } from "@/lib/db/client";
import { DegradedNotice } from "@/components/archon";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
type LeaderboardRow = {
  gasReportId: string;
  contractName: string | null;
  sourceKind: "sample" | "paste" | "address" | string;
  sourceRef: string | null;
  sourceHash: string | null;
  reportHash: string | null;
  anchorTxHash: string | null;
  totals: { annualSavingsUsd?: number; l2GasSavedPerCall?: number; l1DaWeiSavedPerCall?: string; assumptions?: { callsPerYear?: number; mntUsd?: number } } | null;
  assumptions: { callsPerYear?: number; mntUsd?: number } | null;
  createdAt: string;
  optimizationCount: number;
  measuredOptimizationCount: number;
  annualSavingsUsd: string | number;
  l2GasSavedPerCall: string | number;
  l1DaWeiSavedPerCall: string | number;
  gasEfficiencyScore: string | number;
};

const metrics = [
  { value: "score", label: "Efficiency score" },
  { value: "savings", label: "Realized savings" },
  { value: "l2", label: "L2 gas saved" },
  { value: "recent", label: "Newest" },
];
const kinds = [
  { value: "all", label: "All sources" },
  { value: "address", label: "Verified addresses" },
  { value: "paste", label: "User scans" },
  { value: "sample", label: "Archon samples" },
];

function one(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] : value; }
function selected(value: string | undefined, allowed: string[], fallback: string) { return value && allowed.includes(value) ? value : fallback; }
function num(value: unknown) { const n = Number(value ?? 0); return Number.isFinite(n) ? n : 0; }
function money(value: unknown) { return `$${num(value).toLocaleString(undefined, { maximumFractionDigits: 2 })}`; }
function short(value?: string | null) { return value ? `${value.slice(0, 10)}…${value.slice(-6)}` : "—"; }
function date(value: string) { return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }); }
function sourceLabel(row: LeaderboardRow) {
  if (row.sourceKind === "sample") return "Sample · Archon-labeled";
  if (row.sourceKind === "address") return row.sourceRef ? `Verified address · ${short(row.sourceRef)}` : "Verified address";
  return "User-submitted scan";
}
function sourceClass(kind: string) {
  if (kind === "sample") return "border-warning/35 bg-warning/10 text-warning";
  if (kind === "address") return "border-success/35 bg-success/10 text-success";
  return "border-info/35 bg-info/10 text-info";
}

async function loadRows({ metric, sourceKind, q }: { metric: string; sourceKind: string; q: string }) {
  const orderBy = {
    score: `"gasEfficiencyScore" desc nulls last, "annualSavingsUsd" desc nulls last, "createdAt" desc`,
    savings: `"annualSavingsUsd" desc nulls last, "gasEfficiencyScore" desc nulls last, "createdAt" desc`,
    l2: `"l2GasSavedPerCall" desc nulls last, "gasEfficiencyScore" desc nulls last, "createdAt" desc`,
    recent: `"createdAt" desc`,
  } as const;
  const conditions = ["gr.status='done'"];
  const values: unknown[] = [];
  if (sourceKind !== "all") { values.push(sourceKind); conditions.push(`gr.source_kind=$${values.length}`); }
  if (q) { values.push(`%${q.toLowerCase()}%`); conditions.push(`(lower(coalesce(gr.contract_name,'')) like $${values.length} or lower(coalesce(gr.source_ref,'')) like $${values.length} or lower(coalesce(gr.source_hash,'')) like $${values.length})`); }
  const rows = await db.query<LeaderboardRow>(
    `with ranked as (
       select gr.id as "gasReportId",
              gr.contract_name as "contractName",
              gr.source_kind as "sourceKind",
              gr.source_ref as "sourceRef",
              gr.source_hash as "sourceHash",
              gr.report_hash as "reportHash",
              gr.anchor_tx_hash as "anchorTxHash",
              gr.totals,
              gr.assumptions,
              gr.created_at as "createdAt",
              count(go.id)::int as "optimizationCount",
              count(go.id) filter (where go.measurement_label='measured')::int as "measuredOptimizationCount",
              coalesce((gr.totals->>'annualSavingsUsd')::numeric, sum(coalesce(go.annual_savings_usd,0)), 0)::numeric as "annualSavingsUsd",
              coalesce((gr.totals->>'l2GasSavedPerCall')::numeric, sum(greatest(coalesce(go.measured_l2_delta, go.est_l2_delta, 0), 0)), 0)::numeric as "l2GasSavedPerCall",
              coalesce((gr.totals->>'l1DaWeiSavedPerCall')::numeric, sum(greatest(coalesce(go.measured_l1_delta_wei, go.est_l1_delta_wei, 0), 0)), 0)::numeric as "l1DaWeiSavedPerCall",
              (coalesce((gr.totals->>'annualSavingsUsd')::numeric, sum(coalesce(go.annual_savings_usd,0)), 0) * 100 + coalesce((gr.totals->>'l2GasSavedPerCall')::numeric, sum(greatest(coalesce(go.measured_l2_delta, go.est_l2_delta, 0), 0)), 0) + least(count(go.id)::numeric, 10) * 25 + case when gr.anchor_tx_hash is not null then 150 else 0 end)::numeric as "gasEfficiencyScore"
       from gas_reports gr
       left join gas_optimizations go on go.gas_report_id=gr.id
       where ${conditions.join(" and ")}
       group by gr.id
     )
     select * from ranked
     order by ${orderBy[metric as keyof typeof orderBy]}
     limit 50`,
    values,
  );
  return rows.rows;
}

export default async function GasLeaderboardPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const metric = selected(one(params.metric), metrics.map((m) => m.value), "score");
  const sourceKind = selected(one(params.sourceKind), kinds.map((k) => k.value), "all");
  const q = (one(params.q) ?? "").trim().slice(0, 120);
  let rows: LeaderboardRow[] = [];
  let degraded = false;
  try { rows = await loadRows({ metric, sourceKind, q }); } catch { degraded = true; }
  const top = rows[0];
  const totalSavings = rows.reduce((sum, row) => sum + num(row.annualSavingsUsd), 0);
  const sampleCount = rows.filter((row) => row.sourceKind === "sample").length;

  return <main className="mx-auto max-w-7xl px-6 py-10">
    <section className="relative overflow-hidden rounded-card border border-border-subtle bg-surface-1 p-7 shadow-lift">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_16%_10%,rgba(34,197,94,0.22),transparent_34%),radial-gradient(circle_at_86%_8%,rgba(255,255,255,0.08),transparent_28%)]" />
      <div className="relative grid gap-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-green-400">Public Mantle Gas Leaderboard</p>
          <h1 className="mt-3 max-w-4xl text-4xl font-bold tracking-tight text-text-hi md:text-6xl">The contracts saving real Mantle gas.</h1>
          <p className="mt-4 max-w-3xl text-sm leading-6 text-text-mid">Rank completed Archon gas reports by efficiency score, realized annual savings, L2 execution gas, or recency. Sample rows are labeled; no synthetic leaderboard entries are presented as production scans.</p>
          <div className="mt-5 flex flex-wrap gap-2 text-xs">
            <span className="rounded-pill border border-success/30 bg-success/10 px-3 py-1 text-success">Real completed reports only</span>
            <span className="rounded-pill border border-info/30 bg-info/10 px-3 py-1 text-info">Links to public gas reports</span>
            <span className="rounded-pill border border-warning/30 bg-warning/10 px-3 py-1 text-warning">Samples clearly labeled</span>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
          <Hero icon={<Trophy size={18}/>} label="Ranked reports" value={String(rows.length)} />
          <Hero icon={<Zap size={18}/>} label="Visible annual savings" value={money(totalSavings)} />
          <Hero icon={<ShieldCheck size={18}/>} label="Sample-labeled rows" value={String(sampleCount)} />
        </div>
      </div>
    </section>

    <form className="mt-6 grid gap-3 rounded-card border border-border-subtle bg-surface-1 p-4 md:grid-cols-[1fr_220px_220px_auto]" action="/gas-leaderboard">
      <label className="relative block"><Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-low" size={16}/><input name="q" defaultValue={q} placeholder="Search contract, address, or source hash" className="w-full rounded-control border-border-subtle bg-terminal pl-9 text-sm text-text-hi" /></label>
      <label className="relative block"><Filter className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-low" size={16}/><select name="sourceKind" defaultValue={sourceKind} className="w-full rounded-control border-border-subtle bg-terminal pl-9 text-sm text-text-hi">{kinds.map((kind) => <option key={kind.value} value={kind.value}>{kind.label}</option>)}</select></label>
      <label className="relative block"><BarChart3 className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-low" size={16}/><select name="metric" defaultValue={metric} className="w-full rounded-control border-border-subtle bg-terminal pl-9 text-sm text-text-hi">{metrics.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}</select></label>
      <button className="rounded-control bg-green-500 px-4 py-2 text-sm font-semibold text-on-green hover:bg-green-400">Apply filters</button>
    </form>

    {degraded ? <div className="mt-6"><DegradedNotice resource="Gas leaderboard" /></div> : null}

    <section className="mt-6 overflow-hidden rounded-card border border-border-subtle bg-surface-1">
      <div className="grid grid-cols-[72px_1fr] border-b border-border-subtle bg-surface-2 px-4 py-3 text-xs uppercase tracking-[0.14em] text-text-low md:grid-cols-[72px_minmax(220px,1fr)_160px_150px_160px_130px]">
        <span>Rank</span><span>Contract</span><span className="hidden md:block">Score</span><span className="hidden md:block">Savings</span><span className="hidden md:block">Gas split</span><span className="hidden md:block">Report</span>
      </div>
      {rows.map((row, index) => {
        const assumptions = row.totals?.assumptions ?? row.assumptions ?? {};
        return <article key={row.gasReportId} className="grid grid-cols-[72px_1fr] gap-3 border-b border-border-subtle px-4 py-4 last:border-b-0 md:grid-cols-[72px_minmax(220px,1fr)_160px_150px_160px_130px] md:items-center">
          <div className="font-mono text-2xl text-text-hi">#{index + 1}</div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2"><Link href={`/app/gas/${row.gasReportId}`} className="truncate text-lg font-semibold text-text-hi hover:text-green-400">{row.contractName ?? "Unnamed contract"}</Link><span className={`rounded-pill border px-2 py-0.5 text-[11px] ${sourceClass(row.sourceKind)}`}>{sourceLabel(row)}</span></div>
            <p className="mt-1 font-mono text-xs text-text-low">{short(row.sourceHash)} · {date(row.createdAt)}</p>
            <p className="mt-1 text-xs text-text-low">Assumption: {Number(assumptions.callsPerYear ?? 0).toLocaleString()} calls/year · MNT/USD {String(assumptions.mntUsd ?? "?")}</p>
          </div>
          <Metric label="Score" value={num(row.gasEfficiencyScore).toLocaleString(undefined, { maximumFractionDigits: 0 })} />
          <Metric label="Savings" value={money(row.annualSavingsUsd)} />
          <div className="md:block"><p className="text-xs uppercase tracking-[0.12em] text-text-low">Gas split</p><p className="mt-1 font-mono text-sm text-text-hi">{num(row.l2GasSavedPerCall).toLocaleString()} L2</p><p className="mt-1 font-mono text-xs text-text-low">{num(row.l1DaWeiSavedPerCall).toLocaleString()} L1/DA wei</p></div>
          <div className="flex flex-wrap gap-2"><Link href={`/app/gas/${row.gasReportId}`} className="inline-flex items-center gap-1 rounded-control border border-border-subtle bg-surface-2 px-3 py-2 text-sm text-text-mid hover:text-green-400">Open <ExternalLink size={14}/></Link>{row.anchorTxHash ? <a href={`https://mantlescan.xyz/tx/${row.anchorTxHash}`} className="inline-flex items-center gap-1 rounded-control border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">Proof <ArrowDownRight size={14}/></a> : null}</div>
        </article>;
      })}
      {!rows.length ? <div className="p-8 text-center"><p className="text-xl font-semibold text-text-hi">No completed gas reports match these filters yet.</p><p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-text-mid">Archon will not invent leaderboard rows. Run a Mantle gas optimization or clear filters to see completed reports that already exist.</p><Link href="/app/gas" className="mt-5 inline-flex rounded-control bg-green-500 px-4 py-2 text-sm font-semibold text-on-green hover:bg-green-400">Run Gas Optimizer</Link></div> : null}
    </section>
  </main>;
}

function Hero({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) { return <div className="rounded-card border border-border-subtle bg-terminal p-4"><div className="text-green-400">{icon}</div><p className="mt-3 text-xs uppercase tracking-[0.12em] text-text-low">{label}</p><p className="mt-1 font-mono text-2xl text-text-hi">{value}</p></div>; }
function Metric({ label, value }: { label: string; value: string }) { return <div><p className="text-xs uppercase tracking-[0.12em] text-text-low md:hidden">{label}</p><p className="font-mono text-lg text-text-hi">{value}</p></div>; }
