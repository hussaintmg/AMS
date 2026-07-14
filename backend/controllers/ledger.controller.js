const LedgerEntry = require('../models/LedgerEntry.model');
const AppError = require('../utils/AppError');

const getUserId = (req) => req.user?.id || req.user?._id;

exports.listLedger = async (req, res, next) => {
  try {
    const { search, referenceType, from, to, page = 1, limit = 50 } = req.query;
    const filter = { isDeleted: false };
    if (search) {
      filter.$or = [
        { description: { $regex: search, $options: 'i' } },
        { account: { $regex: search, $options: 'i' } },
        { referenceId: { $regex: search, $options: 'i' } },
      ];
    }
    if (referenceType) filter.referenceType = referenceType;
    if (from || to) {
      filter.transactionDate = {};
      if (from) filter.transactionDate.$gte = new Date(from);
      if (to) filter.transactionDate.$lte = new Date(to);
    }

    const items = await LedgerEntry.find(filter)
      .populate('createdBy', 'firstName lastName email')
      .sort({ transactionDate: -1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    const total = await LedgerEntry.countDocuments(filter);

    const summary = await LedgerEntry.aggregate([
      { $match: filter },
      { $group: { _id: null, totalDebit: { $sum: '$debit' }, totalCredit: { $sum: '$credit' } } },
    ]);

    res.json({
      success: true,
      data: {
        rows: items, total, page: Number(page), limit: Number(limit),
        summary: { totalDebit: summary[0]?.totalDebit || 0, totalCredit: summary[0]?.totalCredit || 0 }
      }
    });
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
