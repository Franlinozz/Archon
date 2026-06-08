import fs from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";

const root = process.cwd();
const sourcePath = path.join(root, "content/docs/resources/whitepaper.mdx");
const outPath = path.join(root, "public/docs/archon-whitepaper.pdf");
const raw = fs.readFileSync(sourcePath, "utf8");

function stripFrontmatter(value) {
  return value.replace(/^---[\s\S]*?---\s*/, "");
}

function mdxToBlocks(value) {
  const withoutJsx = stripFrontmatter(value)
    .replace(/<div[\s\S]*?<\/div>/g, "")
    .replace(/<img[^>]*alt=\"([^\"]+)\"[^>]*>/g, "\n[Architecture diagram: $1]\n")
    .replace(/<[^>]+>/g, "")
    .replace(/```(?:text|bash|ts|json)?\n([\s\S]*?)```/g, (_, code) => `\n${code.trim()}\n`)
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1");

  const lines = withoutJsx.split("\n");
  const blocks = [];
  let paragraph = [];
  const flush = () => {
    if (!paragraph.length) return;
    blocks.push({ type: "p", text: paragraph.join(" ").replace(/\s+/g, " ").trim() });
    paragraph = [];
  };
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) { flush(); continue; }
    if (trimmed.startsWith("# ")) { flush(); blocks.push({ type: "title", text: trimmed.slice(2) }); continue; }
    if (trimmed.startsWith("## ")) { flush(); blocks.push({ type: "h2", text: trimmed.slice(3) }); continue; }
    if (trimmed.startsWith("### ")) { flush(); blocks.push({ type: "h3", text: trimmed.slice(4) }); continue; }
    if (trimmed.startsWith("- ")) { flush(); blocks.push({ type: "li", text: trimmed.slice(2) }); continue; }
    if (/^\d+\.\s/.test(trimmed)) { flush(); blocks.push({ type: "li", text: trimmed.replace(/^\d+\.\s/, "") }); continue; }
    paragraph.push(trimmed);
  }
  flush();
  return blocks.filter((block) => block.text && !block.text.includes("Download PDF"));
}

const blocks = mdxToBlocks(raw);
fs.mkdirSync(path.dirname(outPath), { recursive: true });

const doc = new PDFDocument({ size: "A4", margin: 56, info: { Title: "Archon Whitepaper", Author: "Archon", Subject: "Verifiable DevTools for Mantle", Keywords: "Archon, Mantle, smart contract audit, gas optimization, ERC-8004" } });
doc.pipe(fs.createWriteStream(outPath));

const pageW = doc.page.width;
const pageH = doc.page.height;
const green = "#19C37D";
const ink = "#121714";
const muted = "#58635c";

function footer() {
  const y = pageH - 36;
  doc.save();
  doc.strokeColor("#dfe6e1").lineWidth(0.5).moveTo(56, y - 12).lineTo(pageW - 56, y - 12).stroke();
  doc.font("Helvetica").fontSize(8).fillColor(muted).text("Archon Whitepaper · Verifiable DevTools for Mantle", 56, y, { width: 320 });
  doc.text(String(doc.page.number), pageW - 80, y, { width: 24, align: "right" });
  doc.restore();
}

// Cover
doc.rect(0, 0, pageW, pageH).fill("#f7faf7");
doc.circle(pageW - 92, 96, 42).fill(green);
doc.circle(pageW - 92, 96, 20).fill("#f7faf7");
doc.font("Helvetica-Bold").fontSize(11).fillColor(green).text("ARCHON", 56, 84, { characterSpacing: 2 });
doc.font("Helvetica-Bold").fontSize(42).fillColor(ink).text("Verifiable DevTools\nfor Mantle", 56, 148, { width: 430, lineGap: 5 });
doc.font("Helvetica").fontSize(15).fillColor(muted).text("A technical whitepaper for Archon's audit engine, Mantle gas optimization system, ERC-8004 identity model, and on-chain proof architecture.", 56, 286, { width: 430, lineGap: 6 });
doc.roundedRect(56, 405, 430, 86, 14).fillAndStroke("#ffffff", "#dfe6e1");
doc.font("Helvetica-Bold").fontSize(12).fillColor(ink).text("V2.8 public whitepaper", 78, 428);
doc.font("Helvetica").fontSize(10).fillColor(muted).text("Built for teams that need audit artifacts, gas reports, CI comments, leaderboard records, and proof metadata that can be traced beyond a static PDF.", 78, 449, { width: 380, lineGap: 4 });
doc.font("Helvetica").fontSize(9).fillColor(muted).text(`Generated ${new Date().toISOString().slice(0, 10)} · archonaudit.xyz`, 56, pageH - 72);
doc.addPage();

let firstContentPage = true;
for (const block of blocks) {
  if (!firstContentPage && doc.y > pageH - 110) { footer(); doc.addPage(); }
  firstContentPage = false;
  if (block.type === "title") {
    doc.font("Helvetica-Bold").fontSize(26).fillColor(ink).text(block.text, { lineGap: 4 });
    doc.moveDown(0.7);
  } else if (block.type === "h2") {
    if (doc.y > pageH - 150) { footer(); doc.addPage(); }
    doc.moveDown(0.7);
    doc.font("Helvetica-Bold").fontSize(17).fillColor(ink).text(block.text, { lineGap: 3 });
    doc.moveDown(0.25);
  } else if (block.type === "h3") {
    doc.moveDown(0.45);
    doc.font("Helvetica-Bold").fontSize(12.5).fillColor(ink).text(block.text, { lineGap: 2 });
    doc.moveDown(0.15);
  } else if (block.type === "li") {
    doc.font("Helvetica").fontSize(9.4).fillColor(ink).text(`• ${block.text}`, { indent: 10, width: pageW - 122, lineGap: 3 });
    doc.moveDown(0.2);
  } else {
    doc.font("Helvetica").fontSize(9.6).fillColor(ink).text(block.text, { width: pageW - 112, align: "justify", lineGap: 3 });
    doc.moveDown(0.45);
  }
}
footer();
doc.end();
console.log(`wrote ${path.relative(root, outPath)}`);
