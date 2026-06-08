"use client";

import { useEffect, useState } from "react";

type TocItem = {
  title: string;
  url: string;
  depth: number;
};

export function DocsToc({ items }: { items: TocItem[] }) {
  const [active, setActive] = useState<string | undefined>(items[0]?.url);

  useEffect(() => {
    const headings = items
      .map((item) => document.getElementById(item.url.replace(/^#/, "")))
      .filter((element): element is HTMLElement => Boolean(element));
    if (headings.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible?.target.id) setActive(`#${visible.target.id}`);
      },
      { rootMargin: "-20% 0px -70% 0px" },
    );
    headings.forEach((heading) => observer.observe(heading));
    return () => observer.disconnect();
  }, [items]);

  if (items.length === 0) return null;

  return (
    <nav className="hidden xl:block xl:w-64 xl:shrink-0" aria-label="On this page">
      <div className="sticky top-24 rounded-card border border-subtle bg-surface-1/70 p-4 shadow-card backdrop-blur">
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-muted">On this page</p>
        <ol className="space-y-2 text-sm">
          {items.map((item) => (
            <li key={item.url} style={{ paddingLeft: `${Math.max(0, item.depth - 2) * 12}px` }}>
              <a className={active === item.url ? "text-brand-600" : "text-muted hover:text-ink"} href={item.url}>
                {item.title}
              </a>
            </li>
          ))}
        </ol>
      </div>
    </nav>
  );
}
