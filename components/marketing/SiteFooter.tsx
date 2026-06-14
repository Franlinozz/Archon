import Link from "next/link";
import { ArrowUpRight, Github } from "lucide-react";
import { ArchonLogo, CopyButton, MainnetBadge } from "@/components/archon";
import { MANTLE_EXPLORER_URL } from "@/lib/chain/mantle";
import { shortHash } from "@/lib/marketing/stats";

// The footer is where serious evaluators go first — a sitemap of credibility.
// Every link is real; on-chain artifacts link to their explorer/manifest form.
const REGISTRY = process.env.NEXT_PUBLIC_ARCHON_PROOF_REGISTRY ?? "0xe7043e2ec95eF357FbBa3359BA2f1edb10cEAD2a";

type FooterLink = { label: string; href: string; external?: boolean };

const COLUMNS: Array<{ title: string; links: FooterLink[] }> = [
  {
    title: "Product",
    links: [
      { label: "Audit Studio", href: "/app/audit/new" },
      { label: "Gas Optimizer", href: "/app/gas" },
      { label: "Cost Guard", href: "/app/cost-guard" },
      { label: "Gas Leaderboard", href: "/gas-leaderboard" },
      { label: "Gas Observatory", href: "/observatory" },
      { label: "Public Reports", href: "/proofs" },
      { label: "Pricing", href: "/pricing" },
    ],
  },
  {
    title: "Developers",
    links: [
      { label: "Documentation", href: "/docs" },
      { label: "API Reference", href: "/api-reference" },
      { label: "CI GitHub Action", href: "/docs/gas-optimizer/ci-github-action" },
      { label: "Whitepaper", href: "/docs/resources/whitepaper" },
      { label: "Whitepaper PDF (v2.1)", href: "/whitepaper.pdf", external: true },
      { label: "Changelog", href: "/docs/resources/changelog" },
      { label: "GitHub", href: "https://github.com/Franlinozz/Archon", external: true },
    ],
  },
  {
    title: "Trust",
    links: [
      { label: "Verify a proof", href: "/proofs" },
      { label: "Security & safety model", href: "/docs/resources/security-safety-model" },
      { label: "ArchonProofRegistry", href: `${MANTLE_EXPLORER_URL}/address/${REGISTRY}`, external: true },
      { label: "ERC-8004 Agent #97", href: "/.well-known/archon-agent.json", external: true },
      { label: "Proof verification docs", href: "/docs/on-chain-proofs/verifying-a-proof" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-border-subtle bg-surface-1/50">
      <div className="mx-auto grid max-w-7xl gap-10 px-6 py-14 md:grid-cols-[1.3fr_1fr_1fr_1fr]">
        <div>
          <ArchonLogo />
          <p className="mt-4 max-w-xs text-sm leading-6 text-body">Verifiable audit, gas, and proof infrastructure for Mantle builders.</p>
          <div className="mt-5"><MainnetBadge /></div>
        </div>
        {COLUMNS.map((column) => (
          <nav key={column.title} aria-label={column.title}>
            <h3 className="text-sm font-semibold text-ink">{column.title}</h3>
            <ul className="mt-4 space-y-2.5 text-sm">
              {column.links.map((link) => (
                <li key={link.label}>
                  {link.external ? (
                    <a href={link.href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-body transition-colors hover:text-ink">
                      {link.label} <ArrowUpRight size={12} className="text-muted" aria-hidden />
                    </a>
                  ) : (
                    <Link href={link.href} className="text-body transition-colors hover:text-ink">{link.label}</Link>
                  )}
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-t border-border-subtle">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-6 py-5 text-xs text-muted">
          <span>© 2026 Archon</span>
          <span className="inline-flex items-center gap-1.5 font-mono">
            ArchonProofRegistry {shortHash(REGISTRY, 6, 4)} <CopyButton value={REGISTRY} />
          </span>
          <a href="https://github.com/Franlinozz/Archon" target="_blank" rel="noreferrer" aria-label="Archon on GitHub" className="text-muted transition-colors hover:text-ink"><Github size={16} /></a>
        </div>
      </div>
    </footer>
  );
}
