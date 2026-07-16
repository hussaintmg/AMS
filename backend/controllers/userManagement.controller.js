const mongoose = require('mongoose');
const { User, Role, Department, Log } = require('../models');
const { logFileOperation } = require('../utils/apiLogger');
const { normalizePhone } = require('../utils/phone.util');
const logger = require('../utils/logger');
const { syncFromUser } = require('../utils/relationshipSync');
/**
 * @swagger
 * /admin/users/stats:
 *   get:
 *     tags: [User Management]
 *     summary: Get user statistics
 *     security: [{ cookieAuth: [], bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: User statistics
 */
const getUserStats = async (req, res, next) => {
  try {
    const [total, byStatus] = await Promise.all([
      User.countDocuments(),
      User.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
    ]);
    const statusMap = { active: 0, inactive: 0, suspended: 0 };
    for (const entry of byStatus) {
      if (entry._id) statusMap[entry._id] = entry.count;
    }
    const data = {
      total_users: total,
      active_users: statusMap.active,
      inactive_users: statusMap.inactive,
      suspended_users: statusMap.suspended,
    };
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

const isSuperAdminUser = (user) => {
  const roleName = typeof user.role === 'object' ? user.role?.name : user.role;
  return String(roleName || '').trim().toLowerCase() === 'super_admin';
};

/**
 * @swagger
 * /admin/users:
 *   get:
 *     tags: [User Management]
 *     summary: Get paginated list of users
 *     security: [{ cookieAuth: [], bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 25 }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *       - in: query
 *         name: role
 *         schema: { type: string }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [active, inactive, suspended] }
 *     responses:
 *       200:
 *         description: Paginated users list
 */
const getAllUsers = async (req, res, next) => {
  try {
    const { page = 1, limit = 25, search = '', role: roleFilter = '', status = '' } = req.query;
    const query = {};
    if (search) {
      const re = new RegExp(search, 'i');
      query.$or = [
        { email: re },
        { firstName: re },
        { lastName: re },
        { fullName: re },
        { employeeId: re },
        { phone: re },
        { designation: re },
        { city: re },
        { country: re },
      ];
    }
    if (roleFilter) {
      const role = await Role.findOne({ name: roleFilter });
      if (role) query.role = role._id;
    }
    if (status) {
      query.status = status;
    }

    const pageNum = Math.max(1, Number(page));
    const limitNum = Math.min(100, Math.max(1, Number(limit)));

    const [users, total] = await Promise.all([
      User.find(query)
        .select('email firstName lastName fullName phone role status department isActive employeeId createdAt lastLogin designation')
        .populate('role', 'name displayName')
        .populate({
          path: 'department',
          select: 'name code',
          match: { _id: { $exists: true } },
        })
        .sort({ createdAt: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .lean(),
      User.countDocuments(query),
    ]);

    res.json({
      success: true,
      message: 'Users fetched successfully',
      data: {
        users,
        pagination: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum) },
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /admin/users/{id}:
 *   get:
 *     tags: [User Management]
 *     summary: Get user by ID
 *     security: [{ cookieAuth: [], bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: User data
 *       404:
 *         description: User not found
 */
const getUserById = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id)
      .select('-password -refreshTokens -passwordReset')
      .populate('role', 'name displayName permissions')
      .populate('department', 'name code')
      .lean();
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    res.json({ success: true, data: user });
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /admin/users:
 *   post:
 *     tags: [User Management]
 *     summary: Create a new user
 *     security: [{ cookieAuth: [], bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password, firstName, lastName]
 *             properties:
 *               email: { type: string }
 *               password: { type: string }
 *               firstName: { type: string }
 *               lastName: { type: string }
 *               phone: { type: string }
 *               roleId: { type: string }
 *               department: { type: string }
 *               jobTitle: { type: string }
 *     responses:
 *       201:
 *         description: User created
 */
const createUser = async (req, res, next) => {
  try {
    const { email, password, firstName, lastName, phone, roleId, department, jobTitle } = req.body;
    if (!email || !password || !firstName || !lastName) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }
    const existing = await User.findOne({ email: email.toLowerCase().trim() });
    if (existing) return res.status(400).json({ success: false, message: 'Email already exists' });

    let role = await Role.findById(roleId);
    if (!role) {
      role = await Role.findOne({ name: 'staff' });
    }

    let deptId = null;
    if (department && mongoose.Types.ObjectId.isValid(department)) {
      const dept = await Department.findById(department);
      if (dept) deptId = dept._id;
    }
    const normalizedPhone = phone ? normalizePhone(phone) : '';

    const user = await User.create({
      email,
      password,
      firstName,
      lastName,
      phone: normalizedPhone,
      role: role?._id || null,
      department: deptId,
      designation: jobTitle || '',
      status: 'active',
      createdBy: req.user?.id || req.user?._id,
      updatedBy: req.user?.id || req.user?._id,
    });

    const populated = await User.findById(user._id)
      .select('email firstName lastName fullName phone role status department isActive createdAt')
      .populate('role', 'name displayName')
      .populate('department', 'name code')
      .lean();

    // Log to Mongo
    await Log.create({
      endpoint: '/admin/users',
      method: 'POST',
      module: 'user-management',
      action: 'create',
      user: { id: req.user?.id, email: req.user?.email },
      ip: req.ip,
      description: `Created user ${email}`,
    });

    // Log to physical file
    logFileOperation(req, { action: 'createUser', email });

    res.status(201).json({ success: true, message: 'User created', data: { user: populated } });
  } catch (error) {
    if (error.code === 11000) return res.status(400).json({ success: false, message: 'Email already exists' });
    next(error);
  }
};

/**
 * @swagger
 * /admin/users/{id}:
 *   put:
 *     tags: [User Management]
 *     summary: Update user
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
 *               email: { type: string }
 *               password: { type: string }
 *               firstName: { type: string }
 *               lastName: { type: string }
 *               phone: { type: string }
 *               roleId: { type: string }
 *               department: { type: string }
 *               jobTitle: { type: string }
 *     responses:
 *       200:
 *         description: User updated
 *       404:
 *         description: User not found
 */
const updateUser = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const { email, password, firstName, lastName, phone, roleId, department, jobTitle } = req.body;
    if (email !== undefined && email !== user.email) {
      const dup = await User.findOne({ email: email.toLowerCase().trim(), _id: { $ne: req.params.id } });
      if (dup) return res.status(400).json({ success: false, message: 'Email already exists' });
      user.email = email;
    }
    if (firstName !== undefined) user.firstName = firstName;
    if (lastName !== undefined) user.lastName = lastName;
    if (phone !== undefined) user.phone = normalizePhone(phone);
    if (roleId !== undefined) user.role = roleId;
    if (department !== undefined) {
      if (department === "" || department === null) {
        user.department = null;
      } else if (mongoose.Types.ObjectId.isValid(department)) {
        const dept = await Department.findById(department);
        if (dept) {
          user.department = dept._id;
        } else {
          return res.status(400).json({ success: false, message: 'Department not found' });
        }
      } else {
        return res.status(400).json({ success: false, message: 'Invalid department' });
      }
    }
    if (jobTitle !== undefined) user.designation = jobTitle;
    if (password) user.password = password;
    user.updatedBy = req.user?.id || req.user?._id;
    await user.save();
    await syncFromUser(user, req.user?.id || req.user?._id);

    const populated = await User.findById(user._id)
      .select('email firstName lastName fullName phone role status department isActive createdAt')
      .populate('role', 'name displayName')
      .populate('department', 'name code')
      .lean();

    // Log to Mongo
    await Log.create({
      endpoint: `/admin/users/${req.params.id}`,
      method: 'PUT',
      module: 'user-management',
      action: 'update',
      user: { id: req.user?.id, email: req.user?.email },
      ip: req.ip,
      description: `Updated user ${user.email}`,
    });

    logFileOperation(req, { action: 'updateUser', userId: req.params.id, email: user.email });

    res.json({ success: true, message: 'User updated', data: { user: populated } });
  } catch (error) {
    if (error.code === 11000) return res.status(400).json({ success: false, message: 'Email already exists' });
    next(error);
  }
};

/**
 * @swagger
 * /admin/users/{id}:
 *   delete:
 *     tags: [User Management]
 *     summary: Deactivate user (soft delete)
 *     security: [{ cookieAuth: [], bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: User deactivated
 *       404:
 *         description: User not found
 */
const deleteUser = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id).populate('role', 'name');
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    if (isSuperAdminUser(user)) {
      return res.status(403).json({ success: false, message: 'Super admin cannot be deactivated' });
    }
    user.status = 'inactive';
    user.isActive = false;
    user.updatedBy = req.user?.id || req.user?._id;
    await user.save();
    await syncFromUser(user, req.user?.id || req.user?._id);

    await Log.create({
      endpoint: `/admin/users/${req.params.id}`,
      method: 'DELETE',
      module: 'user-management',
      action: 'deactivate',
      user: { id: req.user?.id, email: req.user?.email },
      ip: req.ip,
      description: `Deactivated user ${user.email}`,
    });

    logFileOperation(req, { action: 'deactivateUser', userId: req.params.id, email: user.email });

    res.json({ success: true, message: 'User deactivated' });
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /admin/users/{id}/status:
 *   patch:
 *     tags: [User Management]
 *     summary: Toggle user status (active ↔ inactive)
 *     security: [{ cookieAuth: [], bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Status toggled
 *       404:
 *         description: User not found
 */
const toggleUserStatus = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id).populate('role', 'name');
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    if (isSuperAdminUser(user) && user.status === 'active') {
      return res.status(403).json({ success: false, message: 'Super admin cannot be deactivated' });
    }
    user.status = user.status === 'active' ? 'inactive' : 'active';
    user.isActive = user.status === 'active';
    user.updatedBy = req.user?.id || req.user?._id;
    await user.save();
    await syncFromUser(user, req.user?.id || req.user?._id);

    await Log.create({
      endpoint: `/admin/users/${req.params.id}/status`,
      method: 'PATCH',
      module: 'user-management',
      action: 'toggleStatus',
      user: { id: req.user?.id, email: req.user?.email },
      ip: req.ip,
      description: `Toggled user ${user.email} status to ${user.status}`,
    });

    logFileOperation(req, { action: 'toggleUserStatus', userId: req.params.id, newStatus: user.status });

    res.json({ success: true, message: `User ${user.status === 'active' ? 'activated' : 'deactivated'}`, data: { status: user.status } });
  } catch (error) {
    next(error);
  }
};

const assignRole = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    user.role = req.body.roleId;
    user.updatedBy = req.user?.id || req.user?._id;
    await user.save();
    await syncFromUser(user, req.user?.id || req.user?._id);
    res.json({ success: true, message: 'Role assigned' });
  } catch (error) {
    next(error);
  }
};

const assignDepartment = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const { deptId } = req.body;
    if (!deptId || deptId === "" || deptId === null) {
      user.department = null;
    } else if (mongoose.Types.ObjectId.isValid(deptId)) {
      const dept = await Department.findById(deptId);
      if (dept) {
        user.department = dept._id;
      } else {
        return res.status(400).json({ success: false, message: 'Department not found' });
      }
    } else {
      return res.status(400).json({ success: false, message: 'Invalid department' });
    }

    user.updatedBy = req.user?.id || req.user?._id;
    await user.save();
    await syncFromUser(user, req.user?.id || req.user?._id);
    res.json({ success: true, message: 'Department assigned' });
  } catch (error) {
    next(error);
  }
};

const removeDepartment = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    user.department = null;
    user.updatedBy = req.user?.id || req.user?._id;
    await user.save();
    await syncFromUser(user, req.user?.id || req.user?._id);
    res.json({ success: true, message: 'Department removed' });
  } catch (error) {
    next(error);
  }
};

const resetPassword = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id).select('+password');
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    user.password = req.body.password || 'Password123!';
    user.updatedBy = req.user?.id || req.user?._id;
    await user.save();
    res.json({ success: true, message: 'Password reset' });
  } catch (error) {
    next(error);
  }
};

const fixAllUsersFullName = async (req, res, next) => {
  try {
    const users = await User.find({}).select('firstName lastName').lean();
    let updated = 0;
    for (const user of users) {
      const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
      await User.updateOne({ _id: user._id }, { $set: { fullName } });
      updated++;
    }
    res.json({ success: true, message: `Full name fixed for ${updated} users`, data: { updated } });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAllUsers, getUserById, createUser, updateUser, deleteUser,
  toggleUserStatus, assignRole, assignDepartment, removeDepartment,
  resetPassword, getUserStats, fixAllUsersFullName,
};
