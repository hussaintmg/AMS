/**
 * Reports added 2026-08-18: credit receivables, payables, account balances
 * and gate passes. Each returns { summary, rows } — the summary feeds the KPI
 * cards, the rows feed the table and the export — so the Reports screen can
 * treat them all the same way.
 */
const mongoose = require('mongoose');
const { Invoice, PartInvoice, Customer, LedgerEntry } = require('../models');

const asNumber = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);
const customerName = (customer) => (customer
  ? ([customer.firstName, customer.lastName].filter(Boolean).join(' ') || customer.companyName || '')
  : '');
const send = (res, data) => res.json({ success: true, data });

const dateRange = (query = {}) => {
  const filter = {};
  const start = query.startDate || query.dateFrom;
  const end = query.endDate || query.dateTo;
  if (start) filter.$gte = new Date(start);
  if (end) { const stop = new Date(end); stop.setHours(23, 59, 59, 999); filter.$lte = stop; }
  return Object.keys(filter).length ? filter : null;
};

/** Days past due bucketed the way an ageing report expects. */
const ageBucket = (days) => {
  if (days <= 0) return 'current';
  if (days <= 30) return '1_30';
  if (days <= 60) return '31_60';
  if (days <= 90) return '61_90';
  return '90_plus';
};

/**
 * Credit invoices with money still owed, per customer, aged from their due
 * date. Vehicle, parts and custom invoices alike — the customer owes the
 * company whichever screen the invoice was raised on.
 */
const getCreditReceivables = async (req, res, next) => {
  try {
    const now = new Date();
    const range = dateRange(req.query);
    const base = { paymentTerm: 'credit', status: { $ne: 'cancelled' }, balanceAmount: { $gt: 0 } };
    if (range) base.invoiceDate = range;
    if (req.query.customerId && mongoose.Types.ObjectId.isValid(req.query.customerId)) base.customer = req.query.customerId;

    const models = [['vehicle', Invoice], ['parts', PartInvoice]];
    try { models.push(['custom', require('../models/CustomInvoice.model')]); } catch (error) { /* module not present */ }

    const invoices = [];
    for (const [kind, Model] of models) {
      const rows = await Model.find(base)
        .select('invoiceNumber customer walkIn walkInName invoiceDate creditDueDate dueDate totalAmount paidAmount balanceAmount creditStatus createdAt')
        .populate('customer', 'firstName lastName companyName phone email customerCode')
        .lean();
      rows.forEach((row) => invoices.push({ ...row, kind }));
    }

    const rows = invoices.map((invoice) => {
      const due = invoice.creditDueDate || invoice.dueDate || invoice.invoiceDate || invoice.createdAt;
      const daysOverdue = due ? Math.floor((now - new Date(due)) / (24 * 60 * 60 * 1000)) : 0;
      return {
        id: invoice._id,
        invoice_number: invoice.invoiceNumber,
        kind: invoice.kind,
        customer_id: invoice.customer?._id || null,
        customer: invoice.walkIn && invoice.walkInName ? invoice.walkInName : customerName(invoice.customer),
        phone: invoice.customer?.phone || '',
        invoice_date: invoice.invoiceDate || invoice.createdAt,
        due_date: due,
        total_amount: asNumber(invoice.totalAmount),
        paid_amount: asNumber(invoice.paidAmount),
        outstanding: asNumber(invoice.balanceAmount),
        days_overdue: Math.max(0, daysOverdue),
        bucket: ageBucket(daysOverdue),
        credit_status: invoice.creditStatus || (daysOverdue > 0 ? 'overdue' : 'open'),
      };
    }).sort((a, b) => b.days_overdue - a.days_overdue || b.outstanding - a.outstanding);

    const buckets = { current: 0, '1_30': 0, '31_60': 0, '61_90': 0, '90_plus': 0 };
    rows.forEach((row) => { buckets[row.bucket] += row.outstanding; });
    const overdue = rows.filter((row) => row.days_overdue > 0);
    const customers = new Set(rows.map((row) => String(row.customer_id || row.customer)));

    send(res, {
      summary: {
        outstanding: rows.reduce((sum, row) => sum + row.outstanding, 0),
        overdue: overdue.reduce((sum, row) => sum + row.outstanding, 0),
        overdue_count: overdue.length,
        invoice_count: rows.length,
        customers_with_credit: customers.size,
        avg_days_overdue: overdue.length ? Math.round(overdue.reduce((sum, row) => sum + row.days_overdue, 0) / overdue.length) : 0,
        buckets,
      },
      rows,
    });
  } catch (error) { next(error); }
};

/** Payables (what the company owes suppliers), aged from their due date. */
const getPayablesReport = async (req, res, next) => {
  try {
    let Payable;
    try { Payable = require('../models/Payable.model'); } catch (error) { return send(res, { summary: { outstanding: 0, overdue: 0, vendors: 0, count: 0 }, rows: [] }); }
    const now = new Date();
    const filter = { status: { $ne: 'cancelled' } };
    const range = dateRange(req.query);
    if (range) filter.createdAt = range;
    if (req.query.status) filter.status = req.query.status;
    // Populate the supplier: without it `item.vendor` is a raw ObjectId, and a
    // payable saved without a typed vendor name sent that object to the screen,
    // where React refuses to render it and the report went blank.
    const items = await Payable.find(filter).populate('vendor', 'name').sort({ dueDate: 1 }).lean();
    const rows = items.map((item) => {
      const daysOverdue = item.dueDate ? Math.floor((now - new Date(item.dueDate)) / (24 * 60 * 60 * 1000)) : 0;
      return {
        id: item._id,
        payable_number: item.payableNumber,
        vendor: item.vendorName || item.vendor?.name || '',
        description: item.description || '',
        source_type: item.sourceType || 'manual',
        due_date: item.dueDate || null,
        amount: asNumber(item.amount),
        paid_amount: asNumber(item.paidAmount),
        outstanding: asNumber(item.balance ?? (item.amount - item.paidAmount)),
        days_overdue: Math.max(0, daysOverdue),
        bucket: ageBucket(daysOverdue),
        status: item.status,
      };
    });
    const open = rows.filter((row) => row.outstanding > 0);
    const overdue = open.filter((row) => row.days_overdue > 0);
    const buckets = { current: 0, '1_30': 0, '31_60': 0, '61_90': 0, '90_plus': 0 };
    open.forEach((row) => { buckets[row.bucket] += row.outstanding; });
    send(res, {
      summary: {
        outstanding: open.reduce((sum, row) => sum + row.outstanding, 0),
        overdue: overdue.reduce((sum, row) => sum + row.outstanding, 0),
        overdue_count: overdue.length,
        count: rows.length,
        vendors: new Set(open.map((row) => row.vendor)).size,
        buckets,
      },
      rows,
    });
  } catch (error) { next(error); }
};

/**
 * Per-account balance sheet over a period: opening, in, out, closing — from
 * the ledger, so it can never disagree with the entries behind it.
 */
const getAccountBalances = async (req, res, next) => {
  try {
    let Account;
    try { Account = require('../models/Account.model'); } catch (error) { return send(res, { summary: { accounts: 0, total_in: 0, total_out: 0, closing: 0 }, rows: [] }); }
    const accounts = await Account.find({ isActive: { $ne: false } }).sort({ sortOrder: 1, name: 1 }).lean();
    const range = dateRange(req.query);
    const from = range?.$gte || null;
    const to = range?.$lte || null;

    const sumFor = async (accountId, name, dateFilter) => {
      const match = { isDeleted: false, $or: [{ accountRef: accountId }, { account: name, accountRef: null }] };
      if (dateFilter) match.transactionDate = dateFilter;
      const [row] = await LedgerEntry.aggregate([
        { $match: match },
        { $group: { _id: null, debit: { $sum: '$debit' }, credit: { $sum: '$credit' } } },
      ]);
      return { debit: asNumber(row?.debit), credit: asNumber(row?.credit) };
    };

    const rows = [];
    for (const account of accounts) {
      const before = from ? await sumFor(account._id, account.name, { $lt: from }) : { debit: 0, credit: 0 };
      const periodFilter = range ? { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) } : null;
      const period = await sumFor(account._id, account.name, periodFilter);
      // A money account is an asset: debits bring money in, credits take it out.
      const opening = asNumber(account.openingBalance) + before.debit - before.credit;
      const closing = opening + period.debit - period.credit;
      rows.push({
        id: account._id,
        account: account.name,
        code: account.code,
        type: account.type,
        status: account.status,
        limit: asNumber(account.limit),
        opening,
        money_in: period.debit,
        money_out: period.credit,
        closing,
        current_balance: asNumber(account.currentBalance),
        over_limit: asNumber(account.limit) > 0 && closing > asNumber(account.limit),
      });
    }
    send(res, {
      summary: {
        accounts: rows.length,
        opening: rows.reduce((sum, row) => sum + row.opening, 0),
        total_in: rows.reduce((sum, row) => sum + row.money_in, 0),
        total_out: rows.reduce((sum, row) => sum + row.money_out, 0),
        closing: rows.reduce((sum, row) => sum + row.closing, 0),
        over_limit: rows.filter((row) => row.over_limit).length,
      },
      rows,
    });
  } catch (error) { next(error); }
};

/** Gate passes: what came in and went out, and what is still inside. */
const getGatePassReport = async (req, res, next) => {
  try {
    let GatePass;
    try { GatePass = require('../models/GatePass.model'); } catch (error) { return send(res, { summary: { in_today: 0, out_today: 0, open: 0, items_received: 0 }, rows: [] }); }
    const filter = {};
    const range = dateRange(req.query);
    if (range) filter.createdAt = range;
    if (req.query.entryType) filter.entryType = req.query.entryType;
    if (req.query.direction) filter.direction = req.query.direction;
    const passes = await GatePass.find(filter)
      .populate('customer', 'firstName lastName companyName')
      .populate('linkedGatePass', 'gatePassNumber')
      .sort({ createdAt: -1 })
      .limit(1000)
      .lean();
    const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
    const rows = passes.map((pass) => ({
      id: pass._id,
      gate_pass_number: pass.gatePassNumber,
      direction: pass.direction,
      entry_type: pass.entryType,
      date: pass.createdAt,
      party: pass.entryType === 'customer'
        ? (pass.walkInName || customerName(pass.customer))
        : (pass.transporter || pass.driverName || ''),
      vehicle_number: pass.customerVehicleNumber || pass.truckNumber || '',
      ro_number: pass.roNumber || '',
      co_number: pass.coNumber || '',
      invoice_number: pass.invoiceNumber || '',
      linked_gate_pass: pass.linkedGatePass?.gatePassNumber || '',
      items: (pass.items || []).length,
      items_to_inventory: (pass.items || []).filter((item) => item.addToInventory).length,
      status: pass.status,
    }));
    const outLinked = new Set(passes.filter((pass) => pass.direction === 'out' && pass.linkedGatePass).map((pass) => String(pass.linkedGatePass._id || pass.linkedGatePass)));
    send(res, {
      summary: {
        in_today: passes.filter((pass) => pass.direction === 'in' && new Date(pass.createdAt) >= startOfDay).length,
        out_today: passes.filter((pass) => pass.direction === 'out' && new Date(pass.createdAt) >= startOfDay).length,
        open: passes.filter((pass) => pass.direction === 'in' && !outLinked.has(String(pass._id)) && pass.status !== 'closed').length,
        items_received: passes.filter((pass) => pass.direction === 'in').reduce((sum, pass) => sum + (pass.items || []).reduce((n, item) => n + asNumber(item.quantity), 0), 0),
        total: passes.length,
      },
      rows,
    });
  } catch (error) { next(error); }
};

module.exports = { getCreditReceivables, getPayablesReport, getAccountBalances, getGatePassReport };
