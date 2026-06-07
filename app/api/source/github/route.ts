import { NextResponse } from "next/server";
import { z } from "zod";

const bodySchema = z.object({ repo: z.string().min(3), path: z.string().optional(), ref: z.string().optional() });

function parseRepo(input: string) {
  const trimmed = input.trim();
  const urlMatch = trimmed.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)(?:\/(?:blob|raw)\/([^/]+)\/(.+))?/i);
  if (urlMatch) return { owner: urlMatch[1]!, repo: urlMatch[2]!.replace(/\.git$/, ""), ref: urlMatch[3], path: urlMatch[4] };
  const short = trimmed.match(/^([^/\s]+)\/([^/\s#]+)(?:#(.+))?$/);
  if (short) return { owner: short[1]!, repo: short[2]!.replace(/\.git$/, ""), ref: undefined, path: short[3] };
  return null;
}

async function github(path: string) {
  const headers: HeadersInit = { accept: "application/vnd.github+json", "user-agent": "archon-audit" };
  if (process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const response = await fetch(`https://api.github.com${path}`, { headers, next: { revalidate: 60 } });
  if (!response.ok) throw new Error(`GitHub returned HTTP ${response.status}`);
  return response.json() as Promise<unknown>;
}

type TreeItem = { path: string; type: string; size?: number };

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Provide a GitHub repo like owner/name, a GitHub URL, or owner/name#path/to/File.sol." }, { status: 400 });
  const repoInfo = parseRepo(parsed.data.repo);
  if (!repoInfo) return NextResponse.json({ error: "Unsupported GitHub repo format." }, { status: 400 });

  const owner = repoInfo.owner;
  const repo = repoInfo.repo;
  const ref = parsed.data.ref ?? repoInfo.ref;
  let filePath = parsed.data.path ?? repoInfo.path;

  try {
    if (!filePath) {
      const branchSuffix = ref ? `?ref=${encodeURIComponent(ref)}` : "";
      const tree = await github(`/repos/${owner}/${repo}/git/trees/${encodeURIComponent(ref ?? "HEAD")}?recursive=1`).catch(async () => {
        const meta = await github(`/repos/${owner}/${repo}${branchSuffix}`) as { default_branch?: string };
        return github(`/repos/${owner}/${repo}/git/trees/${encodeURIComponent(meta.default_branch ?? "main")}?recursive=1`);
      }) as { tree?: TreeItem[] };
      const candidates = (tree.tree ?? [])
        .filter((item) => item.type === "blob" && item.path.endsWith(".sol") && !(item.path.includes("/test/") || item.path.includes("/script/")))
        .sort((a, b) => (b.size ?? 0) - (a.size ?? 0));
      filePath = candidates[0]?.path;
    }
    if (!filePath) return NextResponse.json({ error: "No Solidity file found in the repository. Provide owner/repo#path/to/File.sol." }, { status: 404 });

    const content = await github(`/repos/${owner}/${repo}/contents/${encodeURIComponent(filePath).replaceAll("%2F", "/")}${ref ? `?ref=${encodeURIComponent(ref)}` : ""}`) as { content?: string; encoding?: string; download_url?: string; name?: string; path?: string };
    let source = "";
    if (content.encoding === "base64" && content.content) source = Buffer.from(content.content, "base64").toString("utf8");
    else if (content.download_url) source = await fetch(content.download_url).then((res) => res.text());
    if (!source.includes("pragma solidity")) return NextResponse.json({ error: `${filePath} does not look like Solidity source.` }, { status: 422 });

    return NextResponse.json({ source, fileName: content.name ?? filePath.split("/").pop(), path: content.path ?? filePath, repo: `${owner}/${repo}` });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "GitHub source import failed." }, { status: 502 });
  }
}
