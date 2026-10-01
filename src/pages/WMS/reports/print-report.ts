// Printable report: a plain HTML table in a hidden iframe, handed to the
// browser's print dialog, where "Save as PDF" produces the PDF. Keeps the
// app free of a PDF library and prints with real, selectable text.

export interface PrintColumn {
  header: string;
  align?: "left" | "right";
}

export interface PrintableReport {
  /** Also the suggested PDF file name. */
  title: string;
  /** Lines under the title: period, filters. */
  subtitle: string[];
  columns: PrintColumn[];
  rows: string[][];
  /** Optional totals row, one cell per column. */
  totals?: string[];
}

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

function buildHtml(report: PrintableReport): string {
  const align = (i: number) => (report.columns[i]?.align === "right" ? ' class="num"' : "");
  const head = report.columns.map((c, i) => `<th${align(i)}>${escapeHtml(c.header)}</th>`).join("");
  const body = report.rows
    .map((row) => `<tr>${row.map((cell, i) => `<td${align(i)}>${escapeHtml(cell)}</td>`).join("")}</tr>`)
    .join("");
  const foot = report.totals
    ? `<tfoot><tr>${report.totals.map((cell, i) => `<td${align(i)}>${escapeHtml(cell)}</td>`).join("")}</tr></tfoot>`
    : "";
  const printedAt = new Date().toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" });

  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${escapeHtml(report.title)}</title>
<style>
  @page { size: A4 landscape; margin: 12mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif; color: #111; font-size: 10.5px; margin: 0; }
  h1 { font-size: 17px; margin: 0 0 4px; }
  .sub { color: #555; margin: 0 0 2px; }
  .meta { color: #888; margin: 6px 0 12px; font-size: 9.5px; }
  table { width: 100%; border-collapse: collapse; }
  thead { display: table-header-group; }
  tfoot { display: table-row-group; }
  tr { page-break-inside: avoid; }
  th, td { padding: 4px 6px; border-bottom: 1px solid #ddd; text-align: left; vertical-align: top; }
  th { background: #f3f3f3; font-weight: 600; border-bottom: 1px solid #999; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  tfoot td { font-weight: 700; border-top: 1px solid #999; border-bottom: none; }
  .empty { padding: 24px; text-align: center; color: #888; }
</style></head>
<body>
  <h1>${escapeHtml(report.title)}</h1>
  ${report.subtitle.map((line) => `<p class="sub">${escapeHtml(line)}</p>`).join("")}
  <p class="meta">Printed ${escapeHtml(printedAt)} · ${report.rows.length} ${report.rows.length === 1 ? "row" : "rows"}</p>
  ${report.rows.length
    ? `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody>${foot}</table>`
    : '<div class="empty">No data for these filters.</div>'}
</body></html>`;
}

/** Opens the print dialog for `report`. Choose "Save as PDF" to export. */
export function printReport(report: PrintableReport): void {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  Object.assign(frame.style, { position: "fixed", right: "0", bottom: "0", width: "0", height: "0", border: "0" });
  document.body.appendChild(frame);

  const win = frame.contentWindow;
  const doc = win?.document;
  if (!win || !doc) {
    frame.remove();
    return;
  }
  doc.open();
  doc.write(buildHtml(report));
  doc.close();

  const cleanup = () => setTimeout(() => frame.remove(), 500);
  win.addEventListener("afterprint", cleanup, { once: true });
  // Let the iframe lay out before printing; some browsers print blank otherwise.
  setTimeout(() => {
    win.focus();
    win.print();
    // Browsers without afterprint in iframes still need the frame removed.
    setTimeout(cleanup, 60_000);
  }, 50);
}
