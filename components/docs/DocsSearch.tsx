"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Command } from "cmdk";
import { Search, X } from "lucide-react";

type SearchResult = {
  id: string;
  title: string;
  description?: string;
  url: string;
  content?: string;
};

export function DocsSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(true);
      }
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!open || query.trim().length < 2) {
      setResults([]);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`, { signal: controller.signal });
        const json = (await response.json()) as { results?: SearchResult[] };
        setResults(json.results ?? []);
      } catch (error) {
        if (!controller.signal.aborted) setResults([]);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 120);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [open, query]);

  const label = useMemo(() => (loading ? "Searching…" : "Search docs"), [loading]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-between gap-3 rounded-input border border-subtle bg-surface-1/80 px-3 py-2 text-left text-sm text-muted shadow-sm backdrop-blur hover:border-emphasis hover:text-ink lg:w-72"
      >
        <span className="flex items-center gap-2"><Search className="h-4 w-4" /> {label}</span>
        <kbd className="rounded-md border border-subtle bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] text-muted">⌘K</kbd>
      </button>
      {open ? (
        <div className="fixed inset-0 z-[999] isolate bg-ink/35 p-4 backdrop-blur-sm" onMouseDown={() => setOpen(false)}>
          <Command
            className="relative z-[1000] mx-auto mt-16 max-w-2xl overflow-hidden rounded-card border border-emphasis bg-surface-1 shadow-lift"
            shouldFilter={false}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-center gap-3 border-b border-subtle px-4 py-3">
              <Search className="h-5 w-5 text-muted" />
              <Command.Input
                autoFocus
                value={query}
                onValueChange={setQuery}
                placeholder="Search Archon docs…"
                className="min-w-0 flex-1 bg-transparent text-base text-ink outline-none placeholder:text-muted"
              />
              <button type="button" onClick={() => setOpen(false)} className="rounded-full p-1 text-muted hover:bg-surface-2 hover:text-ink">
                <X className="h-4 w-4" />
              </button>
            </div>
            <Command.List className="max-h-[55vh] overflow-y-auto p-2">
              {query.trim().length < 2 ? <Command.Empty className="px-3 py-8 text-center text-sm text-muted">Type at least two characters.</Command.Empty> : null}
              {query.trim().length >= 2 && results.length === 0 ? <Command.Empty className="px-3 py-8 text-center text-sm text-muted">No results found.</Command.Empty> : null}
              {results.map((result) => (
                <Command.Item key={result.id} value={result.id} asChild>
                  <Link href={result.url} onClick={() => setOpen(false)} className="block rounded-input px-3 py-3 hover:bg-surface-2 aria-selected:bg-brand-100">
                    <div className="font-semibold text-ink">{result.title}</div>
                    {result.description ? <div className="mt-1 text-sm text-body">{result.description}</div> : null}
                    {result.content ? <div className="mt-1 line-clamp-2 text-xs text-muted">{result.content}</div> : null}
                  </Link>
                </Command.Item>
              ))}
            </Command.List>
          </Command>
        </div>
      ) : null}
    </>
  );
}
