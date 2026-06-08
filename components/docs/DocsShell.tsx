import Link from "next/link";
import { ArrowLeft, ArrowRight, BookOpen, ExternalLink } from "lucide-react";
import type React from "react";
import type { ComponentType, ReactNode } from "react";
import { docsNav, getAdjacentDocs } from "@/lib/docs/nav";
import { DocsSearch } from "@/components/docs/DocsSearch";
import { DocsToc } from "@/components/docs/DocsToc";
import { PreWithCopy } from "@/components/docs/DocsCode";
import { ReadingProgress } from "@/components/docs/ReadingProgress";

type MdxComponent = ComponentType<{ components?: Record<string, ComponentType<unknown>> }>;

type DocsShellProps = {
  title: string;
  description?: string;
  href: string;
  toc: { title: string; url: string; depth: number }[];
  children: ReactNode;
};

function Sidebar({ currentHref }: { currentHref: string }) {
  return (
    <aside className="lg:w-72 lg:shrink-0">
      <div className="sticky top-6 space-y-5 rounded-card border border-subtle bg-surface-1/75 p-4 shadow-card backdrop-blur">
        <Link href="/" className="flex items-center gap-3 rounded-input px-2 py-1.5 text-sm font-semibold text-ink hover:bg-surface-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-brand-700"><BookOpen className="h-4 w-4" /></span>
          Archon Docs
        </Link>
        <Link href="/docs" className={currentHref === "/docs" ? "block rounded-input bg-brand-100 px-3 py-2 text-sm font-semibold text-brand-700" : "block rounded-input px-3 py-2 text-sm text-body hover:bg-surface-2 hover:text-ink"}>
          Start here
        </Link>
        <nav className="space-y-5" aria-label="Documentation">
          {docsNav.map((group) => (
            <div key={group.title}>
              <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-[0.18em] text-muted">{group.title}</p>
              <ul className="space-y-1">
                {group.items.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={
                        currentHref === item.href
                          ? "block rounded-input bg-brand-100 px-3 py-2 text-sm font-semibold text-brand-700"
                          : "block rounded-input px-3 py-2 text-sm text-body hover:bg-surface-2 hover:text-ink"
                      }
                    >
                      {item.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </div>
    </aside>
  );
}

const mdxComponents = {
  pre: PreWithCopy,
  a: (props: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props} />,
};

export function DocsMdx({ body: Body }: { body: MdxComponent }) {
  return <Body components={mdxComponents as Record<string, ComponentType<unknown>>} />;
}

export function DocsShell({ title, description, href, toc, children }: DocsShellProps) {
  const { previous, next } = getAdjacentDocs(href);

  return (
    <div className="min-h-screen bg-canvas text-body">
      <ReadingProgress />
      <header className="sticky top-0 z-50 border-b border-subtle bg-canvas/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1500px] flex-col gap-3 px-4 py-3 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <Link href="/docs" className="font-display text-xl font-bold tracking-[-0.03em] text-ink">Archon Documentation</Link>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <DocsSearch />
            <Link href="/app" className="inline-flex items-center justify-center gap-2 rounded-input border border-subtle bg-surface-1 px-3 py-2 text-sm font-semibold text-ink shadow-sm hover:border-emphasis">
              Open app <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </header>
      <main className="mx-auto flex max-w-[1500px] flex-col gap-8 px-4 py-8 sm:px-6 lg:flex-row lg:px-8">
        <Sidebar currentHref={href} />
        <div className="min-w-0 flex-1 rounded-card border border-subtle bg-surface-1/82 shadow-card backdrop-blur">
          <article className="archon-docs-prose mx-auto max-w-3xl px-6 py-8 sm:px-8 lg:py-10">
            {description ? <p className="archon-docs-description">{description}</p> : null}
            {children}
          </article>
          <div className="grid gap-3 border-t border-subtle p-6 sm:grid-cols-2">
            {previous ? (
              <Link href={previous.href} className="rounded-card border border-subtle bg-surface-2/70 p-4 hover:border-emphasis">
                <span className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-muted"><ArrowLeft className="h-3.5 w-3.5" /> Previous</span>
                <span className="mt-2 block font-semibold text-ink">{previous.title}</span>
              </Link>
            ) : <div />}
            {next ? (
              <Link href={next.href} className="rounded-card border border-subtle bg-surface-2/70 p-4 text-right hover:border-emphasis">
                <span className="flex items-center justify-end gap-2 text-xs uppercase tracking-[0.18em] text-muted">Next <ArrowRight className="h-3.5 w-3.5" /></span>
                <span className="mt-2 block font-semibold text-ink">{next.title}</span>
              </Link>
            ) : null}
          </div>
        </div>
        <DocsToc items={toc} />
      </main>
    </div>
  );
}
