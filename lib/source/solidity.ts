import JSZip from "jszip";
import path from "node:path";

export const MAX_SOURCE_BYTES = Number(process.env.ARCHON_SOURCE_MAX_BYTES ?? 350_000);
export const MAX_UPLOAD_BYTES = Number(process.env.ARCHON_UPLOAD_MAX_BYTES ?? 1_500_000);
export const MAX_ZIP_FILES = Number(process.env.ARCHON_ZIP_MAX_FILES ?? 80);
export const MAX_GITHUB_SOL_FILES = Number(process.env.ARCHON_GITHUB_MAX_SOL_FILES ?? 80);
export const MAX_GITHUB_TOTAL_BYTES = Number(process.env.ARCHON_GITHUB_MAX_TOTAL_BYTES ?? 1_500_000);

export type SoliditySourceFile = {
  path: string;
  name: string;
  source: string;
  size: number;
  contractNames: string[];
};

export type SourceBundleFile = { path: string; source: string };
export type SolidityRemapping = { from: string; to: string };

export type SourceSelectionResponse = {
  mode: "single" | "select";
  source?: string;
  fileName?: string;
  path?: string;
  sourceFiles?: Array<{ path: string; source: string }>;
  files?: Array<{ path: string; name: string; size: number; contractNames: string[] }>;
  message?: string;
};

function isSourceBundleConfig(path: string) {
  return path === "remappings.txt" || path.endsWith("/remappings.txt") || path === "foundry.toml" || path.endsWith("/foundry.toml");
}

export function validateSoliditySource(source: string, label = "Source") {
  const trimmed = source.trim();
  if (!trimmed) throw new Error(`${label} is empty.`);
  if (Buffer.byteLength(trimmed, "utf8") > MAX_SOURCE_BYTES) throw new Error(`${label} exceeds ${Math.round(MAX_SOURCE_BYTES / 1000)} KB.`);
  if (!/pragma\s+solidity\b/.test(trimmed)) throw new Error(`${label} must include a Solidity pragma.`);
  if (!/\b(contract|library|interface)\s+[A-Za-z_][A-Za-z0-9_]*/.test(trimmed)) throw new Error(`${label} must include at least one contract, library, or interface.`);
  return trimmed;
}

export function contractNames(source: string) {
  return Array.from(source.matchAll(/\b(?:contract|library|interface)\s+([A-Za-z_][A-Za-z0-9_]*)/g)).map((match) => match[1]!).slice(0, 20);
}

export function solidityImports(source: string) {
  const imports = new Set<string>();
  for (const match of source.matchAll(/import\s+(?:[^"']*from\s+)?["']([^"']+)["']\s*;/g)) {
    const specifier = match[1]?.trim();
    if (specifier && specifier.endsWith(".sol") && !specifier.startsWith("http://") && !specifier.startsWith("https://")) imports.add(specifier);
  }
  return [...imports];
}

export function parseFoundryRemappings(source: string) {
  const remappings: SolidityRemapping[] = [];
  const add = (line: string) => {
    const trimmed = line.trim().replace(/^['"]|['"]$/g, "");
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) return;
    const [from, ...rest] = trimmed.split("=");
    const to = rest.join("=");
    if (from && to) remappings.push({ from: from.trim(), to: to.trim() });
  };

  for (const line of source.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.includes("=") && !trimmed.startsWith("remappings")) add(trimmed);
    const arrayMatch = trimmed.match(/remappings\s*=\s*\[(.*)\]/);
    if (arrayMatch) {
      for (const item of arrayMatch[1]!.split(",")) add(item.trim());
    }
  }
  return remappings;
}

export const ARCHON_DEPS_ROOT = process.env.ARCHON_DEPS_ROOT ?? "/opt/archon-deps";

function ozMajorPreference(source: string, imports: string[]) {
  const pragma = source.match(/pragma\s+solidity\s+([^;]+);/)?.[1]?.trim() ?? "";
  const minor = Number(pragma.match(/0\.8\.(\d+)/)?.[1] ?? "999");
  const pinsPre020 = Number.isFinite(minor) && minor < 20;
  const usesV5OnlyStyle = imports.some((item) => /access\/manager|governance\/utils|utils\/cryptography\/MessageHashUtils|interfaces\/IERC5267/.test(item));
  if (usesV5OnlyStyle) return [5, 4] as const;
  return pinsPre020 ? ([4, 5] as const) : ([5, 4] as const);
}

export function dependencyRemappingsForSource(source: string, extraImports: string[] = []): SolidityRemapping[] {
  const imports = [...new Set([...solidityImports(source), ...extraImports])];
  const ozOrder = ozMajorPreference(source, imports);
  const remaps: SolidityRemapping[] = [];
  for (const major of ozOrder) remaps.push({ from: "@openzeppelin/contracts/", to: `openzeppelin/${major}/contracts/` });
  for (const major of ozOrder) remaps.push({ from: "@openzeppelin/contracts-upgradeable/", to: `openzeppelin-upgradeable/${major}/contracts-upgradeable/` });
  remaps.push(
    { from: "solmate/", to: "solmate/src/" },
    { from: "solady/", to: "solady/src/" },
    { from: "forge-std/", to: "forge-std/src/" },
  );
  return remaps;
}

export function dependencyRemapGroupsForSource(source: string, extraImports: string[] = []): SolidityRemapping[][] {
  const imports = [...new Set([...solidityImports(source), ...extraImports])];
  const [first, second] = ozMajorPreference(source, imports);
  const base = [
    { from: "solmate/", to: "solmate/src/" },
    { from: "solady/", to: "solady/src/" },
    { from: "forge-std/", to: "forge-std/src/" },
  ];
  return [first, second].map((major) => [
    { from: "@openzeppelin/contracts/", to: `openzeppelin/${major}/contracts/` },
    { from: "@openzeppelin/contracts-upgradeable/", to: `openzeppelin-upgradeable/${major}/contracts-upgradeable/` },
    ...base,
  ]);
}

export function solcRemapArgs(remappings: SolidityRemapping[]) {
  return remappings.map((mapping) => `${mapping.from}=${mapping.to}`);
}

export function solcIncludePaths(workdir: string) {
  return [workdir, ARCHON_DEPS_ROOT, path.join(process.cwd(), "node_modules"), path.join(process.cwd(), "lib/source/vendor")];
}

export function importCandidates(importPath: string, fromFile: string, remappings: SolidityRemapping[] = []) {
  const fromDir = fromFile.includes("/") ? fromFile.split("/").slice(0, -1).join("/") : "";
  const normalize = (value: string) => path.posix.normalize(value.replaceAll("\\", "/")).replace(/^\.\//, "");
  const candidates = new Set<string>();
  if (importPath.startsWith("./") || importPath.startsWith("../")) candidates.add(normalize(`${fromDir}/${importPath}`));
  for (const mapping of remappings) {
    if (importPath.startsWith(mapping.from)) candidates.add(normalize(`${mapping.to}${importPath.slice(mapping.from.length)}`));
  }
  candidates.add(normalize(importPath));
  return [...candidates].filter((candidate) => candidate && !candidate.startsWith("../") && candidate !== "..");
}

export function sanitizeArchivePath(rawPath: string) {
  const normalized = rawPath.replaceAll("\\", "/").split("/").filter(Boolean).join("/");
  if (!normalized || normalized.startsWith("/") || normalized.includes("../") || normalized === "..") throw new Error(`Unsafe archive path rejected: ${rawPath}`);
  return normalized;
}

export function makeSourceFile(path: string, source: string): SoliditySourceFile {
  const safeSource = validateSoliditySource(source, path);
  const parts = path.split("/");
  return { path, name: parts.at(-1) ?? path, source: safeSource, size: Buffer.byteLength(safeSource, "utf8"), contractNames: contractNames(safeSource) };
}

export function chooseOrList(files: SoliditySourceFile[], requestedPath?: string): SourceSelectionResponse {
  if (!files.length) throw new Error("No Solidity files found.");
  const selected = requestedPath ? files.find((file) => file.path === requestedPath) : undefined;
  if (requestedPath && !selected) throw new Error(`Selected Solidity file was not found: ${requestedPath}`);
  const file = selected ?? (files.length === 1 ? files[0] : undefined);
  if (file) return { mode: "single", source: file.source, fileName: file.name, path: file.path, sourceFiles: files.map(({ path, source }) => ({ path, source })) };
  return {
    mode: "select",
    message: "Multiple Solidity files found. Select the target contract file.",
    files: files.map(({ path, name, size, contractNames }) => ({ path, name, size, contractNames })),
  };
}

export async function parseSolidityUpload(file: File, selectedPath?: string): Promise<SourceSelectionResponse> {
  if (file.size > MAX_UPLOAD_BYTES) throw new Error(`Upload exceeds ${Math.round(MAX_UPLOAD_BYTES / 1000)} KB.`);
  const lower = file.name.toLowerCase();
  if (lower.endsWith(".sol")) {
    return chooseOrList([makeSourceFile(file.name, await file.text())], selectedPath);
  }
  if (!lower.endsWith(".zip")) throw new Error("Upload a Solidity .sol file or a .zip containing Solidity files.");

  const zip = await JSZip.loadAsync(await file.arrayBuffer(), { checkCRC32: true });
  const files: SoliditySourceFile[] = [];
  const configFiles: SourceBundleFile[] = [];
  let totalBytes = 0;
  for (const entry of Object.values(zip.files)) {
    if (entry.dir) continue;
    const safePath = sanitizeArchivePath(entry.name);
    const source = await entry.async("string");
    totalBytes += Buffer.byteLength(source, "utf8");
    if (totalBytes > MAX_UPLOAD_BYTES) throw new Error(`Archive Solidity contents exceed ${Math.round(MAX_UPLOAD_BYTES / 1000)} KB.`);
    if (safePath.endsWith(".sol")) {
      if (files.length >= MAX_ZIP_FILES) throw new Error(`Archive contains more than ${MAX_ZIP_FILES} Solidity files. Upload a smaller archive.`);
      files.push(makeSourceFile(safePath, source));
    } else if (isSourceBundleConfig(safePath)) {
      configFiles.push({ path: path.basename(safePath), source });
    }
  }
  const response = chooseOrList(files.sort((a, b) => b.size - a.size), selectedPath);
  return response.mode === "single" && configFiles.length ? { ...response, sourceFiles: [...(response.sourceFiles ?? []), ...configFiles] } : response;
}
