const queueService = require('../services/emailQueue.service');
const { EmailQueue } = require('../models');
const AppError = require('../utils/AppError');

exports.list = async (req, res, next) => {
  try {
    const { page = 1, limit = 50, status } = req.query;
    const filter = {};
    if (status) filter.status = status;

    const items = await EmailQueue.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    const total = await EmailQueue.countDocuments(filter);

    res.json({ success: true, data: { items, total, page: Number(page), limit: Number(limit) } });
  } catch (error) {
    next(error);
  }
};

exports.stats = async (req, res, next) => {
  try {
    const stats = await queueService.getQueueStats();
    res.json({ success: true, data: stats });
  } catch (error) {
    next(error);
  }
};

exports.retryAll = async (req, res, next) => {
  try {
    const result = await queueService.retryFailed();
    res.json({ success: true, message: 'Retrying failed items', data: result });
  } catch (error) {
    next(error);
  }
};

exports.retryOne = async (req, res, next) => {
  try {
    await queueService.retryOne(req.params.id);
    res.json({ success: true, message: 'Item queued for retry' });
  } catch (error) {
    next(error);
  }
};

exports.clearSent = async (req, res, next) => {
  try {
    await queueService.clearSent();
    res.json({ success: true, message: 'Sent items cleared' });
  } catch (error) {
    next(error);
  }
};

exports.remove = async (req, res, next) => {
  try {
    const item = await EmailQueue.findById(req.params.id);
    if (!item) throw new AppError('Queue item not found', 404);
    await item.deleteOne();
    res.json({ success: true, message: 'Queue item removed' });
  } catch (error) {
    next(error);
  }
};
