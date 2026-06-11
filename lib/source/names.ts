import { createHash } from "node:crypto";

const solidityKeywords = new Set([
  "abstract", "after", "alias", "apply", "auto", "byte", "case", "catch", "constant", "copyof", "default", "defined", "do", "else", "emit", "event", "external", "false", "final", "for", "function", "immutable", "implements", "in", "indexed", "inline", "internal", "is", "let", "mapping", "match", "memory", "mutable", "null", "of", "override", "partial", "private", "promise", "public", "pure", "reference", "relocatable", "return", "returns", "sizeof", "static", "storage", "struct", "super", "supports", "switch", "this", "throw", "true", "try", "typedef", "typeof", "var", "view", "virtual", "while",
  "address", "bool", "bytes", "int", "uint", "string", "contract", "library", "interface", "pragma", "import", "from", "as", "using", "constructor", "modifier", "receive", "fallback",
]);

const stopwords = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "has", "have", "if", "in", "into", "is", "it", "never", "no", "not", "of", "on", "or", "that", "the", "this", "to", "was", "were", "when", "where", "with", "without",
]);

export function sourceShortHash(source: string) {
  return createHash("sha256").update(source).digest("hex").slice(0, 8);
}

export function isValidContractName(name: string | null | undefined) {
  if (!name) return false;
  if (!/^[A-Za-z_]\w*$/.test(name)) return false;
  const lower = name.toLowerCase();
  return !solidityKeywords.has(lower) && !stopwords.has(lower);
}

export function sanitizeContractName(name: string | null | undefined) {
  const cleaned = (name ?? "").trim().replace(/[^A-Za-z0-9_]/g, "_").replace(/^[^A-Za-z_]+/, "").slice(0, 80);
  return isValidContractName(cleaned) ? cleaned : null;
}

export function stripSolidityComments(source: string) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

export function solidityDefinitionNames(source: string) {
  const clean = stripSolidityComments(source);
  const defs = Array.from(clean.matchAll(/\b(contract|library|interface)\s+([A-Za-z_]\w*)/g))
    .map((match, index) => ({ kind: match[1]!, name: sanitizeContractName(match[2]), index }))
    .filter((def): def is { kind: string; name: string; index: number } => Boolean(def.name));
  const priority = (kind: string) => kind === "contract" ? 0 : kind === "library" ? 1 : 2;
  return defs.sort((a, b) => priority(a.kind) - priority(b.kind) || a.index - b.index).map((def) => def.name);
}

export function fallbackContractName(source: string, hash?: string | null) {
  const suffix = (hash ?? sourceShortHash(source)).replace(/^0x/, "").slice(0, 8) || "source";
  return `Contract_${suffix}`;
}

export function deriveContractName(source: string, options: { label?: string | null; compiledNames?: string[] | null; sourceHash?: string | null } = {}) {
  const label = sanitizeContractName(options.label);
  if (label && !/^0x[a-fA-F0-9]{40}$/.test(label)) return label;
  const compiled = (options.compiledNames ?? []).map(sanitizeContractName).find(Boolean);
  if (compiled) return compiled;
  const parsed = solidityDefinitionNames(source)[0];
  if (parsed) return parsed;
  return fallbackContractName(source, options.sourceHash);
}
