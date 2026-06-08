import { source } from "@/lib/docs/source";

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9\s/-]/g, " ").replace(/\s+/g, " ").trim();
}

function excerpt(content: string, query: string) {
  const clean = content.replace(/^---[\s\S]*?---/, "").replace(/[#`>*_{}[\]()]/g, " ").replace(/\s+/g, " ").trim();
  const index = normalize(clean).indexOf(normalize(query));
  if (index < 0) return clean.slice(0, 180);
  const start = Math.max(0, index - 70);
  return clean.slice(start, start + 220);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = url.searchParams.get("q")?.trim() ?? "";
  if (query.length < 2) return Response.json({ results: [] });

  const normalizedQuery = normalize(query);
  const pages = await Promise.all(
    source.getPages().map(async (page) => {
      const raw = await page.data.getText("raw");
      const haystack = normalize(`${page.data.title ?? ""} ${page.data.description ?? ""} ${raw}`);
      if (!haystack.includes(normalizedQuery)) return null;
      const titleHit = normalize(page.data.title ?? "").includes(normalizedQuery);
      return {
        id: page.url,
        title: page.data.title ?? page.url,
        description: page.data.description,
        url: page.url,
        content: excerpt(raw, query),
        score: titleHit ? 2 : 1,
      };
    }),
  );

  return Response.json({
    results: pages
      .filter((page): page is NonNullable<typeof page> => Boolean(page))
      .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
      .slice(0, 12),
  });
}
