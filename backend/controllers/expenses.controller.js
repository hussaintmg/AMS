const Expense = require('../models/Expense.model');
const ExpenseCategory = require('../models/ExpenseCategory.model');
const Employee = require('../models/Employee.model');
const AppError = require('../utils/AppError');
const {
  postDoubleEntry,
  isAlreadyPosted,
  DEFAULT_CREDIT_ACCOUNT,
  DEFAULT_EXPENSE_ACCOUNT,
} = require('../services/ledgerPosting.service');

const getUserId = (req) => req.user?.id || req.user?._id;

/**
 * Post an expense to the ledger: debit the expense account, credit cash.
 * Shared by postExpense and the 'posted' branch of toggleExpenseStatus so a
 * status change can never mark an expense posted without a ledger entry.
 */
async function postExpenseToLedger(item, req) {
  if (await isAlreadyPosted('expense', item.expenseNumber)) {
    throw new AppError('Expense already posted', 400);
  }
  if (!(Number(item.amount) > 0)) {
    throw new AppError('Cannot post an expense with a zero or negative amount', 400);
  }

  // Debit the expense category; credit the money account it was paid from —
  // petty cash unless the expense named another (`account` holds the money
  // account's name or id since 2026-08-18; older rows may hold an expense
  // account name, which then simply is not a money account and falls back).
  const accountsService = require('../services/accounts.service');
  const paidFrom = (await accountsService.resolveAccount(item.paidFromAccount || item.account)) || (await accountsService.pettyCashAccount());
  await postDoubleEntry({
    transactionDate: item.expenseDate,
    debitAccount: item.category || DEFAULT_EXPENSE_ACCOUNT,
    creditAccount: paidFrom ? paidFrom.name : DEFAULT_CREDIT_ACCOUNT,
    creditAccountRef: paidFrom ? paidFrom._id : null,
    amount: item.amount,
    description: item.description || `Expense ${item.expenseNumber}`,
    referenceType: 'expense',
    referenceId: item.expenseNumber,
    userId: getUserId(req),
  });
  if (paidFrom) {
    item.paidFromAccount = paidFrom._id;
    await accountsService.syncBalance(paidFrom._id);
  }

  item.status = 'posted';
  item.updatedBy = getUserId(req);
  await item.save();
}

const getBulkIds = (req) => {
  const ids = Array.isArray(req.body?.ids) ? [...new Set(req.body.ids.filter(Boolean))] : [];
  if (!ids.length) throw new AppError('Select at least one expense', 400);
  return ids;
};

exports.bulkDeleteExpenses = async (req, res, next) => {
  try {
    const ids = getBulkIds(req);
    const protectedCount = await Expense.countDocuments({ _id: { $in: ids }, isDeleted: false, status: 'posted' });
    if (protectedCount) throw new AppError('Posted expenses cannot be deleted', 400);
    const result = await Expense.deleteMany({ _id: { $in: ids } });
    res.json({ success: true, message: `${result.deletedCount} expense(s) deleted`, data: { modifiedCount: result.deletedCount } });
  } catch (error) { next(error); }
};

exports.bulkDeactivateExpenses = async (req, res, next) => {
  try {
    const ids = getBulkIds(req);
    const protectedCount = await Expense.countDocuments({ _id: { $in: ids }, isDeleted: false, status: 'posted' });
    if (protectedCount) throw new AppError('Posted expenses cannot be deactivated', 400);
    const result = await Expense.updateMany({ _id: { $in: ids }, isDeleted: false, isActive: { $ne: false } }, { $set: { isActive: false, updatedBy: getUserId(req) } });
    res.json({ success: true, message: `${result.modifiedCount} expense(s) deactivated`, data: { modifiedCount: result.modifiedCount } });
  } catch (error) { next(error); }
};

exports.listExpenses = async (req, res, next) => {
  try {
    const { search, category, status, from, to, page = 1, limit = 50 } = req.query;
    const filter = { isDeleted: false };
    if (search) {
      filter.$or = [
        { description: { $regex: search, $options: 'i' } },
        { expenseNumber: { $regex: search, $options: 'i' } },
        { vendor: { $regex: search, $options: 'i' } },
      ];
    }
    if (category) filter.category = category;
    if (status) filter.status = status;
    if (from || to) {
      filter.expenseDate = {};
      if (from) filter.expenseDate.$gte = new Date(from);
      if (to) filter.expenseDate.$lte = new Date(to);
    }

    const items = await Expense.find(filter)
      .populate('employee', 'firstName lastName employeeCode')
      .populate('createdBy', 'firstName lastName email')
      .sort({ expenseDate: -1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    const total = await Expense.countDocuments(filter);

    res.json({ success: true, data: { expenses: items, total, page: Number(page), limit: Number(limit) } });
  } catch (error) { next(error); }
};

exports.getExpense = async (req, res, next) => {
  try {
    const item = await Expense.findOne({ _id: req.params.id, isDeleted: false })
      .populate('employee', 'firstName lastName employeeCode')
      .populate('createdBy', 'firstName lastName email')
      .populate('updatedBy', 'firstName lastName email');
    if (!item) throw new AppError('Expense not found', 404);
    res.json({ success: true, data: { expense: item } });
  } catch (error) { next(error); }
};

exports.createExpense = async (req, res, next) => {
  try {
    const { category, account, employee, amount, expenseDate, description, vendor, status, paidFromAccount } = req.body;
    if (!category || amount == null || !expenseDate) {
      throw new AppError('Category, amount, and expense date are required', 400);
    }

    const year = new Date().getFullYear();
    const count = await Expense.countDocuments({ expenseNumber: { $regex: `EXP-${year}-` } });
    const expenseNumber = `EXP-${year}-${String(count + 1).padStart(5, '0')}`;

    const item = await Expense.create({
      expenseNumber, category, account, employee: employee || null,
      paidFromAccount: (paidFromAccount || account) && require('mongoose').Types.ObjectId.isValid(paidFromAccount || account) ? (paidFromAccount || account) : null,
      amount: Number(amount), expenseDate, description: description || '',
      vendor: vendor || '', status: status || 'draft',
      createdBy: getUserId(req), updatedBy: getUserId(req),
    });
    res.status(201).json({ success: true, message: 'Expense created', data: { expense: item } });
  } catch (error) { next(error); }
};

exports.updateExpense = async (req, res, next) => {
  try {
    const item = await Expense.findOne({ _id: req.params.id, isDeleted: false });
    if (!item) throw new AppError('Expense not found', 404);
    if (item.status === 'posted') throw new AppError('Posted expenses cannot be edited', 400);
    const updFields = ['category', 'account', 'employee', 'amount', 'expenseDate', 'description', 'vendor', 'status', 'paidFromAccount'];
    updFields.forEach(f => { if (req.body[f] !== undefined) item[f] = req.body[f]; });
    item.updatedBy = getUserId(req);
    await item.save();
    res.json({ success: true, message: 'Expense updated', data: { expense: item } });
  } catch (error) { next(error); }
};

exports.toggleExpenseStatus = async (req, res, next) => {
  try {
    const { status } = req.body;
    if (!['draft', 'submitted', 'approved', 'posted'].includes(status)) {
      throw new AppError('Invalid status', 400);
    }
    const item = await Expense.findOne({ _id: req.params.id, isDeleted: false });
    if (!item) throw new AppError('Expense not found', 404);

    if (status === 'posted') {
      // Route through the ledger so this path can't create a posted expense
      // that has no matching journal entry.
      if (item.status === 'posted') throw new AppError('Expense already posted', 400);
      await postExpenseToLedger(item, req);
    } else {
      if (item.status === 'posted') throw new AppError('Posted expenses cannot change status', 400);
      item.status = status;
      item.updatedBy = getUserId(req);
      await item.save();
    }
    res.json({ success: true, message: `Expense status updated to ${status}`, data: { expense: item } });
  } catch (error) { next(error); }
};

exports.postExpense = async (req, res, next) => {
  try {
    const item = await Expense.findOne({ _id: req.params.id, isDeleted: false });
    if (!item) throw new AppError('Expense not found', 404);
    if (item.status === 'posted') throw new AppError('Expense already posted', 400);
    await postExpenseToLedger(item, req);
    res.json({ success: true, message: 'Expense posted to ledger', data: { expense: item } });
  } catch (error) { next(error); }
};

exports.deleteExpense = async (req, res, next) => {
  try {
    const item = await Expense.findOne({ _id: req.params.id, isDeleted: false });
    if (!item) throw new AppError('Expense not found', 404);
    if (item.status === 'posted') throw new AppError('Posted expenses cannot be deleted', 400);
    await Expense.deleteOne({ _id: item._id });
    res.json({ success: true, message: 'Expense deleted' });
  } catch (error) { next(error); }
};

exports.getStats = async (req, res, next) => {
  try {
    const [total, draft, submitted, approved, posted] = await Promise.all([
      Expense.countDocuments({ isDeleted: false }),
      Expense.countDocuments({ isDeleted: false, status: 'draft' }),
      Expense.countDocuments({ isDeleted: false, status: 'submitted' }),
      Expense.countDocuments({ isDeleted: false, status: 'approved' }),
      Expense.countDocuments({ isDeleted: false, status: 'posted' }),
    ]);
    const totalAmount = await Expense.aggregate([
      { $match: { isDeleted: false } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);
    res.json({
      success: true,
      data: { total, draft, submitted, approved, posted, totalAmount: totalAmount[0]?.total || 0 }
    });
  } catch (error) { next(error); }
};

// ─── Expense Categories ────────────────────────────────────────────

exports.listCategories = async (req, res, next) => {
  try {
    const items = await ExpenseCategory.find({ isDeleted: false })
      .populate('createdBy', 'firstName lastName email')
      .sort({ name: 1 });
    res.json({ success: true, data: items });
  } catch (error) { next(error); }
};

exports.createCategory = async (req, res, next) => {
  try {
    const { name, code, categoryGroup } = req.body;
    if (!name || !code) throw new AppError('Name and code are required', 400);
    const existing = await ExpenseCategory.findOne({ code: code.toUpperCase(), isDeleted: false });
    if (existing) throw new AppError('Category code already exists', 400);
    const item = await ExpenseCategory.create({
      name, code: code.toUpperCase(), categoryGroup: categoryGroup || 'general',
      createdBy: getUserId(req), updatedBy: getUserId(req),
    });
    res.status(201).json({ success: true, message: 'Category created', data: item });
  } catch (error) { next(error); }
};

exports.updateCategory = async (req, res, next) => {
  try {
    const item = await ExpenseCategory.findOne({ _id: req.params.id, isDeleted: false });
    if (!item) throw new AppError('Category not found', 404);
    const updFields = ['name', 'categoryGroup', 'isActive'];
    updFields.forEach(f => { if (req.body[f] !== undefined) item[f] = req.body[f]; });
    item.updatedBy = getUserId(req);
    await item.save();
    res.json({ success: true, message: 'Category updated', data: item });
  } catch (error) { next(error); }
};
