/**
 * Ledger Posting Service
 * ======================
 * Single place that turns a business event (expense posted, payroll posted)
 * into a balanced double-entry pair of LedgerEntry rows.
 *
 * Before this existed only the manual journal screen ever wrote to the ledger,
 * so "post to ledger" actions elsewhere silently produced nothing.
 *
 * Maintained by Hussain Developer
 * hussaintmerng@gmail.com | +92 319 1634446
 * AMS ERP
 */

const LedgerEntry = require('../models/LedgerEntry.model');
const AppError = require('../utils/AppError');

const DEFAULT_CREDIT_ACCOUNT = 'Cash';
const DEFAULT_EXPENSE_ACCOUNT = 'General Expenses';
const DEFAULT_SALARY_ACCOUNT = 'Salaries Expense';

/**
 * Write one balanced debit/credit pair sharing a referenceId.
 * Returns the created entries.
 */
async function postDoubleEntry({
    transactionDate,
    debitAccount,
    creditAccount,
    amount,
    description,
    referenceType,
    referenceId,
    userId,
}) {
    const value = Number(amount);

    if (!Number.isFinite(value) || value <= 0) {
        throw new AppError('Ledger amount must be greater than zero', 400);
    }
    const debit = String(debitAccount || '').trim();
    const credit = String(creditAccount || '').trim();
    if (!debit || !credit) {
        throw new AppError('Debit and credit accounts are required', 400);
    }
    if (debit === credit) {
        throw new AppError('Debit and credit accounts must be different', 400);
    }

    const base = {
        transactionDate: transactionDate || new Date(),
        description: description || '',
        referenceType,
        referenceId,
        createdBy: userId || null,
    };

    return LedgerEntry.create([
        { ...base, account: debit, debit: value, credit: 0 },
        { ...base, account: credit, debit: 0, credit: value },
    ]);
}

/** True when this reference already has ledger rows — keeps posting idempotent. */
async function isAlreadyPosted(referenceType, referenceId) {
    const existing = await LedgerEntry.countDocuments({
        referenceType,
        referenceId,
        isDeleted: false,
    });
    return existing > 0;
}

/** Remove the ledger rows for a reference (used when a posting is reversed). */
async function reverseEntries(referenceType, referenceId, userId) {
    return LedgerEntry.updateMany(
        { referenceType, referenceId, isDeleted: false },
        { $set: { isDeleted: true, updatedBy: userId || null } }
    );
}

module.exports = {
    postDoubleEntry,
    isAlreadyPosted,
    reverseEntries,
    DEFAULT_CREDIT_ACCOUNT,
    DEFAULT_EXPENSE_ACCOUNT,
    DEFAULT_SALARY_ACCOUNT,
};
