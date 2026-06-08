import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { source } from "@/lib/docs/source";
import { DocsMdx, DocsShell } from "@/components/docs/DocsShell";

export const dynamic = "force-static";

type DocsRouteProps = {
  params: Promise<{ slug?: string[] }>;
};

function hrefFor(slug?: string[]) {
  return slug && slug.length > 0 ? `/docs/${slug.join("/")}` : "/docs";
}

export function generateStaticParams() {
  return source.generateParams("slug").map((params) => ({ slug: params.slug }));
}

export async function generateMetadata({ params }: DocsRouteProps): Promise<Metadata> {
  const { slug } = await params;
  const page = source.getPage(slug);
  if (!page) return {};
  return {
    title: `${page.data.title} — Archon Docs`,
    description: page.data.description,
  };
}

export default async function DocsRoute({ params }: DocsRouteProps) {
  const { slug } = await params;
  const page = source.getPage(slug);
  if (!page) notFound();

  const body = await page.data.body;

  const toc = (page.data.toc ?? []).map((item) => ({
    title: typeof item.title === "string" ? item.title : String(item.title ?? ""),
    url: item.url,
    depth: item.depth,
  }));

  return (
    <DocsShell title={page.data.title ?? "Archon Docs"} description={page.data.description} href={hrefFor(slug)} toc={toc}>
      <DocsMdx body={body} />
    </DocsShell>
  );
}
