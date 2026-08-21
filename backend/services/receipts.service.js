/**
 * Money coming in from a customer, posted where it actually lands.
 *
 * Until this existed, a sale recorded what the customer paid on the invoice and
 * stopped there: the cash account never moved, so the counter could take 15,000
 * in cash and the Accounts screen would still read zero. Expenses, salary
 * advances and payables already posted through the ledger; receipts did not.
 *
 * Every path that takes money for an invoice — vehicle, parts or custom, at the
 * counter or through Record Payment — calls `postCustomerReceipt`, which writes
 * the same balanced pair the rest of the system uses:
 *
 *     debit  <the money account>     credit  Accounts Receivable
 *
 * so the account balance, the balance sheet and the journal agree without
 * anybody reconciling them by hand.
 *
 * Which account? Whatever the operator chose, else whatever the payment method
 * is wired to, else the sensible account for that kind of money, else petty
 * cash — the client's stated default. Nothing is ever guessed silently: the
 * account that was used is returned so the caller can store and show it.
 */
const logger = require('../utils/logger');
const accounts = require('./accounts.service');
const { postDoubleEntry, reverseEntries, isAlreadyPosted } = require('./ledgerPosting.service');

const RECEIVABLE_ACCOUNT = 'Accounts Receivable';

/** A payment method's kind → the kind of money account it settles into. */
const TYPE_TO_ACCOUNT = {
  cash: 'petty_cash',
  bank: 'ibft',
  transfer: 'ibft',
  cheque: 'ibft',
  card: 'card_machine',
  online: 'online_payment',
  wallet: 'online_payment',
};

const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;

/**
 * The account a receipt belongs in.
 *
 * @param {object}  options
 * @param {string}  [options.accountId]     what the operator picked, if anything
 * @param {object}  [options.paymentMethod] resolved PaymentMethod ({ id, name, type, accountId })
 * @returns {Promise<object|null>} an Account document, or null when none exists yet
 */
async function accountForPayment({ accountId = null, paymentMethod = null } = {}) {
  const chosen = accountId ? await accounts.resolveAccount(accountId) : null;
  if (chosen) return chosen;

  if (paymentMethod) {
    // A payment method may name its account outright (Payment Methods screen).
    if (paymentMethod.accountId) {
      const wired = await accounts.resolveAccount(paymentMethod.accountId);
      if (wired) return wired;
    }
    const Account = require('../models/Account.model');
    const wantedType = TYPE_TO_ACCOUNT[String(paymentMethod.type || '').toLowerCase()];
    if (wantedType) {
      const byType = await Account.findOne({ type: wantedType, isActive: { $ne: false } }).sort({ isDefault: -1, sortOrder: 1 });
      if (byType) return byType;
    }
    // "Cash", "IBFT", "Card Machine" — the method and the account often share a name.
    if (paymentMethod.name) {
      const byName = await accounts.resolveAccount(paymentMethod.name);
      if (byName) return byName;
    }
  }
  return accounts.pettyCashAccount();
}

/**
 * Post one customer receipt to the ledger and refresh the account balance.
 *
 * Idempotent on (referenceType, referenceId): calling it twice for the same
 * payment posts once, so a retried request cannot double the cash.
 *
 * Never throws into the caller's request — a sale must not fail because the
 * accounts module is not set up yet. Failures are logged and reported back in
 * the return value.
 *
 * @returns {Promise<{posted: boolean, account: object|null, reason?: string}>}
 */
async function postCustomerReceipt({
  amount,
  accountId = null,
  paymentMethod = null,
  date = null,
  description = '',
  referenceType = 'invoice_payment',
  referenceId,
  userId = null,
}) {
  const value = round2(amount);
  if (!(value > 0)) return { posted: false, account: null, reason: 'zero amount' };
  if (!referenceId) return { posted: false, account: null, reason: 'no reference' };
  try {
    if (await isAlreadyPosted(referenceType, referenceId)) {
      return { posted: false, account: null, reason: 'already posted' };
    }
    const account = await accountForPayment({ accountId, paymentMethod });
    if (!account) return { posted: false, account: null, reason: 'no money account configured' };
    await postDoubleEntry({
      transactionDate: date || new Date(),
      debitAccount: account.name,
      debitAccountRef: account._id,
      creditAccount: RECEIVABLE_ACCOUNT,
      amount: value,
      description: description || `Customer receipt ${referenceId}`,
      referenceType,
      referenceId,
      userId,
    });
    await accounts.syncBalance(account._id);
    return { posted: true, account };
  } catch (error) {
    logger.error(`[Receipts] Could not post ${referenceId}: ${error.message}`);
    return { posted: false, account: null, reason: error.message };
  }
}

/**
 * The deposit taken when a booking is raised.
 *
 * A booking deposit is money over the counter like any other, so it belongs in
 * an account the moment it is taken — not only later, if and when the booking
 * becomes an invoice. It gets its own reference type so it can be told apart
 * from the invoice receipts, and so converting the booking can carry it across
 * without banking it a second time (see `alreadyBanked` at the invoice end).
 */
async function postBookingDeposit({ bookingNumber, amount, accountId = null, paymentMethod = null, date = null, userId = null }) {
  return postCustomerReceipt({
    amount,
    accountId,
    paymentMethod,
    date,
    description: `Deposit taken with booking ${bookingNumber}`,
    referenceType: 'booking_deposit',
    referenceId: bookingNumber,
    userId,
  });
}

/** Undo the ledger rows for one receipt — used when an invoice is cancelled. */
async function reverseCustomerReceipt(referenceType, referenceId, userId = null) {
  try {
    const LedgerEntry = require('../models/LedgerEntry.model');
    const rows = await LedgerEntry.find({ referenceType, referenceId, isDeleted: false, accountRef: { $ne: null } }).lean();
    await reverseEntries(referenceType, referenceId, userId);
    for (const row of rows) await accounts.syncBalance(row.accountRef);
    return { reversed: rows.length > 0 };
  } catch (error) {
    logger.error(`[Receipts] Could not reverse ${referenceId}: ${error.message}`);
    return { reversed: false, reason: error.message };
  }
}

/**
 * Undo every receipt an invoice ever took — `INV-1` and `INV-1#<paymentId>`
 * alike — without the caller having to know how many there were.
 *
 * Cancelling used to walk `#1`…`#n` from a payment count, which quietly missed
 * any receipt whose suffix did not line up. Matching the invoice number itself
 * cannot miss one, and cannot reach a different invoice: the separator is the
 * only thing allowed after the number.
 */
async function reverseAllReceiptsFor(invoiceNumber, userId = null, referenceType = 'invoice_payment') {
  const LedgerEntry = require('../models/LedgerEntry.model');
  const escaped = String(invoiceNumber).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rows = await LedgerEntry.find({
    referenceType,
    referenceId: new RegExp(`^${escaped}(#|$)`),
    isDeleted: false,
  }).select('referenceId').lean();
  const references = [...new Set(rows.map((row) => row.referenceId))];
  for (const reference of references) await reverseCustomerReceipt(referenceType, reference, userId);
  return { reversed: references.length };
}

module.exports = {
  RECEIVABLE_ACCOUNT,
  TYPE_TO_ACCOUNT,
  accountForPayment,
  postCustomerReceipt,
  postBookingDeposit,
  reverseCustomerReceipt,
  reverseAllReceiptsFor,
};
