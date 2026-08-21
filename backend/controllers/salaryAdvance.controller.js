/**
 * Salary advances — money paid to an employee before payday, and the running
 * balance of what they still owe back.
 *
 * An advance is a receivable, not an expense: issuing one moves cash out but
 * costs nothing yet. The expense lands when payroll recovers it, which is why
 * recovery is driven from the payroll posting rather than from here.
 *
 * Maintained by Hussain Developer
 * AMS ERP
 */

const mongoose = require('mongoose');
const SalaryAdvance = require('../models/SalaryAdvance.model');
const Employee = require('../models/Employee.model');
const { AppError } = require('../middleware/errorHandler');
const {
  postDoubleEntry,
  reverseEntries,
  DEFAULT_CREDIT_ACCOUNT,
} = require('../services/ledgerPosting.service');

/** The receivable an unrecovered advance sits in. */
const ADVANCE_ACCOUNT = 'Salary Advances';

const getUserId = (req) => req.user?._id || req.user?.id || null;
const toObjectId = (value) => (mongoose.Types.ObjectId.isValid(value) ? new mongoose.Types.ObjectId(value) : null);
const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;

const employeeName = (emp) =>
  (emp && typeof emp === 'object'
    ? [emp.firstName, emp.lastName].filter(Boolean).join(' ')
    : '') || '';

const mapAdvance = (advance) => {
  const emp = advance.employee && typeof advance.employee === 'object' ? advance.employee : null;
  const amount = round2(advance.amount);
  const recovered = round2(advance.recovered);
  return {
    id: String(advance._id),
    employee_id: emp ? String(emp._id) : String(advance.employee),
    employee_name: employeeName(emp),
    employee_code: emp?.employeeCode || '',
    amount,
    recovered,
    // `balance` is the number the whole feature exists for.
    balance: advance.status === 'cancelled' ? 0 : round2(Math.max(0, amount - recovered)),
    issued_on: advance.issuedOn ? new Date(advance.issuedOn).toISOString().slice(0, 10) : null,
    reason: advance.reason || '',
    status: advance.status,
    created_at: advance.createdAt,
  };
};

/**
 * Total still owed by one employee. Payroll calls this to decide how much to
 * hold back, so it must only count advances that are actually outstanding.
 */
async function outstandingFor(employeeId) {
  const rows = await SalaryAdvance.find({ employee: employeeId, status: 'outstanding' })
    .select('amount recovered').lean();
  return round2(rows.reduce((sum, row) => sum + Math.max(0, (row.amount || 0) - (row.recovered || 0)), 0));
}

/** Same thing for many employees at once, as a Map keyed by employee id. */
async function outstandingByEmployee(employeeIds) {
  const rows = await SalaryAdvance.find({
    ...(employeeIds ? { employee: { $in: employeeIds } } : {}),
    status: 'outstanding',
  }).select('employee amount recovered').lean();

  const map = new Map();
  for (const row of rows) {
    const key = String(row.employee);
    const owed = Math.max(0, (row.amount || 0) - (row.recovered || 0));
    map.set(key, round2((map.get(key) || 0) + owed));
  }
  return map;
}

/**
 * Take `amount` off an employee's outstanding advances, oldest first, and say
 * how much was actually taken. Callers must not assume the full amount was
 * applied — an advance may have been repaid in cash since the figure was worked
 * out, and nothing may recover more than is owed.
 */
async function recoverFromAdvances(employeeId, amount, userId) {
  let remaining = round2(amount);
  if (remaining <= 0) return { applied: 0, advances: [] };

  const advances = await SalaryAdvance.find({ employee: employeeId, status: 'outstanding' })
    .sort({ issuedOn: 1, createdAt: 1 });

  const touched = [];
  for (const advance of advances) {
    if (remaining <= 0) break;
    const owed = Math.max(0, round2(advance.amount - advance.recovered));
    if (owed <= 0) continue;
    const take = Math.min(owed, remaining);
    advance.recovered = round2(advance.recovered + take);
    advance.updatedBy = userId || null;
    await advance.save(); // the pre-save hook flips it to "settled" when clear
    touched.push({ id: String(advance._id), applied: take });
    remaining = round2(remaining - take);
  }

  return { applied: round2(amount - remaining), advances: touched };
}

/**
 * List advances, newest first.
 * @route GET /api/salary-advances?employee_id=&status=
 */
const list = async (req, res, next) => {
  try {
    const filter = {};
    const employeeId = toObjectId(req.query.employee_id);
    if (req.query.employee_id && !employeeId) throw new AppError('Invalid employee id', 400);
    if (employeeId) filter.employee = employeeId;
    if (req.query.status) filter.status = String(req.query.status);

    const advances = await SalaryAdvance.find(filter)
      .populate('employee', 'firstName lastName employeeCode')
      .sort({ issuedOn: -1, createdAt: -1 })
      .lean();

    const mapped = advances.map(mapAdvance);
    res.json({
      success: true,
      data: mapped,
      summary: {
        total_issued: round2(mapped.reduce((sum, a) => sum + a.amount, 0)),
        total_recovered: round2(mapped.reduce((sum, a) => sum + a.recovered, 0)),
        total_outstanding: round2(mapped.reduce((sum, a) => sum + a.balance, 0)),
      },
    });
  } catch (e) { next(e); }
};

/**
 * What one employee still owes.
 * @route GET /api/salary-advances/outstanding/:employeeId
 */
const outstanding = async (req, res, next) => {
  try {
    const employeeId = toObjectId(req.params.employeeId);
    if (!employeeId) throw new AppError('Invalid employee id', 400);
    res.json({ success: true, data: { employee_id: String(employeeId), outstanding: await outstandingFor(employeeId) } });
  } catch (e) { next(e); }
};

/**
 * Issue an advance. Cash leaves now; the cost is recognised when payroll
 * recovers it, so this posts to a receivable rather than to salary expense.
 * @route POST /api/salary-advances
 */
const create = async (req, res, next) => {
  try {
    const { employee_id, amount, issued_on, reason } = req.body;
    const employeeId = toObjectId(employee_id);
    if (!employeeId) throw new AppError('Select an employee', 400);

    const employee = await Employee.findOne({ _id: employeeId, isDeleted: { $ne: true } })
      .select('firstName lastName employeeCode salary').lean();
    if (!employee) throw new AppError('Employee not found', 404);

    const value = round2(amount);
    if (!Number.isFinite(value) || value <= 0) throw new AppError('Advance amount must be greater than zero', 400);

    // An advance larger than a month's salary can never be cleared by one
    // payroll run, so say so plainly instead of silently carrying it forever.
    const salary = round2(employee.salary);
    const alreadyOwed = await outstandingFor(employeeId);
    if (salary > 0 && value + alreadyOwed > salary) {
      throw new AppError(
        `That would put ${employeeName(employee)} at ${round2(value + alreadyOwed)} against a salary of ${salary}. Reduce the advance or recover the existing ${alreadyOwed} first.`,
        400,
      );
    }

    const advance = await SalaryAdvance.create({
      employee: employeeId,
      amount: value,
      issuedOn: issued_on ? new Date(issued_on) : new Date(),
      reason: String(reason || '').trim(),
      createdBy: getUserId(req),
    });

    // The cash leaves a named money account — petty cash unless the form said
    // otherwise — so the account balances and the balance sheet reflect it.
    const accountsService = require('../services/accounts.service');
    const paidFrom = (await accountsService.resolveAccount(req.body.accountId || req.body.account)) || (await accountsService.pettyCashAccount());
    // The client's rule: advances come out of petty cash. They cannot come out
    // of a petty cash that does not hold them.
    await accountsService.assertSufficientFunds(paidFrom, value, {
      allowNegative: req.body.allowNegative === true, action: 'be advanced',
    });
    await postDoubleEntry({
      transactionDate: advance.issuedOn,
      debitAccount: ADVANCE_ACCOUNT,
      creditAccount: paidFrom ? paidFrom.name : DEFAULT_CREDIT_ACCOUNT,
      creditAccountRef: paidFrom ? paidFrom._id : null,
      amount: value,
      description: `Salary advance to ${employeeName(employee)}${employee.employeeCode ? ` (${employee.employeeCode})` : ''}`,
      referenceType: 'salary',
      referenceId: `ADV-${advance._id}`,
      userId: getUserId(req),
    });
    if (paidFrom) await accountsService.syncBalance(paidFrom._id);

    const populated = await SalaryAdvance.findById(advance._id)
      .populate('employee', 'firstName lastName employeeCode').lean();

    res.status(201).json({ success: true, message: 'Advance issued', data: mapAdvance(populated) });
  } catch (e) { next(e); }
};

/**
 * Employee hands cash back outside payroll.
 * @route POST /api/salary-advances/:id/repay
 */
const repay = async (req, res, next) => {
  try {
    const id = toObjectId(req.params.id);
    if (!id) throw new AppError('Advance not found', 404);
    const advance = await SalaryAdvance.findById(id);
    if (!advance) throw new AppError('Advance not found', 404);
    if (advance.status === 'cancelled') throw new AppError('This advance was cancelled', 400);

    const owed = round2(advance.amount - advance.recovered);
    if (owed <= 0) throw new AppError('This advance is already settled', 400);

    const value = round2(req.body?.amount);
    if (!Number.isFinite(value) || value <= 0) throw new AppError('Repayment must be greater than zero', 400);
    if (value > owed) throw new AppError(`Repayment cannot exceed the outstanding balance of ${owed}`, 400);

    advance.recovered = round2(advance.recovered + value);
    advance.updatedBy = getUserId(req);
    await advance.save();

    // Cash comes back in (to a named account), the receivable shrinks.
    const accountsService = require('../services/accounts.service');
    const paidInto = (await accountsService.resolveAccount(req.body.accountId || req.body.account)) || (await accountsService.pettyCashAccount());
    await postDoubleEntry({
      transactionDate: new Date(),
      debitAccount: paidInto ? paidInto.name : DEFAULT_CREDIT_ACCOUNT,
      debitAccountRef: paidInto ? paidInto._id : null,
      creditAccount: ADVANCE_ACCOUNT,
      amount: value,
      description: `Salary advance repayment (advance ${advance._id})`,
      referenceType: 'salary',
      // Repayments are repeatable, so the reference has to be unique per event.
      referenceId: `ADVREP-${advance._id}-${Date.now()}`,
      userId: getUserId(req),
    });
    if (paidInto) await accountsService.syncBalance(paidInto._id);

    const populated = await SalaryAdvance.findById(advance._id)
      .populate('employee', 'firstName lastName employeeCode').lean();
    res.json({ success: true, message: 'Repayment recorded', data: mapAdvance(populated) });
  } catch (e) { next(e); }
};

/**
 * Cancel an advance that was never actually handed over.
 * @route DELETE /api/salary-advances/:id
 */
const cancel = async (req, res, next) => {
  try {
    const id = toObjectId(req.params.id);
    if (!id) throw new AppError('Advance not found', 404);
    const advance = await SalaryAdvance.findById(id);
    if (!advance) throw new AppError('Advance not found', 404);
    if (advance.status === 'cancelled') throw new AppError('This advance is already cancelled', 400);
    // Part of it has come back already; cancelling would lose that history.
    if (advance.recovered > 0) {
      throw new AppError('Some of this advance has already been recovered, so it cannot be cancelled', 400);
    }

    advance.status = 'cancelled';
    advance.updatedBy = getUserId(req);
    await advance.save();
    await reverseEntries('salary', `ADV-${advance._id}`, getUserId(req));

    res.json({ success: true, message: 'Advance cancelled' });
  } catch (e) { next(e); }
};

module.exports = {
  list,
  outstanding,
  create,
  repay,
  cancel,
  // Used by the payroll controller.
  outstandingFor,
  outstandingByEmployee,
  recoverFromAdvances,
  ADVANCE_ACCOUNT,
};
