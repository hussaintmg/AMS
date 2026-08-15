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
const SalaryAdvance = require('../models/SalaryAdvance.model');
const { AppError } = require('../middleware/errorHandler');
const {
    postDoubleEntry,
    isAlreadyPosted,
    reverseEntries,
    DEFAULT_CREDIT_ACCOUNT,
    DEFAULT_SALARY_ACCOUNT,
} = require('../services/ledgerPosting.service');
const {
    outstandingByEmployee,
    recoverFromAdvances,
    ADVANCE_ACCOUNT,
} = require('./salaryAdvance.controller');

/** What the company owes staff between posting a period and paying it out. */
const SALARY_PAYABLE_ACCOUNT = 'Salaries Payable';

const getUserId = (req) => req.user?._id || req.user?.id || null;
const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;

const toObjectId = (value) => (mongoose.Types.ObjectId.isValid(value) ? new mongoose.Types.ObjectId(value) : null);

const asDateOnly = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null);

const remainingOf = (line) => Math.max(0, round2((line.netAmount || 0) - (line.paidAmount || 0)));

/** unpaid → partial → paid, worked out from the numbers rather than stored. */
const paymentStatusOf = (line) => {
    const net = round2(line.netAmount);
    const paid = round2(line.paidAmount);
    if (net <= 0) return 'nothing_due';
    if (paid <= 0) return 'unpaid';
    return paid >= net ? 'paid' : 'partial';
};

const mapPeriod = (p) => {
    const lines = p.lines || [];
    const net = round2(lines.reduce((sum, l) => sum + (l.netAmount || 0), 0));
    const paid = round2(lines.reduce((sum, l) => sum + (l.paidAmount || 0), 0));
    return {
        id: p._id,
        label: p.label,
        period_start: asDateOnly(p.periodStart),
        period_end: asDateOnly(p.periodEnd),
        status: p.status,
        line_count: lines.length,
        // Totals let the list show at a glance what a month still owes.
        net_total: net,
        paid_total: paid,
        // The row-level "Given" figure, summed — see `already_given` in mapLine.
        given_total: round2(lines.reduce((sum, l) => sum + (l.advanceDeduction || 0) + (l.paidAmount || 0), 0)),
        remaining_total: round2(lines.reduce((sum, l) => sum + remainingOf(l), 0)),
        unpaid_count: lines.filter((l) => paymentStatusOf(l) !== 'paid' && (l.netAmount || 0) > 0).length,
        posted_at: p.postedAt || null,
        created_at: p.createdAt,
    };
};

const mapPayment = (payment) => ({
    id: String(payment._id),
    amount: round2(payment.amount),
    paid_on: asDateOnly(payment.paidOn),
    method: payment.method || 'cash',
    reference: payment.reference || '',
    notes: payment.notes || '',
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
        /**
         * Everything the employee owes against advances right now, whatever this
         * line decides to take. It is what the deduction box may be raised to,
         * and what the row shows before anyone has decided anything.
         */
        advance_outstanding: round2((line.advanceDeduction || 0) + (line.advanceBalance || 0)),
        net_amount: line.netAmount || 0,
        paid_amount: round2(line.paidAmount),
        /**
         * What the employee has actually had in hand for this period.
         *
         * `paid_amount` counts only salary paid out, which is the right figure
         * for the ledger and the wrong one to show a person: on a 40,000 salary
         * with a 20,000 advance already taken, the screen said "Paid 0" beside
         * "Remaining 20,000" — and the employee is holding 20,000. An advance is
         * salary paid early, so it belongs here.
         */
        already_given: round2((line.advanceDeduction || 0) + (line.paidAmount || 0)),
        remaining_amount: remainingOf(line),
        payment_status: paymentStatusOf(line),
        payments: (line.payments || []).map(mapPayment),
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

/**
 * Mapped lines, with each employee's advance position read fresh.
 *
 * `advanceBalance` is written when the line is generated, so it is a snapshot of
 * a moment — and an advance issued *after* the lines were generated is not in
 * it. The row then said nothing was owed and the editor refused to take a figure
 * at all, while the employee plainly owed the money. Recovery only happens at
 * posting, so until then the advance is still fully outstanding and the truth is
 * one query away.
 *
 * A posted period keeps what it stored: the advance really was recovered then,
 * and the payslip should go on saying so.
 */
async function withAdvancePosition(lines, periodStatus) {
    const mapped = lines.map(mapLine);
    if (periodStatus === 'posted') return mapped;

    const owed = await outstandingByEmployee(mapped.map((line) => line.employee_id).filter(Boolean));
    return mapped.map((line) => {
        const outstanding = round2(owed.get(String(line.employee_id)) || 0);
        return {
            ...line,
            advance_outstanding: outstanding,
            advance_balance: round2(Math.max(0, outstanding - line.advance_deduction)),
        };
    });
}

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

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];

/**
 * Create a payroll period
 * @route POST /api/payroll/periods
 *
 * A period is one whole calendar month. The client sends `month` ("2026-08")
 * and the first day, the last day (28/29/30/31 — the month decides) and the
 * label ("August 2026") all follow from it. `label`/`period_start`/`period_end`
 * are still accepted for API callers that predate the month picker.
 */
const createPeriod = async (req, res, next) => {
    try {
        const { label, period_start, period_end, month } = req.body;

        let periodStart;
        let periodEnd;
        let finalLabel;
        if (month) {
            const parsed = /^(\d{4})-(\d{2})$/.exec(String(month).trim());
            const year = parsed ? Number(parsed[1]) : NaN;
            const monthNo = parsed ? Number(parsed[2]) : NaN;
            if (!parsed || monthNo < 1 || monthNo > 12) {
                throw new AppError('month must look like 2026-08', 400);
            }
            // UTC keeps the stored dates exactly on the 1st and the last day,
            // whatever timezone the server wakes up in.
            periodStart = new Date(Date.UTC(year, monthNo - 1, 1));
            periodEnd = new Date(Date.UTC(year, monthNo, 0));
            finalLabel = String(label || '').trim() || `${MONTH_NAMES[monthNo - 1]} ${year}`;
        } else {
            if (!label || !period_start || !period_end) {
                throw new AppError('month (e.g. 2026-08) or label, period_start, period_end required', 400);
            }
            periodStart = new Date(period_start);
            periodEnd = new Date(period_end);
            finalLabel = String(label).trim();
        }

        // The same month twice would pay everyone twice. Overlap (not equality)
        // is what is checked, so a hand-made half-month cannot slip past either.
        const clash = await Payroll.findOne({
            periodStart: { $lte: periodEnd },
            periodEnd: { $gte: periodStart },
        }).select('label').lean();
        if (clash) {
            throw new AppError(`This period overlaps the existing "${clash.label}" — each month can only be created once`, 409);
        }

        const period = await Payroll.create({
            label: finalLabel,
            periodStart,
            periodEnd,
            status: 'draft',
            createdBy: getUserId(req),
        });

        res.status(201).json({ success: true, data: mapPeriod(period.toObject()) });
    } catch (e) {
        next(e);
    }
};

/**
 * Delete a period that has not been posted.
 * @route DELETE /api/payroll/periods/:id
 *
 * A posted period is in the ledger and its payments have left the till — that
 * history is not deletable. A draft or locked period is still only a proposal.
 */
const deletePeriod = async (req, res, next) => {
    try {
        const period = await findPeriodOr404(req.params.id);
        if (period.status === 'posted') {
            throw new AppError('A posted period is in the ledger and cannot be deleted', 400);
        }
        await period.deleteOne();
        res.json({ success: true, message: `Period "${period.label}" deleted` });
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
            data: {
                period: mapPeriod(period.toObject()),
                lines: await withAdvancePosition(lines, period.status),
            },
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
        const flagged = [];
        for (const emp of employees) {
            if (existing.has(String(emp._id))) continue;

            // Employee records predating salary validation can hold a negative
            // salary. Clamp to 0 and flag it rather than blocking the whole run.
            const raw = Number(emp.salary) || 0;
            const gross = Math.max(0, raw);
            const notes = raw < 0 ? 'Employee salary was negative on record; treated as 0 — please correct the employee.' : '';
            if (raw < 0) flagged.push(String(emp._id));

            /**
             * An advance is salary already handed over, so this month's line
             * simply carries it: pay 40,000, gave 20,000 up front, 20,000 left
             * to pay. `settleLine` never lets it push the payslip below zero —
             * anything that will not fit this month stays owed and comes off the
             * next one.
             *
             * The line is still editable while the period is a draft, for the
             * month where somebody wants to take less.
             */
            const owed = round2(owedByEmployee.get(String(emp._id)) || 0);
            const line = settleLine({
                employee: emp._id,
                grossAmount: gross,
                deductions: 0,
                advanceDeduction: owed,
                notes,
            });
            line.advanceBalance = round2(owed - line.advanceDeduction);

            period.lines.push(line);
            added++;
        }

        /**
         * Generate is also the "refresh from today's data" button: an advance
         * issued *after* the lines were made only showed up as "still to
         * deduct", and clicking Generate again skipped the existing lines, so
         * nothing ever moved it into the deduction. Every line is re-settled
         * against the employee's current advance balance — which also means a
         * hand-lowered deduction goes back to the full figure; the Edit dialog
         * is where "take less this month" is decided, after the sync.
         *
         * Queried per line rather than reusing `owedByEmployee`: a line can
         * belong to an employee who has since been deactivated.
         */
        let refreshed = 0;
        let advanceTotal = 0;
        const owedForLines = await outstandingByEmployee(period.lines.map((l) => l.employee));
        for (const line of period.lines) {
            const before = round2(line.advanceDeduction);
            const owed = round2(owedForLines.get(String(line.employee)) || 0);
            line.advanceDeduction = owed;
            settleLine(line);
            line.advanceBalance = round2(owed - line.advanceDeduction);
            // A just-added line re-settles to the value it was born with, so
            // only genuinely moved lines — the stale existing ones — count.
            if (round2(line.advanceDeduction) !== before) refreshed++;
            advanceTotal = round2(advanceTotal + line.advanceDeduction);
        }

        period.updatedBy = getUserId(req);
        await period.save();

        const populated = await findPeriodOr404(period._id, true);

        const notices = [`${added} line(s) generated`];
        if (refreshed > 0) notices.push(`${refreshed} existing line(s) updated to the current advance balances`);
        if (advanceTotal > 0) notices.push(`${advanceTotal} of salary advances already given, deducted from this month`);
        if (flagged.length) notices.push(`${flagged.length} employee(s) had a negative salary and were set to 0`);

        res.json({
            success: true,
            message: notices.join('; '),
            data: {
                count: populated.lines.length,
                added,
                advanceDeducted: advanceTotal,
                flaggedEmployees: flagged,
                lines: await withAdvancePosition(populated.lines, populated.status),
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

        /**
         * Posting recognises the cost and the debt, not the cash. Salaries here
         * are often handed over in instalments, so the money leaves when a
         * payment is recorded — until then the net sits in Salaries Payable,
         * which is exactly what the employee is still owed.
         */
        if (netTotal > 0) {
            await postDoubleEntry({
                transactionDate: period.periodEnd,
                debitAccount: DEFAULT_SALARY_ACCOUNT,
                creditAccount: SALARY_PAYABLE_ACCOUNT,
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
        const [decorated] = await withAdvancePosition([populated.lines.id(lineId)], period.status);
        res.json({ success: true, data: decorated });
    } catch (e) {
        next(e);
    }
};

/** Shared by the single and bulk payment routes. */
async function findPostedLineOr404(lineId) {
    if (!toObjectId(lineId)) throw new AppError('Salary line not found', 404);
    const period = await Payroll.findOne({ 'lines._id': lineId });
    if (!period) throw new AppError('Salary line not found', 404);
    if (period.status !== 'posted') {
        throw new AppError('Post the payroll period before paying salaries from it', 400);
    }
    return { period, line: period.lines.id(lineId) };
}

/**
 * Write the cash movement for one salary payment: the debt raised at posting is
 * cleared and the money leaves.
 */
async function postPaymentToLedger({ period, line, payment, employeeLabel, userId }) {
    await postDoubleEntry({
        transactionDate: payment.paidOn,
        debitAccount: SALARY_PAYABLE_ACCOUNT,
        creditAccount: DEFAULT_CREDIT_ACCOUNT,
        amount: payment.amount,
        description: `Salary paid to ${employeeLabel} — ${period.label}`,
        referenceType: 'salary',
        referenceId: `PRPAY-${line._id}-${payment._id}`,
        userId,
    });
}

/**
 * Record a salary payment against one line.
 * @route POST /api/payroll/lines/:lineId/pay
 */
const payLine = async (req, res, next) => {
    try {
        const { period, line } = await findPostedLineOr404(req.params.lineId);

        const remaining = remainingOf(line);
        if (remaining <= 0) throw new AppError('This salary is already fully paid', 400);

        // Paying the whole remainder is the common case, so an empty amount
        // means "settle it".
        const amount = req.body?.amount == null || req.body.amount === ''
            ? remaining
            : round2(req.body.amount);
        if (!Number.isFinite(amount) || amount <= 0) {
            throw new AppError('Payment must be greater than zero', 400);
        }
        if (amount > remaining) {
            throw new AppError(`Payment cannot exceed the remaining ${remaining}`, 400);
        }

        line.payments.push({
            amount,
            paidOn: req.body?.paid_on ? new Date(req.body.paid_on) : new Date(),
            method: String(req.body?.method || 'cash').trim(),
            reference: String(req.body?.reference || '').trim(),
            notes: String(req.body?.notes || '').trim(),
            createdBy: getUserId(req),
        });
        line.paidAmount = round2(line.paidAmount + amount);
        period.updatedBy = getUserId(req);
        await period.save();

        const employee = await Employee.findById(line.employee).select('firstName lastName employeeCode').lean();
        await postPaymentToLedger({
            period,
            line,
            payment: line.payments[line.payments.length - 1],
            employeeLabel: [employee?.firstName, employee?.lastName].filter(Boolean).join(' ') || 'employee',
            userId: getUserId(req),
        });

        const populated = await findPeriodOr404(period._id, true);
        const updated = populated.lines.id(line._id);
        res.json({
            success: true,
            message: remainingOf(updated) > 0
                ? `Paid ${amount}; ${remainingOf(updated)} still remaining`
                : `Paid ${amount} — salary settled`,
            data: mapLine(updated),
        });
    } catch (e) { next(e); }
};

/**
 * Settle every unpaid line in a period in one go — the usual "pay everyone
 * today" action.
 * @route POST /api/payroll/periods/:id/pay-all
 */
const payPeriod = async (req, res, next) => {
    try {
        const period = await findPeriodOr404(req.params.id, true);
        if (period.status !== 'posted') {
            throw new AppError('Post the payroll period before paying salaries from it', 400);
        }

        const paidOn = req.body?.paid_on ? new Date(req.body.paid_on) : new Date();
        const method = String(req.body?.method || 'cash').trim();
        const userId = getUserId(req);

        let total = 0;
        let count = 0;
        const receipts = [];
        for (const line of period.lines) {
            const remaining = remainingOf(line);
            if (remaining <= 0) continue;
            line.payments.push({ amount: remaining, paidOn, method, notes: 'Paid with the whole period', createdBy: userId });
            line.paidAmount = round2(line.paidAmount + remaining);
            receipts.push({ line, payment: line.payments[line.payments.length - 1] });
            total = round2(total + remaining);
            count += 1;
        }

        if (!count) throw new AppError('Every salary in this period is already paid', 400);

        period.updatedBy = userId;
        await period.save();

        // Ledger rows are written after the save so a failed save cannot leave
        // cash movements behind for payments that were never recorded.
        for (const { line, payment } of receipts) {
            const emp = line.employee && typeof line.employee === 'object' ? line.employee : null;
            await postPaymentToLedger({
                period,
                line,
                payment,
                employeeLabel: emp ? [emp.firstName, emp.lastName].filter(Boolean).join(' ') : 'employee',
                userId,
            });
        }

        const populated = await findPeriodOr404(period._id, true);
        res.json({
            success: true,
            message: `${count} salar${count === 1 ? 'y' : 'ies'} paid, ${total} in total`,
            data: { period: mapPeriod(populated.toObject()), lines: await withAdvancePosition(populated.lines, populated.status) },
        });
    } catch (e) { next(e); }
};

/**
 * Undo a payment that was recorded by mistake.
 * @route DELETE /api/payroll/lines/:lineId/payments/:paymentId
 */
const deletePayment = async (req, res, next) => {
    try {
        const { period, line } = await findPostedLineOr404(req.params.lineId);
        const payment = line.payments.id(req.params.paymentId);
        if (!payment) throw new AppError('Payment not found', 404);

        const amount = round2(payment.amount);
        payment.deleteOne();
        line.paidAmount = Math.max(0, round2(line.paidAmount - amount));
        period.updatedBy = getUserId(req);
        await period.save();

        // Drop the cash movement too, otherwise the ledger keeps money leaving
        // for a payment the payroll no longer shows.
        await reverseEntries('salary', `PRPAY-${line._id}-${req.params.paymentId}`, getUserId(req));

        const populated = await findPeriodOr404(period._id, true);
        res.json({ success: true, message: `Payment of ${amount} removed`, data: mapLine(populated.lines.id(line._id)) });
    } catch (e) { next(e); }
};

/**
 * One employee's salary month by month, newest first.
 * @route GET /api/payroll/employees/:employeeId/history
 *
 * Answers the question a payroll clerk actually gets asked: what has this
 * person earned, what was held back, what have we paid them, and what do we
 * still owe — for this month and across the year.
 */
const employeeHistory = async (req, res, next) => {
    try {
        const employeeId = toObjectId(req.params.employeeId);
        if (!employeeId) throw new AppError('Invalid employee id', 400);

        const employee = await Employee.findById(employeeId)
            .select('firstName lastName employeeCode salary designation status').lean();
        if (!employee) throw new AppError('Employee not found', 404);

        // Only periods that actually carry a line for this employee.
        const periods = await Payroll.find({ 'lines.employee': employeeId })
            .sort({ periodStart: -1 }).lean();

        const months = [];
        for (const period of periods) {
            for (const line of period.lines || []) {
                if (String(line.employee) !== String(employeeId)) continue;
                months.push({
                    period_id: String(period._id),
                    period_label: period.label,
                    period_start: asDateOnly(period.periodStart),
                    period_end: asDateOnly(period.periodEnd),
                    period_status: period.status,
                    ...mapLine({ ...line, employee: null }),
                });
            }
        }

        const sum = (key) => round2(months.reduce((total, m) => total + (Number(m[key]) || 0), 0));
        const advances = await SalaryAdvance.find({ employee: employeeId })
            .sort({ issuedOn: -1 }).select('amount recovered status issuedOn reason').lean();

        res.json({
            success: true,
            data: {
                employee: {
                    id: String(employee._id),
                    name: [employee.firstName, employee.lastName].filter(Boolean).join(' '),
                    code: employee.employeeCode || '',
                    designation: employee.designation || '',
                    status: employee.status || '',
                    monthly_salary: round2(employee.salary),
                },
                months,
                totals: {
                    months: months.length,
                    gross: sum('gross_amount'),
                    deductions: sum('deductions'),
                    advance_recovered: sum('advance_deduction'),
                    net: sum('net_amount'),
                    paid: sum('paid_amount'),
                    remaining: sum('remaining_amount'),
                },
                advance_outstanding: round2(advances.reduce(
                    (total, a) => total + (a.status === 'outstanding' ? Math.max(0, a.amount - a.recovered) : 0), 0,
                )),
            },
        });
    } catch (e) { next(e); }
};

/**
 * Everyone who is still owed something, across every posted period.
 * @route GET /api/payroll/outstanding
 */
const outstandingSalaries = async (req, res, next) => {
    try {
        const periods = await Payroll.find({ status: 'posted' })
            .populate('lines.employee', 'firstName lastName employeeCode')
            .sort({ periodStart: -1 }).lean();

        const byEmployee = new Map();
        let total = 0;
        for (const period of periods) {
            for (const line of period.lines || []) {
                const remaining = remainingOf(line);
                if (remaining <= 0) continue;
                const emp = line.employee && typeof line.employee === 'object' ? line.employee : null;
                const key = String(emp?._id || line.employee);
                const entry = byEmployee.get(key) || {
                    employee_id: key,
                    employee_name: emp ? [emp.firstName, emp.lastName].filter(Boolean).join(' ') : '',
                    employee_code: emp?.employeeCode || '',
                    remaining: 0,
                    months: [],
                };
                entry.remaining = round2(entry.remaining + remaining);
                entry.months.push({ period_label: period.label, remaining });
                byEmployee.set(key, entry);
                total = round2(total + remaining);
            }
        }

        res.json({
            success: true,
            data: [...byEmployee.values()].sort((a, b) => b.remaining - a.remaining),
            summary: { total_outstanding: total, employees: byEmployee.size },
        });
    } catch (e) { next(e); }
};

module.exports = {
    listPeriods,
    createPeriod,
    deletePeriod,
    getPeriodLines,
    generateLines,
    lockPeriod,
    postPeriod,
    updateLine,
    payLine,
    payPeriod,
    deletePayment,
    employeeHistory,
    outstandingSalaries,
};
