// Archon for VS Code — a THIN client of the Archon public API (no local
// analysis, no re-implementation). Findings render as native diagnostics with
// hover detail; catalog-safe gas patches surface as Code Actions that edit the
// buffer locally (the user reviews and saves — nothing is committed or sent
// back); gas opportunities render as CodeLens at their lines. Network failures
// degrade to a status-bar state, never popups. Read-only: source goes to the
// API exactly like pasting into the Audit Studio.
const vscode = require("vscode");

// Mirror of lib/gas/patch.ts: never offer an annotation-only patch as a quick
// fix (applying it would change nothing but a comment).
const stripComments = (c) => c.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "").replace(/\s+/g, " ").trim();
const isAutoApplicable = (opt) => opt.safety === "safe" && opt.patch && opt.patch.oldText && opt.patch.newText && stripComments(opt.patch.oldText) !== stripComments(opt.patch.newText);

const SEV = { critical: 0, high: 0, medium: 1, low: 2, info: 3 }; // map to vscode.DiagnosticSeverity
let diagnostics, status, output;
const fileState = new Map(); // uri -> { findings, optimizations, gasReportId, reportId, version }
let lensEmitter;

const cfg = () => vscode.workspace.getConfiguration("archon");
const api = () => String(cfg().get("apiBase") || "https://archonaudit.xyz").replace(/\/$/, "");

function setStatus(text, tooltip) { status.text = text; status.tooltip = tooltip ?? ""; status.show(); }

async function post(path, body, timeoutMs = 30000) {
  const res = await fetch(`${api()}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
  return json;
}
async function get(path) {
  const res = await fetch(`${api()}${path}`, { signal: AbortSignal.timeout(20000) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
  return json;
}

async function poll(path, done, timeoutMs) {
  const start = Date.now();
  for (;;) {
    const body = await get(path);
    const result = done(body);
    if (result) return result;
    if (Date.now() - start > timeoutMs) throw new Error("Archon scan timed out");
    await new Promise((r) => setTimeout(r, 3000));
  }
}

function toRange(doc, lineStart, lineEnd) {
  const start = Math.max(0, (lineStart || 1) - 1);
  const end = Math.max(start, (lineEnd || lineStart || 1) - 1);
  if (start >= doc.lineCount) return new vscode.Range(doc.lineCount - 1, 0, doc.lineCount - 1, 1);
  return new vscode.Range(start, doc.lineAt(start).firstNonWhitespaceCharacterIndex, Math.min(end, doc.lineCount - 1), doc.lineAt(Math.min(end, doc.lineCount - 1)).text.length);
}

async function scanDocument(doc) {
  if (doc.languageId !== "solidity" && !doc.fileName.endsWith(".sol")) return;
  const name = doc.fileName.split(/[\\/]/).pop().replace(/\.sol$/, "");
  setStatus("$(sync~spin) Archon: scanning…", "Audit + gas via archonaudit.xyz");
  try {
    const source = doc.getText();
    const [scan, gas] = await Promise.all([
      post("/api/scans", { sourceKind: "paste", sourceCode: source, contractLabel: `${name} (vscode)`, scanDepth: "quick", protocols: ["mETH"] })
        .then((r) => poll(`/api/scans/${r.scanId}`, (b) => (["done", "failed"].includes(b.scan?.status) ? b : null), 240000)),
      cfg().get("gasLens")
        ? post("/api/gas/scan", { sourceKind: "paste", sourceCode: source, contractLabel: `${name} (vscode)` })
            .then((r) => poll(`/api/gas/reports/${r.gasReportId}`, (b) => (["done", "failed"].includes((b.report ?? b).status) ? b : null), 240000))
            .catch(() => null)
        : Promise.resolve(null),
    ]);
    if (scan.scan.status === "failed") throw new Error(scan.scan.error || "scan failed");

    const gasReport = gas?.report ?? null;
    const optimizations = (gas?.optimizations ?? []).filter((o) => o.patch && o.patch.oldText);
    fileState.set(doc.uri.toString(), { findings: scan.findings || [], optimizations, gasReportId: gasReport?.id, reportId: scan.report?.id, version: doc.version });

    const items = (scan.findings || []).map((f) => {
      const d = new vscode.Diagnostic(toRange(doc, f.lineStart, f.lineEnd), `${f.title}${f.summary ? ` — ${f.summary}` : ""}`, SEV[f.severity] ?? 3);
      d.source = `archon:${f.severity}`;
      d.code = scan.report?.id ? { value: f.severity, target: vscode.Uri.parse(`${api()}/r/${scan.report.id}`) } : f.severity;
      return d;
    });
    diagnostics.set(doc.uri, items);
    lensEmitter.fire();
    const sevCount = (scan.findings || []).filter((f) => f.severity === "critical" || f.severity === "high").length;
    setStatus(`$(shield) Archon: ${items.length} finding(s)${sevCount ? ` · ${sevCount} high+` : ""}${optimizations.length ? ` · ${optimizations.length} gas opps` : ""}`, scan.report?.id ? `Full report: ${api()}/r/${scan.report.id}` : "");
  } catch (error) {
    // Offline/API-down: quiet status-bar state, never a popup.
    setStatus("$(cloud-offline) Archon: unavailable", String(error.message || error));
    output.appendLine(`[archon] ${new Date().toISOString()} ${error.message || error}`);
  }
}

class ArchonCodeActions {
  provideCodeActions(doc, range) {
    const state = fileState.get(doc.uri.toString());
    if (!state) return [];
    const text = doc.getText();
    const actions = [];
    for (const opt of state.optimizations) {
      if (!isAutoApplicable(opt)) continue;
      const idx = text.indexOf(opt.patch.oldText);
      if (idx < 0 || text.indexOf(opt.patch.oldText, idx + 1) >= 0) continue; // must match exactly once
      const startPos = doc.positionAt(idx);
      const endPos = doc.positionAt(idx + opt.patch.oldText.length);
      const patchRange = new vscode.Range(startPos, endPos);
      if (!range || patchRange.intersection(range) || patchRange.contains(range.start)) {
        const action = new vscode.CodeAction(`Apply Archon patch: ${opt.title} (est. ${opt.est_l2_delta ?? opt.estL2Delta ?? "—"} gas/call)`, vscode.CodeActionKind.QuickFix);
        action.edit = new vscode.WorkspaceEdit();
        action.edit.replace(doc.uri, patchRange, opt.patch.newText);
        action.isPreferred = true;
        actions.push(action);
      }
    }
    return actions;
  }
}

class ArchonLens {
  constructor() { this.onDidChangeCodeLenses = lensEmitter.event; }
  provideCodeLenses(doc) {
    if (!cfg().get("gasLens")) return [];
    const state = fileState.get(doc.uri.toString());
    if (!state) return [];
    const lenses = [];
    if (state.gasReportId) {
      const total = state.optimizations.reduce((s, o) => s + (o.est_l2_delta ?? o.estL2Delta ?? 0), 0);
      lenses.push(new vscode.CodeLens(new vscode.Range(0, 0, 0, 0), { title: `Archon gas: ${state.optimizations.length} opportunities · ~${total.toLocaleString()} L2 gas/call savings (estimates)`, command: "vscode.open", arguments: [vscode.Uri.parse(`${api()}/app/gas/${state.gasReportId}`)] }));
    }
    for (const opt of state.optimizations) {
      const line = Math.max(0, (opt.line_start ?? opt.lineStart ?? 1) - 1);
      if (line < doc.lineCount) {
        lenses.push(new vscode.CodeLens(new vscode.Range(line, 0, line, 0), { title: `~${(opt.est_l2_delta ?? opt.estL2Delta ?? 0).toLocaleString()} gas/call: ${opt.title} (${opt.safety === "safe" ? "quick fix available" : "review"} · estimate)`, command: "editor.action.quickFix" }));
      }
    }
    return lenses;
  }
}

function activate(context) {
  diagnostics = vscode.languages.createDiagnosticCollection("archon");
  status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
  output = vscode.window.createOutputChannel("Archon");
  lensEmitter = new vscode.EventEmitter();

  let debounce;
  context.subscriptions.push(
    diagnostics, status, output,
    vscode.commands.registerCommand("archon.scanFile", () => { const ed = vscode.window.activeTextEditor; if (ed) scanDocument(ed.document); }),
    vscode.commands.registerCommand("archon.clear", () => { diagnostics.clear(); fileState.clear(); lensEmitter.fire(); status.hide(); }),
    vscode.workspace.onDidSaveTextDocument((doc) => {
      if (!cfg().get("scanOnSave") || !doc.fileName.endsWith(".sol")) return;
      clearTimeout(debounce);
      debounce = setTimeout(() => scanDocument(doc), 1500);
    }),
    vscode.languages.registerCodeActionsProvider({ pattern: "**/*.sol" }, new ArchonCodeActions(), { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] }),
    vscode.languages.registerCodeLensProvider({ pattern: "**/*.sol" }, new ArchonLens()),
  );
  setStatus("$(shield) Archon", "Run “Archon: Scan current file” on any .sol");
}

function deactivate() {}
module.exports = { activate, deactivate };
