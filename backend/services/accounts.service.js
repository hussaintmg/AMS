/**
 * Money accounts: balances, transfers, the petty-cash limit rule.
 *
 * Every figure here is read from the ledger (LedgerEntry rows carrying
 * `accountRef`, or the account's name for rows written before the ref
 * existed), so the balance sheet can never disagree with the journal.
 * `Account.currentBalance` is a convenience the cards show; `balanceOf()` is
 * the truth.
 */
const mongoose = require('mongoose');
const Account = require('../models/Account.model');
const AccountTransfer = require('../models/AccountTransfer.model');
const { LedgerEntry } = require('../models');
const { postDoubleEntry, reverseEntries } = require('./ledgerPosting.service');
const { nextDocNumber } = require('../utils/docNumber');
const AppError = require('../utils/AppError');

const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;

/** The ledger match for one account: rows referencing it, plus legacy rows under its name. */
const rowsOf = (account, extra = {}) => ({
  isDeleted: false,
  $or: [{ accountRef: account._id }, { accountRef: null, account: account.name }],
  ...extra,
});

/** Debit − credit over a date filter (an asset account: debits bring money in). */
async function movement(account, dateFilter = null) {
  const match = rowsOf(account, dateFilter ? { transactionDate: dateFilter } : {});
  const [row] = await LedgerEntry.aggregate([
    { $match: match },
    { $group: { _id: null, debit: { $sum: '$debit' }, credit: { $sum: '$credit' } } },
  ]);
  return { debit: round2(row?.debit), credit: round2(row?.credit) };
}

/** Balance right now: opening + everything ever posted. */
async function balanceOf(account) {
  const all = await movement(account);
  return round2((Number(account.openingBalance) || 0) + all.debit - all.credit);
}

/** Refresh `currentBalance` from the ledger. */
async function syncBalance(accountId) {
  const account = await Account.findById(accountId);
  if (!account) return null;
  account.currentBalance = await balanceOf(account);
  await account.save();
  return account.currentBalance;
}

/**
 * Opening / in / out / closing per account for a period — the balance sheet.
 * Without dates the period is "everything", so opening is the opening balance.
 */
async function balanceSheet({ from = null, to = null } = {}) {
  const accounts = await Account.find({ isActive: { $ne: false } }).sort({ sortOrder: 1, name: 1 }).lean();
  const rows = [];
  for (const account of accounts) {
    const before = from ? await movement(account, { $lt: from }) : { debit: 0, credit: 0 };
    const periodFilter = from || to ? { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) } : null;
    const period = await movement(account, periodFilter);
    const opening = round2((Number(account.openingBalance) || 0) + before.debit - before.credit);
    const closing = round2(opening + period.debit - period.credit);
    rows.push({
      id: account._id, account: account.name, code: account.code, type: account.type, status: account.status,
      limit: Number(account.limit) || 0, opening, money_in: period.debit, money_out: period.credit, closing,
      over_limit: Number(account.limit) > 0 && closing > Number(account.limit),
    });
  }
  return {
    rows,
    summary: {
      accounts: rows.length,
      opening: round2(rows.reduce((sum, row) => sum + row.opening, 0)),
      total_in: round2(rows.reduce((sum, row) => sum + row.money_in, 0)),
      total_out: round2(rows.reduce((sum, row) => sum + row.money_out, 0)),
      closing: round2(rows.reduce((sum, row) => sum + row.closing, 0)),
      over_limit: rows.filter((row) => row.over_limit).length,
    },
  };
}

/**
 * Refuse to take more out of an account than it holds.
 *
 * Petty cash is real money in a real drawer: it cannot go below zero, and a
 * balance that does is a sign the ledger has lost touch with the tin. Transfers
 * always checked this; expenses, salary advances, payable payments and manual
 * adjustments did not, so any of them could quietly overdraw an account and the
 * balance sheet would report a negative figure nobody could explain.
 *
 * The message names the account, what it actually holds and the shortfall, so
 * the operator knows the two ways out: move money in, or pick another account.
 *
 * `allowNegative` is the deliberate escape hatch — the caller passes it through
 * from the request when someone with the authority to do so insists (an account
 * whose opening balance was never entered, say).
 *
 * @param {object} account   an Account document
 * @param {number} amount    what is about to leave it
 * @param {object} [options]
 * @param {boolean} [options.allowNegative]
 * @param {string}  [options.action] what is being attempted, for the message
 */
async function assertSufficientFunds(account, amount, { allowNegative = false, action = 'pay' } = {}) {
  if (!account || allowNegative) return null;
  const value = round2(amount);
  if (!(value > 0)) return null;
  const held = await balanceOf(account);
  if (value <= held + 0.009) return held;
  const money = (number) => `PKR ${Number(number).toLocaleString('en-PK')}`;
  throw new AppError(
    `${account.name} holds ${money(held)}, so ${money(value)} cannot ${action} from it `
    + `— ${money(round2(value - held))} short. Transfer money in first, or choose another account.`,
    400,
  );
}

/** The default petty-cash account (isDefault, else the first petty_cash one). */
async function pettyCashAccount() {
  return (await Account.findOne({ type: 'petty_cash', isDefault: true, isActive: { $ne: false } }))
    || (await Account.findOne({ type: 'petty_cash', isActive: { $ne: false } }).sort({ sortOrder: 1 }));
}

/** The account a name or id refers to; null when nothing matches. */
async function resolveAccount(idOrName) {
  if (!idOrName) return null;
  if (mongoose.Types.ObjectId.isValid(idOrName)) {
    const byId = await Account.findById(idOrName);
    if (byId) return byId;
  }
  return Account.findOne({ name: new RegExp(`^${String(idOrName).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') });
}

/**
 * Move money between two accounts: one balanced ledger pair, one transfer row.
 * Refuses to overdraw the giving account unless `allowNegative`.
 */
async function transfer({ fromAccountId, toAccountId, amount, transferDate, reference, notes, reason = 'manual', userId, allowNegative = false }) {
  const value = round2(amount);
  if (!(value > 0)) throw new AppError('Transfer amount must be greater than zero', 400);
  const [from, to] = await Promise.all([Account.findById(fromAccountId), Account.findById(toAccountId)]);
  if (!from || !to) throw new AppError('Both accounts are required', 400);
  if (String(from._id) === String(to._id)) throw new AppError('From and to accounts must be different', 400);
  if (from.isActive === false || to.isActive === false) throw new AppError('Both accounts must be active', 400);
  await assertSufficientFunds(from, value, { allowNegative, action: 'be transferred' });
  const transferNumber = await nextDocNumber(AccountTransfer, 'transferNumber', 'TRF');
  const row = await AccountTransfer.create({
    transferNumber, fromAccount: from._id, toAccount: to._id, amount: value,
    transferDate: transferDate || new Date(), reference: reference || '', notes: notes || '', reason, createdBy: userId || null,
  });
  await postDoubleEntry({
    transactionDate: row.transferDate,
    debitAccount: to.name, debitAccountRef: to._id,
    creditAccount: from.name, creditAccountRef: from._id,
    amount: value,
    description: notes || `Transfer ${transferNumber}: ${from.name} → ${to.name}`,
    referenceType: 'transfer', referenceId: transferNumber, userId,
  });
  await Promise.all([syncBalance(from._id), syncBalance(to._id)]);
  return row;
}

async function reverseTransfer(transferId, userId) {
  const row = await AccountTransfer.findById(transferId);
  if (!row) throw new AppError('Transfer not found', 404);
  if (row.status === 'reversed') throw new AppError('Transfer already reversed', 400);
  await reverseEntries('transfer', row.transferNumber, userId);
  row.status = 'reversed'; row.reversedAt = new Date();
  await row.save();
  await Promise.all([syncBalance(row.fromAccount), syncBalance(row.toAccount)]);
  return row;
}

/**
 * The petty-cash limit rule. Returns what is over the limit and where it
 * should go; `sweep()` performs the transfer. Enforced server-side so it
 * cannot be skipped by calling the API directly.
 */
async function limitStatus(accountId = null) {
  const account = accountId ? await Account.findById(accountId) : await pettyCashAccount();
  if (!account) return null;
  const balance = await balanceOf(account);
  const limit = Number(account.limit) || 0;
  const over = limit > 0 && balance > limit;
  let sweepTo = account.sweepTo ? await Account.findById(account.sweepTo) : null;
  if (!sweepTo) sweepTo = await Account.findOne({ type: 'internal_company', isActive: { $ne: false } }).sort({ sortOrder: 1 });
  return {
    account: { id: account._id, name: account.name, type: account.type },
    balance, limit, over,
    excess: over ? round2(balance - limit) : 0,
    sweepTo: sweepTo ? { id: sweepTo._id, name: sweepTo.name } : null,
  };
}

async function sweep({ accountId = null, amount = null, userId }) {
  const status = await limitStatus(accountId);
  if (!status) throw new AppError('No petty cash account is configured', 400);
  if (!status.sweepTo) throw new AppError('No internal company account to transfer to', 400);
  const value = amount != null ? round2(amount) : status.excess;
  if (!(value > 0)) throw new AppError('Nothing to transfer — the balance is within its limit', 400);
  return transfer({
    fromAccountId: status.account.id, toAccountId: status.sweepTo.id, amount: value,
    reason: 'limit_sweep', notes: `Petty cash over its limit of ${status.limit.toLocaleString('en-PK')}; ${value.toLocaleString('en-PK')} moved to ${status.sweepTo.name}`, userId,
  });
}

module.exports = { movement, balanceOf, syncBalance, balanceSheet, pettyCashAccount, resolveAccount, assertSufficientFunds, transfer, reverseTransfer, limitStatus, sweep, rowsOf };
