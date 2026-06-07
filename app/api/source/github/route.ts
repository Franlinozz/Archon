import { NextResponse } from "next/server";
import { z } from "zod";
import { chooseOrList, makeSourceFile, MAX_GITHUB_SOL_FILES, MAX_GITHUB_TOTAL_BYTES, type SoliditySourceFile } from "@/lib/source/solidity";

const bodySchema = z.object({ repo: z.string().min(3), path: z.string().optional(), ref: z.string().optional() });

type RepoInfo = { owner: string; repo: string; ref?: string; path?: string };
type TreeItem = { path: string; type: string; size?: number };
type GithubError = Error & { status?: number; rateLimited?: boolean };

function parseRepo(input: string): RepoInfo | null {
  const trimmed = input.trim();
  const urlMatch = trimmed.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)(?:\/(?:blob|raw)\/([^/]+)\/(.+))?\/?$/i);
  if (urlMatch) return { owner: urlMatch[1]!, repo: urlMatch[2]!.replace(/\.git$/, ""), ref: urlMatch[3], path: urlMatch[4] };
  const short = trimmed.match(/^([^/\s]+)\/([^/\s#]+)(?:#(.+))?$/);
  if (short) return { owner: short[1]!, repo: short[2]!.replace(/\.git$/, ""), path: short[3] };
  return null;
}

function friendlyGithubError(error: unknown) {
  const err = error as GithubError;
  if (err.rateLimited || err.status === 403) return { error: "GitHub rate limit reached. Add GITHUB_TOKEN in the environment or retry later.", status: 429 };
  if (err.status === 404) return { error: "GitHub repository or file was not found. Public repos only unless GITHUB_TOKEN has access.", status: 404 };
  if (err.status === 413) return { error: err.message, status: 413 };
  return { error: err instanceof Error ? err.message : "GitHub source import failed.", status: 502 };
}

async function github(path: string) {
  const headers: HeadersInit = { accept: "application/vnd.github+json", "user-agent": "archon-audit" };
  if (process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const response = await fetch(`https://api.github.com${path}`, { headers, next: { revalidate: 60 } });
  if (!response.ok) {
    const error = new Error(`GitHub returned HTTP ${response.status}`) as GithubError;
    error.status = response.status;
    error.rateLimited = response.status === 403 && (response.headers.get("x-ratelimit-remaining") === "0" || /rate limit/i.test(await response.text().catch(() => "")));
    throw error;
  }
  return response.json() as Promise<unknown>;
}

async function defaultBranch(owner: string, repo: string) {
  const meta = await github(`/repos/${owner}/${repo}`) as { default_branch?: string; private?: boolean };
  if (meta.private) throw Object.assign(new Error("Private repositories require a GitHub token with access."), { status: 404 });
  return meta.default_branch ?? "main";
}

async function fetchSolidityFile(owner: string, repo: string, path: string, ref?: string): Promise<SoliditySourceFile> {
  const content = await github(`/repos/${owner}/${repo}/contents/${encodeURIComponent(path).replaceAll("%2F", "/")}${ref ? `?ref=${encodeURIComponent(ref)}` : ""}`) as { content?: string; encoding?: string; download_url?: string; name?: string; path?: string; size?: number };
  if ((content.size ?? 0) > MAX_GITHUB_TOTAL_BYTES) throw Object.assign(new Error(`${path} exceeds ${Math.round(MAX_GITHUB_TOTAL_BYTES / 1000)} KB.`), { status: 413 });
  let source = "";
  if (content.encoding === "base64" && content.content) source = Buffer.from(content.content, "base64").toString("utf8");
  else if (content.download_url) source = await fetch(content.download_url).then((res) => res.text());
  return makeSourceFile(content.path ?? path, source);
}

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Provide a GitHub repo like owner/name, a GitHub URL, or owner/name#path/to/File.sol." }, { status: 400 });
  const repoInfo = parseRepo(parsed.data.repo);
  if (!repoInfo) return NextResponse.json({ error: "Unsupported GitHub repo format." }, { status: 400 });

  const owner = repoInfo.owner;
  const repo = repoInfo.repo;
  const ref = parsed.data.ref ?? repoInfo.ref;
  const selectedPath = parsed.data.path ?? repoInfo.path;

  try {
    if (selectedPath) {
      const selected = await fetchSolidityFile(owner, repo, selectedPath, ref);
      return NextResponse.json({ repo: `${owner}/${repo}`, ref, ...chooseOrList([selected], selected.path) });
    }

    const branch = ref ?? await defaultBranch(owner, repo);
    const tree = await github(`/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`) as { truncated?: boolean; tree?: TreeItem[] };
    if (tree.truncated) throw Object.assign(new Error("GitHub repo tree is too large/truncated. Provide owner/repo#path/to/File.sol."), { status: 413 });
    const candidates = (tree.tree ?? [])
      .filter((item) => item.type === "blob" && item.path.endsWith(".sol") && !(item.path.includes("/test/") || item.path.includes("/script/") || item.path.includes("/node_modules/")))
      .sort((a, b) => (b.size ?? 0) - (a.size ?? 0));
    if (!candidates.length) return NextResponse.json({ error: "No Solidity file found in the repository." }, { status: 404 });
    if (candidates.length > MAX_GITHUB_SOL_FILES) throw Object.assign(new Error(`Repository has ${candidates.length} Solidity files. Provide owner/repo#path/to/File.sol or narrow the repo.`), { status: 413 });
    const total = candidates.reduce((sum, item) => sum + (item.size ?? 0), 0);
    if (total > MAX_GITHUB_TOTAL_BYTES) throw Object.assign(new Error(`Repository Solidity files exceed ${Math.round(MAX_GITHUB_TOTAL_BYTES / 1000)} KB. Select a specific file with owner/repo#path/to/File.sol.`), { status: 413 });

    const files = await Promise.all(candidates.map((item) => fetchSolidityFile(owner, repo, item.path, branch)));
    return NextResponse.json({ repo: `${owner}/${repo}`, ref: branch, ...chooseOrList(files) });
  } catch (error) {
    const friendly = friendlyGithubError(error);
    return NextResponse.json({ error: friendly.error }, { status: friendly.status });
  }
}
