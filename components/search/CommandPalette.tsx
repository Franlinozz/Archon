"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Clock, FileText, Search, ShieldCheck, SquareCode } from "lucide-react";
import { SeverityPill } from "@/components/archon";
import type { Severity } from "@/components/archon/severity";

type FindingHit = { id: string; reportId: string; severity: string; title: string; file: string | null; lineStart: number | null; contractName: string };
type ReportHit = { id: string; contractName: string; riskScore: number; reportHash: string | null };
type ContractHit = { reportId: string; contractName: string; address: string | null };
type SearchResults = { findings: FindingHit[]; reports: ReportHit[]; contracts: ContractHit[] };
const EMPTY: SearchResults = { findings: [], reports: [], contracts: [] };

type RecentEntry = { label: string; sub?: string; route: string };
const RECENT_KEY = "archon-recent-search";

const PAGES: { label: string; route: string; keywords?: string }[] = [
  { label: "Overview", route: "/app", keywords: "home workspace dashboard reports" },
  { label: "Creator Workspace", route: "/app/creator", keywords: "builder launch templates founder workspace" },
  { label: "Audit Studio", route: "/app/audit/new", keywords: "scan new contract solidity" },
  { label: "Contract Context", route: "/app/context", keywords: "abi address verified" },
  { label: "Cost Guard", route: "/app/cost-guard", keywords: "gas spend rpc ai" },
  { label: "Findings", route: "/app/findings", keywords: "vulnerabilities severity" },
  { label: "Generated Tests", route: "/app/tests", keywords: "foundry coverage" },
  { label: "On-chain Proof", route: "/app/proofs", keywords: "reputation erc-8004 verify" },
  { label: "Validation", route: "/app/validation" },
  { label: "Settings", route: "/app/settings", keywords: "theme appearance wallet notifications" },
  { label: "Docs", route: "/docs", keywords: "documentation how it works" },
];

function loadRecent(): RecentEntry[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const parsed = raw ? (JSON.parse(raw) as RecentEntry[]) : [];
    return Array.isArray(parsed) ? parsed.slice(0, 5) : [];
  } catch {
    return [];
  }
}

export function CommandPalette() {
  const router = useRouter();
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [recent, setRecent] = useState<RecentEntry[]>([]);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Global ⌘K / Ctrl+K to open; Escape to close.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === "Escape" && open) {
        setOpen(false);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  // On open: load recent + reset. On close: restore focus to the trigger.
  useEffect(() => {
    if (open) {
      setRecent(loadRecent());
    } else {
      setQuery("");
      setResults(EMPTY);
      triggerRef.current?.focus();
    }
  }, [open]);

  // Debounced server search with stale-request cancellation.
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults(EMPTY);
      setLoading(false);
      return;
    }
    setLoading(true);
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: controller.signal });
        const data = (await res.json()) as SearchResults;
        setResults({ findings: data.findings ?? [], reports: data.reports ?? [], contracts: data.contracts ?? [] });
      } catch {
        /* aborted or failed — leave previous results */
      } finally {
        setLoading(false);
      }
    }, 180);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const pages = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return PAGES.filter((p) => p.label.toLowerCase().includes(q) || p.keywords?.includes(q));
  }, [query]);

  const go = useCallback((route: string, entry: RecentEntry) => {
    try {
      const next = [entry, ...loadRecent().filter((r) => r.route !== entry.route)].slice(0, 5);
      localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
    setOpen(false);
    router.push(route);
  }, [router]);

  const hasQuery = query.trim().length > 0;
  const noResults = hasQuery && !loading && pages.length === 0 && results.findings.length === 0 && results.reports.length === 0 && results.contracts.length === 0;

  return (
    <>
      {/* Trigger bar (replaces the dead search form). */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Search"
        className="flex min-w-0 flex-1 items-center gap-2 rounded-control border border-border-subtle bg-surface-2 px-3 py-1.5 text-sm text-text-low transition-colors hover:border-border-emphasis"
      >
        <Search size={15} />
        <span className="min-w-0 flex-1 truncate text-left">Search findings, reports, contracts…</span>
        <kbd className="hidden rounded border border-border-subtle bg-surface-1 px-1.5 py-0.5 font-mono text-[10px] text-text-low sm:inline">⌘K</kbd>
      </button>

      <AnimatePresence>
        {open ? (
          <motion.div
            className="fixed inset-0 z-[100] flex items-start justify-center p-4 pt-[12vh]"
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            {/* backdrop */}
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setOpen(false)} aria-hidden />
            <motion.div
              className="relative w-full max-w-xl overflow-hidden rounded-card border border-border-subtle bg-surface-1 shadow-lift"
              initial={reduce ? false : { opacity: 0, scale: 0.97, y: -6 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.97, y: -6 }}
              transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
            >
              <Command shouldFilter={false} loop label="Global search">
                <div className="flex items-center gap-2 border-b border-border-subtle px-3">
                  <Search size={16} className="text-text-low" />
                  <Command.Input
                    autoFocus
                    value={query}
                    onValueChange={setQuery}
                    placeholder="Search findings, reports, contracts…"
                    className="w-full border-0 bg-transparent py-3 text-sm text-text-hi placeholder:text-text-low focus:outline-none focus:ring-0"
                  />
                  <kbd className="rounded border border-border-subtle bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] text-text-low">Esc</kbd>
                </div>

                <Command.List className="max-h-[60vh] overflow-auto p-2">
                  {loading ? (
                    <div className="space-y-1.5 p-1">
                      {[0, 1, 2].map((i) => <div key={i} className="archon-skeleton h-9 rounded-control" />)}
                    </div>
                  ) : null}

                  {!loading && !hasQuery ? (
                    recent.length ? (
                      <Group heading="Recent">
                        {recent.map((r) => (
                          <Item key={`recent-${r.route}`} value={`recent-${r.route}`} onSelect={() => go(r.route, r)} icon={<Clock size={15} className="text-text-low" />}>
                            <span className="truncate text-text-hi">{r.label}</span>
                            {r.sub ? <span className="ml-2 truncate text-xs text-text-low">{r.sub}</span> : null}
                          </Item>
                        ))}
                      </Group>
                    ) : (
                      <p className="px-3 py-6 text-center text-sm text-text-low">Type to search findings, reports, contracts…</p>
                    )
                  ) : null}

                  {noResults ? <p className="px-3 py-6 text-center text-sm text-text-low">No matches for &ldquo;{query.trim()}&rdquo;</p> : null}

                  {!loading && hasQuery ? (
                    <>
                      {results.findings.length ? (
                        <Group heading="Findings">
                          {results.findings.map((f) => (
                            <Item key={`f-${f.id}`} value={`finding-${f.id}`} onSelect={() => go(`/app/reports/${f.reportId}/findings/${f.id}`, { label: f.title, sub: `${f.contractName} · ${f.file ?? "?"}:${f.lineStart ?? "?"}`, route: `/app/reports/${f.reportId}/findings/${f.id}` })} icon={<SeverityPill severity={(f.severity as Severity) ?? "info"} size="sm" />}>
                              <span className="min-w-0 flex-1 truncate text-text-hi">{f.title}</span>
                              <span className="ml-2 shrink-0 truncate font-mono text-xs text-text-low">{f.file ?? "?"}:{f.lineStart ?? "?"}</span>
                            </Item>
                          ))}
                        </Group>
                      ) : null}

                      {results.reports.length ? (
                        <Group heading="Reports">
                          {results.reports.map((r) => (
                            <Item key={`r-${r.id}`} value={`report-${r.id}`} onSelect={() => go(`/app/reports/${r.id}`, { label: r.contractName, sub: `Risk ${r.riskScore}`, route: `/app/reports/${r.id}` })} icon={<FileText size={15} className="text-text-low" />}>
                              <span className="min-w-0 flex-1 truncate text-text-hi">{r.contractName}</span>
                              <span className="ml-2 shrink-0 font-mono text-xs text-green-400">Risk {r.riskScore}</span>
                              {r.reportHash ? <span className="ml-2 hidden shrink-0 font-mono text-xs text-text-low sm:inline">{r.reportHash.slice(0, 10)}…</span> : null}
                            </Item>
                          ))}
                        </Group>
                      ) : null}

                      {results.contracts.length ? (
                        <Group heading="Contracts">
                          {results.contracts.map((c) => (
                            <Item key={`c-${c.reportId}`} value={`contract-${c.reportId}`} onSelect={() => go(`/app/reports/${c.reportId}`, { label: c.contractName, sub: c.address ?? undefined, route: `/app/reports/${c.reportId}` })} icon={<SquareCode size={15} className="text-text-low" />}>
                              <span className="min-w-0 flex-1 truncate text-text-hi">{c.contractName}</span>
                              {c.address ? <span className="ml-2 shrink-0 truncate font-mono text-xs text-text-low">{c.address.slice(0, 10)}…</span> : null}
                            </Item>
                          ))}
                        </Group>
                      ) : null}

                      {pages.length ? (
                        <Group heading="Pages">
                          {pages.map((p) => (
                            <Item key={`p-${p.route}`} value={`page-${p.route}`} onSelect={() => go(p.route, { label: p.label, sub: "Page", route: p.route })} icon={<ShieldCheck size={15} className="text-text-low" />}>
                              <span className="truncate text-text-hi">{p.label}</span>
                            </Item>
                          ))}
                        </Group>
                      ) : null}
                    </>
                  ) : null}
                </Command.List>
              </Command>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}

function Group({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <Command.Group heading={heading} className="mb-1 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.12em] [&_[cmdk-group-heading]]:text-text-low">
      {children}
    </Command.Group>
  );
}

function Item({ value, onSelect, icon, children }: { value: string; onSelect: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <Command.Item
      value={value}
      onSelect={onSelect}
      className="flex cursor-pointer items-center gap-2.5 rounded-control px-2.5 py-2 text-sm aria-selected:bg-surface-2 data-[selected=true]:bg-surface-2"
    >
      <span className="flex shrink-0 items-center">{icon}</span>
      <span className="flex min-w-0 flex-1 items-center">{children}</span>
    </Command.Item>
  );
}
