/**
 * Lead number generator
 * =====================
 * Single source of truth for lead numbering, shared by the single-create
 * controller and the bulk importer.
 *
 * Two bugs this replaces:
 *  1. Both callers derived "next" from the NEWEST lead (sort by createdAt desc)
 *     instead of the HIGHEST number. As soon as a lead was deleted or numbers
 *     were backfilled out of order, the generated number collided with the
 *     unique index and every bulk row failed with "Duplicate value".
 *  2. The two callers used different prefixes (LD- vs LEAD-), so the app had
 *     two parallel, conflicting sequences.
 *
 * Numbering is now MAX-based across BOTH legacy prefixes and always emits the
 * LD-xxxxxxxx form the single-create flow already used.
 *
 * Maintained by Hussain Developer
 * hussaintmerng@gmail.com | +92 319 1634446
 * AMS ERP
 */

const Lead = require('../models/Lead.model');

const PREFIX = 'LD-';
const WIDTH = 8;

const format = (n) => `${PREFIX}${String(n).padStart(WIDTH, '0')}`;

/**
 * Highest lead number currently in use, considering both the LD- and the
 * legacy LEAD- series so a new LD- number can never land on an existing one.
 */
async function currentMaxLeadNumber() {
    const rows = await Lead.find({ leadNo: { $regex: /^(LD|LEAD)-\d+$/ } })
        .select('leadNo')
        .lean();

    return rows.reduce((max, row) => {
        const match = String(row.leadNo).match(/^(?:LD|LEAD)-(\d+)$/);
        if (!match) return max;
        const n = parseInt(match[1], 10);
        return Number.isFinite(n) && n > max ? n : max;
    }, 0);
}

/** Next single lead number, e.g. "LD-00000167". */
async function generateLeadNo() {
    return format(await currentMaxLeadNumber() + 1);
}

/**
 * Allocate a contiguous block of numbers for a bulk import.
 * Returns a function that yields the next formatted number on each call.
 */
async function leadNumberSequence() {
    let next = await currentMaxLeadNumber() + 1;
    return () => format(next++);
}

module.exports = {
    generateLeadNo,
    leadNumberSequence,
    currentMaxLeadNumber,
    formatLeadNo: format,
};
