/**
 * The same sales document the Download PDF button produces, drawn in HTML.
 *
 * View and Print used to render from an entirely separate set of ERP-Settings
 * HTML templates: a different layout, a single hard-coded product row, and no
 * letterhead or summary box. So the same quotation looked like three different
 * documents depending on how you asked for it, and fields the templates never
 * mentioned (the notes among them) simply never appeared. Both renderers now
 * describe the document from services/salesDocumentLayout.cjs and the one data
 * bag in services/pdfData.service.js, so what you see is what prints and what
 * downloads.
 *
 * The markup is deliberately self-contained — its <style> travels with it into
 * the print iframe (see frontend utils/printSalesModal.js), so printing does
 * not depend on the app's stylesheets being loaded.
 */
const {
  TITLES, NOTE_BY_TYPE, clean,
  summaryRows, billedToGrid, headerMeta, productSections,
} = require('./salesDocumentLayout.cjs');

const esc = (value) => String(value == null ? '' : value)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Column widths are authored in points for the PDF; here they become shares of the table. */
const columnWidths = (columns) => {
  const total = columns.reduce((sum, column) => sum + column.width, 0);
  return columns.map((column) => `${((column.width / total) * 100).toFixed(3)}%`);
};

function productSectionHtml(section) {
  const widths = columnWidths(section.columns);
  const gridClass = section.columns.length > 6 ? 'ams-sd__grid ams-sd__grid--compact' : 'ams-sd__grid';
  const head = section.columns
    .map((column, i) => `<th style="width:${widths[i]}${column.align === 'right' ? ';text-align:right' : ''}">${esc(column.label)}</th>`)
    .join('');
  const body = section.rows.map((row) => `<tr>${section.columns
    .map((column) => `<td${column.align === 'right' ? ' class="r"' : ''}>${esc(column.get(row))}</td>`)
    .join('')}</tr>`).join('');
  return `<div class="ams-sd__section-title">${esc(section.title)}</div>
<table class="${gridClass}">
  <thead><tr>${head}</tr></thead>
  <tbody>${body}</tbody>
  <tfoot><tr>
    <td class="r" colspan="${section.columns.length - 1}">${esc(section.totalLabel)}</td>
    <td class="r">${esc(section.totalText)}</td>
  </tr></tfoot>
</table>`;
}

const CSS = `
.ams-sd { font-family: Helvetica, Arial, sans-serif; color: #1e293b; font-size: 12px; line-height: 1.4; background: #fff; }
.ams-sd * { box-sizing: border-box; }
.ams-sd__head { position: relative; text-align: center; margin-bottom: 10px; }
.ams-sd__company { font-size: 21px; font-weight: bold; color: #1e293b; }
.ams-sd__companyline { font-size: 12px; color: #64748b; }
.ams-sd__ref { position: absolute; top: 0; right: 0; text-align: right; font-size: 12px; color: #1e293b; white-space: pre-line; }
.ams-sd__title { text-align: center; font-size: 18px; font-weight: bold; letter-spacing: 0.04em; margin: 10px 0; }
.ams-sd__billed { width: 100%; border-collapse: collapse; table-layout: fixed; margin-bottom: 12px; }
.ams-sd__billed td { width: 33.333%; border: 1px solid #cbd5e1; padding: 5px 6px; font-size: 12px; vertical-align: top; word-break: break-word; }
.ams-sd__section-title { background: #e2e8f0; text-align: center; font-weight: bold; font-size: 13px; padding: 4px; border: 1px solid #cbd5e1; border-bottom: 0; }
.ams-sd__grid { width: 100%; border-collapse: collapse; table-layout: fixed; margin-bottom: 12px; }
.ams-sd__grid th, .ams-sd__grid td { border: 1px solid #cbd5e1; padding: 5px 6px; font-size: 12px; text-align: left; vertical-align: top; word-break: break-word; }
.ams-sd__grid thead th { background: #f1f5f9; font-weight: bold; }
.ams-sd__grid tfoot td { background: #f1f5f9; font-weight: bold; }
.ams-sd__grid .r, .ams-sd__grid th[style*="right"] { text-align: right; }
.ams-sd__boxes { width: 100%; border-collapse: separate; border-spacing: 12px 0; table-layout: fixed; margin: 0 0 10px; }
.ams-sd__boxes > tbody > tr > td { border: 1px solid #cbd5e1; padding: 8px; vertical-align: top; }
.ams-sd__standing { width: 58%; font-size: 11px; font-weight: bold; color: #64748b; }
.ams-sd__words-label { font-size: 11px; font-weight: bold; color: #1e293b; }
.ams-sd__words { font-size: 12px; font-weight: bold; text-decoration: underline; margin-top: 3px; }
.ams-sd__foot { width: 100%; table-layout: fixed; border-collapse: separate; border-spacing: 12px 0; margin: 0; }
.ams-sd__foot > tbody > tr > td { vertical-align: top; padding: 0; }
.ams-sd__notes-col { width: 55%; }
.ams-sd__notes-title { font-size: 13px; font-weight: bold; color: #1e293b; margin-bottom: 2px; }
.ams-sd__notes-body { font-size: 12px; color: #64748b; white-space: pre-wrap; margin: 0 0 8px; }
.ams-sd__summary { width: 100%; border-collapse: collapse; table-layout: fixed; }
.ams-sd__summary caption { background: #f1f5f9; border: 1px solid #cbd5e1; font-weight: bold; font-size: 13px; padding: 4px; text-align: center; }
.ams-sd__summary td { border: 1px solid #cbd5e1; padding: 3px 6px; font-size: 12px; }
.ams-sd__summary td + td { text-align: right; }
.ams-sd__summary tr.net td { font-weight: bold; font-size: 13px; }
@media print {
  .ams-sd { font-size: 10pt; }
  .ams-sd__grid tr, .ams-sd__billed tr { page-break-inside: avoid; }
  .ams-sd__section-title { page-break-after: avoid; }
  .ams-sd__grid--compact th, .ams-sd__grid--compact td { font-size: 8pt; padding: 3pt 2pt; overflow-wrap: anywhere; }
  .ams-sd__grid--compact th { white-space: normal; }
  /*
   * Keep the closing blocks whole.
   *
   * With enough product lines the summary lands right on a page boundary and
   * the printer splits it — the reader gets a document whose totals are sawn in
   * half across two sheets, which is exactly the part they were looking for.
   * These blocks are short, so moving a straddling one to the next page costs
   * nothing and always beats cutting it.
   */
  .ams-sd__boxes, .ams-sd__foot, .ams-sd__summary,
  .ams-sd__boxes > tbody > tr, .ams-sd__foot > tbody > tr,
  .ams-sd__boxes > tbody > tr > td, .ams-sd__foot > tbody > tr > td,
  .ams-sd__summary tr {
    page-break-inside: avoid;
    break-inside: avoid;
  }
  /* The summary must never be separated from the words-in-figures block above
     it either, or page two opens on a lone totals box. */
  .ams-sd__boxes { page-break-after: avoid; break-after: avoid; }
}
`;

/**
 * @param {string} type quotation | booking | order | invoice
 * @param {object} data services/pdfData.service.js buildDataBag() output
 * @returns {{ html: string, css: string }}
 */
function buildSalesDocumentHtml(type, data) {
  const d = data.document || {};
  const company = data.company || {};

  const companyLines = [
    company.phone && `Tel: ${company.phone}`,
    company.address && `Address: ${company.address}`,
    company.ntn && `NTN Number: ${company.ntn}`,
  ].filter(Boolean).map((line) => `<div class="ams-sd__companyline">${esc(line)}</div>`).join('');

  const billed = billedToGrid(type, data)
    .map((cells) => `<tr>${cells.map((cell) => `<td>${esc(clean(cell))}</td>`).join('')}</tr>`)
    .join('');

  const sections = productSections(data).map(productSectionHtml).join('');

  const notesBlocks = [
    { title: 'Notes', body: clean(d.notes) },
    { title: 'Terms & Conditions', body: clean(d.termsAndConditions) },
  ].filter((block) => block.body)
    .map((block) => `<div class="ams-sd__notes-title">${esc(block.title)}</div><p class="ams-sd__notes-body">${esc(block.body)}</p>`)
    .join('');

  const summary = summaryRows(type, data).map(([label, value]) => {
    const isNet = label === 'NET';
    return `<tr${isNet ? ' class="net"' : ''}><td>${esc(isNet ? 'Net Amount' : label)}</td><td>${esc(value)}</td></tr>`;
  }).join('');

  const html = `<style>${CSS}</style>
<div class="ams-sd">
  <div class="ams-sd__head">
    <div class="ams-sd__ref">${esc(headerMeta(type, data).join('\n'))}</div>
    <div class="ams-sd__company">${esc(company.name || '')}</div>
    ${companyLines}
  </div>
  <div class="ams-sd__title">${esc(TITLES[type] || 'DOCUMENT')}</div>
  <table class="ams-sd__billed"><tbody>${billed}</tbody></table>
  ${sections}
  <table class="ams-sd__boxes"><tbody><tr>
    <td class="ams-sd__standing">${esc(NOTE_BY_TYPE[type] || '')}</td>
    <td>
      <div class="ams-sd__words-label">Total amount in words:</div>
      <div class="ams-sd__words">${esc(d.totalInWords || '')}</div>
    </td>
  </tr></tbody></table>
  <table class="ams-sd__foot"><tbody><tr>
    <td class="ams-sd__notes-col">${notesBlocks}</td>
    <td>
      <table class="ams-sd__summary">
        <caption>SUMMARY</caption>
        <tbody>${summary}</tbody>
      </table>
    </td>
  </tr></tbody></table>
</div>`;

  return { html, css: CSS };
}

module.exports = { buildSalesDocumentHtml };
