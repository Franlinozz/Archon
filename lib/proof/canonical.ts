import { createHash } from "node:crypto";

export function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(object[key])}`).join(",")}}`;
}

export function sha256Hex(value: string) {
  return `0x${createHash("sha256").update(value).digest("hex")}`;
}

export function deterministicReportHash(metadata: unknown) {
  return sha256Hex(canonicalize(metadata));
}
