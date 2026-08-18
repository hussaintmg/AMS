const Employee = require('../models/Employee.model');
const Department = require('../models/Department.model');
const SystemSetting = require('../models/SystemSetting.model');
const AppError = require('../utils/AppError');

const getUserId = (req) => req.user?.id || req.user?._id;

const getBulkIds = (req) => {
  const ids = Array.isArray(req.body?.ids) ? [...new Set(req.body.ids.filter(Boolean))] : [];
  if (!ids.length) throw new AppError('Select at least one employee', 400);
  return ids;
};

exports.bulkDeleteEmployees = async (req, res, next) => {
  try {
    const ids = getBulkIds(req);
    const result = await Employee.deleteMany({ _id: { $in: ids } });
    res.json({ success: true, message: `${result.deletedCount} employee(s) deleted`, data: { modifiedCount: result.deletedCount } });
  } catch (error) { next(error); }
};

exports.bulkDeactivateEmployees = async (req, res, next) => {
  try {
    const ids = getBulkIds(req);
    const result = await Employee.updateMany(
      { _id: { $in: ids }, isDeleted: false, isActive: true },
      { $set: { isActive: false, status: 'inactive', updatedBy: getUserId(req) } }
    );
    res.json({ success: true, message: `${result.modifiedCount} employee(s) deactivated`, data: { modifiedCount: result.modifiedCount } });
  } catch (error) { next(error); }
};

exports.listEmployees = async (req, res, next) => {
  try {
    const { search, department, status, page = 1, limit = 50 } = req.query;
    const filter = { isDeleted: false };
    if (search) {
      filter.$or = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { employeeCode: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
      ];
    }
    if (department) filter.department = department;
    if (status === 'active') filter.isActive = true;
    if (status === 'inactive') filter.isActive = false;
    // A form's Employee dropdown names itself (?forPage=leaves&forForm=create
    // &forField=employee) so Role Jobs can narrow whose employees it lists.
    const { requestDropdownFilter, isHidden } = require('../utils/dropdownScope');
    const scope = await requestDropdownFilter(req, null, ['createdBy']);
    if (isHidden(scope)) return res.json({ success: true, data: [], pagination: { page: 1, limit: Number(limit), total: 0, totalPages: 0 } });
    if (scope) Object.assign(filter, scope.$or && filter.$or ? { $and: [{ $or: filter.$or }, scope] } : scope);

    const items = await Employee.find(filter)
      .populate('department', 'name code')
      .populate('role', 'name displayName')
      .populate('createdBy', 'firstName lastName email')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    const total = await Employee.countDocuments(filter);

    res.json({ success: true, data: { employees: items, total, page: Number(page), limit: Number(limit) } });
  } catch (error) { next(error); }
};

exports.getEmployee = async (req, res, next) => {
  try {
    const item = await Employee.findOne({ _id: req.params.id, isDeleted: false })
      .populate('department', 'name code')
      .populate('role', 'name displayName')
      .populate('createdBy', 'firstName lastName email')
      .populate('updatedBy', 'firstName lastName email');
    if (!item) throw new AppError('Employee not found', 404);
    res.json({ success: true, data: { employee: item } });
  } catch (error) { next(error); }
};

exports.createEmployee = async (req, res, next) => {
  try {
    const { firstName, lastName, email, phone, cnic, department, designation, joiningDate, salary, status } = req.body;
    if (!firstName || !lastName) throw new AppError('First name and last name are required', 400);

    const year = new Date().getFullYear();
    const count = await Employee.countDocuments({ employeeCode: { $regex: `EMP-${year}-` } });
    const employeeCode = `EMP-${year}-${String(count + 1).padStart(5, '0')}`;

    const sanitize = (v) => (v === '' || v === undefined ? undefined : v);

    const roleSetting = await SystemSetting.findOne({ key: 'employee_role_config' }).lean();
    const configuredRoleId = roleSetting?.value?.activeRoleId;
    if (!configuredRoleId) {
      throw new AppError('Employee role is not configured in Server Management > Role Usage.', 400);
    }

    const item = await Employee.create({
      employeeCode, firstName, lastName, email, phone, cnic,
      department: sanitize(department), role: configuredRoleId,
      designation, joiningDate, salary: salary || 0, status: status || 'active',
      isActive: true, createdBy: getUserId(req), updatedBy: getUserId(req),
    });
    res.status(201).json({ success: true, message: 'Employee created', data: { employee: item } });
  } catch (error) { next(error); }
};

exports.updateEmployee = async (req, res, next) => {
  try {
    const item = await Employee.findOne({ _id: req.params.id, isDeleted: false });
    if (!item) throw new AppError('Employee not found', 404);
    const updFields = ['firstName', 'lastName', 'email', 'phone', 'cnic', 'department', 'role', 'designation', 'joiningDate', 'salary', 'status', 'isActive'];
    updFields.forEach(f => { if (req.body[f] !== undefined) item[f] = req.body[f] === '' ? undefined : req.body[f]; });
    item.updatedBy = getUserId(req);
    await item.save();
    res.json({ success: true, message: 'Employee updated', data: { employee: item } });
  } catch (error) { next(error); }
};

exports.toggleEmployeeStatus = async (req, res, next) => {
  try {
    const item = await Employee.findOne({ _id: req.params.id, isDeleted: false });
    if (!item) throw new AppError('Employee not found', 404);
    item.isActive = !item.isActive;
    // `status` is what the UI badge reads, so keep it in step with isActive.
    item.status = item.isActive ? 'active' : 'inactive';
    item.updatedBy = getUserId(req);
    await item.save();
    res.json({ success: true, message: `Employee ${item.isActive ? 'activated' : 'deactivated'}`, data: { employee: item } });
  } catch (error) { next(error); }
};

exports.deleteEmployee = async (req, res, next) => {
  try {
    const item = await Employee.findOne({ _id: req.params.id, isDeleted: false });
    if (!item) throw new AppError('Employee not found', 404);
    await Employee.deleteOne({ _id: item._id });
    res.json({ success: true, message: 'Employee deleted' });
  } catch (error) { next(error); }
};

exports.getStats = async (req, res, next) => {
  try {
    const [total, active, inactive] = await Promise.all([
      Employee.countDocuments({ isDeleted: false }),
      Employee.countDocuments({ isDeleted: false, isActive: true }),
      Employee.countDocuments({ isDeleted: false, isActive: false }),
    ]);
    const deptCount = await Department.countDocuments({ isActive: true });
    res.json({ success: true, data: { total, active, inactive, departments: deptCount, totalEmployees: total } });
  } catch (error) { next(error); }
};
