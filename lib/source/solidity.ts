import JSZip from "jszip";

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

export type SourceSelectionResponse = {
  mode: "single" | "select";
  source?: string;
  fileName?: string;
  path?: string;
  files?: Array<{ path: string; name: string; size: number; contractNames: string[] }>;
  message?: string;
};

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
  if (file) return { mode: "single", source: file.source, fileName: file.name, path: file.path };
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
  let totalBytes = 0;
  for (const entry of Object.values(zip.files)) {
    if (entry.dir) continue;
    const safePath = sanitizeArchivePath(entry.name);
    if (!safePath.endsWith(".sol")) continue;
    if (files.length >= MAX_ZIP_FILES) throw new Error(`Archive contains more than ${MAX_ZIP_FILES} Solidity files. Upload a smaller archive.`);
    const source = await entry.async("string");
    totalBytes += Buffer.byteLength(source, "utf8");
    if (totalBytes > MAX_UPLOAD_BYTES) throw new Error(`Archive Solidity contents exceed ${Math.round(MAX_UPLOAD_BYTES / 1000)} KB.`);
    files.push(makeSourceFile(safePath, source));
  }
  return chooseOrList(files.sort((a, b) => b.size - a.size), selectedPath);
}
