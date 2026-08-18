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
    // Parts only: each way of moving a stock level is granted separately — a
    // goods-in role may only add, a goods-out role may only remove, and
    // overwriting the count after a physical check is its own trust again.
    stockIncrease: { type: Boolean, default: false },
    stockDecrease: { type: Boolean, default: false },
    stockSet: { type: Boolean, default: false },
    // Legacy combined grant, replaced by the split pair above. Stays on the
    // schema so documents written before the split still load.
    adjustStock: { type: Boolean, default: false },
    // Granted separately since 2026-08-18 — see constants/pageCapabilities.js
    // ALL_ACTIONS for what each one is. Every one used to ride on `edit`.
    import: { type: Boolean, default: false },
    toggleStatus: { type: Boolean, default: false },
    convert: { type: Boolean, default: false },
    assign: { type: Boolean, default: false },
    barcode: { type: Boolean, default: false },
    recordPayment: { type: Boolean, default: false },
    changePaymentTerm: { type: Boolean, default: false },
    markDelivered: { type: Boolean, default: false },
    createJobCard: { type: Boolean, default: false },
    postLedger: { type: Boolean, default: false },
    transfer: { type: Boolean, default: false },
    verify: { type: Boolean, default: false },
    generateGrn: { type: Boolean, default: false },
    lock: { type: Boolean, default: false },
    payout: { type: Boolean, default: false },
  },
  dataScope: {
    mode: { type: String, enum: ['own', 'selected_roles', 'selected_users', 'all'], default: 'own' },
    roles: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Role' }],
    users: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  },
  // Which columns of those records the role may read — customer phone, purchase
  // price, salesperson and so on. "all" is the default so an existing role keeps
  // seeing everything it saw before this setting existed. This is the API-level
  // mask (utils/fieldPermissions.js); the blocks below are the screen-level
  // choices layered on top of it (constants/pageCatalog.js).
  fields: {
    mode: { type: String, enum: ['all', 'selected'], default: 'all' },
    allowed: [{ type: String, trim: true }],
  },
  // Which table columns the screen draws. Keys are the catalog's column keys.
  columns: {
    mode: { type: String, enum: ['all', 'selected'], default: 'all' },
    allowed: [{ type: String, trim: true }],
  },
  // Which rows the record's drawer shows, and which of the drawer's own
  // buttons (record payment, convert, delete…) are offered.
  drawerFields: {
    mode: { type: String, enum: ['all', 'selected'], default: 'all' },
    allowed: [{ type: String, trim: true }],
  },
  drawerExtras: {
    mode: { type: String, enum: ['all', 'selected'], default: 'all' },
    allowed: [{ type: String, trim: true }],
  },
  // Which "+ Create X" shortcuts appear inside the create and edit forms. A role
  // may be allowed to create leads and still be kept from raising new sources
  // from inside the lead form. The owning master-data page's Create right is
  // still required on top of this — this only removes the shortcut.
  quickCreate: {
    mode: { type: String, enum: ['all', 'selected'], default: 'all' },
    create: [{ type: String, trim: true }],
    edit: [{ type: String, trim: true }],
  },
  // Whose records each dropdown of each form offers. One row per dropdown the
  // administrator has changed from the default ("all"); anything not listed
  // is unrestricted.
  dropdowns: {
    type: [new mongoose.Schema({
      key: { type: String, required: true, trim: true },
      form: { type: String, enum: ['create', 'edit', 'filters'], default: 'create' },
      mode: { type: String, enum: ['all', 'own', 'selected_roles', 'selected_users', 'none'], default: 'all' },
      roles: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Role' }],
      users: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    }, { _id: false })],
    default: [],
  },
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
