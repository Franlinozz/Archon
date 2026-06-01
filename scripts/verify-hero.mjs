// Session 9.4 — pre-deploy hero verification with headless Chromium.
// Requires Playwright + a running PRODUCTION build (next build && next start):
//   BASE=http://127.0.0.1:3100 node scripts/verify-hero.mjs
// In this repo's ops the runnable copy lives at /root/.pwverify/verify-hero.cjs
// (shared chromium install) — see ADR 0010/DEVIATIONS. Logic is identical.
import { chromium } from "playwright";
import fs from "node:fs";

const BASE = process.env.BASE || "http://127.0.0.1:3100";
const OUT = process.env.OUT || "verify-screenshots";
const results = [];
const ok = (n, c, extra = "") => { results.push([n, !!c]); if (!c && extra) console.log("   ↳", extra); };

const markTop = (page) => page.evaluate(() => {
  const i = Array.from(document.querySelectorAll("img")).find((x) => /mark-(light|dark)\.png/.test(x.currentSrc || x.src) && x.offsetParent !== null);
  return i ? i.getBoundingClientRect().top : null;
});

async function setTheme(page, theme) {
  await page.evaluate((t) => localStorage.setItem("archon-theme", t), theme);
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(500);
}

const browser = await chromium.launch();
fs.mkdirSync(OUT, { recursive: true });

const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const badAssets = [], consoleErrors = [], pageErrors = [];
page.on("response", (r) => {
  const rt = r.request().resourceType();
  if ((rt === "image" || rt === "font" || rt === "stylesheet") && r.url().startsWith(BASE) && r.status() >= 400) badAssets.push(`${r.status()} ${r.url()}`);
});
page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
page.on("pageerror", (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
await page.waitForTimeout(600);
ok("no asset (img/css/font) >=400", badAssets.length === 0, badAssets.join(" | "));
ok("no uncaught page errors", pageErrors.length === 0, pageErrors.join(" | "));
ok("no asset-related console errors", consoleErrors.filter((t) => /404|failed to load|mark-|hero-|logo-|favicon/i.test(t)).length === 0);

const markOk = await page.evaluate(() => Array.from(document.querySelectorAll("img")).some((i) => /mark-(light|dark)\.png/.test(i.currentSrc || i.src) && i.offsetParent !== null && i.naturalWidth > 0));
ok("hero mark <img> naturalWidth>0", markOk);

for (const f of ["/favicon-light-32.png", "/favicon-dark-32.png", "/icon-64.png", "/apple-touch.png"]) {
  const res = await page.request.get(`${BASE}${f}`);
  ok(`favicon ${f} -> 200`, res.status() === 200);
}

const samples = [];
for (let k = 0; k < 4; k++) { samples.push(await markTop(page)); await page.waitForTimeout(500); }
const valid = samples.filter((s) => s != null);
ok("hero mark animates (idle float)", valid.length >= 2 && Math.max(...valid) - Math.min(...valid) > 0.5, JSON.stringify(samples));

for (const t of ["marble", "obsidian"]) { await setTheme(page, t); await page.screenshot({ path: `${OUT}/hero-${t}-1440.png` }); }
await ctx.close();

const mctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const mpage = await mctx.newPage();
await mpage.goto(`${BASE}/`, { waitUntil: "networkidle" });
for (const t of ["marble", "obsidian"]) { await setTheme(mpage, t); await mpage.screenshot({ path: `${OUT}/hero-${t}-390.png` }); }
await mctx.close();

const rctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
const rpage = await rctx.newPage();
await rpage.goto(`${BASE}/`, { waitUntil: "networkidle" });
await rpage.waitForTimeout(500);
const r1 = await markTop(rpage); await rpage.waitForTimeout(1200); const r2 = await markTop(rpage);
ok("reduced-motion: mark renders", r1 != null);
ok("reduced-motion: mark static", r1 != null && r2 != null && Math.abs(r1 - r2) < 0.5);
await rctx.close();

await browser.close();
let pass = 0;
for (const [n, c] of results) { console.log(`${c ? "PASS" : "FAIL"}  ${n}`); if (c) pass++; }
console.log(`\n${pass}/${results.length} checks passed`);
process.exit(pass === results.length ? 0 : 1);
