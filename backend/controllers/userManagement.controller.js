const { User, Role } = require('../models');
const bcrypt = require('bcryptjs');
const logger = require('../utils/logger');

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
        { employeeId: re },
      ];
    }
    if (roleFilter) {
      const role = await Role.findOne({ name: roleFilter });
      if (role) query.role = role._id;
    }
    if (status) query.isActive = status === 'active';

    const pageNum = Math.max(1, Number(page));
    const limitNum = Math.min(100, Math.max(1, Number(limit)));

    const [users, total] = await Promise.all([
      User.find(query)
        .select('email firstName lastName phone role isActive employeeId createdAt')
        .populate('role', 'name displayName')
        .sort({ createdAt: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .lean(),
      User.countDocuments(query),
    ]);

    res.json({ success: true, data: { users, pagination: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum) } } });
  } catch (error) {
    next(error);
  }
};

const getUserById = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id)
      .select('-password -refreshTokens -passwordReset')
      .populate('role', 'name displayName permissions')
      .lean();
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    res.json({ success: true, data: user });
  } catch (error) {
    next(error);
  }
};

const createUser = async (req, res, next) => {
  try {
    const { email, password, firstName, lastName, phone, roleId, departmentId, jobTitle } = req.body;
    if (!email || !password || !firstName || !lastName) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }
    const existing = await User.findOne({ email: email.toLowerCase().trim() });
    if (existing) return res.status(400).json({ success: false, message: 'Email already exists' });

    let role = await Role.findById(roleId);
    if (!role) {
      role = await Role.findOne({ name: 'staff' });
    }

    const user = await User.create({
      email, password, firstName, lastName, phone: phone || '',
      role: role?._id || null, department: departmentId || '', designation: jobTitle || '',
      createdBy: req.user?.id || req.user?._id, updatedBy: req.user?.id || req.user?._id,
    });

    const populated = await User.findById(user._id)
      .select('email firstName lastName phone role isActive createdAt')
      .populate('role', 'name displayName')
      .lean();

    res.status(201).json({ success: true, message: 'User created', data: { user: populated } });
  } catch (error) {
    if (error.code === 11000) return res.status(400).json({ success: false, message: 'Email already exists' });
    next(error);
  }
};

const updateUser = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const { email, password, firstName, lastName, phone, roleId, departmentId, jobTitle } = req.body;
    if (email !== undefined && email !== user.email) {
      const dup = await User.findOne({ email: email.toLowerCase().trim(), _id: { $ne: req.params.id } });
      if (dup) return res.status(400).json({ success: false, message: 'Email already exists' });
      user.email = email;
    }
    if (firstName !== undefined) user.firstName = firstName;
    if (lastName !== undefined) user.lastName = lastName;
    if (phone !== undefined) user.phone = phone;
    if (roleId !== undefined) user.role = roleId;
    if (departmentId !== undefined) user.department = departmentId;
    if (jobTitle !== undefined) user.designation = jobTitle;
    if (password) user.password = password;
    user.updatedBy = req.user?.id || req.user?._id;
    await user.save();

    const populated = await User.findById(user._id)
      .select('email firstName lastName phone role isActive')
      .populate('role', 'name displayName')
      .lean();

    res.json({ success: true, message: 'User updated', data: { user: populated } });
  } catch (error) {
    if (error.code === 11000) return res.status(400).json({ success: false, message: 'Email already exists' });
    next(error);
  }
};

const deleteUser = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    user.isActive = false;
    user.updatedBy = req.user?.id || req.user?._id;
    await user.save();
    res.json({ success: true, message: 'User deactivated' });
  } catch (error) {
    next(error);
  }
};

const toggleUserStatus = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    user.isActive = !user.isActive;
    user.updatedBy = req.user?.id || req.user?._id;
    await user.save();
    res.json({ success: true, message: `User ${user.isActive ? 'activated' : 'deactivated'}`, data: { isActive: user.isActive } });
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
    res.json({ success: true, message: 'Role assigned' });
  } catch (error) {
    next(error);
  }
};

const assignDepartment = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    user.department = req.body.deptId || '';
    user.updatedBy = req.user?.id || req.user?._id;
    await user.save();
    res.json({ success: true, message: 'Department assigned' });
  } catch (error) {
    next(error);
  }
};

const removeDepartment = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    user.department = '';
    user.updatedBy = req.user?.id || req.user?._id;
    await user.save();
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

const getUserStats = async (req, res, next) => {
  try {
    const [total, active, byRole] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ isActive: true }),
      User.aggregate([
        { $group: { _id: '$isActive', count: { $sum: 1 } } },
      ]),
    ]);
    res.json({ success: true, data: { total, active, inactive: total - active, byRole } });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAllUsers, getUserById, createUser, updateUser, deleteUser,
  toggleUserStatus, assignRole, assignDepartment, removeDepartment,
  resetPassword, getUserStats,
};
