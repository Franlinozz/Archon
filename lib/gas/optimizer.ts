import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { formatEther, type Hex } from "viem";
import { getMantlePublicClient } from "@/lib/chain/mantle";
import { calldataByteProfile, calibrateMantleDaModel, estimateDaFeeWei, type CalibratedDaModel } from "@/lib/gas/da-pricing";
import type { GasMeasurementProfile } from "@/lib/gas/measurement";
import { runGasOptimizationRules, type GasOptimizationRuleResult } from "@/lib/gas/rules";
import type { ScanFinding, Severity } from "@/lib/scan/types";


type DetectorInput = {
  source: string;
  sourceFile: string;
  workdir: string;
  contractName: string;
};

export type GasOptimizerProfile = {
  sourceHash: string;
  daPricing: {
    source: "receipt-calibrated";
    groundTruthField: "l1Fee";
    model: CalibratedDaModel | null;
  };
  pricing: {
    l2GasPriceWei: string | null;
    creationBytecodeBytes: number;
    mode: "deterministic-calldata-estimate" | "calibrated-receipts";
    calldataZeroBytes: number;
    calldataNonZeroBytes: number;
    calldataGasEstimate: number;
    deployDataFeeWei: string | null;
    deployDataFeeMnt: string | null;
    pricedAt: string;
    unavailableReason?: string;
    calibrationErrorPct?: number;
  };
  opportunities: Array<GasOptimizationRuleResult & {
    severity: Severity;
    estimatedGasSaved: number | null;
    estimatedDataBytesSaved: number | null;
    annualizedBasis: string;
  }>;
  measurement?: GasMeasurementProfile | null;
};

function snippet(source: string, lineStart: number | null) {
  if (!lineStart) return null;
  const lines = source.split("\n");
  const start = Math.max(1, lineStart - 2);
  const end = Math.min(lines.length, lineStart + 2);
  return lines.slice(start - 1, end).map((line, index) => `${start + index}: ${line}`).join("\n");
}

async function compiledCreationBytecode(workdir: string, contractName: string) {
  const buildDir = path.join(workdir, "build");
  const files = await readdir(buildDir).catch(() => []);
  const exact = files.find((file) => file.endsWith(`${contractName}.bin`)) ?? files.find((file) => file.endsWith(".bin"));
  if (!exact) return "0x" as Hex;
  const raw = (await readFile(path.join(buildDir, exact), "utf8")).trim();
  return raw ? (`0x${raw.replace(/^0x/, "")}` as Hex) : ("0x" as Hex);
}

async function priceCreationData(workdir: string, contractName: string): Promise<{ pricing: GasOptimizerProfile["pricing"]; model: CalibratedDaModel | null }> {
  const bytecode = await compiledCreationBytecode(workdir, contractName);
  const byteLength = Math.max(0, (bytecode.length - 2) / 2);
  const profile = calldataByteProfile(bytecode);
  const pricedAt = new Date().toISOString();
  const base = {
    mode: "deterministic-calldata-estimate" as const,
    l2GasPriceWei: null as string | null,
    creationBytecodeBytes: byteLength,
    calldataZeroBytes: profile.zeroBytes,
    calldataNonZeroBytes: profile.nonZeroBytes,
    calldataGasEstimate: profile.calldataGasEstimate,
    deployDataFeeWei: null as string | null,
    deployDataFeeMnt: null as string | null,
    pricedAt,
  };

  try {
    const [model, l2GasPriceWei] = await Promise.all([calibrateMantleDaModel(), getMantlePublicClient().getGasPrice()]);
    if (model.maxValidationErrorPct >= 10) {
      return {
        model,
        pricing: {
          ...base,
          l2GasPriceWei: l2GasPriceWei.toString(),
          unavailableReason: `Receipt-calibrated DA model validation error ${model.maxValidationErrorPct.toFixed(4)}% exceeds 10% tolerance.`,
          calibrationErrorPct: model.maxValidationErrorPct,
        },
      };
    }
    const deployDataFeeWei = estimateDaFeeWei(profile, model);
    return {
      model,
      pricing: {
        ...base,
        mode: "calibrated-receipts" as const,
        l2GasPriceWei: l2GasPriceWei.toString(),
        deployDataFeeWei: deployDataFeeWei.toString(),
        deployDataFeeMnt: formatEther(deployDataFeeWei),
        calibrationErrorPct: model.maxValidationErrorPct,
      },
    };
  } catch (error) {
    return {
      model: null,
      pricing: {
        ...base,
        unavailableReason: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

function severityFor(result: GasOptimizationRuleResult): Severity {
  if (result.category === "storage" && (result.estL2Delta ?? 0) >= 20_000) return "medium";
  if (result.category === "calldata") return "low";
  return "info";
}

export async function analyzeGasOptimizations(input: DetectorInput): Promise<{ profile: GasOptimizerProfile; findings: ScanFinding[] }> {
  const source = input.source;
  const ruleResults = runGasOptimizationRules({ source, sourceFile: input.sourceFile });
  const opportunities: GasOptimizerProfile["opportunities"] = ruleResults.map((item) => ({
    ...item,
    severity: severityFor(item),
    estimatedGasSaved: item.estL2Delta,
    estimatedDataBytesSaved: item.estL1Delta,
    annualizedBasis: item.category === "calldata"
      ? "Receipt-calibrated DA estimate for calldata/data bytes; exact deltas require V2.1.2 harness measurement."
      : "Static deterministic estimate. Exact runtime deltas require queued Foundry snapshots with representative inputs.",
  }));
  const findings: ScanFinding[] = opportunities.map((item) => ({
    severity: item.severity,
    category: `mantle-gas-optimizer/${item.category}/${item.id}`,
    title: item.title,
    file: item.file,
    lineStart: item.lineStart,
    lineEnd: item.lineStart,
    codeSnippet: snippet(source, item.lineStart),
    summary: item.rationale,
    whyMantle: item.category === "calldata" ? "Mantle receipts show DA/L1 cost is exposed through l1Fee, so calldata byte reduction is a first-class cost lever." : "Mantle execution is inexpensive but high-frequency contracts still compound L2 gas costs.",
    recommendedFix: `Before: ${item.before}\nAfter: ${item.after}`,
    confidence: item.confidence,
    gasImpact: `L2 delta: ${item.estL2Delta ?? "n/a"}; L1/DA delta: ${item.estL1Delta ?? "n/a"}; safety: ${item.safety}`,
    source: "rule",
    dedupeKey: `gas:${item.id}:${item.where}:${createHash("sha256").update(item.before).digest("hex").slice(0, 12)}`,
  }));

  const { pricing, model } = await priceCreationData(input.workdir, input.contractName);
  const profile: GasOptimizerProfile = {
    sourceHash: `0x${createHash("sha256").update(source).digest("hex")}`,
    daPricing: {
      source: "receipt-calibrated",
      groundTruthField: "l1Fee",
      model,
    },
    pricing,
    opportunities,
  };

  return { profile, findings };
}
