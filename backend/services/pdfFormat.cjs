'use strict';
/**
 * Shared token/value formatting for PDF generation. Required by the controller
 * (HTML-mode templates) and by pdfHtml.service (designer-mode templates) so a
 * variable renders the same way in the live preview and the server PDF.
 */

const { expandBlocks, hasBlocks } = require('./templateLoops.cjs');

// Numeric fields that should render as currency (e.g. PKR 1,250,000).
const AMOUNT_RE = /(amount|price|subtotal|balance|paid|charge|deposit|total|changedue|tendered)/i;
// ...unless they are really counts/ratios, which stay as plain numbers.
const COUNT_RE = /(percentage|percent|days|quantity|qty|count|number|rate|angle|opacity)/i;
// Fields that hold dates.
const DATE_RE = /(date|until|createdat|updatedat|deliveredat|dob)/i;

function getValue(source, key) {
  return String(key).split('.').reduce((value, part) => (value == null ? undefined : value[part]), source);
}

function formatCurrency(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return String(value);
  return `PKR ${num.toLocaleString('en-PK')}`;
}

function formatValue(value, key = '') {
  if (value == null) return '';
  const flat = String(key).replace(/\./g, '').toLowerCase();
  if (value instanceof Date || (DATE_RE.test(flat) && !AMOUNT_RE.test(flat))) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date.toLocaleDateString('en-GB');
  }
  if (typeof value === 'number' && AMOUNT_RE.test(flat) && !COUNT_RE.test(flat)) return formatCurrency(value);
  if (typeof value === 'object') {
    return Array.isArray(value)
      ? value.map((item) => (item && typeof item === 'object' ? (item.description || item.name || '') : String(item))).filter(Boolean).join(', ')
      : (value.name || value.fullName || '');
  }
  return String(value);
}

function resolveTokens(text, data) {
  // Multi-product documents repeat a row per line item, so block helpers run
  // first and hand back plain markup for the single-token pass below.
  const expanded = hasBlocks(text) ? expandBlocks(text, data, formatValue) : String(text == null ? '' : text);
  return expanded.replace(/\{\{\s*([^#/}][^}]*?)\s*\}\}/g, (match, key) => {
    const trimmed = key.trim();
    const value = getValue(data, trimmed);
    // A token that resolves to nothing (e.g. a row field left over from a loop
    // that produced no rows) renders empty rather than leaking "{{this.name}}".
    if (value === undefined && trimmed.startsWith('this.')) return '';
    return formatValue(value, trimmed);
  });
}

module.exports = { getValue, formatCurrency, formatValue, resolveTokens };
