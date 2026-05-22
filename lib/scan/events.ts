import { db } from "@/lib/db/client";
import { redis } from "@/lib/queue/redis";
import type { ScanEvent } from "./types";

export function scanChannel(scanId: string) {
  return `scan:${scanId}:events`;
}

export async function publishScanEvent(event: ScanEvent) {
  await redis.publish(scanChannel(event.scanId), JSON.stringify(event));
}

export async function appendScanLog(scanId: string, level: "INFO" | "WARN" | "ERROR", message: string) {
  const at = new Date().toISOString();
  await db.query("insert into scan_logs (scan_id, level, message, created_at) values ($1, $2, $3, $4)", [scanId, level, message, at]);
  await publishScanEvent({ type: "log", scanId, level, message, at });
}
