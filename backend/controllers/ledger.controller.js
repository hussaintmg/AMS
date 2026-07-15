const LedgerEntry = require('../models/LedgerEntry.model');
const AppError = require('../utils/AppError');

const getUserId = (req) => req.user?.id || req.user?._id;

exports.listLedger = async (req, res, next) => {
  try {
    const { search, referenceType, account, from, to, page = 1, limit = 50 } = req.query;
    const filter = { isDeleted: false };
    if (search) {
      filter.$or = [
        { description: { $regex: search, $options: 'i' } },
        { account: { $regex: search, $options: 'i' } },
        { referenceId: { $regex: search, $options: 'i' } },
      ];
    }
    if (referenceType) filter.referenceType = referenceType;
    if (account) filter.account = account;
    if (from || to) {
      filter.transactionDate = {};
      if (from) filter.transactionDate.$gte = new Date(from);
      if (to) { const end = new Date(to); end.setHours(23, 59, 59, 999); filter.transactionDate.$lte = end; }
    }

    const allItems = await LedgerEntry.find(filter)
      .populate('createdBy', 'firstName lastName email')
      .sort({ transactionDate: 1, createdAt: 1 }).lean();
    let openingBalance = 0;
    if (from) {
      const openingFilter = { isDeleted: false, transactionDate: { $lt: new Date(from) } };
      if (account) openingFilter.account = account;
      const opening = await LedgerEntry.aggregate([{ $match: openingFilter }, { $group: { _id: null, debit: { $sum: '$debit' }, credit: { $sum: '$credit' } } }]);
      openingBalance = (opening[0]?.debit || 0) - (opening[0]?.credit || 0);
    }
    let runningBalance = openingBalance;
    const withBalance = allItems.map((item) => {
      runningBalance += Number(item.debit || 0) - Number(item.credit || 0);
      return { ...item, runningBalance };
    });
    const total = withBalance.length;
    const reversed = withBalance.reverse();
    const items = reversed.slice((Number(page) - 1) * Number(limit), Number(page) * Number(limit));
    const totalDebit = allItems.reduce((sum, item) => sum + Number(item.debit || 0), 0);
    const totalCredit = allItems.reduce((sum, item) => sum + Number(item.credit || 0), 0);

    res.json({
      success: true,
      data: {
        rows: items, total, page: Number(page), limit: Number(limit),
        summary: { openingBalance, totalDebit, totalCredit, closingBalance: openingBalance + totalDebit - totalCredit }
      }
    });
  } catch (error) { next(error); }
};

exports.getAccounts = async (_req, res, next) => {
  try {
    const accounts = await LedgerEntry.distinct('account', { isDeleted: false, account: { $nin: [null, ''] } });
    res.json({ success: true, data: { accounts: accounts.sort((a, b) => a.localeCompare(b)) } });
  } catch (error) { next(error); }
};

exports.createManualEntry = async (req, res, next) => {
  try {
    const { transactionDate, debitAccount, creditAccount, amount, description } = req.body;
    const journalAmount = Number(amount || 0);
    if (!transactionDate || !debitAccount?.trim() || !creditAccount?.trim() || !description?.trim()) throw new AppError('Date, debit account, credit account and description are required', 400);
    if (debitAccount.trim() === creditAccount.trim()) throw new AppError('Debit and credit accounts must be different', 400);
    if (journalAmount <= 0) throw new AppError('Amount must be greater than zero', 400);
    const referenceId = `JV-${new Date().getFullYear()}-${Date.now().toString().slice(-8)}`;
    const base = { transactionDate, description: description.trim(), referenceType: 'manual', referenceId, createdBy: getUserId(req) };
    const entries = await LedgerEntry.create([
      { ...base, account: debitAccount.trim(), debit: journalAmount, credit: 0 },
      { ...base, account: creditAccount.trim(), debit: 0, credit: journalAmount },
    ]);
    res.status(201).json({ success: true, message: 'Balanced journal entry posted', data: { entries, referenceId } });
  } catch (error) { next(error); }
};

exports.getLedgerEntry = async (req, res, next) => {
  try {
    const item = await LedgerEntry.findOne({ _id: req.params.id, isDeleted: false })
      .populate('createdBy', 'firstName lastName email');
    if (!item) throw new AppError('Ledger entry not found', 404);
    res.json({ success: true, data: { entry: item } });
  } catch (error) { next(error); }
};

exports.getStats = async (req, res, next) => {
  try {
    const [total, summary] = await Promise.all([
      LedgerEntry.countDocuments({ isDeleted: false }),
      LedgerEntry.aggregate([
        { $match: { isDeleted: false } },
        { $group: { _id: null, totalDebit: { $sum: '$debit' }, totalCredit: { $sum: '$credit' } } },
      ]),
    ]);
    const balance = (summary[0]?.totalDebit || 0) - (summary[0]?.totalCredit || 0);
    res.json({ success: true, data: { total, totalDebit: summary[0]?.totalDebit || 0, totalCredit: summary[0]?.totalCredit || 0, balance } });
  } catch (error) { next(error); }
};
