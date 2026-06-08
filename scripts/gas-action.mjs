#!/usr/bin/env node
import { readFile, appendFile } from "node:fs/promises";
import path from "node:path";

const marker = "<!-- archon-gas-action -->";
const sourceFile = must("INPUT_SOURCE_FILE");
const archonUrl = (process.env.INPUT_ARCHON_URL || "https://archonaudit.xyz").replace(/\/$/, "");
const callsPerYear = intInput("INPUT_CALLS_PER_YEAR", 100000);
const mntUsd = numInput("INPUT_MNT_USD", 1);
const timeoutSeconds = intInput("INPUT_TIMEOUT_SECONDS", 180);
const shouldComment = boolInput("INPUT_COMMENT", true);
const failOnRegression = boolInput("INPUT_FAIL_ON_REGRESSION", true);
const maxRegressionL2Gas = intInput("INPUT_MAX_REGRESSION_L2_GAS", 0);
const token = process.env.INPUT_GITHUB_TOKEN || process.env.GITHUB_TOKEN || "";

function must(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}
function boolInput(name, fallback) {
  const value = process.env[name];
  if (value == null || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}
function intInput(name, fallback) {
  const value = Number.parseInt(process.env[name] || "", 10);
  return Number.isFinite(value) ? value : fallback;
}
function numInput(name, fallback) {
  const value = Number(process.env[name] || "");
  return Number.isFinite(value) && value > 0 ? value : fallback;
}
function n(value) {
  const out = Number(value ?? 0);
  return Number.isFinite(out) ? out : 0;
}
function money(value) {
  return `$${n(value).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}
function short(value) {
  return value ? `${value.slice(0, 10)}…${value.slice(-6)}` : "—";
}
function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

async function api(pathname, init) {
  const res = await fetch(`${archonUrl}${pathname}`, { ...init, headers: { accept: "application/json", ...(init?.headers || {}) } });
  const text = await res.text();
  let json;
  try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
  if (!res.ok) throw new Error(json.error || json.message || `Archon API ${pathname} returned HTTP ${res.status}`);
  return json;
}

async function submitReport(sourceCode) {
  return api("/api/gas/scan", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sourceKind: "paste", sourceCode, callsPerYear, mntUsd }),
  });
}

async function pollReport(id) {
  const deadline = Date.now() + timeoutSeconds * 1000;
  let delay = 2500;
  while (Date.now() < deadline) {
    const payload = await api(`/api/gas/reports/${id}`);
    const status = payload.report?.status;
    if (status === "done") return payload;
    if (status === "failed") throw new Error(payload.report?.error || "Archon gas report failed.");
    console.log(`Archon gas report ${id}: ${status || "unknown"} ${payload.report?.progress ?? 0}% (${payload.report?.currentStage || "queued"})`);
    await sleep(delay);
    delay = Math.min(delay + 1000, 8000);
  }
  throw new Error(`Timed out waiting ${timeoutSeconds}s for Archon gas report.`);
}

async function loadPrContext() {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  const repo = process.env.GITHUB_REPOSITORY;
  if (!eventPath || !repo) return null;
  try {
    const event = JSON.parse(await readFile(eventPath, "utf8"));
    const number = event.pull_request?.number || event.issue?.number;
    return number ? { repo, number } : null;
  } catch {
    return null;
  }
}

function commentBody({ report, optimizations, reportUrl }) {
  const totals = report.totals || {};
  const assumptions = totals.assumptions || report.assumptions || {};
  const top = [...optimizations].slice(0, 5);
  const rows = top.length
    ? top.map((opt) => `| ${escapePipe(opt.title)} | ${opt.measurementLabel || "estimate"} | ${opt.measuredL2Delta ?? opt.estL2Delta ?? "—"} | ${opt.measuredL1DeltaWei ?? opt.estL1DeltaWei ?? "—"} | ${money(opt.annualSavingsUsd)} |`).join("\n")
    : "| No optimizations found | — | — | — | — |";
  return `${marker}\n## Archon Mantle gas diff\n\nArchon scanned \`${sourceFile}\` and produced a real gas report.\n\n- **Report:** ${reportUrl}\n- **Contract:** ${report.contractName || "Contract"}\n- **L2 gas saved / call:** ${n(totals.l2GasSavedPerCall).toLocaleString()}\n- **L1 / DA wei saved / call:** ${totals.l1DaWeiSavedPerCall || "0"}\n- **Annualized savings:** ${money(totals.annualSavingsUsd)}\n- **Assumptions:** ${(assumptions.callsPerYear ?? callsPerYear).toLocaleString?.() ?? callsPerYear} calls/year · MNT/USD ${assumptions.mntUsd ?? mntUsd}\n- **Report hash:** \`${short(report.reportHash)}\`\n\n| Optimization | Basis | L2 Δ | L1/DA Δ wei | Annual savings |\n| --- | ---: | ---: | ---: | ---: |\n${rows}\n\n_Archon separates Mantle L2 execution gas from L1/data-availability cost. If this comment is noisy, tune \`calls-per-year\`, \`mnt-usd\`, and regression thresholds in the workflow._`;
}
function escapePipe(value) { return String(value || "").replace(/\|/g, "\\|"); }

async function upsertComment(body) {
  if (!shouldComment) return;
  const ctx = await loadPrContext();
  if (!ctx) { console.log("Not a pull_request context; skipping PR comment."); return; }
  if (!token) { console.log("No github-token provided; skipping PR comment."); return; }
  const headers = { authorization: `Bearer ${token}`, accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28", "content-type": "application/json" };
  const commentsUrl = `https://api.github.com/repos/${ctx.repo}/issues/${ctx.number}/comments`;
  const commentsRes = await fetch(commentsUrl, { headers });
  if (!commentsRes.ok) throw new Error(`GitHub comments lookup failed: HTTP ${commentsRes.status}`);
  const comments = await commentsRes.json();
  const mine = comments.find((comment) => comment.user?.type === "Bot" && typeof comment.body === "string" && comment.body.includes(marker));
  if (mine) {
    const res = await fetch(mine.url, { method: "PATCH", headers, body: JSON.stringify({ body }) });
    if (!res.ok) throw new Error(`GitHub comment update failed: HTTP ${res.status}`);
    console.log(`Updated Archon gas comment on PR #${ctx.number}.`);
  } else {
    const res = await fetch(commentsUrl, { method: "POST", headers, body: JSON.stringify({ body }) });
    if (!res.ok) throw new Error(`GitHub comment create failed: HTTP ${res.status}`);
    console.log(`Posted Archon gas comment on PR #${ctx.number}.`);
  }
}

async function setOutput(name, value) {
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `${name}=${String(value).replace(/\n/g, "%0A")}\n`);
}

const absolute = path.resolve(process.cwd(), sourceFile);
const sourceCode = await readFile(absolute, "utf8");
if (!/pragma\s+solidity/.test(sourceCode)) throw new Error(`${sourceFile} does not look like Solidity source.`);
console.log(`Submitting ${sourceFile} to ${archonUrl}/api/gas/scan`);
const queued = await submitReport(sourceCode);
const reportId = queued.gasReportId;
const reportUrl = `${archonUrl}/app/gas/${reportId}`;
console.log(`Archon gas report queued: ${reportUrl}`);
const { report, optimizations } = await pollReport(reportId);
const body = commentBody({ report, optimizations: optimizations || [], reportUrl });
await upsertComment(body);

const l2Saved = n(report.totals?.l2GasSavedPerCall);
const annualSavings = n(report.totals?.annualSavingsUsd);
await setOutput("gas-report-id", reportId);
await setOutput("report-url", reportUrl);
await setOutput("annual-savings-usd", annualSavings);
await setOutput("l2-gas-saved-per-call", l2Saved);

const regression = l2Saved < -Math.abs(maxRegressionL2Gas);
if (failOnRegression && regression) {
  throw new Error(`Archon detected an L2 gas regression of ${l2Saved} gas/call, beyond allowed ${maxRegressionL2Gas}.`);
}
console.log(`Archon gas action complete: ${reportUrl}`);
