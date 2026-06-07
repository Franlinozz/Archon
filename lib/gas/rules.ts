import { createHash } from "node:crypto";
import path from "node:path";

export type GasOptimizationCategory = "storage" | "calldata" | "computation" | "deployment";
export type GasOptimizationSafety = "safe" | "review";

export type GasOptimizationRuleResult = {
  id: string;
  title: string;
  category: GasOptimizationCategory;
  where: string;
  file: string;
  lineStart: number | null;
  before: string;
  after: string;
  estL2Delta: number | null;
  estL1Delta: number | null;
  confidence: number;
  safety: GasOptimizationSafety;
  rationale: string;
  patch: {
    oldText: string;
    newText: string;
  };
};

export type NormalizedAstNode = {
  nodeType?: string;
  name?: string;
  src?: string;
  [key: string]: unknown;
};

export type GasRuleContext = {
  source: string;
  sourceFile: string;
  ast?: NormalizedAstNode | null;
};

type Rule = {
  id: string;
  run: (ctx: GasRuleContext) => GasOptimizationRuleResult[];
};

type AddArgs = Omit<GasOptimizationRuleResult, "where" | "file" | "patch"> & { oldText: string; newText: string };

const SMALL_STORAGE_TYPES = /\b(?:bool|address|uint(?:8|16|24|32|40|48|56|64|72|80|88|96|104|112|120|128|136|144|152|160|168|176|184|192|200|208|216|224|232|240|248)|int(?:8|16|24|32|40|48|56|64|72|80|88|96|104|112|120|128|136|144|152|160|168|176|184|192|200|208|216|224|232|240|248)|bytes(?:1|2|3|4|5|6|7|8|9|1\d|2\d|3[0-1]))\b/;

function lineFor(source: string, index: number) {
  return source.slice(0, index).split("\n").length;
}

function result(ctx: GasRuleContext, args: AddArgs): GasOptimizationRuleResult {
  return {
    ...args,
    file: path.basename(ctx.sourceFile),
    where: `${path.basename(ctx.sourceFile)}:${args.lineStart ?? "?"}`,
    patch: { oldText: args.oldText, newText: args.newText },
  };
}

function unique(results: GasOptimizationRuleResult[]) {
  const seen = new Set<string>();
  return results.filter((item) => {
    const key = createHash("sha256").update(`${item.id}:${item.where}:${item.before}:${item.after}`).digest("hex");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function matchLines(ctx: GasRuleContext, pattern: RegExp, build: (line: string, lineNo: number, match: RegExpMatchArray) => AddArgs | null) {
  const out: GasOptimizationRuleResult[] = [];
  ctx.source.split("\n").forEach((line, index) => {
    const match = line.match(pattern);
    if (!match) return;
    const args = build(line, index + 1, match);
    if (args) out.push(result(ctx, args));
  });
  return out;
}

const storagePackingRule: Rule = {
  id: "storage-packing",
  run(ctx) {
    const lines = ctx.source.split("\n");
    const decls = lines.map((line, index) => ({ line, lineNo: index + 1 })).filter(({ line }) => {
      const trimmed = line.trim();
      if (!trimmed.endsWith(";")) return false;
      if (/\b(?:function|event|error|return|require|emit|for|if|while)\b/.test(trimmed)) return false;
      if (/\b(?:memory|calldata|constant|immutable)\b/.test(trimmed)) return false;
      return SMALL_STORAGE_TYPES.test(trimmed);
    });
    const out: GasOptimizationRuleResult[] = [];
    for (let index = 0; index < decls.length - 1; index += 1) {
      const current = decls[index]!;
      const next = decls[index + 1]!;
      if (next.lineNo - current.lineNo > 4) continue;
      const between = lines.slice(current.lineNo, next.lineNo - 1).join("\n");
      if (/\buint256\b|\bbytes32\b|string\b|\[\]/.test(between)) {
        out.push(result(ctx, {
          id: "storage-packing",
          title: "Pack small storage variables into fewer slots",
          category: "storage",
          lineStart: current.lineNo,
          before: `${current.line.trim()} … ${next.line.trim()}`,
          after: "Group adjacent bool/address/small uint fields together and place full-slot fields after them.",
          oldText: current.line,
          newText: `${current.line} // REVIEW: reorder adjacent small storage fields with nearby small fields to reduce SSTORE/SLOAD slots`,
          estL2Delta: 20_000,
          estL1Delta: null,
          confidence: 0.64,
          safety: "review",
          rationale: "Storage slot packing can remove entire SSTORE/SLOAD slots but changes layout, so upgradeable contracts need manual review.",
        }));
      }
    }
    return unique(out).slice(0, 3);
  },
};

const calldataMemoryRule: Rule = {
  id: "calldata-over-memory",
  run(ctx) {
    return matchLines(ctx, /function\s+\w+\s*\([^)]*\b(string|bytes|\w+\[\])\s+memory\s+\w+[^)]*\)\s+(external|public)\b/, (line, lineStart) => resultArgs({
      id: "calldata-over-memory",
      title: "Use calldata for read-only external arguments",
      category: "calldata",
      lineStart,
      before: line.trim(),
      after: line.replace(/\bmemory\b/g, "calldata").trim(),
      oldText: line,
      newText: line.replace(/\bmemory\b/g, "calldata"),
      estL2Delta: 250,
      estL1Delta: 16,
      confidence: 0.76,
      safety: "review",
      rationale: "calldata avoids copying dynamic args into memory when the function only reads them; savings are primarily calldata/L1-DA plus copy gas.",
    }));
  },
};

const calldataTypeRule: Rule = {
  id: "calldata-smaller-types",
  run(ctx) {
    return matchLines(ctx, /function\s+\w+\s*\([^)]*\buint256\s+(amount|bps|fee|percent|rate|id|index|count)\b[^)]*\)\s+(external|public)\b/, (line, lineStart) => resultArgs({
      id: "calldata-smaller-types",
      title: "Review calldata parameter width",
      category: "calldata",
      lineStart,
      before: line.trim(),
      after: "Use the smallest ABI-safe integer width only when the domain is bounded and documented.",
      oldText: line,
      newText: `${line} // REVIEW: bounded calldata params may be packable/smaller in structs or encoded batches`,
      estL2Delta: null,
      estL1Delta: 16,
      confidence: 0.55,
      safety: "review",
      rationale: "For individual ABI params uint256 still occupies a full word, but bounded types help packed structs/batches and prevent redundant calldata.",
    }));
  },
};

const customErrorsRule: Rule = {
  id: "custom-errors",
  run(ctx) {
    return matchLines(ctx, /require\s*\((.+),\s*"([^"]{16,})"\s*\)/, (line, lineStart, match) => {
      const name = String(match[2]).replace(/[^A-Za-z0-9 ]/g, " ").trim().split(/\s+/).slice(0, 4).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join("") || "ArchonError";
      return resultArgs({
        id: "custom-errors",
        title: "Replace long revert string with custom error",
        category: "deployment",
        lineStart,
        before: line.trim(),
        after: `error ${name}(); … if (!(condition)) revert ${name}();`,
        oldText: line,
        newText: line.replace(/require\s*\((.+),\s*"[^"]+"\s*\)/, `if (!($1)) revert ${name}()`),
        estL2Delta: 120,
        estL1Delta: Math.max(16, String(match[2]).length),
        confidence: 0.9,
        safety: "safe",
        rationale: "Custom errors reduce deployment bytecode and revert-path gas while preserving typed failure semantics.",
      });
    });
  },
};

const immutableConstantRule: Rule = {
  id: "immutable-constant",
  run(ctx) {
    return matchLines(ctx, /^\s*(address|uint256|bytes32)\s+(public\s+)?([A-Z_][A-Z0-9_]*|\w+Registry|\w+Router|owner)\s*(=\s*[^;]+)?;/, (line, lineStart) => {
      if (/\b(constant|immutable)\b/.test(line)) return null;
      return resultArgs({
        id: "immutable-constant",
        title: "Mark never-changing value constant or immutable",
        category: "storage",
        lineStart,
        before: line.trim(),
        after: line.includes("=") ? line.replace(/\b(address|uint256|bytes32)\b/, "$1 constant").trim() : line.replace(/\b(address|uint256|bytes32)\b/, "$1 immutable").trim(),
        oldText: line,
        newText: line.includes("=") ? line.replace(/\b(address|uint256|bytes32)\b/, "$1 constant") : line.replace(/\b(address|uint256|bytes32)\b/, "$1 immutable"),
        estL2Delta: 2_100,
        estL1Delta: null,
        confidence: 0.62,
        safety: "review",
        rationale: "Constants/immutables avoid storage reads for values that do not change after deployment.",
      });
    });
  },
};

const cacheSloadRule: Rule = {
  id: "cache-repeated-sload",
  run(ctx) {
    const out: GasOptimizationRuleResult[] = [];
    const regex = /\b(\w+)\[(msg\.sender|\w+)\]/g;
    const counts = new Map<string, { count: number; index: number; text: string }>();
    for (const match of ctx.source.matchAll(regex)) {
      const key = match[0];
      const item = counts.get(key) ?? { count: 0, index: match.index ?? 0, text: key };
      item.count += 1;
      counts.set(key, item);
    }
    for (const item of counts.values()) {
      if (item.count < 2) continue;
      out.push(result(ctx, {
        id: "cache-repeated-sload",
        title: "Cache repeated storage read",
        category: "storage",
        lineStart: lineFor(ctx.source, item.index),
        before: `${item.text} read ${item.count} times`,
        after: `uint256 cached = ${item.text}; // reuse cached value`,
        oldText: item.text,
        newText: item.text,
        estL2Delta: 100 * (item.count - 1),
        estL1Delta: null,
        confidence: 0.7,
        safety: "review",
        rationale: "Repeated SLOADs should be cached in stack/memory when state cannot change between reads.",
      }));
    }
    return out.slice(0, 5);
  },
};

const uncheckedLoopRule: Rule = {
  id: "unchecked-loop-increment",
  run(ctx) {
    return matchLines(ctx, /for\s*\(([^;]*uint\w*\s+i\s*=\s*0;[^;]+;\s*)i\+\+\s*\)/, (line, lineStart) => resultArgs({
      id: "unchecked-loop-increment",
      title: "Use unchecked loop increment where bounded",
      category: "computation",
      lineStart,
      before: line.trim(),
      after: line.replace(/i\+\+/, "unchecked { ++i; }").trim(),
      oldText: line,
      newText: line.replace(/i\+\+/, "++i /* wrap increment in unchecked block after refactor */"),
      estL2Delta: 30,
      estL1Delta: null,
      confidence: 0.58,
      safety: "review",
      rationale: "A loop counter bounded by array length cannot overflow in practical execution; unchecked removes overflow checks after manual review.",
    }));
  },
};

const loopHygieneRule: Rule = {
  id: "loop-hygiene",
  run(ctx) {
    return matchLines(ctx, /for\s*\([^;]+;[^;]+\.length\s*;[^)]*\)/, (line, lineStart) => resultArgs({
      id: "loop-hygiene",
      title: "Cache array length before loop",
      category: "storage",
      lineStart,
      before: line.trim(),
      after: "uint256 len = array.length; for (...; i < len; ) { ... }",
      oldText: line,
      newText: `${line} // REVIEW: cache .length before loop and prefer ++i`,
      estL2Delta: 100,
      estL1Delta: null,
      confidence: 0.82,
      safety: "safe",
      rationale: "Caching storage array length avoids repeated SLOADs; using ++i/unchecked can reduce loop overhead.",
    }));
  },
};

const comparisonRule: Rule = {
  id: "nonzero-comparison",
  run(ctx) {
    return matchLines(ctx, />\s*0\b/, (line, lineStart) => resultArgs({
      id: "nonzero-comparison",
      title: "Use != 0 for unsigned non-zero checks",
      category: "computation",
      lineStart,
      before: line.trim(),
      after: line.replace(/>\s*0\b/g, "!= 0").trim(),
      oldText: line,
      newText: line.replace(/>\s*0\b/g, "!= 0"),
      estL2Delta: 3,
      estL1Delta: null,
      confidence: 0.7,
      safety: "safe",
      rationale: "For unsigned integers, != 0 is equivalent for non-zero checks and can compile slightly cheaper.",
    }));
  },
};

const externalPublicRule: Rule = {
  id: "external-vs-public",
  run(ctx) {
    return matchLines(ctx, /function\s+\w+\s*\([^)]*\bcalldata\b[^)]*\)\s+public\b/, (line, lineStart) => resultArgs({
      id: "external-vs-public",
      title: "Use external for calldata-arg functions not called internally",
      category: "calldata",
      lineStart,
      before: line.trim(),
      after: line.replace(/\bpublic\b/, "external").trim(),
      oldText: line,
      newText: line.replace(/\bpublic\b/, "external"),
      estL2Delta: 20,
      estL1Delta: null,
      confidence: 0.72,
      safety: "review",
      rationale: "external avoids public dispatch overhead when the function is never called internally.",
    }));
  },
};

const bitmapBoolRule: Rule = {
  id: "bitmap-bools",
  run(ctx) {
    return matchLines(ctx, /mapping\s*\([^=]+=>\s*bool\)\s+(?:public\s+|private\s+|internal\s+|external\s+)?\w+;/, (line, lineStart) => resultArgs({
      id: "bitmap-bools",
      title: "Bitmap-pack boolean flags",
      category: "storage",
      lineStart,
      before: line.trim(),
      after: "mapping(uint256 => uint256) bitmap; // pack 256 flags per slot",
      oldText: line,
      newText: `${line} // REVIEW: high-volume bool flags can be bitmap-packed`,
      estL2Delta: 20_000,
      estL1Delta: null,
      confidence: 0.62,
      safety: "review",
      rationale: "Bitmap packing can reduce many boolean SSTOREs from one slot per flag to one slot per 256 flags.",
    }));
  },
};

const zeroInitRule: Rule = {
  id: "remove-zero-init",
  run(ctx) {
    return matchLines(ctx, /\b(uint\w*|int\w*|bool|address)\s+\w+\s*=\s*(0|false|address\(0\))\s*;/, (line, lineStart) => resultArgs({
      id: "remove-zero-init",
      title: "Remove redundant zero initialization",
      category: "deployment",
      lineStart,
      before: line.trim(),
      after: line.replace(/\s*=\s*(0|false|address\(0\))/, "").trim(),
      oldText: line,
      newText: line.replace(/\s*=\s*(0|false|address\(0\))/, ""),
      estL2Delta: 3,
      estL1Delta: 4,
      confidence: 0.86,
      safety: "safe",
      rationale: "Solidity initializes variables to zero by default; explicit zero init adds bytecode/instructions.",
    }));
  },
};

const indexedEventRule: Rule = {
  id: "indexed-events-vs-storage",
  run(ctx) {
    return matchLines(ctx, /event\s+\w+\s*\([^)]*\baddress\s+\w+[^)]*\)/, (line, lineStart) => {
      if (/\bindexed\b/.test(line)) return null;
      return resultArgs({
        id: "indexed-events-vs-storage",
        title: "Index high-value event fields instead of extra lookup storage",
        category: "storage",
        lineStart,
        before: line.trim(),
        after: line.replace(/\baddress\s+(\w+)/, "address indexed $1").trim(),
        oldText: line,
        newText: line.replace(/\baddress\s+(\w+)/, "address indexed $1"),
        estL2Delta: null,
        estL1Delta: null,
        confidence: 0.6,
        safety: "review",
        rationale: "Indexed events can support off-chain lookup without adding storage writes, when query patterns permit it.",
      });
    });
  },
};

function resultArgs(args: AddArgs) {
  return args;
}

export const GAS_OPTIMIZATION_RULES: Rule[] = [
  storagePackingRule,
  calldataMemoryRule,
  calldataTypeRule,
  customErrorsRule,
  immutableConstantRule,
  cacheSloadRule,
  uncheckedLoopRule,
  loopHygieneRule,
  comparisonRule,
  externalPublicRule,
  bitmapBoolRule,
  zeroInitRule,
  indexedEventRule,
];

export function runGasOptimizationRules(ctx: GasRuleContext) {
  return unique(GAS_OPTIMIZATION_RULES.flatMap((rule) => rule.run(ctx)));
}
