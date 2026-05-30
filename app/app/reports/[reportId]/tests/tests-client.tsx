"use client";

import { useMemo, useState } from "react";
import { Copy, Download, ExternalLink, Lock } from "lucide-react";
import { CodePanel, TestCoverageBar } from "@/components/archon";

const tabs = ["Foundry", "Hardhat", "Edge Cases"] as const;

type GeneratedTests = {
  version: string;
  framework: "foundry";
  fileName: string;
  solidityVersion: string;
  code: string;
  loc: number;
  totalTests: number;
  edgeCases: number;
  forkMode: string;
  chainId: number;
  coverage: Array<{ findingId: string | null; category: string; title: string; covered: boolean; testName: string }>;
  matrix: Array<{ category: string; testName: string; findingIds: string[]; status: string }>;
  hardhat: { status: string; message: string };
  edgeCasesContent: string;
  perFinding?: Record<string, string>;
};

export function TestsClient({ reportId, tests }: { reportId: string; tests: GeneratedTests }) {
  const [tab, setTab] = useState<(typeof tabs)[number]>("Foundry");
  const [copied, setCopied] = useState(false);
  const grouped = useMemo(() => {
    const map = new Map<string, { covered: number; total: number }>();
    for (const item of tests.coverage) {
      const current = map.get(item.category) ?? { covered: 0, total: 0 };
      current.total += 1;
      if (item.covered) current.covered += 1;
      map.set(item.category, current);
    }
    return Array.from(map.entries()).map(([category, value]) => ({ category, ...value }));
  }, [tests.coverage]);

  async function copyAll() {
    await navigator.clipboard.writeText(tests.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  const exportHref = `data:text/plain;charset=utf-8,${encodeURIComponent(tests.code)}`;

  return <div className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-green-400">Generated Tests</p>
        <div className="mt-3 flex flex-wrap items-center gap-3"><h1 className="text-4xl font-bold tracking-tight text-text-hi">Foundry regression suite</h1><span className="rounded-pill border border-success/30 bg-success/10 px-3 py-1 text-sm text-success">Mantle Mainnet Native</span></div>
        <p className="mt-2 text-text-mid">Generated for report {reportId}. Run locally or in fork mode; Archon never auto-executes tests on mainnet.</p>
      </div>
      <div className="flex flex-wrap gap-2"><button onClick={copyAll} className="inline-flex items-center gap-2 rounded-control border border-border-subtle bg-surface-2 px-3 py-2 text-sm text-green-400"><Copy size={15}/>{copied ? "Copied" : "Copy All"}</button><a download={tests.fileName.split("/").pop()} href={exportHref} className="inline-flex items-center gap-2 rounded-control border border-border-subtle bg-surface-2 px-3 py-2 text-sm text-green-400"><Download size={15}/> Export</a><button disabled className="inline-flex cursor-not-allowed items-center gap-2 rounded-control border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning"><ExternalLink size={15}/> Open in IDE · future integration</button></div>
    </div>

    <div className="flex flex-wrap items-center gap-2">{tabs.map((item) => <button key={item} onClick={() => setTab(item)} className={tab === item ? "rounded-pill border border-green-400/35 bg-green-400/10 px-4 py-2 text-sm text-green-400" : "rounded-pill border border-border-subtle bg-surface-2 px-4 py-2 text-sm text-text-mid"}>{item}{item === "Hardhat" ? " · Coming soon" : ""}</button>)}<span className="text-xs text-text-low">Hardhat output coming soon; Foundry is generated now.</span></div>

    <div className="grid gap-6 [&>*]:min-w-0 xl:grid-cols-[minmax(0,1fr)_390px]">
      <main className="space-y-4">
        {tab === "Foundry" ? <><div className="flex flex-wrap gap-2 text-xs"><span className="rounded-pill border border-border-subtle bg-surface-2 px-3 py-1 text-text-mid">{tests.loc} LOC</span><span className="rounded-pill border border-border-subtle bg-surface-2 px-3 py-1 text-text-mid">Solidity {tests.solidityVersion}</span><span className="rounded-pill border border-green-400/30 bg-green-400/10 px-3 py-1 text-green-400">Foundry</span><span className="rounded-pill border border-info/30 bg-info/10 px-3 py-1 text-info">vm.createSelectFork</span></div><CodePanel code={tests.code} language="sol" footer={`${tests.fileName} · Mantle fork · FORK_BLOCK defaults to latest when unset`} height={680} /></> : null}
        {tab === "Hardhat" ? <ComingSoon title="Hardhat output coming soon" message={tests.hardhat.message} /> : null}
        {tab === "Edge Cases" ? <section className="rounded-card border border-border-subtle bg-surface-1 p-5"><h2 className="text-xl font-semibold text-text-hi">Edge Cases</h2><pre className="mt-4 whitespace-pre-wrap rounded-card border border-border-subtle bg-terminal p-4 text-sm leading-6 text-text-code">{tests.edgeCasesContent}</pre></section> : null}
      </main>

      <aside className="space-y-4">
        <div className="grid grid-cols-2 gap-3"><SummaryCard label="Total Tests" value={String(tests.totalTests)} /><SummaryCard label="Edge Cases" value={String(tests.edgeCases)} /><SummaryCard label="Fork Mode" value={tests.forkMode} /><SummaryCard label="Chain ID" value="5000" /></div>
        <section className="rounded-card border border-border-subtle bg-surface-1 p-5"><h2 className="text-lg font-semibold text-text-hi">Coverage by Finding</h2><div className="mt-4 space-y-4">{grouped.map((item) => <TestCoverageBar key={item.category} category={item.category} covered={item.covered} total={item.total} />)}</div></section>
        <section className="rounded-card border border-border-subtle bg-surface-1 p-5"><h2 className="text-lg font-semibold text-text-hi">Test Matrix</h2><div className="mt-4 overflow-x-auto rounded-card border border-border-subtle"><table className="w-full text-left text-xs"><thead className="bg-surface-2 text-text-low"><tr><th className="p-2">Category</th><th className="p-2">Test</th><th className="p-2">Findings</th></tr></thead><tbody>{tests.matrix.map((row) => <tr key={row.category} className="border-t border-border-subtle"><td className="p-2 text-text-mid">{row.category}</td><td className="p-2 font-mono text-green-400">{row.testName}</td><td className="p-2 font-mono text-text-low">{row.findingIds.length}</td></tr>)}</tbody></table></div></section>
        <section className="rounded-card border border-info/25 bg-info/10 p-4 text-sm leading-6 text-text-mid"><Lock className="mb-2 text-info" size={16}/> Tests are generated artifacts for local/fork execution. Archon does not run them against mainnet or submit transactions.</section>
      </aside>
    </div>
  </div>;
}

function SummaryCard({ label, value }: { label: string; value: string }) { return <div className="rounded-card border border-border-subtle bg-surface-1 p-4"><p className="text-xs text-text-low">{label}</p><p className="mt-2 font-mono text-lg text-text-hi">{value}</p></div>; }
function ComingSoon({ title, message }: { title: string; message: string }) { return <section className="rounded-card border border-warning/30 bg-warning/10 p-8 text-center"><h2 className="text-2xl font-semibold text-warning">{title}</h2><p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-text-mid">{message}</p></section>; }
