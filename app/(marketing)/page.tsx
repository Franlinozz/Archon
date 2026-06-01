import Link from "next/link";
import { Reveal } from "@/components/motion";
import { Hero } from "@/components/marketing/Hero";
import { ThreeSteps } from "@/components/marketing/ThreeSteps";

const previews = [
  ["Audit Studio", "Paste Solidity or inspect a Mantle address read-only.", "7-stage scan"],
  ["Contract Context", "Verified source, ABI preview, protocol matches.", "RPC read-only"],
  ["Cost Guard", "Gas, RPC, infrastructure, and AI spend signals.", "Sample-labeled"],
  ["On-chain Proof", "IPFS metadata + ERC-8004 Reputation entry.", "Verifiable"],
] as const;

export default function MarketingHome() {
  return <main className="bg-canvas text-text-hi">
    <Hero/>
    <section id="product" className="mx-auto max-w-7xl px-6 py-10"><div className="grid gap-3 md:grid-cols-4">{previews.map(([title, body, tag]) => <Reveal key={title}><article className="archon-card-lift h-full rounded-card border border-border-subtle bg-surface-1 p-4"><p className="font-mono text-xs uppercase tracking-[0.12em] text-green-400">{tag}</p><h2 className="mt-2 text-base font-semibold text-text-hi">{title}</h2><p className="mt-1.5 text-sm leading-relaxed text-text-mid">{body}</p><div className="mt-3 rounded-control bg-terminal p-2.5 font-mono text-xs text-text-code">{title === "On-chain Proof" ? "report_hash == rederived_hash" : title === "Cost Guard" ? "gas + rpc + ai · sample" : title === "Contract Context" ? "verifiedSource: true" : "Code Parse → Proof Logger"}</div></article></Reveal>)}</div></section>
    <ThreeSteps/>
    <footer id="docs" className="mx-auto grid max-w-7xl gap-6 border-t border-border-subtle px-6 py-8 text-sm text-text-mid md:grid-cols-4">
      <Footer title="Product" items={[["Audit Studio", "/app/audit/new"], ["Context Explorer", "/app/context"], ["Cost Guard", "/app/cost-guard"], ["Proofs", "/app/proofs"]]}/>
      <Footer title="Resources" items={[["Docs", "/docs"], ["ADR log", "https://github.com/Franlinozz/Archon/tree/main/docs/decisions"], ["README", "https://github.com/Franlinozz/Archon#readme"], ["API health", "/api/health"]]}/>
      <Footer title="Company" items={[["Mantle-native"], ["Hackathon build"], ["Read-only scans"], ["Careful findings"]]}/>
      <Footer title="Connect" items={[["GitHub", "https://github.com/Franlinozz/Archon"], ["Mantle Explorer", "https://mantlescan.xyz"], ["ERC-8004", "https://eips.ethereum.org/EIPS/eip-8004"], ["Archon Agent", "/.well-known/archon-agent.json"]]}/>
    </footer>
  </main>;
}
function Footer({ title, items }: { title: string; items: Array<[string, string?]> }) {
  return <div><h3 className="text-sm font-semibold text-text-hi">{title}</h3><ul className="mt-3 space-y-2 text-text-mid">{items.map(([label, href]) => <li key={label}>{!href ? <span className="text-text-low">{label}</span> : href.startsWith("http") ? <a href={href} target="_blank" rel="noreferrer" className="transition-colors hover:text-text-hi">{label}</a> : <Link href={href} className="transition-colors hover:text-text-hi">{label}</Link>}</li>)}</ul></div>;
}
