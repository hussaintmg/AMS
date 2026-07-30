/**
 * Flexible date parser for Dealer Pro XLSX imports.
 * Handles: "03-Jul-2026", "Oct - 2026", "30-Jun-2026", Excel serial numbers,
 * ISO dates, DD/MM/YYYY, named months, etc.
 */

const xlsx = require('xlsx');

const MONTH_NAMES = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3,
  apr: 4, april: 4, may: 5, jun: 6, june: 6,
  jul: 7, july: 7, aug: 8, august: 8,
  sep: 9, sept: 9, september: 9, oct: 10, october: 10,
  nov: 11, november: 11, dec: 12, december: 12
};

function buildDate(y, m, d) {
  if (y < 1900 || y > 2200 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return date;
}

function fixYear(y) {
  if (y >= 100) return y;
  return y >= 70 ? 1900 + y : 2000 + y;
}

/**
 * Parse a flexible date value. Returns Date or null.
 * Handles all formats found in Dealer Pro XLSX files.
 */
function parseFlexibleDate(raw) {
  if (raw === undefined || raw === null) return null;

  if (raw instanceof Date) return isNaN(raw.getTime()) ? null : raw;

  const s = String(raw).trim();
  if (!s) return null;

  // Excel serial number (days since 1899-12-30)
  if (/^\d+(\.\d+)?$/.test(s)) {
    const serial = parseFloat(s);
    if (serial > 20000 && serial < 80000) {
      const d = new Date(Math.round((serial - 25569) * 86400 * 1000));
      if (!isNaN(d.getTime())) return d;
    }
  }

  // ISO / year-first: 2026-07-13, 2026/7/3
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s].*)?$/);
  if (m) {
    const d = buildDate(+m[1], +m[2], +m[3]);
    if (d) return d;
  }

  // "30-Jun-2026" or "30 Jun 2026"
  m = s.match(/^(\d{1,2})[\s,./-]+([A-Za-z]{3,9})[\s,./-]+(\d{2,4})$/);
  if (m) {
    const mo = MONTH_NAMES[m[2].toLowerCase()];
    if (mo) {
      const d = buildDate(fixYear(+m[3]), mo, +m[1]);
      if (d) return d;
    }
  }

  // "Jun 30 2026", "June 30th, 2026"
  m = s.match(/^([A-Za-z]{3,9})[\s,./-]+(\d{1,2})(?:st|nd|rd|th)?[\s,./-]+(\d{2,4})$/);
  if (m) {
    const mo = MONTH_NAMES[m[1].toLowerCase()];
    if (mo) {
      const d = buildDate(fixYear(+m[3]), mo, +m[2]);
      if (d) return d;
    }
  }

  // "Oct - 2026" or "Oct 2026" (month-only delivery dates)
  m = s.match(/^([A-Za-z]{3,9})\s*[-–]?\s*(\d{4})$/);
  if (m) {
    const mo = MONTH_NAMES[m[1].toLowerCase()];
    if (mo) {
      const d = buildDate(+m[2], mo, 1);
      if (d) return d;
    }
  }

  // Day-first / month-first numeric: 05/07/2026, 7-13-26
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})(?:[T\s].*)?$/);
  if (m) {
    const a = +m[1];
    const b = +m[2];
    const y = fixYear(+m[3]);
    let d = null;
    if (a > 12 && b <= 12) d = buildDate(y, b, a);
    else if (b > 12 && a <= 12) d = buildDate(y, a, b);
    else d = buildDate(y, b, a) || buildDate(y, a, b);
    if (d) return d;
  }

  // Last resort — native parser
  const native = new Date(s);
  if (!isNaN(native.getTime())) return native;

  return null;
}

module.exports = { parseFlexibleDate };
