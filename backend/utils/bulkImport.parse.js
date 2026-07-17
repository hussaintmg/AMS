/**
 * Parse CSV / XLSX into normalized row objects for bulk import.
 * Comment lines starting with # are skipped until the header row.
 */

const xlsx = require('xlsx');
const { AppError } = require('../middleware/errorHandler');

/**
 * Normalize a spreadsheet column header for matching.
 * Strips BOM, trailing * (required marker), and (required)/(optional) hints.
 */
function normalizeHeader(cell) {
    if (cell === undefined || cell === null) return '';
    let s = String(cell).replace(/^\uFEFF/, '').trim();
    s = s.replace(/\s*\*\s*$/u, '');
    s = s.replace(/\s*\(required\)\s*$/iu, '');
    s = s.replace(/\s*\(optional\)\s*$/iu, '');
    s = s.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    return s;
}

function stripLeadingHashCommentLines(text) {
    return text
        .split(/\r?\n/)
        .filter((line) => !line.trim().startsWith('#'))
        .join('\n');
}

function findHeaderRowIndex(matrix) {
    for (let i = 0; i < matrix.length; i++) {
        const row = matrix[i];
        if (!row || !row.length) continue;
        const first = String(row[0] ?? '').trim();
        if (first.startsWith('#')) continue;
        const nonEmpty = row.filter((c) => String(c ?? '').trim() !== '').length;
        if (nonEmpty >= 2) return i;
    }
    return -1;
}

function matrixToObjects(matrix) {
    // A malformed upload is the caller's input problem, not a server fault —
    // these must surface as 400, not as an unhandled 500 with a stack trace.
    const hi = findHeaderRowIndex(matrix);
    if (hi === -1) {
        throw new AppError(
            'Could not find a header row. Add a column header row after any # comment lines.',
            400,
            'The first non-comment row must contain at least two column names.'
        );
    }
    const headerCells = matrix[hi];
    const headers = headerCells.map((c) => normalizeHeader(c)).filter(Boolean);
    if (headers.length === 0) {
        throw new AppError('Header row has no valid column names.', 400);
    }

    const rows = [];
    for (let r = hi + 1; r < matrix.length; r++) {
        const line = matrix[r] || [];
        if (line.every((c) => String(c ?? '').trim() === '')) continue;

        const obj = {};
        headerCells.forEach((rawH, colIdx) => {
            const h = normalizeHeader(rawH);
            if (!h) return;
            obj[h] = String(line[colIdx] ?? '').trim();
        });

        const hasAny = Object.values(obj).some((v) => v !== '');
        if (hasAny) rows.push(obj);
    }
    return rows;
}

/**
 * @param {Buffer} buffer
 * @param {string} originalname
 * @returns {{ rows: Record<string,string>[], extension: string }}
 */
function parseSpreadsheet(buffer, originalname) {
    const name = (originalname || '').toLowerCase();
    const ext = name.endsWith('.xlsx') ? 'xlsx' : name.endsWith('.csv') ? 'csv' : '';

    if (ext !== 'xlsx' && ext !== 'csv') {
        throw new AppError('Unsupported file type. Use .csv or .xlsx', 400);
    }

    let matrix;

    if (ext === 'xlsx') {
        const wb = xlsx.read(buffer, { type: 'buffer' });
        const sheetName = wb.SheetNames[0];
        const sheet = wb.Sheets[sheetName];
        matrix = xlsx.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });
    } else {
        const text = stripLeadingHashCommentLines(buffer.toString('utf8'));
        const wb = xlsx.read(text, { type: 'string', FS: ',', raw: false });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        matrix = xlsx.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });
    }

    const rows = matrixToObjects(matrix);
    return { rows, extension: ext };
}

module.exports = {
    normalizeHeader,
    parseSpreadsheet
};
