// Print-ready HTML reports rendered in a temporary iframe.
export interface PrintColumn { top?: string; label: string; align?: "left" | "right"; }
export interface PrintRow { cells: string[]; }
export interface PrintSection {
  title: string;
  subtitle?: string;
  layout?: "grid" | "list";
  columns: PrintColumn[];
  rows: PrintRow[];
  totals?: string[];
}
export interface PrintableReport {
  title: string;
  subtitle: string[];
  sections: PrintSection[];
  pagePerSection?: boolean;
  language?: "en" | "zh";
}

const escapeHtml = (value: string) => value
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function sectionHtml(section: PrintSection): string {
  const grid = (section.layout ?? "grid") === "grid";
  const last = section.columns.length - 1;
  const cls = (index: number) => [
    grid ? (index === 0 ? "label" : index === last ? "total" : "mid") : "",
    section.columns[index]?.align === "right" ? "num" : "",
  ].join(" ").trim();
  const withSpacer = (cells: string[], spacer: string) =>
    grid ? [...cells.slice(0, -1), spacer, ...cells.slice(-1)] : cells;
  const label = (text: string) => escapeHtml(text).replace(/\n/g, "<br>");
  const head = withSpacer(section.columns.map((column, index) =>
    `<th class="${cls(index)}">${column.top ? `<span class="top">${escapeHtml(column.top)}</span>` : ""}${label(column.label)}</th>`), '<th class="spacer"></th>').join("");
  const body = section.rows.map((row) => `<tr>${withSpacer(row.cells.map((cell, index) =>
    `<td class="${cls(index)}">${escapeHtml(cell)}</td>`), '<td class="spacer"></td>').join("")}</tr>`).join("");
  const foot = section.totals ? `<tfoot><tr>${withSpacer(section.totals.map((cell, index) =>
    `<td class="${cls(index)}">${escapeHtml(cell)}</td>`), '<td class="spacer"></td>').join("")}</tr></tfoot>` : "";
  return `<section>
    <div class="section-heading"><div><h2>${escapeHtml(section.title)}</h2>${section.subtitle ? `<p class="kind">${escapeHtml(section.subtitle)}</p>` : ""}</div>
    <span class="row-count">${section.rows.length} ${section.rows.length === 1 ? "row" : "rows"}</span></div>
    <table class="${grid ? "grid" : "list"}"><thead><tr>${head}</tr></thead><tbody>${body}</tbody>${foot}</table>
  </section>`;
}

function filterHtml(line: string): string {
  const separator = line.indexOf(":");
  if (separator < 0) return `<div class="filter-item"><span class="filter-value">${escapeHtml(line)}</span></div>`;
  return `<div class="filter-item"><span class="filter-label">${escapeHtml(line.slice(0, separator))}</span><span class="filter-value">${escapeHtml(line.slice(separator + 1).trim())}</span></div>`;
}

function buildHtml(report: PrintableReport): string {
  const printedAt = new Date().toLocaleString(report.language === "zh" ? "zh-CN" : "en-PH", { dateStyle: "medium", timeStyle: "short" });
  const copy = report.language === "zh"
    ? { system: "库存管理系统", eyebrow: "仓库报告", generated: "生成时间", internal: "内部运营报告", empty: "没有符合筛选条件的数据。", section: "部分" }
    : { system: "Inventory Management System", eyebrow: "Warehouse report", generated: "Generated", internal: "Internal operational report", empty: "No data for these filters.", section: "section" };
  const sectionCount = `${report.sections.length} ${copy.section}${report.language !== "zh" && report.sections.length !== 1 ? "s" : ""}`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(report.title)}</title>
<style>${report.pagePerSection ? "section + section { break-before: page; page-break-before: always; }" : ""}</style>
<style>
@page { size: A4 portrait; margin: 10mm 10mm 15mm; }
* { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { color:#171717; font-family:Arial,"Segoe UI",sans-serif; font-size:10px; margin:0; padding-bottom:8mm; }
.document-header { margin-bottom:20px; }
.brand-row,.title-row,.section-heading,footer { align-items:center; display:flex; justify-content:space-between; }
.brand { color:#111; font-size:15px; font-weight:700; letter-spacing:-.2px; }
.system { color:#666; font-size:9px; margin-top:2px; }
.document-meta { text-align:right; }
.document-meta span { color:#777; display:block; font-size:8px; letter-spacing:.08em; text-transform:uppercase; }
.document-meta strong { color:#222; display:block; font-size:10px; margin-top:2px; }
.accent { background:#222; height:2px; margin:9px 0 13px; }
.eyebrow { color:#555; font-size:8px; font-weight:700; letter-spacing:.13em; margin:0 0 3px; text-transform:uppercase; }
h1 { color:#111; font-size:21px; letter-spacing:-.35px; line-height:1.15; margin:0; }
.section-count { color:#555; font-size:9px; font-weight:600; }
.filter-summary { border-bottom:1px solid #ccc; border-top:1px solid #ccc; display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); margin-top:12px; padding:7px 0; }
.filter-item { min-width:0; padding:4px 10px 4px 0; }
.filter-label { color:#777; display:block; font-size:7.5px; font-weight:700; letter-spacing:.06em; margin-bottom:2px; text-transform:uppercase; }
.filter-value { color:#222; display:block; font-size:9.5px; font-weight:600; overflow-wrap:anywhere; }
section { margin-bottom:20px; }
.section-heading { border-bottom:1px solid #bbb; margin-bottom:7px; padding-bottom:7px; }
h2 { color:#111; font-size:14px; line-height:1.2; margin:0; }
.kind { color:#666; margin:2px 0 0; }
.row-count { color:#666; font-size:8.5px; white-space:nowrap; }
table { border-collapse:collapse; width:100%; }
thead { display:table-header-group; }
th { border-bottom:1px solid #777; color:#111; font-size:10px; font-weight:700; padding:7px 8px; text-align:center; vertical-align:bottom; }
.list th { font-size:7.5px; padding:5px 4px; text-align:left; }
.list td { font-size:7.5px; padding:5px 4px; text-align:left; overflow-wrap:anywhere; }
.list .num { text-align:right; white-space:nowrap; }
tr { break-inside:avoid; page-break-inside:avoid; }
th.label { font-size:11px; text-align:left; } th .top { color:#666; display:block; font-size:8px; font-weight:500; }
td { border-bottom:1px solid #ddd; font-variant-numeric:tabular-nums; padding:6px 8px; text-align:center; }
.label { width:150px; } .mid { width:92px; } .total { width:90px; } td.label { font-weight:700; text-align:left; }
.total.num { text-align:right; } td.total { font-weight:700; }
tfoot td { border-bottom:0; border-top:2px solid #555; color:#111; font-weight:700; padding:7px 8px; }
.empty { border:1px solid #ccc; color:#666; padding:32px; text-align:center; }
footer { border-top:1px solid #ccc; bottom:0; color:#666; font-size:8px; left:0; padding-top:4px; position:fixed; right:0; }
</style></head><body>
<header class="document-header">
  <div class="brand-row"><div><div class="brand">Wensor Trading IMS</div><div class="system">${copy.system}</div></div><div class="document-meta"><span>${copy.generated}</span><strong>${escapeHtml(printedAt)}</strong></div></div>
  <div class="accent"></div>
  <div class="title-row"><div><p class="eyebrow">${copy.eyebrow}</p><h1>${escapeHtml(report.title)}</h1></div><span class="section-count">${sectionCount}</span></div>
  ${report.subtitle.length ? `<div class="filter-summary">${report.subtitle.map(filterHtml).join("")}</div>` : ""}
</header>
${report.sections.length ? report.sections.map(sectionHtml).join("") : `<div class="empty">${copy.empty}</div>`}
<footer><span>Wensor Trading IMS · ${copy.internal}</span><span>${escapeHtml(report.title)}</span></footer>
</body></html>`;
}

/** Opens the print dialog. Choose "Save as PDF" to export. */
export function printReport(report: PrintableReport): void {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  Object.assign(frame.style, { position:"fixed", right:"0", bottom:"0", width:"0", height:"0", border:"0" });
  document.body.appendChild(frame);
  const win = frame.contentWindow;
  const doc = win?.document;
  if (!win || !doc) { frame.remove(); return; }
  doc.open(); doc.write(buildHtml(report)); doc.close();
  const cleanup = () => setTimeout(() => frame.remove(), 500);
  win.addEventListener("afterprint", cleanup, { once:true });
  setTimeout(() => { win.focus(); win.print(); setTimeout(cleanup, 60_000); }, 50);
}
