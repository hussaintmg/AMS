const mongoose = require('mongoose');

const permissionSchema = new mongoose.Schema({
  pageKey: { type: String, trim: true },
  path: { type: String, trim: true },
  module: { type: String, trim: true },
  canView: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true }
}, { _id: false });

const logPermissionsSchema = new mongoose.Schema({
  mode: {
    type: String,
    enum: ['own', 'selected_users', 'selected_roles', 'all'],
    default: 'own'
  },
  users: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  roles: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Role' }],
  updatedAt: { type: Date },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { _id: false });

const roleJobSchema = new mongoose.Schema({
  pageKey: { type: String, required: true, trim: true },
  module: { type: String, trim: true },
  actions: {
    view: { type: Boolean, default: true },
    create: { type: Boolean, default: false },
    edit: { type: Boolean, default: false },
    delete: { type: Boolean, default: false },
    sendEmail: { type: Boolean, default: false },
    downloadPdf: { type: Boolean, default: false },
    export: { type: Boolean, default: false },
    // Sign-off actions: approving a quotation is what lets it become a booking.
    approve: { type: Boolean, default: false },
  },
  dataScope: {
    mode: { type: String, enum: ['own', 'selected_roles', 'selected_users', 'all'], default: 'own' },
    roles: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Role' }],
    users: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  }
}, { _id: false });

const normalizeLogPermissions = (permissions) => {
  if (!permissions || typeof permissions !== 'object') return { mode: 'own', users: [], roles: [] };
  if (Array.isArray(permissions)) {
    const active = permissions.filter((p) => p?.isActive !== false);
    const users = active.filter((p) => p?.type === 'user' && p.refId).map((p) => p.refId);
    const roles = active.filter((p) => p?.type === 'role' && p.refId).map((p) => p.refId);
    if (active.some((p) => p?.type === 'all')) return { mode: 'all', users: [], roles: [] };
    if (users.length) return { mode: 'selected_users', users, roles: [] };
    if (roles.length) return { mode: 'selected_roles', users: [], roles };
    return { mode: 'own', users: [], roles: [] };
  }
  const mode = ['own', 'selected_users', 'selected_roles', 'all'].includes(permissions.mode) ? permissions.mode : 'own';
  return {
    mode,
    users: Array.isArray(permissions.users) ? permissions.users.map((u) => String(u?._id || u)).filter(Boolean) : [],
    roles: Array.isArray(permissions.roles) ? permissions.roles.map((r) => String(r?._id || r)).filter(Boolean) : [],
  };
};

const roleSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Role name is required'],
    unique: true,
    trim: true,
    lowercase: true
  },
  displayName: {
    type: String,
    trim: true
  },
  description: {
    type: String,
    default: ''
  },
  permissions: {
    type: [permissionSchema],
    default: []
  },
  logsPermissions: {
    type: logPermissionsSchema,
    set: normalizeLogPermissions,
    default: () => ({ mode: 'own', users: [], roles: [] }),
  },
  jobs: { type: [roleJobSchema], default: [] },
  count: {
    type: Number,
    default: 0,
    min: 0
  },
  editable: {
    type: Boolean,
    default: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

roleSchema.index({ isActive: 1 });
roleSchema.index({ count: 1 });

const Role = mongoose.model('Role', roleSchema);

module.exports = Role;
