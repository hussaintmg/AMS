const { Department, User, Log } = require('../models');
const { logFileOperation } = require('../utils/apiLogger');
const { normalizePhone } = require('../utils/phone.util');

/**
 * @swagger
 * /admin/departments/stats:
 *   get:
 *     tags: [Department Management]
 *     summary: Get department statistics
 *     security: [{ cookieAuth: [], bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Department statistics
 */
const getDepartmentStats = async (req, res, next) => {
  try {
    const [total, active, inactive, root, totalManagers] = await Promise.all([
      Department.countDocuments(),
      Department.countDocuments({ isActive: true }),
      Department.countDocuments({ isActive: false }),
      Department.countDocuments({ parent: null }),
      Department.countDocuments({ manager: { $ne: null } }),
    ]);
    const activeStaffResult = await User.aggregate([
      { $match: { status: 'active', isActive: true, department: { $ne: null } } },
      { $count: 'count' },
    ]);
    const totalActiveStaff = activeStaffResult.length > 0 ? activeStaffResult[0].count : 0;
    res.json({
      success: true,
      data: {
        total_departments: total,
        active_departments: active,
        inactive_departments: inactive,
        root_departments: root,
        users_with_department: totalActiveStaff,
        total_active_staff: totalActiveStaff,
        total_managers: totalManagers,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /admin/departments:
 *   get:
 *     tags: [Department Management]
 *     summary: Get all departments (hierarchy + flat)
 *     security: [{ cookieAuth: [], bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: flat
 *         schema: { type: string, enum: ['true'] }
 *     responses:
 *       200:
 *         description: Department tree and flat list
 */
const getAllDepartments = async (req, res, next) => {
  try {
    const depts = await Department.find()
      .populate('manager', 'firstName lastName email status department')
      .populate('createdBy', 'firstName lastName email')
      .sort({ name: 1 })
      .lean();

    const staffCounts = await User.aggregate([
      { $match: { status: 'active', isActive: true, department: { $ne: null } } },
      { $group: { _id: '$department', count: { $sum: 1 } } },
    ]);
    const countMap = {};
    staffCounts.forEach(s => {
      countMap[s._id.toString()] = s.count;
    });

    const buildDeptOutput = (d) => {
      let staffCount = countMap[d._id.toString()] || 0;
      if (d.manager && d.manager.department && String(d.manager.department) === String(d._id)) {
        staffCount = Math.max(0, staffCount - 1);
      }
      const managerActive = d.manager && d.manager.status === 'active' && d.manager.department;
      const managerDeactivated = d.manager && (!managerActive);
      return {
        id: d._id,
        _id: d._id,
        name: d.name,
        code: d.code,
        description: d.description || '',
        parent_id: d.parent,
        manager_id: d.manager?._id || null,
        manager_name: (d.manager && managerActive)
          ? `${d.manager.firstName || ''} ${d.manager.lastName || ''}`.trim()
          : '',
        manager_deactivated: managerDeactivated,
        is_active: d.isActive,
        isActive: d.isActive,
        email: d.email || '',
        phone: d.phone || '',
        location: d.location || '',
        budget: d.budget || 0,
        staff_count: staffCount,
        total_users: staffCount,
        created_at: d.createdAt,
        createdAt: d.createdAt,
        created_by: d.createdBy
          ? { id: d.createdBy._id, name: `${d.createdBy.firstName || ''} ${d.createdBy.lastName || ''}`.trim(), email: d.createdBy.email }
          : null,
      };
    };

    const buildTree = (parentId) => {
      return depts
        .filter((d) => String(d.parent || '') === String(parentId || ''))
        .map((d) => ({
          ...buildDeptOutput(d),
          children: buildTree(d._id),
        }));
    };

    const hierarchy = buildTree(null);
    const flat = depts.map(d => buildDeptOutput(d));

    res.json({ success: true, data: { hierarchy, flat } });
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /admin/departments/{id}:
 *   get:
 *     tags: [Department Management]
 *     summary: Get department by ID with staff list
 *     security: [{ cookieAuth: [], bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Department data with staff
 *       404:
 *         description: Department not found
 */
const getDepartmentById = async (req, res, next) => {
  try {
    const dept = await Department.findById(req.params.id)
      .populate('manager', 'firstName lastName email phone status department isActive')
      .populate('parent', 'name code')
      .populate('createdBy', 'firstName lastName email')
      .populate('updatedBy', 'firstName lastName email')
      .lean();
    if (!dept) return res.status(404).json({ success: false, message: 'Department not found' });

    const managerActive = dept.manager && dept.manager.status === 'active' && dept.manager.isActive;

    const staffQuery = {
      department: dept._id,
      status: 'active',
      isActive: true,
    };
    if (dept.manager) {
      staffQuery._id = { $ne: dept.manager._id };
    }
    const staff = await User.find(staffQuery)
      .populate('role', 'name displayName')
      .select('firstName lastName email phone status isActive designation role')
      .sort({ firstName: 1 })
      .lean();

    const staffCount = staff.length;

    const totalStaffCountResult = await User.countDocuments({ department: dept._id });
    const totalStaffCount = totalStaffCountResult;

    res.json({
      success: true,
      data: {
        ...dept,
        manager_name: managerActive
          ? `${dept.manager.firstName || ''} ${dept.manager.lastName || ''}`.trim()
          : '',
        manager_deactivated: dept.manager && !managerActive,
        staff_count: staffCount,
        total_users: staffCount,
        total_staff: totalStaffCount,
        staff,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /admin/departments:
 *   post:
 *     tags: [Department Management]
 *     summary: Create department
 *     security: [{ cookieAuth: [], bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, code]
 *             properties:
 *               name: { type: string }
 *               code: { type: string }
 *               description: { type: string }
 *               parentId: { type: string }
 *               managerId: { type: string }
 *               email: { type: string }
 *               phone: { type: string }
 *               location: { type: string }
 *               budget: { type: number }
 *               isActive: { type: boolean }
 *     responses:
 *       201:
 *         description: Department created
 */
const createDepartment = async (req, res, next) => {
  try {
    const { name, code, description, parentId, managerId, email, phone, location, budget, isActive } = req.body;
    if (!name || !code) {
      return res.status(400).json({ success: false, message: 'Name and code are required' });
    }
    const existing = await Department.findOne({ code: code.trim() });
    if (existing) return res.status(400).json({ success: false, message: 'Department code already exists' });

    const dept = await Department.create({
      name: name.trim(),
      code: code.trim(),
      description: description || '',
      parent: parentId || null,
      manager: managerId || null,
      email: email || '',
      phone: normalizePhone(phone) || '',
      location: location || '',
      budget: budget || 0,
      isActive: isActive !== undefined ? isActive : true,
      createdBy: req.user?.id || req.user?._id,
      updatedBy: req.user?.id || req.user?._id,
    });

    await Log.create({
      endpoint: '/admin/departments',
      method: 'POST',
      module: 'department-management',
      action: 'create',
      user: { id: req.user?.id, email: req.user?.email },
      ip: req.ip,
      description: `Created department ${name} (${code})`,
    });

    logFileOperation(req, { action: 'createDepartment', name, code });

    res.status(201).json({ success: true, message: 'Department created', data: dept });
  } catch (error) {
    if (error.code === 11000) return res.status(400).json({ success: false, message: 'Department code already exists' });
    next(error);
  }
};

/**
 * @swagger
 * /admin/departments/{id}:
 *   put:
 *     tags: [Department Management]
 *     summary: Update department
 *     security: [{ cookieAuth: [], bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string }
 *               code: { type: string }
 *               description: { type: string }
 *               parentId: { type: string }
 *               managerId: { type: string }
 *               email: { type: string }
 *               phone: { type: string }
 *               location: { type: string }
 *               budget: { type: number }
 *               isActive: { type: boolean }
 *     responses:
 *       200:
 *         description: Department updated
 *       404:
 *         description: Department not found
 */
const updateDepartment = async (req, res, next) => {
  try {
    const dept = await Department.findById(req.params.id);
    if (!dept) return res.status(404).json({ success: false, message: 'Department not found' });

    const { name, code, description, parentId, managerId, email, phone, location, budget, isActive } = req.body;
    if (code !== undefined && code !== dept.code) {
      const dup = await Department.findOne({ code: code.trim(), _id: { $ne: req.params.id } });
      if (dup) return res.status(400).json({ success: false, message: 'Department code already exists' });
      dept.code = code.trim();
    }
    if (name !== undefined) dept.name = name.trim();
    if (description !== undefined) dept.description = description;
    if (parentId !== undefined) dept.parent = parentId || null;
    if (managerId !== undefined) dept.manager = managerId || null;
    if (email !== undefined) dept.email = email;
    if (phone !== undefined) dept.phone = normalizePhone(phone) || '';
    if (location !== undefined) dept.location = location;
    if (budget !== undefined) dept.budget = budget;
    if (isActive !== undefined) dept.isActive = isActive;
    dept.updatedBy = req.user?.id || req.user?._id;
    await dept.save();

    await Log.create({
      endpoint: `/admin/departments/${req.params.id}`,
      method: 'PUT',
      module: 'department-management',
      action: 'update',
      user: { id: req.user?.id, email: req.user?.email },
      ip: req.ip,
      description: `Updated department ${dept.name}`,
    });

    logFileOperation(req, { action: 'updateDepartment', departmentId: req.params.id, name: dept.name });

    res.json({ success: true, message: 'Department updated', data: dept });
  } catch (error) {
    if (error.code === 11000) return res.status(400).json({ success: false, message: 'Department code already exists' });
    next(error);
  }
};

/**
 * @swagger
 * /admin/departments/{id}:
 *   delete:
 *     tags: [Department Management]
 *     summary: Delete department (soft-deactivate)
 *     security: [{ cookieAuth: [], bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Department deactivated
 *       404:
 *         description: Department not found
 */
const deleteDepartment = async (req, res, next) => {
  try {
    const dept = await Department.findById(req.params.id);
    if (!dept) return res.status(404).json({ success: false, message: 'Department not found' });
    dept.isActive = false;
    dept.updatedBy = req.user?.id || req.user?._id;
    await dept.save();

    await Department.updateMany({ parent: dept._id }, { isActive: false });

    await Log.create({
      endpoint: `/admin/departments/${req.params.id}`,
      method: 'DELETE',
      module: 'department-management',
      action: 'deactivate',
      user: { id: req.user?.id, email: req.user?.email },
      ip: req.ip,
      description: `Deactivated department ${dept.name} and its children`,
    });

    logFileOperation(req, { action: 'deleteDepartment', departmentId: req.params.id, name: dept.name });

    res.json({ success: true, message: 'Department deactivated' });
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /admin/departments/{id}/manager:
 *   patch:
 *     tags: [Department Management]
 *     summary: Assign/reassign department manager
 *     security: [{ cookieAuth: [], bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               userId: { type: string }
 *     responses:
 *       200:
 *         description: Manager assigned
 *       404:
 *         description: Department not found
 */
const assignManager = async (req, res, next) => {
  try {
    const dept = await Department.findById(req.params.id);
    if (!dept) return res.status(404).json({ success: false, message: 'Department not found' });
    const managerId = req.body.userId || null;
    if (managerId) {
      const managerUser = await User.findById(managerId);
      if (!managerUser) return res.status(404).json({ success: false, message: 'User not found' });
    }
    dept.manager = managerId;
    dept.updatedBy = req.user?.id || req.user?._id;
    await dept.save();

    await Log.create({
      endpoint: `/admin/departments/${req.params.id}/manager`,
      method: 'PATCH',
      module: 'department-management',
      action: 'assignManager',
      user: { id: req.user?.id, email: req.user?.email },
      ip: req.ip,
      description: `Assigned manager ${managerId} to department ${dept.name}`,
    });

    logFileOperation(req, { action: 'assignManager', departmentId: req.params.id, managerId });

    res.json({ success: true, message: 'Manager assigned', data: dept });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAllDepartments, getDepartmentById, createDepartment, updateDepartment,
  deleteDepartment, assignManager, getDepartmentStats,
};
