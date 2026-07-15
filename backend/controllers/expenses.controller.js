const Expense = require('../models/Expense.model');
const ExpenseCategory = require('../models/ExpenseCategory.model');
const Employee = require('../models/Employee.model');
const AppError = require('../utils/AppError');

const getUserId = (req) => req.user?.id || req.user?._id;

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
    const result = await Expense.updateMany({ _id: { $in: ids }, isDeleted: false }, { $set: { isDeleted: true, isActive: false, updatedBy: getUserId(req) } });
    res.json({ success: true, message: `${result.modifiedCount} expense(s) deleted`, data: { modifiedCount: result.modifiedCount } });
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
    const { category, account, employee, amount, expenseDate, description, vendor, status } = req.body;
    if (!category || amount == null || !expenseDate) {
      throw new AppError('Category, amount, and expense date are required', 400);
    }

    const year = new Date().getFullYear();
    const count = await Expense.countDocuments({ expenseNumber: { $regex: `EXP-${year}-` } });
    const expenseNumber = `EXP-${year}-${String(count + 1).padStart(5, '0')}`;

    const item = await Expense.create({
      expenseNumber, category, account, employee: employee || null,
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
    const updFields = ['category', 'account', 'employee', 'amount', 'expenseDate', 'description', 'vendor', 'status'];
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
    item.status = status;
    item.updatedBy = getUserId(req);
    await item.save();
    res.json({ success: true, message: `Expense status updated to ${status}`, data: { expense: item } });
  } catch (error) { next(error); }
};

exports.postExpense = async (req, res, next) => {
  try {
    const item = await Expense.findOne({ _id: req.params.id, isDeleted: false });
    if (!item) throw new AppError('Expense not found', 404);
    if (item.status === 'posted') throw new AppError('Expense already posted', 400);
    item.status = 'posted';
    item.updatedBy = getUserId(req);
    await item.save();
    res.json({ success: true, message: 'Expense posted to ledger', data: { expense: item } });
  } catch (error) { next(error); }
};

exports.deleteExpense = async (req, res, next) => {
  try {
    const item = await Expense.findOne({ _id: req.params.id, isDeleted: false });
    if (!item) throw new AppError('Expense not found', 404);
    if (item.status === 'posted') throw new AppError('Posted expenses cannot be deleted', 400);
    item.isDeleted = true;
    item.updatedBy = getUserId(req);
    await item.save();
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
