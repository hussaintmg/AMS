/**
 * Payroll controller (MongoDB)
 *
 * Migrated off the MySQL stub — every query() here used to hit the disabled
 * MySQL layer, so periods/lines were always empty and posting did nothing.
 *
 * Maintained by Hussain Developer
 * hussaintmerng@gmail.com | +92 319 1634446
 * AMS ERP
 */

const mongoose = require('mongoose');
const Payroll = require('../models/Payroll.model');
const Employee = require('../models/Employee.model');
const { AppError } = require('../middleware/errorHandler');
const {
    postDoubleEntry,
    isAlreadyPosted,
    DEFAULT_CREDIT_ACCOUNT,
    DEFAULT_SALARY_ACCOUNT,
} = require('../services/ledgerPosting.service');
const {
    outstandingByEmployee,
    recoverFromAdvances,
    ADVANCE_ACCOUNT,
} = require('./salaryAdvance.controller');

const getUserId = (req) => req.user?._id || req.user?.id || null;
const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;

const toObjectId = (value) => (mongoose.Types.ObjectId.isValid(value) ? new mongoose.Types.ObjectId(value) : null);

const asDateOnly = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null);

const mapPeriod = (p) => ({
    id: p._id,
    label: p.label,
    period_start: asDateOnly(p.periodStart),
    period_end: asDateOnly(p.periodEnd),
    status: p.status,
    line_count: (p.lines || []).length,
    posted_at: p.postedAt || null,
    created_at: p.createdAt,
});

const mapLine = (line) => {
    const emp = line.employee && typeof line.employee === 'object' ? line.employee : null;
    return {
        id: line._id,
        employee_id: emp ? emp._id : line.employee,
        employee_name: emp ? [emp.firstName, emp.lastName].filter(Boolean).join(' ') : '',
        employee_code: emp ? emp.employeeCode || '' : '',
        gross_amount: line.grossAmount || 0,
        deductions: line.deductions || 0,
        advance_deduction: line.advanceDeduction || 0,
        // What the employee still owes after this run is taken off.
        advance_balance: line.advanceBalance || 0,
        net_amount: line.netAmount || 0,
        notes: line.notes || '',
    };
};

/**
 * Net pay after everything is held back. An advance can never push the payslip
 * negative — whatever cannot be recovered this run stays on the balance.
 */
const settleLine = (line) => {
    const gross = round2(line.grossAmount);
    const other = round2(line.deductions);
    const room = Math.max(0, round2(gross - other));
    line.advanceDeduction = Math.min(round2(line.advanceDeduction), room);
    line.netAmount = round2(gross - other - line.advanceDeduction);
    return line;
};

/** Load a period or 404, optionally with employee details on each line. */
async function findPeriodOr404(id, populateEmployees = false) {
    if (!toObjectId(id)) throw new AppError('Period not found', 404);
    const q = Payroll.findById(id);
    if (populateEmployees) q.populate('lines.employee', 'firstName lastName employeeCode');
    const period = await q;
    if (!period) throw new AppError('Period not found', 404);
    return period;
}

/**
 * List payroll periods
 * @route GET /api/payroll/periods
 */
const listPeriods = async (req, res, next) => {
    try {
        const periods = await Payroll.find({}).sort({ periodStart: -1 }).lean();
        res.json({ success: true, data: periods.map(mapPeriod) });
    } catch (e) {
        next(e);
    }
};

/**
 * Create a payroll period
 * @route POST /api/payroll/periods
 */
const createPeriod = async (req, res, next) => {
    try {
        const { label, period_start, period_end } = req.body;
        if (!label || !period_start || !period_end) {
            throw new AppError('label, period_start, period_end required', 400);
        }

        const period = await Payroll.create({
            label: String(label).trim(),
            periodStart: new Date(period_start),
            periodEnd: new Date(period_end),
            status: 'draft',
            createdBy: getUserId(req),
        });

        res.status(201).json({ success: true, data: mapPeriod(period.toObject()) });
    } catch (e) {
        next(e);
    }
};

/**
 * Get a period with its lines
 * @route GET /api/payroll/periods/:id/lines
 */
const getPeriodLines = async (req, res, next) => {
    try {
        const period = await findPeriodOr404(req.params.id, true);
        const lines = [...(period.lines || [])].sort((a, b) => {
            const ac = a.employee?.employeeCode || '';
            const bc = b.employee?.employeeCode || '';
            return ac.localeCompare(bc);
        });

        res.json({
            success: true,
            data: { period: mapPeriod(period.toObject()), lines: lines.map(mapLine) },
        });
    } catch (e) {
        next(e);
    }
};

/**
 * Generate one line per active employee (draft periods only)
 * @route POST /api/payroll/periods/:id/generate
 */
const generateLines = async (req, res, next) => {
    try {
        const period = await findPeriodOr404(req.params.id);
        if (period.status !== 'draft') {
            throw new AppError('Can only generate lines for draft periods', 400);
        }

        const employees = await Employee.find({
            isActive: true,
            isDeleted: { $ne: true },
            $or: [
                { status: { $in: ['active', 'probation', 'on_leave'] } },
                { status: { $in: [null, ''] } },
                { status: { $exists: false } },
            ],
        }).select('_id salary').lean();

        // Regenerating must not duplicate lines for employees already present.
        const existing = new Set((period.lines || []).map((l) => String(l.employee)));
        // One query for every employee's outstanding advance, rather than one
        // per line.
        const owedByEmployee = await outstandingByEmployee(employees.map((e) => e._id));

        let added = 0;
        let advanceTotal = 0;
        const flagged = [];
        for (const emp of employees) {
            if (existing.has(String(emp._id))) continue;

            // Employee records predating salary validation can hold a negative
            // salary. Clamp to 0 and flag it rather than blocking the whole run.
            const raw = Number(emp.salary) || 0;
            const gross = Math.max(0, raw);
            const notes = raw < 0 ? 'Employee salary was negative on record; treated as 0 — please correct the employee.' : '';
            if (raw < 0) flagged.push(String(emp._id));

            // Hold back what the employee owes, but never more than this
            // month's pay — the rest simply stays outstanding.
            const owed = round2(owedByEmployee.get(String(emp._id)) || 0);
            const line = settleLine({
                employee: emp._id,
                grossAmount: gross,
                deductions: 0,
                advanceDeduction: owed,
                notes,
            });
            line.advanceBalance = round2(owed - line.advanceDeduction);
            advanceTotal = round2(advanceTotal + line.advanceDeduction);

            period.lines.push(line);
            added++;
        }

        period.updatedBy = getUserId(req);
        await period.save();

        const populated = await findPeriodOr404(period._id, true);

        const notices = [`${added} line(s) generated`];
        if (advanceTotal > 0) notices.push(`${advanceTotal} recovered against salary advances`);
        if (flagged.length) notices.push(`${flagged.length} employee(s) had a negative salary and were set to 0`);

        res.json({
            success: true,
            message: notices.join('; '),
            data: {
                count: populated.lines.length,
                added,
                advanceRecovered: advanceTotal,
                flaggedEmployees: flagged,
                lines: populated.lines.map(mapLine),
            },
        });
    } catch (e) {
        next(e);
    }
};

/**
 * Lock a draft period
 * @route POST /api/payroll/periods/:id/lock
 */
const lockPeriod = async (req, res, next) => {
    try {
        const period = await findPeriodOr404(req.params.id);
        if (period.status !== 'draft') {
            throw new AppError('Period not found or not in draft', 400);
        }
        if (!period.lines.length) {
            throw new AppError('Cannot lock a period with no lines', 400);
        }

        period.status = 'locked';
        period.updatedBy = getUserId(req);
        await period.save();

        res.json({ success: true, message: 'Period locked', data: mapPeriod(period.toObject()) });
    } catch (e) {
        next(e);
    }
};

/**
 * Post a locked period to the ledger
 * @route POST /api/payroll/periods/:id/post
 */
const postPeriod = async (req, res, next) => {
    try {
        const period = await findPeriodOr404(req.params.id);
        if (period.status !== 'locked') {
            throw new AppError('Payroll period must be locked before posting', 400);
        }

        const referenceId = `PR-${period._id}`;
        if (await isAlreadyPosted('salary', referenceId)) {
            throw new AppError('Period already posted to ledger', 400);
        }

        /**
         * Recovery happens here, not at generate time: the lines are only a
         * proposal until the period is posted, and an employee may have repaid
         * in cash in between. `recoverFromAdvances` therefore reports what it
         * could actually apply, and the line is rewritten to match — so a
         * payslip never claims to have taken back money that was not there.
         */
        let advanceRecovered = 0;
        for (const line of period.lines) {
            const wanted = round2(line.advanceDeduction);
            if (wanted <= 0) {
                line.advanceBalance = 0;
                continue;
            }
            const { applied } = await recoverFromAdvances(line.employee, wanted, getUserId(req));
            if (applied !== wanted) {
                line.advanceDeduction = applied;
                settleLine(line); // net pay goes back up by whatever was not owed
                line.notes = [line.notes, `Advance recovery adjusted to ${applied} at posting.`]
                    .filter(Boolean).join(' ');
            }
            advanceRecovered = round2(advanceRecovered + applied);
        }

        const netTotal = round2(period.lines.reduce((sum, l) => sum + (Number(l.netAmount) || 0), 0));
        if (netTotal <= 0 && advanceRecovered <= 0) {
            throw new AppError('Cannot post a period with zero net total', 400);
        }

        // Cash actually handed over.
        if (netTotal > 0) {
            await postDoubleEntry({
                transactionDate: period.periodEnd,
                debitAccount: DEFAULT_SALARY_ACCOUNT,
                creditAccount: DEFAULT_CREDIT_ACCOUNT,
                amount: netTotal,
                description: `Payroll ${period.label} (${period.lines.length} employees)`,
                referenceType: 'salary',
                referenceId,
                userId: getUserId(req),
            });
        }

        // Salary that was already paid out as an advance: the cost lands now
        // and the receivable it was sitting in is cleared.
        if (advanceRecovered > 0) {
            await postDoubleEntry({
                transactionDate: period.periodEnd,
                debitAccount: DEFAULT_SALARY_ACCOUNT,
                creditAccount: ADVANCE_ACCOUNT,
                amount: advanceRecovered,
                description: `Payroll ${period.label} — salary advances recovered`,
                referenceType: 'salary',
                referenceId: `${referenceId}-ADV`,
                userId: getUserId(req),
            });
        }

        period.status = 'posted';
        period.postedAt = new Date();
        period.updatedBy = getUserId(req);
        await period.save();

        res.json({
            success: true,
            message: advanceRecovered > 0
                ? `Payroll posted to ledger; ${advanceRecovered} recovered against salary advances`
                : 'Payroll posted to ledger',
            data: { ...mapPeriod(period.toObject()), advance_recovered: advanceRecovered, net_total: netTotal },
        });
    } catch (e) {
        next(e);
    }
};

/**
 * Update a payroll line (draft periods only)
 * @route PATCH /api/payroll/lines/:lineId
 */
const updateLine = async (req, res, next) => {
    try {
        const { lineId } = req.params;
        if (!toObjectId(lineId)) throw new AppError('Line not found', 404);

        const period = await Payroll.findOne({ 'lines._id': lineId });
        if (!period) throw new AppError('Line not found', 404);
        if (period.status !== 'draft') {
            throw new AppError('Only draft period lines can be edited', 400);
        }

        const line = period.lines.id(lineId);
        const { gross_amount, deductions, advance_deduction, notes } = req.body;

        if (gross_amount != null) {
            const g = Number(gross_amount);
            if (!Number.isFinite(g) || g < 0) throw new AppError('Gross amount must be zero or greater', 400);
            line.grossAmount = g;
        }
        if (deductions != null) {
            const d = Number(deductions);
            if (!Number.isFinite(d) || d < 0) throw new AppError('Deductions must be zero or greater', 400);
            line.deductions = d;
        }
        if (advance_deduction != null) {
            const a = Number(advance_deduction);
            if (!Number.isFinite(a) || a < 0) throw new AppError('Advance deduction must be zero or greater', 400);
            // Recovering more than is owed would turn an advance into a charge.
            const owed = (await outstandingByEmployee([line.employee])).get(String(line.employee)) || 0;
            if (a > round2(owed)) {
                throw new AppError(`That employee only owes ${round2(owed)} against advances`, 400);
            }
            line.advanceDeduction = a;
        }
        if (notes != null) line.notes = notes;

        if (line.deductions > line.grossAmount) {
            throw new AppError('Deductions cannot exceed the gross amount', 400);
        }

        // No error when other deductions leave too little room for the advance:
        // settleLine recovers what it can and the rest stays on the balance,
        // which is the whole point of carrying advances across runs.
        settleLine(line);
        const owedNow = (await outstandingByEmployee([line.employee])).get(String(line.employee)) || 0;
        line.advanceBalance = round2(Math.max(0, owedNow - line.advanceDeduction));

        period.updatedBy = getUserId(req);
        await period.save();

        const populated = await findPeriodOr404(period._id, true);
        res.json({ success: true, data: mapLine(populated.lines.id(lineId)) });
    } catch (e) {
        next(e);
    }
};

module.exports = {
    listPeriods,
    createPeriod,
    getPeriodLines,
    generateLines,
    lockPeriod,
    postPeriod,
    updateLine
};
