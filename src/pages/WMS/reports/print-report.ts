// Printable report: plain HTML tables in a hidden iframe, handed to the
// browser's print dialog, where "Save as PDF" produces the PDF. Keeps the
// app free of a PDF library and prints with real, selectable text.

export interface PrintColumn {
  /** Optional small line above the header, e.g. the weekday. */
  top?: string;
  /** "\n" breaks the header onto a second line. */
  label: string;
  align?: "left" | "right";
}

export interface PrintRow {
  cells: string[];
  /** Colors the first cell, the row label. */
  color?: string;
}

/** One titled table. Every section after the first starts a new page. */
export interface PrintSection {
  title: string;
  subtitle?: string;
  columns: PrintColumn[];
  rows: PrintRow[];
  /** Optional totals row, one cell per column. */
  totals?: string[];
}

export interface PrintableReport {
  /** Also the suggested PDF file name. */
  title: string;
  /** Lines under the title: period, filters. */
  subtitle: string[];
  sections: PrintSection[];
}

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/**
 * The first column is the row label and the last the row total; the ones
 * between are fixed-width and packed left, with an empty spacer taking the
 * rest of the width so the total sits at the right edge.
 */
function sectionHtml(section: PrintSection): string {
  const last = section.columns.length - 1;
  const cls = (i: number) =>
    [i === 0 ? "label" : i === last ? "total" : "mid", section.columns[i]?.align === "right" ? "num" : ""].join(" ");
  // Spacer before the total column, in every row.
  const withSpacer = (cells: string[], spacer: string) => [...cells.slice(0, -1), spacer, ...cells.slice(-1)];
  const label = (text: string) => escapeHtml(text).replace(/\n/g, "<br>");

  const head = withSpacer(
    section.columns.map((c, i) =>
      `<th class="${cls(i)}">${c.top ? `<span class="top">${escapeHtml(c.top)}</span>` : ""}${label(c.label)}</th>`),
    '<th class="spacer"></th>',
  ).join("");
  const body = section.rows
    .map((row) =>
      `<tr>${withSpacer(
        row.cells.map((cell, i) =>
          i === 0 && row.color
            ? `<td class="${cls(i)}" style="color:${escapeHtml(row.color)}">${escapeHtml(cell)}</td>`
            : `<td class="${cls(i)}">${escapeHtml(cell)}</td>`),
        '<td class="spacer"></td>',
      ).join("")}</tr>`)
    .join("");
  const foot = section.totals
    ? `<tfoot><tr>${withSpacer(
      section.totals.map((cell, i) => `<td class="${cls(i)}">${escapeHtml(cell)}</td>`),
      '<td class="spacer"></td>',
    ).join("")}</tr></tfoot>`
    : "";
  return `<section>
    <h2>${escapeHtml(section.title)}</h2>
    ${section.subtitle ? `<p class="kind">${escapeHtml(section.subtitle)}</p>` : ""}
    <table><thead><tr>${head}</tr></thead><tbody>${body}</tbody>${foot}</table>
  </section>`;
}

function buildHtml(report: PrintableReport): string {
  const printedAt = new Date().toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" });
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${escapeHtml(report.title)}</title>
<style>
  @page { size: A4 landscape; margin: 12mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif; color: #222; font-size: 11px; margin: 0; }
  header { margin-bottom: 14px; }
  h1 { font-size: 15px; margin: 0 0 2px; }
  .sub { color: #666; margin: 0; }
  .meta { color: #999; margin: 4px 0 0; font-size: 9.5px; }
  section { margin-bottom: 22px; page-break-inside: avoid; }
  section + section { page-break-before: always; }
  h2 { font-size: 16px; margin: 0; color: #333; }
  .kind { color: #666; margin: 2px 0 10px; padding-bottom: 10px; border-bottom: 1px solid #bbb; }
  table { width: 100%; border-collapse: collapse; }
  thead { display: table-header-group; }
  th { font-weight: 700; font-size: 14px; color: #1e3a8a; padding: 6px 8px; text-align: center; vertical-align: bottom; }
  th.label { font-size: 17px; text-align: left; padding-bottom: 8px; }
  th .top { display: block; font-weight: 400; font-size: 11.5px; color: #222; }
  td { padding: 5px 8px; text-align: center; font-variant-numeric: tabular-nums; }
  .label { width: 150px; }
  .mid { width: 92px; }
  .total { width: 90px; }
  td.label { text-align: left; font-weight: 700; color: #1e3a8a; }
  .total.num { text-align: right; }
  td.total { font-weight: 700; color: #555; }
  tbody tr:nth-child(odd) td { background: #f3f4f6; }
  tfoot td { border-top: 1.5px solid #333; font-weight: 700; color: #1e3a8a; padding-top: 8px; }
  tfoot td.total { color: #1e3a8a; }
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .empty { padding: 24px; text-align: center; color: #888; }
</style></head>
<body>
  <header>
    <h1>${escapeHtml(report.title)}</h1>
    ${report.subtitle.map((line) => `<p class="sub">${escapeHtml(line)}</p>`).join("")}
    <p class="meta">Printed ${escapeHtml(printedAt)}</p>
  </header>
  ${report.sections.length ? report.sections.map(sectionHtml).join("") : '<div class="empty">No data for these filters.</div>'}
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
