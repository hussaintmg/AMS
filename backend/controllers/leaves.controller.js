const Leave = require('../models/Leave.model');
const Employee = require('../models/Employee.model');
const AppError = require('../utils/AppError');

const getUserId = (req) => req.user?.id || req.user?._id;

const getBulkIds = (req) => {
  const ids = Array.isArray(req.body?.ids) ? [...new Set(req.body.ids.filter(Boolean))] : [];
  if (!ids.length) throw new AppError('Select at least one leave request', 400);
  return ids;
};

exports.bulkDeleteLeaves = async (req, res, next) => {
  try {
    const ids = getBulkIds(req);
    const result = await Leave.deleteMany({ _id: { $in: ids } });
    res.json({ success: true, message: `${result.deletedCount} leave request(s) deleted`, data: { modifiedCount: result.deletedCount } });
  } catch (error) { next(error); }
};

exports.bulkDeactivateLeaves = async (req, res, next) => {
  try {
    const ids = getBulkIds(req);
    const result = await Leave.updateMany({ _id: { $in: ids }, isDeleted: false, isActive: { $ne: false } }, { $set: { isActive: false, updatedBy: getUserId(req) } });
    res.json({ success: true, message: `${result.modifiedCount} leave request(s) deactivated`, data: { modifiedCount: result.modifiedCount } });
  } catch (error) { next(error); }
};

exports.listLeaves = async (req, res, next) => {
  try {
    const { search, status, leaveType, employee, from, to, page = 1, limit = 50 } = req.query;
    const filter = { isDeleted: false };
    if (search) filter['$or'] = [
      { reason: { $regex: search, $options: 'i' } },
    ];
    if (status) filter.status = status;
    if (leaveType) filter.leaveType = leaveType;
    if (employee) filter.employee = employee;
    if (from || to) {
      filter.startDate = {};
      if (from) filter.startDate.$gte = new Date(from);
      if (to) filter.startDate.$lte = new Date(to);
    }

    const items = await Leave.find(filter)
      .populate('employee', 'firstName lastName employeeCode')
      .populate('approvedBy', 'firstName lastName email')
      .populate('createdBy', 'firstName lastName email')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    const total = await Leave.countDocuments(filter);

    res.json({ success: true, data: { leaves: items, total, page: Number(page), limit: Number(limit) } });
  } catch (error) { next(error); }
};

exports.getLeave = async (req, res, next) => {
  try {
    const item = await Leave.findOne({ _id: req.params.id, isDeleted: false })
      .populate('employee', 'firstName lastName employeeCode department')
      .populate('approvedBy', 'firstName lastName email')
      .populate('createdBy', 'firstName lastName email');
    if (!item) throw new AppError('Leave not found', 404);
    res.json({ success: true, data: { leave: item } });
  } catch (error) { next(error); }
};

exports.createLeave = async (req, res, next) => {
  try {
    const { employee, leaveType, startDate, endDate, days, reason } = req.body;
    if (!employee || !leaveType || !startDate || !endDate || !days) {
      throw new AppError('Employee, leave type, start date, end date, and days are required', 400);
    }
    const empExists = await Employee.findOne({ _id: employee, isDeleted: false, isActive: true });
    if (!empExists) throw new AppError('Employee not found or inactive', 400);

    const item = await Leave.create({
      employee, leaveType, startDate, endDate, days, reason: reason || '',
      status: 'pending', createdBy: getUserId(req), updatedBy: getUserId(req),
    });
    res.status(201).json({ success: true, message: 'Leave request created', data: { leave: item } });
  } catch (error) { next(error); }
};

exports.updateLeave = async (req, res, next) => {
  try {
    const item = await Leave.findOne({ _id: req.params.id, isDeleted: false });
    if (!item) throw new AppError('Leave not found', 404);
    const updFields = ['leaveType', 'startDate', 'endDate', 'days', 'reason'];
    updFields.forEach(f => { if (req.body[f] !== undefined) item[f] = req.body[f]; });
    item.updatedBy = getUserId(req);
    await item.save();
    res.json({ success: true, message: 'Leave updated', data: { leave: item } });
  } catch (error) { next(error); }
};

exports.approveRejectLeave = async (req, res, next) => {
  try {
    const { status } = req.body;
    if (!['approved', 'rejected', 'cancelled'].includes(status)) {
      throw new AppError('Status must be approved, rejected, or cancelled', 400);
    }
    const item = await Leave.findOne({ _id: req.params.id, isDeleted: false });
    if (!item) throw new AppError('Leave not found', 404);
    if (item.status !== 'pending') throw new AppError('Only pending requests can be updated', 400);
    item.status = status;
    if (status === 'approved' || status === 'rejected') item.approvedBy = getUserId(req);
    item.updatedBy = getUserId(req);
    await item.save();
    res.json({ success: true, message: `Leave ${status}`, data: { leave: item } });
  } catch (error) { next(error); }
};

exports.deleteLeave = async (req, res, next) => {
  try {
    const item = await Leave.findOne({ _id: req.params.id, isDeleted: false });
    if (!item) throw new AppError('Leave not found', 404);
    await Leave.deleteOne({ _id: item._id });
    res.json({ success: true, message: 'Leave deleted' });
  } catch (error) { next(error); }
};

exports.getStats = async (req, res, next) => {
  try {
    const [total, pending, approved, rejected] = await Promise.all([
      Leave.countDocuments({ isDeleted: false }),
      Leave.countDocuments({ isDeleted: false, status: 'pending' }),
      Leave.countDocuments({ isDeleted: false, status: 'approved' }),
      Leave.countDocuments({ isDeleted: false, status: 'rejected' }),
    ]);
    const thisMonth = new Date();
    thisMonth.setDate(1);
    thisMonth.setHours(0, 0, 0, 0);
    const monthCount = await Leave.countDocuments({ isDeleted: false, createdAt: { $gte: thisMonth } });
    res.json({ success: true, data: { total, pending, approved, rejected, thisMonth: monthCount } });
  } catch (error) { next(error); }
};
