import "dotenv/config";
import { readFile } from "node:fs/promises";
import { closeDb, db } from "../lib/db/client";
const sql = await readFile("lib/db/schema.sql", "utf8");
await db.query(sql);
const tables = await db.query<{ tablename: string }>("select tablename from pg_tables where schemaname = 'public' and tablename = any($1) order by tablename", [["scans", "reports", "findings", "proofs", "ai_cache", "scan_logs"]]);
console.log(tables.rows.map((row) => row.tablename).join("\n"));
await closeDb();
