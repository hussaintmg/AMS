/**
 * Accounts & Petty Cash — /api/accounts
 *
 * The five money accounts (petty cash, IBFT, card machine, online payments,
 * internal company), transfers between them, payables (what we owe), the
 * receivables view (credit invoices, what we are owed) and the balance sheet.
 * All figures come from services/accounts.service.js, i.e. from the ledger.
 */
const mongoose = require('mongoose');
const Account = require('../models/Account.model');
const AccountTransfer = require('../models/AccountTransfer.model');
const Payable = require('../models/Payable.model');
const { Invoice, PartInvoice, CustomInvoice, Supplier } = require('../models');
const AppError = require('../utils/AppError');
const { nextDocNumber } = require('../utils/docNumber');
const { postDoubleEntry } = require('../services/ledgerPosting.service');
const accounts = require('../services/accounts.service');

const num = (value, fallback = 0) => (Number.isFinite(Number(value)) ? Number(value) : fallback);
const round2 = (value) => Math.round(num(value) * 100) / 100;
const getUserId = (req) => req.user?.id || req.user?._id;
const sanitizeId = (value) => (mongoose.Types.ObjectId.isValid(value) ? value : null);

const mapAccount = (account, balance) => ({
  id: account._id,
  name: account.name,
  code: account.code || '',
  type: account.type,
  description: account.description || '',
  opening_balance: num(account.openingBalance),
  current_balance: balance != null ? balance : num(account.currentBalance),
  limit: num(account.limit),
  over_limit: num(account.limit) > 0 && (balance != null ? balance : num(account.currentBalance)) > num(account.limit),
  status: account.status,
  sweep_to: account.sweepTo || null,
  is_default: account.isDefault === true,
  sort_order: num(account.sortOrder),
  is_active: account.isActive !== false,
  created_at: account.createdAt,
  updated_at: account.updatedAt,
});

// ── Accounts ─────────────────────────────────────────────────────────────

exports.list = async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.type) filter.type = req.query.type;
    if (req.query.status) filter.status = req.query.status;
    if (req.query.is_active !== undefined) filter.isActive = req.query.is_active === 'true';
    const rows = await Account.find(filter).sort({ sortOrder: 1, name: 1 }).lean();
    const data = [];
    for (const account of rows) data.push(mapAccount(account, await accounts.balanceOf(account)));
    res.json({ success: true, data });
  } catch (error) { next(error); }
};

exports.getOne = async (req, res, next) => {
  try {
    const account = await Account.findById(sanitizeId(req.params.id)).lean();
    if (!account) throw new AppError('Account not found', 404);
    const balance = await accounts.balanceOf(account);
    const entries = await require('../models').LedgerEntry.find(accounts.rowsOf(account))
      .sort({ transactionDate: -1, createdAt: -1 }).limit(100).lean();
    res.json({ success: true, data: { ...mapAccount(account, balance), entries } });
  } catch (error) { next(error); }
};

exports.create = async (req, res, next) => {
  try {
    const { name, code, type, description, openingBalance, limit, status, sweepTo, isDefault, sortOrder } = req.body;
    if (!String(name || '').trim()) throw new AppError('Account name is required', 400);
    const account = await Account.create({
      name: String(name).trim(), code: String(code || '').trim(), type: type || 'other', description: description || '',
      openingBalance: round2(openingBalance), currentBalance: round2(openingBalance), limit: Math.max(0, num(limit)),
      status: status || 'active', sweepTo: sanitizeId(sweepTo), isDefault: isDefault === true, sortOrder: num(sortOrder),
      createdBy: getUserId(req),
    });
    if (account.isDefault) await Account.updateMany({ _id: { $ne: account._id }, type: account.type }, { $set: { isDefault: false } });
    res.status(201).json({ success: true, message: 'Account created', data: mapAccount(account, account.currentBalance) });
  } catch (error) { next(error?.code === 11000 ? new AppError('An account with this name already exists', 400) : error); }
};

exports.update = async (req, res, next) => {
  try {
    const account = await Account.findById(sanitizeId(req.params.id));
    if (!account) throw new AppError('Account not found', 404);
    ['name', 'code', 'type', 'description', 'status'].forEach((field) => { if (req.body[field] !== undefined) account[field] = req.body[field]; });
    if (req.body.limit !== undefined) account.limit = Math.max(0, num(req.body.limit));
    if (req.body.sweepTo !== undefined) account.sweepTo = sanitizeId(req.body.sweepTo);
    if (req.body.isDefault !== undefined) account.isDefault = req.body.isDefault === true;
    if (req.body.sortOrder !== undefined) account.sortOrder = num(req.body.sortOrder);
    if (req.body.isActive !== undefined) account.isActive = req.body.isActive !== false;
    // Changing the opening balance re-bases everything; only allowed while no
    // ledger row touches the account.
    if (req.body.openingBalance !== undefined && round2(req.body.openingBalance) !== round2(account.openingBalance)) {
      const moved = await accounts.movement(account);
      if (moved.debit || moved.credit) throw new AppError('Opening balance cannot change once the account has ledger entries; post an adjustment instead', 400);
      account.openingBalance = round2(req.body.openingBalance);
    }
    account.updatedBy = getUserId(req);
    await account.save();
    if (account.isDefault) await Account.updateMany({ _id: { $ne: account._id }, type: account.type }, { $set: { isDefault: false } });
    await accounts.syncBalance(account._id);
    res.json({ success: true, message: 'Account updated', data: mapAccount(account, await accounts.balanceOf(account)) });
  } catch (error) { next(error?.code === 11000 ? new AppError('An account with this name already exists', 400) : error); }
};

exports.remove = async (req, res, next) => {
  try {
    const account = await Account.findById(sanitizeId(req.params.id));
    if (!account) throw new AppError('Account not found', 404);
    const moved = await accounts.movement(account);
    if (moved.debit || moved.credit) {
      account.isActive = false; account.status = 'closed'; account.updatedBy = getUserId(req);
      await account.save();
      return res.json({ success: true, message: 'Account has ledger entries, so it was closed rather than deleted' });
    }
    await Account.deleteOne({ _id: account._id });
    return res.json({ success: true, message: 'Account deleted' });
  } catch (error) { return next(error); }
};

/** Post an in/out adjustment (cash counted, a correction) against Suspense. */
exports.adjust = async (req, res, next) => {
  try {
    const account = await Account.findById(sanitizeId(req.params.id));
    if (!account) throw new AppError('Account not found', 404);
    const amount = round2(req.body.amount);
    if (!(amount > 0)) throw new AppError('Amount must be greater than zero', 400);
    const direction = req.body.direction === 'out' ? 'out' : 'in';
    // Money in corrects a balance upwards and is always allowed; money out is
    // still money leaving, and cannot take the account below zero.
    if (direction === 'out') {
      await accounts.assertSufficientFunds(account, amount, { allowNegative: req.body.allowNegative === true, action: 'be taken out' });
    }
    const referenceId = await nextDocNumber(AccountTransfer, 'transferNumber', 'ADJ');
    await postDoubleEntry({
      transactionDate: req.body.date ? new Date(req.body.date) : new Date(),
      debitAccount: direction === 'in' ? account.name : 'Suspense',
      debitAccountRef: direction === 'in' ? account._id : null,
      creditAccount: direction === 'in' ? 'Suspense' : account.name,
      creditAccountRef: direction === 'in' ? null : account._id,
      amount, description: req.body.notes || `Adjustment ${referenceId} on ${account.name}`,
      referenceType: 'account_adjust', referenceId, userId: getUserId(req),
    });
    await accounts.syncBalance(account._id);
    res.status(201).json({ success: true, message: 'Adjustment posted', data: mapAccount(account, await accounts.balanceOf(account)) });
  } catch (error) { next(error); }
};

// ── Summary / balance sheet / limit ──────────────────────────────────────

exports.summary = async (req, res, next) => {
  try {
    const rows = await Account.find({ isActive: { $ne: false } }).sort({ sortOrder: 1, name: 1 }).lean();
    const cards = [];
    for (const account of rows) cards.push(mapAccount(account, await accounts.balanceOf(account)));
    const limit = await accounts.limitStatus();
    const [openPayables] = await Payable.aggregate([{ $match: { status: { $in: ['open', 'partial', 'overdue'] } } }, { $group: { _id: null, total: { $sum: '$balance' }, count: { $sum: 1 } } }]);
    let receivables = { total: 0, count: 0 };
    for (const Model of [Invoice, PartInvoice, CustomInvoice]) {
      const [row] = await Model.aggregate([{ $match: { paymentTerm: 'credit', status: { $ne: 'cancelled' }, balanceAmount: { $gt: 0 } } }, { $group: { _id: null, total: { $sum: '$balanceAmount' }, count: { $sum: 1 } } }]);
      receivables.total += num(row?.total); receivables.count += num(row?.count);
    }
    res.json({ success: true, data: {
      accounts: cards,
      total_balance: round2(cards.reduce((sum, card) => sum + card.current_balance, 0)),
      limit,
      payables: { outstanding: round2(openPayables?.total), count: num(openPayables?.count) },
      receivables: { outstanding: round2(receivables.total), count: receivables.count },
    } });
  } catch (error) { next(error); }
};

exports.balanceSheet = async (req, res, next) => {
  try {
    const from = req.query.dateFrom || req.query.startDate ? new Date(req.query.dateFrom || req.query.startDate) : null;
    let to = req.query.dateTo || req.query.endDate ? new Date(req.query.dateTo || req.query.endDate) : null;
    if (to) to.setHours(23, 59, 59, 999);
    res.json({ success: true, data: await accounts.balanceSheet({ from, to }) });
  } catch (error) { next(error); }
};

exports.limitStatus = async (req, res, next) => {
  try { res.json({ success: true, data: await accounts.limitStatus(req.query.accountId || null) }); } catch (error) { next(error); }
};

exports.sweep = async (req, res, next) => {
  try {
    const row = await accounts.sweep({ accountId: req.body.accountId || null, amount: req.body.amount != null ? req.body.amount : null, userId: getUserId(req) });
    res.status(201).json({ success: true, message: `Transferred ${row.amount.toLocaleString('en-PK')} to the internal company account`, data: row });
  } catch (error) { next(error); }
};

// ── Transfers ────────────────────────────────────────────────────────────

const mapTransfer = (row) => ({
  id: row._id, transfer_number: row.transferNumber,
  from_account_id: row.fromAccount?._id || row.fromAccount, from_account: row.fromAccount?.name || '',
  to_account_id: row.toAccount?._id || row.toAccount, to_account: row.toAccount?.name || '',
  amount: num(row.amount), transfer_date: row.transferDate, reference: row.reference || '', notes: row.notes || '',
  reason: row.reason, status: row.status, created_at: row.createdAt,
});

exports.listTransfers = async (req, res, next) => {
  try {
    const filter = {};
    if (sanitizeId(req.query.accountId)) filter.$or = [{ fromAccount: req.query.accountId }, { toAccount: req.query.accountId }];
    if (req.query.dateFrom || req.query.dateTo) {
      filter.transferDate = {};
      if (req.query.dateFrom) filter.transferDate.$gte = new Date(req.query.dateFrom);
      if (req.query.dateTo) { const end = new Date(req.query.dateTo); end.setHours(23, 59, 59, 999); filter.transferDate.$lte = end; }
    }
    const page = Math.max(1, num(req.query.page, 1)); const limit = Math.max(1, num(req.query.limit, 20));
    const [rows, total] = await Promise.all([
      AccountTransfer.find(filter).populate('fromAccount', 'name').populate('toAccount', 'name').sort({ transferDate: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      AccountTransfer.countDocuments(filter),
    ]);
    res.json({ success: true, data: rows.map(mapTransfer), pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch (error) { next(error); }
};

exports.createTransfer = async (req, res, next) => {
  try {
    const row = await accounts.transfer({
      fromAccountId: req.body.fromAccountId, toAccountId: req.body.toAccountId, amount: req.body.amount,
      transferDate: req.body.transferDate ? new Date(req.body.transferDate) : null,
      reference: req.body.reference, notes: req.body.notes, reason: req.body.reason || 'manual', userId: getUserId(req),
    });
    const populated = await AccountTransfer.findById(row._id).populate('fromAccount', 'name').populate('toAccount', 'name').lean();
    res.status(201).json({ success: true, message: `Transfer ${row.transferNumber} completed`, data: mapTransfer(populated) });
  } catch (error) { next(error); }
};

exports.reverseTransfer = async (req, res, next) => {
  try {
    const row = await accounts.reverseTransfer(sanitizeId(req.params.id), getUserId(req));
    res.json({ success: true, message: `Transfer ${row.transferNumber} reversed` });
  } catch (error) { next(error); }
};

// ── Payables ─────────────────────────────────────────────────────────────

const mapPayable = (row) => ({
  id: row._id, payable_number: row.payableNumber,
  vendor_id: row.vendor?._id || row.vendor || null, vendor: row.vendorName || row.vendor?.name || '',
  description: row.description || '', category: row.category || '',
  amount: num(row.amount), paid_amount: num(row.paidAmount), balance: num(row.balance),
  issued_on: row.issuedOn, due_date: row.dueDate, source_type: row.sourceType, source_id: row.sourceId || '',
  status: row.status, notes: row.notes || '',
  payments: (row.payments || []).map((p) => ({ id: p._id, amount: num(p.amount), paid_on: p.paidOn, account_id: p.account?._id || p.account || null, account: p.account?.name || '', reference: p.reference || '', notes: p.notes || '' })),
  created_at: row.createdAt,
});

exports.listPayables = async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    else if (req.query.open === 'true') filter.status = { $in: ['open', 'partial', 'overdue'] };
    if (sanitizeId(req.query.vendorId)) filter.vendor = req.query.vendorId;
    if (req.query.search) { const re = new RegExp(String(req.query.search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'); filter.$or = [{ payableNumber: re }, { vendorName: re }, { description: re }]; }
    const page = Math.max(1, num(req.query.page, 1)); const limit = Math.max(1, num(req.query.limit, 20));
    const [rows, total] = await Promise.all([
      Payable.find(filter).populate('vendor', 'name').populate('payments.account', 'name').sort({ dueDate: 1, createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      Payable.countDocuments(filter),
    ]);
    res.json({ success: true, data: rows.map(mapPayable), pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch (error) { next(error); }
};

exports.createPayable = async (req, res, next) => {
  try {
    const amount = round2(req.body.amount);
    if (!(amount > 0)) throw new AppError('Amount must be greater than zero', 400);
    let vendorName = String(req.body.vendorName || req.body.vendor || '').trim();
    const vendorId = sanitizeId(req.body.vendorId);
    if (vendorId && !vendorName) { const supplier = await Supplier.findById(vendorId).lean(); vendorName = supplier?.name || ''; }
    if (!vendorName) throw new AppError('Vendor is required', 400);
    const payable = await Payable.create({
      payableNumber: await nextDocNumber(Payable, 'payableNumber', 'PAYB'),
      vendor: vendorId, vendorName, description: req.body.description || '', category: req.body.category || '',
      amount, paidAmount: 0, balance: amount,
      issuedOn: req.body.issuedOn ? new Date(req.body.issuedOn) : new Date(),
      dueDate: req.body.dueDate ? new Date(req.body.dueDate) : null,
      sourceType: ['purchase', 'expense', 'manual'].includes(req.body.sourceType) ? req.body.sourceType : 'manual',
      sourceId: req.body.sourceId || '', notes: req.body.notes || '', createdBy: getUserId(req),
    });
    res.status(201).json({ success: true, message: `Payable ${payable.payableNumber} created`, data: mapPayable(payable.toObject()) });
  } catch (error) { next(error); }
};

exports.updatePayable = async (req, res, next) => {
  try {
    const payable = await Payable.findById(sanitizeId(req.params.id));
    if (!payable) throw new AppError('Payable not found', 404);
    if (payable.status === 'settled') throw new AppError('A settled payable cannot be edited', 400);
    ['vendorName', 'description', 'category', 'notes', 'sourceType', 'sourceId'].forEach((field) => { if (req.body[field] !== undefined) payable[field] = req.body[field]; });
    if (req.body.vendorId !== undefined) payable.vendor = sanitizeId(req.body.vendorId);
    if (req.body.amount !== undefined) { const amount = round2(req.body.amount); if (amount < payable.paidAmount) throw new AppError('Amount cannot be less than what has been paid', 400); payable.amount = amount; }
    if (req.body.dueDate !== undefined) payable.dueDate = req.body.dueDate ? new Date(req.body.dueDate) : null;
    if (req.body.status === 'cancelled') payable.status = 'cancelled';
    payable.updatedBy = getUserId(req);
    await payable.save();
    res.json({ success: true, message: 'Payable updated', data: mapPayable(payable.toObject()) });
  } catch (error) { next(error); }
};

exports.deletePayable = async (req, res, next) => {
  try {
    const payable = await Payable.findById(sanitizeId(req.params.id));
    if (!payable) throw new AppError('Payable not found', 404);
    if (num(payable.paidAmount) > 0) throw new AppError('A payable with payments against it cannot be deleted; cancel it instead', 400);
    await Payable.deleteOne({ _id: payable._id });
    res.json({ success: true, message: 'Payable deleted' });
  } catch (error) { next(error); }
};

/** Pay some or all of a payable from an account: ledger pair + payment row. */
exports.payPayable = async (req, res, next) => {
  try {
    const payable = await Payable.findById(sanitizeId(req.params.id));
    if (!payable) throw new AppError('Payable not found', 404);
    if (payable.status === 'cancelled') throw new AppError('Cancelled payable', 400);
    const amount = round2(req.body.amount);
    if (!(amount > 0)) throw new AppError('Amount must be greater than zero', 400);
    if (amount > num(payable.balance) + 0.009) throw new AppError(`Payment exceeds the outstanding balance of ${num(payable.balance).toLocaleString('en-PK')}`, 400);
    const account = await accounts.requireAccount(req.body.accountId, { action: 'payment leaves' });
    await accounts.assertSufficientFunds(account, amount, { allowNegative: req.body.allowNegative === true, action: 'be paid' });
    const paidOn = req.body.paidOn ? new Date(req.body.paidOn) : new Date();
    payable.payments.push({ amount, paidOn, account: account._id, reference: req.body.reference || '', notes: req.body.notes || '', createdBy: getUserId(req) });
    payable.paidAmount = round2(num(payable.paidAmount) + amount);
    payable.updatedBy = getUserId(req);
    await payable.save();
    await postDoubleEntry({
      transactionDate: paidOn,
      debitAccount: 'Accounts Payable', creditAccount: account.name, creditAccountRef: account._id,
      amount, description: `Payment on ${payable.payableNumber} — ${payable.vendorName}`,
      referenceType: 'payable', referenceId: `${payable.payableNumber}#${payable.payments.length}`, userId: getUserId(req),
    });
    await accounts.syncBalance(account._id);
    res.status(201).json({ success: true, message: 'Payment recorded', data: mapPayable(payable.toObject()) });
  } catch (error) { next(error); }
};

// ── Receivables (credit invoices) ────────────────────────────────────────

exports.listReceivables = async (req, res, next) => {
  try {
    const now = new Date();
    const filter = { paymentTerm: 'credit', status: { $ne: 'cancelled' } };
    if (req.query.open !== 'false') filter.balanceAmount = { $gt: 0 };
    if (sanitizeId(req.query.customerId)) filter.customer = req.query.customerId;
    const rows = [];
    for (const [kind, Model] of [['vehicle', Invoice], ['parts', PartInvoice], ['custom', CustomInvoice]]) {
      const docs = await Model.find(filter).populate('customer', 'firstName lastName companyName phone').sort({ creditDueDate: 1 }).limit(500).lean();
      docs.forEach((doc) => {
        const due = doc.creditDueDate || doc.dueDate;
        rows.push({
          id: doc._id, kind, invoice_number: doc.invoiceNumber,
          customer_id: doc.customer?._id || null,
          customer: doc.walkIn && doc.walkInName ? doc.walkInName : ([doc.customer?.firstName, doc.customer?.lastName].filter(Boolean).join(' ') || doc.customer?.companyName || ''),
          phone: doc.customer?.phone || '', invoice_date: doc.invoiceDate || doc.createdAt, due_date: due,
          total_amount: num(doc.totalAmount), paid_amount: num(doc.paidAmount), outstanding: num(doc.balanceAmount),
          days_overdue: due ? Math.max(0, Math.floor((now - new Date(due)) / 864e5)) : 0,
          credit_status: doc.creditStatus || 'open',
        });
      });
    }
    rows.sort((a, b) => b.days_overdue - a.days_overdue || b.outstanding - a.outstanding);
    res.json({ success: true, data: rows, summary: { outstanding: round2(rows.reduce((sum, row) => sum + row.outstanding, 0)), overdue: round2(rows.filter((row) => row.days_overdue > 0).reduce((sum, row) => sum + row.outstanding, 0)), count: rows.length } });
  } catch (error) { next(error); }
};
