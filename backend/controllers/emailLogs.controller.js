const { EmailLog } = require('../models');

exports.list = async (req, res, next) => {
  try {
    const { page = 1, limit = 50, status, recipient, usageId, templateId, dateFrom, dateTo } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (recipient) filter.recipient = { $regex: recipient, $options: 'i' };
    if (usageId) filter.usage = usageId;
    if (templateId) filter.template = templateId;
    if (dateFrom || dateTo) {
      filter.createdAt = {};
      if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
      if (dateTo) filter.createdAt.$lte = new Date(dateTo);
    }

    const logs = await EmailLog.find(filter)
      .populate('usage', 'name key')
      .populate('template', 'templateName subject version status isActive')
      .populate('sentBy', 'firstName lastName email')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    const total = await EmailLog.countDocuments(filter);
    const stats = {
      sent: await EmailLog.countDocuments({ status: 'sent' }),
      failed: await EmailLog.countDocuments({ status: 'failed' }),
      bounced: await EmailLog.countDocuments({ status: 'bounced' }),
      queued: await EmailLog.countDocuments({ status: 'queued' }),
    };

    res.json({ success: true, data: { logs, total, stats, page: Number(page), limit: Number(limit) } });
  } catch (error) {
    next(error);
  }
};

exports.getById = async (req, res, next) => {
  try {
    const log = await EmailLog.findById(req.params.id)
      .populate('usage', 'name key')
      .populate('template', 'templateName subject version status isActive')
      .populate('sentBy', 'firstName lastName email');
    if (!log) return res.status(404).json({ success: false, message: 'Log not found' });
    res.json({ success: true, data: { log } });
  } catch (error) {
    next(error);
  }
};

exports.stats = async (req, res, next) => {
  try {
    const [sent, failed, bounced, queued, total] = await Promise.all([
      EmailLog.countDocuments({ status: 'sent' }),
      EmailLog.countDocuments({ status: 'failed' }),
      EmailLog.countDocuments({ status: 'bounced' }),
      EmailLog.countDocuments({ status: 'queued' }),
      EmailLog.countDocuments(),
    ]);

    const recentActivity = await EmailLog.find()
      .sort({ createdAt: -1 })
      .limit(10)
      .select('recipient subject status usage template createdAt executionTime errorMessage')
      .populate('usage', 'name key')
      .populate('template', 'templateName version')
      .lean();

    res.json({ success: true, data: { sent, failed, bounced, queued, total, recentActivity } });
  } catch (error) {
    next(error);
  }
};
