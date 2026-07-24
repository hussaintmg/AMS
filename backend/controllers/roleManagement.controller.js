const { Role, User } = require('../models');

const getAllRoles = async (req, res, next) => {
  try {
    const roles = await Role.find()
      .select('name displayName description isActive createdAt permissions')
      .sort({ name: 1 })
      .lean();

    const rolesWithCounts = await Promise.all(roles.map(async (role) => {
      const userCount = await User.countDocuments({ role: role._id });
      const activeUserCount = await User.countDocuments({ role: role._id, isActive: true });
      return { ...role, user_count: userCount, active_user_count: activeUserCount, permission_count: role.permissions?.length || 0 };
    }));

    res.json({ success: true, data: rolesWithCounts });
  } catch (error) {
    next(error);
  }
};

const getRoleById = async (req, res, next) => {
  try {
    const role = await Role.findById(req.params.id).lean();
    if (!role) return res.status(404).json({ success: false, message: 'Role not found' });

    const users = await User.find({ role: role._id })
      .select('email firstName lastName isActive')
      .sort({ firstName: 1 })
      .limit(50)
      .lean();

    res.json({ success: true, data: { ...role, users, permissionGroups: [], assignedPermissions: role.permissions?.map((p) => p.pageKey) || [] } });
  } catch (error) {
    next(error);
  }
};

const createRole = async (req, res, next) => {
  try {
    const { name, description } = req.body;
    if (!name) return res.status(400).json({ success: false, message: 'Role name is required' });

    const existing = await Role.findOne({ name: name.toLowerCase().trim() });
    if (existing) return res.status(400).json({ success: false, message: 'Role name already exists' });

    const role = await Role.create({
      name: name.toLowerCase().trim(),
      displayName: req.body.displayName || name,
      description: description || '',
      createdBy: req.user?.id || req.user?._id,
    });

    res.status(201).json({ success: true, message: 'Role created', data: { id: role._id, name: role.name, description: role.description } });
  } catch (error) {
    if (error.code === 11000) return res.status(400).json({ success: false, message: 'Role name already exists' });
    next(error);
  }
};

const updateRole = async (req, res, next) => {
  try {
    const role = await Role.findById(req.params.id);
    if (!role) return res.status(404).json({ success: false, message: 'Role not found' });
    if (role.name === 'super_admin') return res.status(400).json({ success: false, message: 'Cannot modify super_admin role' });

    if (req.body.name) role.name = req.body.name.toLowerCase().trim();
    if (req.body.displayName !== undefined) role.displayName = req.body.displayName;
    if (req.body.description !== undefined) role.description = req.body.description;
    if (req.body.isActive !== undefined) role.isActive = req.body.isActive;
    role.updatedBy = req.user?.id || req.user?._id;
    await role.save();

    res.json({ success: true, message: 'Role updated' });
  } catch (error) {
    if (error.code === 11000) return res.status(400).json({ success: false, message: 'Role name already exists' });
    next(error);
  }
};

const deleteRole = async (req, res, next) => {
  try {
    const role = await Role.findById(req.params.id);
    if (!role) return res.status(404).json({ success: false, message: 'Role not found' });
    if (role.name === 'super_admin') return res.status(400).json({ success: false, message: 'Cannot delete super_admin role' });

    await User.updateMany({ role: role._id }, { $set: { role: null } });
    await Role.deleteOne({ _id: role._id });

    res.json({ success: true, message: 'Role deleted' });
  } catch (error) {
    next(error);
  }
};

const assignPermissions = async (req, res, next) => {
  try {
    const role = await Role.findById(req.params.id);
    if (!role) return res.status(404).json({ success: false, message: 'Role not found' });

    const permissions = req.body.permissions || [];
    role.permissions = permissions.map((perm) => ({
      pageKey: perm.pageKey || perm,
      path: perm.path || '',
      module: perm.module || '',
      canView: true,
      isActive: true,
    }));
    role.updatedBy = req.user?.id || req.user?._id;
    await role.save();

    res.json({ success: true, message: 'Permissions updated', data: { permissionCount: role.permissions.length } });
  } catch (error) {
    next(error);
  }
};

const getAllPermissions = async (req, res, next) => {
  try {
    res.json({ success: true, data: [] });
  } catch (error) {
    next(error);
  }
};

const getPermissionMatrix = async (req, res, next) => {
  try {
    const roles = await Role.find({ isActive: true }).select('name displayName').lean();
    res.json({ success: true, data: { roles, permissions: [] } });
  } catch (error) {
    next(error);
  }
};

const getPermissionModules = async (req, res, next) => {
  try {
    res.json({ success: true, data: [] });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAllRoles, getRoleById, createRole, updateRole, deleteRole,
  assignPermissions, getAllPermissions, getPermissionMatrix, getPermissionModules,
};
