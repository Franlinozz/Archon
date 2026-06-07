import { formatEther, type Hex } from "viem";
import { getMantlePublicClient } from "@/lib/chain/mantle";

export const DA_CALIBRATION_TXS = [
  "0x82d99588e5f1bff33d618743025d598445493032637de25844a67aa8e88088ef",
  "0xb9ce87de86b212b91eb64012bbdab91014373da1f6d960470b340e1991a1a7c5",
] as const;

export type CalldataByteProfile = {
  zeroBytes: number;
  nonZeroBytes: number;
  totalBytes: number;
  calldataGasEstimate: number;
};

export type ReceiptDaSample = CalldataByteProfile & {
  txHash: string;
  blockNumber: string;
  l1FeeWei: string;
  l1GasUsed: string | null;
  l1GasPrice: string | null;
  l1BaseFeeScalar: string | null;
  l1BlobBaseFee: string | null;
  l1BlobBaseFeeScalar: string | null;
  blobGasUsed: string | null;
  daFootprintGasScalar: string | null;
  operatorFeeConstant: string | null;
  operatorFeeScalar: string | null;
};

export type CalibratedDaModel = {
  mode: "calibrated-receipts";
  sampleCount: number;
  zeroByteFeeWei: string;
  nonZeroByteFeeWei: string;
  maxValidationErrorPct: number;
  meanValidationErrorPct: number;
  validation: Array<{
    txHash: string;
    actualL1FeeWei: string;
    predictedL1FeeWei: string;
    errorPct: number;
  }>;
  samples: ReceiptDaSample[];
};

type RpcTransaction = { input: Hex; blockNumber: Hex };
type RpcReceipt = Record<string, Hex | undefined> & { l1Fee?: Hex };

function toBigInt(value: Hex | undefined) {
  return value ? BigInt(value) : null;
}

function toDecimal(value: Hex | undefined) {
  return value ? BigInt(value).toString() : null;
}

export function calldataByteProfile(data: Hex): CalldataByteProfile {
  const hex = data.replace(/^0x/, "");
  let zeroBytes = 0;
  let nonZeroBytes = 0;
  for (let index = 0; index < hex.length; index += 2) {
    if (hex.slice(index, index + 2) === "00") zeroBytes += 1;
    else nonZeroBytes += 1;
  }
  return {
    zeroBytes,
    nonZeroBytes,
    totalBytes: Math.floor(hex.length / 2),
    calldataGasEstimate: zeroBytes * 4 + nonZeroBytes * 16,
  };
}

async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  const client = getMantlePublicClient();
  return client.request({ method, params } as never) as Promise<T>;
}

export async function getReceiptDaCost(txHash: string) {
  const receipt = await rpc<RpcReceipt>("eth_getTransactionReceipt", [txHash]);
  const l1Fee = toBigInt(receipt.l1Fee);
  if (l1Fee == null) throw new Error(`Mantle receipt ${txHash} does not include l1Fee.`);
  return {
    txHash,
    measuredL1FeeWei: l1Fee.toString(),
    measuredL1FeeMnt: formatEther(l1Fee),
    field: "l1Fee" as const,
  };
}

async function loadSample(txHash: string): Promise<ReceiptDaSample> {
  const [tx, receipt] = await Promise.all([
    rpc<RpcTransaction>("eth_getTransactionByHash", [txHash]),
    rpc<RpcReceipt>("eth_getTransactionReceipt", [txHash]),
  ]);
  const l1Fee = toBigInt(receipt.l1Fee);
  if (l1Fee == null) throw new Error(`Mantle receipt ${txHash} does not include l1Fee.`);
  return {
    txHash,
    blockNumber: BigInt(tx.blockNumber).toString(),
    l1FeeWei: l1Fee.toString(),
    ...calldataByteProfile(tx.input),
    l1GasUsed: toDecimal(receipt.l1GasUsed),
    l1GasPrice: toDecimal(receipt.l1GasPrice),
    l1BaseFeeScalar: toDecimal(receipt.l1BaseFeeScalar),
    l1BlobBaseFee: toDecimal(receipt.l1BlobBaseFee),
    l1BlobBaseFeeScalar: toDecimal(receipt.l1BlobBaseFeeScalar),
    blobGasUsed: toDecimal(receipt.blobGasUsed),
    daFootprintGasScalar: toDecimal(receipt.daFootprintGasScalar),
    operatorFeeConstant: toDecimal(receipt.operatorFeeConstant),
    operatorFeeScalar: toDecimal(receipt.operatorFeeScalar),
  };
}

function solveTwoByteRates(samples: ReceiptDaSample[]) {
  const a = samples[0];
  const b = samples[1];
  if (!a || !b) return null;
  const determinant = BigInt(a.zeroBytes * b.nonZeroBytes - b.zeroBytes * a.nonZeroBytes);
  if (determinant === 0n) return null;
  const aFee = BigInt(a.l1FeeWei);
  const bFee = BigInt(b.l1FeeWei);
  const zeroNumerator = aFee * BigInt(b.nonZeroBytes) - bFee * BigInt(a.nonZeroBytes);
  const nonZeroNumerator = BigInt(a.zeroBytes) * bFee - BigInt(b.zeroBytes) * aFee;
  if (zeroNumerator <= 0n || nonZeroNumerator <= 0n) return null;
  return {
    zeroByteFeeWei: zeroNumerator / determinant,
    nonZeroByteFeeWei: nonZeroNumerator / determinant,
  };
}

function averageByteRate(samples: ReceiptDaSample[]) {
  const totalFee = samples.reduce((sum, item) => sum + BigInt(item.l1FeeWei), 0n);
  const totalBytes = samples.reduce((sum, item) => sum + BigInt(Math.max(1, item.totalBytes)), 0n);
  const rate = totalFee / totalBytes;
  return { zeroByteFeeWei: rate, nonZeroByteFeeWei: rate };
}

export function estimateDaFeeWei(profile: CalldataByteProfile, model: Pick<CalibratedDaModel, "zeroByteFeeWei" | "nonZeroByteFeeWei">) {
  return BigInt(model.zeroByteFeeWei) * BigInt(profile.zeroBytes) + BigInt(model.nonZeroByteFeeWei) * BigInt(profile.nonZeroBytes);
}

function errorPct(predicted: bigint, actual: bigint) {
  if (actual === 0n) return predicted === 0n ? 0 : 100;
  const diff = predicted > actual ? predicted - actual : actual - predicted;
  return Number((diff * 1_000_000n) / actual) / 10_000;
}

function calibrationTxHashes() {
  return (process.env.ARCHON_DA_CALIBRATION_TXS?.split(",").map((item) => item.trim()).filter(Boolean) ?? DA_CALIBRATION_TXS) as string[];
}

export async function calibrateMantleDaModel(): Promise<CalibratedDaModel> {
  const samples = await Promise.all(calibrationTxHashes().map(loadSample));
  if (samples.length < 2) throw new Error("Need at least two Mantle receipt samples to calibrate DA byte pricing.");
  const rates = solveTwoByteRates(samples) ?? averageByteRate(samples);
  const validation = samples.map((sample) => {
    const predicted = estimateDaFeeWei(sample, {
      zeroByteFeeWei: rates.zeroByteFeeWei.toString(),
      nonZeroByteFeeWei: rates.nonZeroByteFeeWei.toString(),
    });
    const actual = BigInt(sample.l1FeeWei);
    return {
      txHash: sample.txHash,
      actualL1FeeWei: actual.toString(),
      predictedL1FeeWei: predicted.toString(),
      errorPct: errorPct(predicted, actual),
    };
  });
  const errors = validation.map((item) => item.errorPct);
  return {
    mode: "calibrated-receipts",
    sampleCount: samples.length,
    zeroByteFeeWei: rates.zeroByteFeeWei.toString(),
    nonZeroByteFeeWei: rates.nonZeroByteFeeWei.toString(),
    maxValidationErrorPct: Math.max(...errors),
    meanValidationErrorPct: errors.reduce((sum, item) => sum + item, 0) / errors.length,
    validation,
    samples,
  };
}
