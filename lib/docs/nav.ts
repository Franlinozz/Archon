export type DocsNavItem = {
  title: string;
  href: string;
  description?: string;
};

export type DocsNavGroup = {
  title: string;
  items: DocsNavItem[];
};

export const docsNav: DocsNavGroup[] = [
  {
    title: "Introduction",
    items: [
      { title: "What is Archon", href: "/docs/introduction/what-is-archon" },
      { title: "Why Archon", href: "/docs/introduction/why-archon" },
      { title: "Quickstart", href: "/docs/introduction/quickstart" },
    ],
  },
  {
    title: "Audit",
    items: [
      { title: "Overview", href: "/docs/audit/overview" },
      { title: "Running a scan", href: "/docs/audit/running-a-scan" },
      { title: "Findings & severity", href: "/docs/audit/findings-severity" },
      { title: "Mantle-specific risks", href: "/docs/audit/mantle-specific-risks" },
      { title: "Protocol coverage", href: "/docs/audit/protocol-coverage" },
      { title: "Generated tests", href: "/docs/audit/generated-tests" },
      { title: "Sentinel (continuous audit)", href: "/docs/audit/sentinel" },
    ],
  },
  {
    title: "Gas Optimizer",
    items: [
      { title: "Overview", href: "/docs/gas-optimizer/overview" },
      { title: "How Mantle gas works", href: "/docs/gas-optimizer/how-mantle-gas-works" },
      { title: "Running an optimization", href: "/docs/gas-optimizer/running-an-optimization" },
      { title: "Optimization catalog", href: "/docs/gas-optimizer/optimization-catalog" },
      { title: "Applying patches & gas-diff tests", href: "/docs/gas-optimizer/applying-patches-gas-diff-tests" },
      { title: "CI GitHub Action", href: "/docs/gas-optimizer/ci-github-action" },
      { title: "Gas Leaderboard", href: "/docs/gas-optimizer/gas-leaderboard" },
    ],
  },
  {
    title: "On-chain Proofs",
    items: [
      { title: "ERC-8004 identity", href: "/docs/on-chain-proofs/erc-8004-identity" },
      { title: "Proof logging", href: "/docs/on-chain-proofs/proof-logging" },
      { title: "Verifying a proof", href: "/docs/on-chain-proofs/verifying-a-proof" },
      { title: "Verified builds", href: "/docs/on-chain-proofs/verified-builds" },
      { title: "ArchonProofRegistry", href: "/docs/on-chain-proofs/archon-proof-registry" },
    ],
  },
  {
    title: "Platform & API",
    items: [
      { title: "API reference", href: "/docs/platform-api/api-reference" },
      { title: "CLI (archon-scan)", href: "/docs/platform-api/cli" },
      { title: "GitHub App", href: "/docs/platform-api/github-app" },
      { title: "Cloud providers", href: "/docs/platform-api/cloud-providers" },
      { title: "Authentication", href: "/docs/platform-api/authentication" },
      { title: "Rate limits", href: "/docs/platform-api/rate-limits" },
      { title: "Webhooks", href: "/docs/platform-api/webhooks" },
    ],
  },
  {
    title: "Resources",
    items: [
      { title: "Architecture", href: "/docs/resources/architecture" },
      { title: "Security & safety model", href: "/docs/resources/security-safety-model" },
      { title: "Whitepaper", href: "/docs/resources/whitepaper" },
      { title: "FAQ", href: "/docs/resources/faq" },
      { title: "Changelog", href: "/docs/resources/changelog" },
    ],
  },
];

export const docsLinks = [
  { title: "Archon documentation", href: "/docs" },
  ...docsNav.flatMap((group) => group.items),
];

export function getAdjacentDocs(href: string) {
  const index = docsLinks.findIndex((item) => item.href === href);
  return {
    previous: index > 0 ? docsLinks[index - 1] : undefined,
    next: index >= 0 && index < docsLinks.length - 1 ? docsLinks[index + 1] : undefined,
  };
}
