const path = require('path');
const fs = require('fs');
const {
  Role,
  User,
  BrandingAsset,
  Page,
  BrandingSetting,
  SystemSetting
} = require('../models');
const AppError = require('../utils/AppError');
const { normalizePermissions } = require('../utils/permissions');
const { getPermissionSettings, canAccessTarget } = require('../utils/permissionResolver');
const { normalizeLogPermissionsConfig } = require('../utils/logPermissionResolver');
const { logFileOperation } = require('../utils/apiLogger');
const { getPublicFileUrl } = require('../utils/url');
const Log = require('../models/mongo/Log.model');
const { syncFromUser } = require('../utils/relationshipSync');
const { pageFieldKeys, catalogForUi } = require('../constants/fieldPermissions');
const { PAGE_CAPABILITIES, capabilitiesFor, ACTION_LABELS } = require('../constants/pageCapabilities');
const { keyForPath, canonicalKey } = require('../utils/pageRegistry');

const uploadRoot = path.join(__dirname, '..', 'uploads', 'branding');
const DEFAULT_PAGE_ICON = 'FileText';
const brandingAssetFields = ['favicon', 'sidebarLogo', 'loginLogo', 'loadingLogo', 'sidebarBackgroundImage'];

const getUserId = (req) => req.user?.id || req.user?._id;

async function createAuditLog(userId, action, module, details, req) {
  try {
    await Log.create({
      userId,
      action,
      module,
      details: typeof details === 'string' ? details : JSON.stringify(details),
      ip: req?.ip || '',
      userAgent: req?.headers?.['user-agent'] || '',
      timestamp: new Date(),
    });
  } catch (err) {
    console.error('Audit log error:', err.message);
  }
}

const withLogPermissionMeta = (config, userId) => ({
  ...normalizeLogPermissionsConfig(config),
  updatedAt: new Date(),
  updatedBy: userId || undefined,
});

const sanitizeIcon = (icon) => {
  if (!icon || typeof icon !== 'string') return DEFAULT_PAGE_ICON;
  const trimmed = icon.trim();
  if (!trimmed) return DEFAULT_PAGE_ICON;
  if (!/^[A-Z][a-zA-Z0-9]*$/.test(trimmed)) return DEFAULT_PAGE_ICON;
  return trimmed;
};

const slugify = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

const normalizePageInput = (page = {}, index = 0) => {
  const label = page.label || page.name || page.title || page.key || `Page ${index + 1}`;
  // A page typed in here used to keep whatever was in the name box verbatim, so
  // adding the parts scanner by hand stored it as "Parts Barcode Scan" — while
  // every route guard, the capability table and the frontend look for
  // `part_scan`. The role then had Create ticked on a key nothing reads. A page
  // sitting on a path this build knows takes that page's key; anything else is
  // at least slugified, so a key is never a sentence.
  const requested = slugify(page.name || page.key) || slugify(label);
  const name = keyForPath(page.path) || requested;

  return {
    name,
    label,
    path: page.path || '/',
    module: page.module || page.group || 'General',
    group: page.group || page.module || 'General',
    icon: sanitizeIcon(page.icon),
    sortOrder: Number.isFinite(Number(page.sortOrder)) ? Number(page.sortOrder) : index,
    description: page.description || '',
    isCore: Boolean(page.isCore),
    isActive: page.isActive !== false
  };
};

const serializeAsset = (asset) => {
  if (!asset) return null;
  const obj = typeof asset.toObject === 'function' ? asset.toObject() : asset;
  const filename = obj.fileName || obj.filename || obj.storedName;
  const rawUrl = obj.publicUrl || (filename ? `/api/uploads/branding/${filename}` : '');
  const publicUrl = getPublicFileUrl(rawUrl);

  return {
    ...obj,
    publicUrl,
    url: publicUrl
  };
};

const populateBranding = (query) => query.populate([
  'favicon',
  'sidebarLogo',
  'loginLogo',
  'loadingLogo'
  ,'sidebarBackgroundImage'
]);

const unlinkAssetFile = (filePath) => {
  if (!filePath) return;
  const absolute = path.resolve(filePath);
  const root = path.resolve(uploadRoot);
  if (!absolute.startsWith(root)) return;
  fs.unlink(absolute, (err) => {
    if (err && err.code !== 'ENOENT') {
      console.error('Failed to delete asset file:', err.message);
    }
  });
};

const getBrandingDoc = async () => {
  let setting = await populateBranding(BrandingSetting.findOne().sort({ createdAt: 1 }));

  if (!setting) {
    setting = await BrandingSetting.create({});
    setting = await populateBranding(BrandingSetting.findById(setting._id));
  }

  return setting;
};

const serializeBranding = (setting) => {
  const obj = typeof setting.toObject === 'function' ? setting.toObject() : setting;
  const assetFields = brandingAssetFields;
  const serialized = { ...obj };

  assetFields.forEach((field) => {
    serialized[field] = serializeAsset(obj[field]);
  });

  return serialized;
};

const getPagesSorted = (filter = {}) => Page.find(filter).sort({ sortOrder: 1, label: 1 });

const filterPagesForUser = async (pages, user) => {
  const roleName = typeof user?.role === 'object' ? user.role?.name : user?.role;
  if (roleName === 'super_admin') return pages;

  const fullUser = await User.findById(user?.id || user?._id).populate('role').lean();
  if (!fullUser) return [];

  return pages.filter((page) => canAccessTarget(fullUser, {
    pageKey: page.name || page.key,
    path: page.path,
    module: page.module
  }));
};

exports.getPermissionSettings = async (_req, res, next) => {
  try {
    const settings = await getPermissionSettings();
    res.json({
      success: true,
      message: 'Permission settings loaded',
      data: settings
    });
  } catch (error) {
    next(error);
  }
};

exports.updatePermissionSettings = async (req, res, next) => {
  try {
    const updates = {};
    if (req.body.logPermissionMode !== undefined) {
      const value = req.body.logPermissionMode;
      if (!['role', 'user'].includes(value)) {
        throw new AppError('logPermissionMode must be role or user', 400);
      }
      await SystemSetting.findOneAndUpdate(
        { key: 'logPermissionMode' },
        {
          $set: {
            value,
            category: 'permissions',
            description: 'Controls whether log visibility comes from role log permissions or user log permissions.',
          },
        },
        { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
      );
    }

    const settings = await getPermissionSettings();
    res.json({
      success: true,
      message: 'Permission settings saved',
      data: settings
    });
  } catch (error) {
    next(error);
  }
};

exports.getOverview = async (_req, res, next) => {
  try {
    const [pagesCount, assetsCount, rolesCount, usersCount] = await Promise.all([
      Page.countDocuments(),
      BrandingAsset.countDocuments({ isActive: true }),
      Role.countDocuments({ isActive: true }),
      User.countDocuments({ isActive: true })
    ]);

    res.json({
      success: true,
      data: {
        database: 'MongoDB',
        mongoConnected: true,
        usersCount,
        rolesCount,
        sidebarPagesCount: pagesCount,
        pagesCount,
        assetsCount,
        authProvider: 'MongoDB',
        sqlRuntime: 'disabled'
      }
    });
  } catch (error) {
    next(error);
  }
};

exports.getPages = async (_req, res, next) => {
  try {
    const pages = await getPagesSorted();
    res.json({ success: true, data: { pages } });
  } catch (error) {
    next(error);
  }
};

exports.createPage = async (req, res, next) => {
  try {
    const payload = normalizePageInput(req.body, 0);
    const page = await Page.create({
      ...payload,
      createdBy: getUserId(req),
      updatedBy: getUserId(req)
    });

    const pages = await getPagesSorted();
    res.status(201).json({ success: true, message: 'Page created', data: { page, pages } });
  } catch (error) {
    if (error.code === 11000) {
      return next(new AppError('Page path already exists', 400));
    }
    next(error);
  }
};

exports.syncPages = async (req, res, next) => {
  try {
    const incomingPages = Array.isArray(req.body) ? req.body : req.body.pages;
    if (!Array.isArray(incomingPages)) throw new AppError('pages array is required', 400);

    const userId = getUserId(req);
    await Promise.all(incomingPages.map(async (page, index) => {
      const payload = normalizePageInput(page, index);
      const existing = await Page.findOne({
        $or: [
          { path: payload.path },
          { name: payload.name }
        ]
      });

      if (existing) {
        return;
      }

      await Page.create({ ...payload, createdBy: userId, updatedBy: userId });
    }));

    const pages = await getPagesSorted();
    res.json({ success: true, message: 'Pages synced', data: { pages } });
  } catch (error) {
    next(error);
  }
};

exports.updatePages = async (req, res, next) => {
  try {
    const incomingPages = Array.isArray(req.body) ? req.body : req.body.pages;
    if (!Array.isArray(incomingPages)) throw new AppError('pages array is required', 400);

    const userId = getUserId(req);
    await Promise.all(incomingPages.map(async (page, index) => {
      const payload = normalizePageInput(page, index);
      const query = page._id ? { _id: page._id } : { path: payload.path };
      await Page.findOneAndUpdate(query, { $set: { ...payload, updatedBy: userId } }, { returnDocument: 'after' });
    }));

    const pages = await getPagesSorted();
    res.json({ success: true, message: 'Pages updated', data: { pages } });
  } catch (error) {
    next(error);
  }
};

exports.getSidebar = async (req, res, next) => {
  try {
    const pages = await getPagesSorted({ isActive: true }).lean();
    const visiblePages = await filterPagesForUser(pages, req.user);
    const branding = await getBrandingDoc();

    res.json({
      success: true,
      data: {
        pages: visiblePages,
        branding: serializeBranding(branding)
      }
    });
  } catch (error) {
    next(error);
  }
};

exports.saveSidebar = async (req, res, next) => {
  try {
    const incomingPages = Array.isArray(req.body) ? req.body : req.body.pages;
    if (!Array.isArray(incomingPages)) throw new AppError('pages array is required', 400);

    const userId = getUserId(req);
    await Promise.all(incomingPages.map(async (page, index) => {
      const payload = normalizePageInput(page, index);
      const query = page._id ? { _id: page._id } : { path: payload.path };
      await Page.findOneAndUpdate(query, { $set: { ...payload, updatedBy: userId } }, { returnDocument: 'after' });
    }));

    const pages = await getPagesSorted();
    res.json({ success: true, message: 'Sidebar configuration saved', data: { pages } });
  } catch (error) {
    next(error);
  }
};

exports.getBranding = async (_req, res, next) => {
  try {
    const [setting, assets] = await Promise.all([
      getBrandingDoc(),
      BrandingAsset.find({ isActive: true }).sort({ createdAt: -1 })
    ]);

    res.json({
      success: true,
      data: {
        setting: serializeBranding(setting),
        assets: assets.map(serializeAsset)
      }
    });
  } catch (error) {
    next(error);
  }
};

exports.updateBranding = async (req, res, next) => {
  try {
    const setting = await getBrandingDoc();
    const assetFields = brandingAssetFields;

    ['applicationName', 'browserTitle', 'activeTheme'].forEach((field) => {
      if (req.body[field] !== undefined) setting[field] = req.body[field];
    });

    const sidebarFields = ['sidebarBackgroundType', 'sidebarBackgroundColor', 'sidebarGradientFrom', 'sidebarGradientTo', 'sidebarGradientAngle', 'sidebarBackgroundSize', 'sidebarBackgroundPosition', 'sidebarBackgroundRepeat', 'sidebarOverlayColor', 'sidebarOverlayOpacity', 'sidebarTextColor', 'sidebarHeadingColor', 'sidebarActiveColor'];
    sidebarFields.forEach((field) => {
      if (req.body[field] !== undefined) setting[field] = req.body[field];
    });

    assetFields.forEach((field) => {
      if (req.body[field] !== undefined) setting[field] = req.body[field] || null;
    });

    setting.updatedBy = getUserId(req);
    await setting.save();

    await BrandingAsset.updateMany({}, { $set: { placements: [] } });
    await Promise.all(assetFields.map(async (field) => {
      const assetId = setting[field];
      if (assetId) {
        await BrandingAsset.findByIdAndUpdate(assetId, { $addToSet: { placements: field } });
      }
    }));

    const [updatedSetting, assets] = await Promise.all([
      populateBranding(BrandingSetting.findById(setting._id)),
      BrandingAsset.find({ isActive: true }).sort({ createdAt: -1 })
    ]);

    res.json({
      success: true,
      message: 'Branding settings saved',
      data: {
        setting: serializeBranding(updatedSetting),
        assets: assets.map(serializeAsset)
      }
    });
  } catch (error) {
    next(error);
  }
};

exports.deleteAsset = async (req, res, next) => {
  try {
    const asset = await BrandingAsset.findById(req.params.id);
    if (!asset) throw new AppError('Asset not found', 404);

    const filePath = asset.filePath;
    await BrandingAsset.deleteOne({ _id: asset._id });
    const settings = await BrandingSetting.find();
    await Promise.all(settings.map(async (setting) => {
      let changed = false;
      brandingAssetFields.forEach((field) => {
        if (setting[field]?.toString?.() === asset._id.toString()) {
          setting[field] = null;
          changed = true;
        }
      });
      if (changed) await setting.save();
    }));
    const branding = await getBrandingDoc();
    const assets = await BrandingAsset.find({ isActive: true }).sort({ createdAt: -1 });
    unlinkAssetFile(filePath);

    res.json({
      success: true,
      message: 'Asset deleted',
      data: { setting: serializeBranding(branding), assets: assets.map(serializeAsset) }
    });
  } catch (error) {
    next(error);
  }
};

exports.replaceAsset = async (req, res, next) => {
  try {
    if (!req.file) throw new AppError('Replacement image is required', 400);

    const asset = await BrandingAsset.findById(req.params.id);
    if (!asset) throw new AppError('Asset not found', 404);

    const oldFilePath = asset.filePath;

    const updated = await BrandingAsset.findByIdAndUpdate(req.params.id, {
      originalName: req.file.originalname,
      fileName: req.file.filename,
      filePath: req.file.path,
      mimeType: req.file.mimetype,
      size: req.file.size,
      publicUrl: getPublicFileUrl(`/api/uploads/branding/${req.file.filename}`),
      updatedBy: getUserId(req),
    }, { returnDocument: 'after' });

    unlinkAssetFile(oldFilePath);

    const branding = await getBrandingDoc();
    const assets = await BrandingAsset.find({ isActive: true }).sort({ createdAt: -1 });
    res.json({
      success: true,
      message: 'Asset replaced',
      data: { asset: serializeAsset(updated), setting: serializeBranding(branding), assets: assets.map(serializeAsset) }
    });
  } catch (error) {
    next(error);
  }
};

exports.getAssets = exports.getBranding;

exports.uploadAssets = async (req, res, next) => {
  try {
    if (!req.files?.length) throw new AppError('At least one image is required', 400);

    fs.mkdirSync(uploadRoot, { recursive: true });

    const assets = await Promise.all(req.files.map((file) => BrandingAsset.create({
      originalName: file.originalname,
      fileName: file.filename,
      filePath: file.path,
      mimeType: file.mimetype,
      size: file.size,
      publicUrl: getPublicFileUrl(`/api/uploads/branding/${file.filename}`),
      uploadedBy: getUserId(req),
      placements: []
    })));

    req.files.forEach((file) => {
      logFileOperation(req, {
        action: 'upload',
        fileName: file.filename,
        filePath: file.path,
        size: file.size,
        mimeType: file.mimetype
      });
    });

    res.status(201).json({
      success: true,
      message: 'Assets uploaded',
      data: { assets: assets.map(serializeAsset) }
    });
  } catch (error) {
    next(error);
  }
};

exports.saveAssetAssignments = async (req, res, next) => {
  try {
    const assignments = req.body.assignments || req.body;
    const payload = {};

    Object.entries(assignments || {}).forEach(([placement, assetId]) => {
      payload[placement] = assetId || null;
    });

    req.body = payload;
    return exports.updateBranding(req, res, next);
  } catch (error) {
    next(error);
  }
};

exports.getRoles = async (_req, res, next) => {
  try {
    const roles = await Role.find().sort({ name: 1 });
    res.json({ success: true, data: { roles } });
  } catch (error) {
    next(error);
  }
};

exports.createRole = async (req, res, next) => {
  try {
    const payload = {
      ...req.body,
      permissions: normalizePermissions(req.body.permissions),
      editable: req.body.name !== 'super_admin',
      createdBy: getUserId(req)
    };

    const role = await Role.create(payload);
    res.status(201).json({ success: true, message: 'Role created', data: { role } });
  } catch (error) {
    if (error.code === 11000) {
      return next(new AppError('Role already exists.', 400));
    }
    next(error);
  }
};

exports.updateRole = async (req, res, next) => {
  try {
    const roleId = req.params.id || req.body._id || req.body.id;
    if (!roleId) throw new AppError('Role id is required', 400);

    const role = await Role.findById(roleId);
    if (!role) throw new AppError('Role not found', 404);
    if (role.name === 'super_admin') throw new AppError('Cannot edit super_admin role', 400);

    ['displayName', 'description', 'isActive'].forEach((field) => {
      if (req.body[field] !== undefined) role[field] = req.body[field];
    });

    if (req.body.logsPermissions !== undefined) {
      role.logsPermissions = withLogPermissionMeta(req.body.logsPermissions, getUserId(req));
    }

    role.permissions = normalizePermissions(req.body.permissions);
    role.editable = true;
    await role.save();

    res.json({ success: true, message: 'Role updated', data: { role } });
  } catch (error) {
    next(error);
  }
};

exports.updateRoles = async (req, res, next) => {
  if (req.body.role || req.body._id || req.body.id) {
    req.body = req.body.role || req.body;
    return exports.updateRole(req, res, next);
  }
  return next(new AppError('Role payload is required', 400));
};

exports.deleteRole = async (req, res, next) => {
  try {
    const role = await Role.findById(req.params.id);
    if (!role) throw new AppError('Role not found', 404);
    if (role.name === 'super_admin') throw new AppError('Cannot delete super_admin role', 400);
    await role.deleteOne();
    res.json({ success: true, message: 'Role deleted' });
  } catch (error) {
    next(error);
  }
};

exports.getUsers = async (_req, res, next) => {
  try {
    const users = await User.find()
      .select('uuid email firstName lastName phone role isActive customPermissions logPermissionSource logsPermissions createdAt')
      .populate('role', 'name displayName permissions logsPermissions')
      .sort({ createdAt: -1 });
    const pages = await getPagesSorted({ isActive: true });

    res.json({ success: true, data: { users, pages } });
  } catch (error) {
    next(error);
  }
};

exports.getUserPermissions = async (req, res, next) => {
  try {
    if (req.params.id) {
      const user = await User.findById(req.params.id)
        .select('email firstName lastName role customPermissions logPermissionSource logsPermissions')
        .populate('role', 'name displayName permissions logsPermissions');
      if (!user) throw new AppError('User not found', 404);
      return res.json({ success: true, data: { user, permissions: user.customPermissions || [] } });
    }

    const users = await User.find()
      .select('uuid email firstName lastName phone role isActive customPermissions logPermissionSource logsPermissions createdAt')
      .populate('role', 'name displayName permissions logsPermissions')
      .sort({ createdAt: -1 });
    const pages = await getPagesSorted({ isActive: true });
    return res.json({ success: true, data: { users, pages } });
  } catch (error) {
    next(error);
  }
};

exports.updateUserPermissions = async (req, res, next) => {
  try {
    const userId = req.params.id || req.body.userId;
    if (!userId) throw new AppError('User id is required', 400);

    let permissions = req.body.permissions || req.body.customPermissions || [];
    if (!Array.isArray(permissions)) permissions = [];

    const user = await User.findById(userId);
    if (!user) throw new AppError('User not found', 404);

    user.customPermissions = permissions.map((p) => ({
      pageKey: p.pageKey || p.name || p.key || '',
      path: p.path || '',
      module: p.module || '',
      canView: p.canView === true,
      isActive: p.isActive !== false,
    })).filter((p) => p.pageKey || p.path);

    await user.save();

    res.json({ success: true, message: 'User permissions saved', data: { user } });
  } catch (error) {
    next(error);
  }
};

exports.updateRolePermissions = async (req, res, next) => {
  try {
    const roleId = req.params.id;
    if (!roleId) throw new AppError('Role id is required', 400);

    let permissions = req.body.permissions || [];
    if (!Array.isArray(permissions)) permissions = [];

    const role = await Role.findById(roleId);
    if (!role) throw new AppError('Role not found', 404);
    if (role.name === 'super_admin') throw new AppError('Cannot modify super_admin permissions', 403);

    role.permissions = permissions.map((p) => ({
      pageKey: p.pageKey || p.name || p.key || '',
      path: p.path || '',
      module: p.module || '',
      canView: p.canView === true,
      isActive: p.isActive !== false,
    })).filter((p) => p.pageKey || p.path);

    await role.save();

    const updatedRole = await Role.findById(role._id).lean();
    res.json({ success: true, message: 'Role permissions saved', data: { role: updatedRole } });
  } catch (error) {
    next(error);
  }
};

exports.saveRoleLogsPermissions = async (req, res, next) => {
  try {
    const roleId = req.params.id || req.body.roleId;
    if (!roleId) throw new AppError('Role id is required', 400);
    const role = await Role.findById(roleId);
    if (!role) throw new AppError('Role not found', 404);

    role.logsPermissions = withLogPermissionMeta(req.body.logsPermissions || req.body.logPermissions, getUserId(req));
    await role.save();

    const populatedRole = await Role.findById(role._id).lean();
    res.json({ success: true, message: 'Log permissions saved for role', data: { role: populatedRole } });
  } catch (error) {
    next(error);
  }
};

exports.getSetting = async (req, res, next) => {
  try {
    const { key } = req.params;
    if (!key) {
      const settings = await require('../models').SystemSetting.find().lean();
      const map = {};
      settings.forEach((s) => { map[s.key] = s.value; });
      return res.json({ success: true, data: map });
    }
    const setting = await require('../models').SystemSetting.findOne({ key }).lean();
    res.json({ success: true, data: { key: setting?.key || key, value: setting?.value ?? null } });
  } catch (error) {
    next(error);
  }
};

exports.saveSetting = async (req, res, next) => {
  try {
    const { key, value } = req.body;
    if (!key) return res.status(400).json({ success: false, message: 'key is required' });

    await require('../models').SystemSetting.findOneAndUpdate(
      { key },
      { $set: { key, value } },
      { upsert: true, returnDocument: 'after' }
    );

    res.json({ success: true, message: `${key} saved`, data: { key, value } });
  } catch (error) {
    next(error);
  }
};

exports.getLeadAssignmentRoles = async (_req, res, next) => {
  try {
    const setting = await SystemSetting.findOne({ key: 'lead_assignment_roles' }).lean();
    const roles = setting && Array.isArray(setting.value) ? setting.value : [];
    res.json({ success: true, data: { roles } });
  } catch (error) {
    next(error);
  }
};

exports.updateLeadAssignmentRoles = async (req, res, next) => {
  try {
    const { roles } = req.body;
    if (!Array.isArray(roles)) {
      return res.status(400).json({ success: false, message: 'roles array is required' });
    }
    await SystemSetting.findOneAndUpdate(
      { key: 'lead_assignment_roles' },
      { $set: { key: 'lead_assignment_roles', value: roles, category: 'leads', description: 'Role IDs allowed to be assigned as lead assignees' } },
      { upsert: true, returnDocument: 'after' },
    );
    res.json({ success: true, message: 'Lead assignment roles saved', data: { roles } });
  } catch (error) {
    next(error);
  }
};

exports.getCustomerRoleConfig = async (_req, res, next) => {
  try {
    const setting = await SystemSetting.findOne({ key: 'customer_role_config' }).lean();
    const config = setting?.value || { activeRoleId: null, availableRoleIds: [], updatedAt: null, updatedBy: null };
    res.json({ success: true, data: config });
  } catch (error) {
    next(error);
  }
};

exports.saveCustomerRoleConfig = async (req, res, next) => {
  try {
    const userId = getUserId(req);
    const { activeRoleId, availableRoleIds } = req.body;
    if (!activeRoleId) {
      return res.status(400).json({ success: false, message: 'activeRoleId is required' });
    }
    if (!Array.isArray(availableRoleIds)) {
      return res.status(400).json({ success: false, message: 'availableRoleIds array is required' });
    }
    const config = {
      activeRoleId,
      availableRoleIds,
      updatedAt: new Date(),
      updatedBy: userId,
    };
    await SystemSetting.findOneAndUpdate(
      { key: 'customer_role_config' },
      { $set: { key: 'customer_role_config', value: config, category: 'customers', description: 'Customer role configuration for lead conversion' } },
      { upsert: true, returnDocument: 'after' },
    );
    await createAuditLog(userId, 'Update Customer Role Config', 'Server Management', `Customer role config saved (role: ${activeRoleId})`, req);
    logFileOperation(req, { action: 'saveCustomerRoleConfig', activeRoleId });
    res.json({ success: true, message: 'Customer role config saved', data: config });
  } catch (error) {
    next(error);
  }
};

exports.getEmployeeRoleConfig = async (_req, res, next) => {
  try {
    const setting = await SystemSetting.findOne({ key: 'employee_role_config' }).lean();
    res.json({ success: true, data: setting?.value || { activeRoleId: null, updatedAt: null, updatedBy: null } });
  } catch (error) {
    next(error);
  }
};

exports.saveEmployeeRoleConfig = async (req, res, next) => {
  try {
    const userId = getUserId(req);
    const { activeRoleId } = req.body;
    if (!activeRoleId) {
      return res.status(400).json({ success: false, message: 'activeRoleId is required' });
    }
    const role = await Role.findById(activeRoleId).select('_id name').lean();
    if (!role || role.name === 'super_admin') {
      return res.status(400).json({ success: false, message: 'Select a valid employee role' });
    }
    const config = { activeRoleId, updatedAt: new Date(), updatedBy: userId };
    await SystemSetting.findOneAndUpdate(
      { key: 'employee_role_config' },
      { $set: { key: 'employee_role_config', value: config, category: 'employees', description: 'Role assigned to newly created employees' } },
      { upsert: true, returnDocument: 'after' },
    );
    await createAuditLog(userId, 'Update Employee Role Config', 'Server Management', `Employee role config saved (role: ${activeRoleId})`, req);
    logFileOperation(req, { action: 'saveEmployeeRoleConfig', activeRoleId });
    res.json({ success: true, message: 'Employee role config saved', data: config });
  } catch (error) {
    next(error);
  }
};

/*
 * Role-usage settings that decide which roles staff a given form field, plus a
 * lookup that turns the configured roles into the actual selectable users.
 */
const ROLE_USAGE_SETTINGS = {
  warehouseManager: {
    key: 'warehouse_manager_roles',
    category: 'warehouse',
    description: 'Role IDs whose users can be assigned as warehouse managers',
    label: 'Warehouse manager roles',
  },
  serviceAdvisor: {
    key: 'service_advisor_roles',
    category: 'service',
    description: 'Role IDs whose users can be assigned as service advisors',
    label: 'Service advisor roles',
  },
};

const readRoleUsage = async (name) => {
  const setting = await SystemSetting.findOne({ key: ROLE_USAGE_SETTINGS[name].key }).lean();
  return setting && Array.isArray(setting.value) ? setting.value : [];
};

const makeRoleUsageHandlers = (name) => {
  const config = ROLE_USAGE_SETTINGS[name];
  return {
    get: async (_req, res, next) => {
      try {
        res.json({ success: true, data: { roles: await readRoleUsage(name) } });
      } catch (error) {
        next(error);
      }
    },
    update: async (req, res, next) => {
      try {
        const { roles } = req.body;
        if (!Array.isArray(roles)) {
          return res.status(400).json({ success: false, message: 'roles array is required' });
        }
        await SystemSetting.findOneAndUpdate(
          { key: config.key },
          { $set: { key: config.key, value: roles, category: config.category, description: config.description } },
          { upsert: true, returnDocument: 'after' },
        );
        await createAuditLog(getUserId(req), `Update ${config.label}`, 'Server Management', `${config.label} saved`, req);
        res.json({ success: true, message: `${config.label} saved`, data: { roles } });
      } catch (error) {
        next(error);
      }
    },
    /** Active users holding one of the configured roles. */
    users: async (_req, res, next) => {
      try {
        const roles = await readRoleUsage(name);
        if (!roles.length) return res.json({ success: true, data: { users: [], roles } });
        const users = await User.find({
          role: { $in: roles },
          isActive: true,
          status: 'active',
        })
          .select('firstName lastName email phone role')
          .populate('role', 'name displayName')
          .sort({ firstName: 1 })
          .lean();
        res.json({ success: true, data: { users, roles } });
      } catch (error) {
        next(error);
      }
    },
  };
};

const warehouseManagerHandlers = makeRoleUsageHandlers('warehouseManager');
exports.getWarehouseManagerRoles = warehouseManagerHandlers.get;
exports.updateWarehouseManagerRoles = warehouseManagerHandlers.update;
exports.getWarehouseManagerUsers = warehouseManagerHandlers.users;

const serviceAdvisorHandlers = makeRoleUsageHandlers('serviceAdvisor');
exports.getServiceAdvisorRoles = serviceAdvisorHandlers.get;
exports.updateServiceAdvisorRoles = serviceAdvisorHandlers.update;
exports.getServiceAdvisorUsers = serviceAdvisorHandlers.users;

/**
 * Keep only field keys the page actually publishes, and collapse "everything
 * ticked" back to mode "all" so a later catalog addition stays visible rather
 * than being silently withheld by a stale allow-list.
 */
const normalizeJobFields = (pageKey, fields) => {
  const catalogKeys = pageFieldKeys(pageKey);
  if (!catalogKeys.length || fields?.mode !== 'selected') return { mode: 'all', allowed: [] };
  const allowed = catalogKeys.filter((key) => (fields.allowed || []).map(String).includes(key));
  if (allowed.length === catalogKeys.length) return { mode: 'all', allowed: [] };
  return { mode: 'selected', allowed };
};

exports.getRoleJobs = async (req, res, next) => {
  try {
    const role = await Role.findById(req.params.id)
      .select('name displayName permissions jobs')
      .populate('jobs.dataScope.roles', 'name displayName')
      .populate('jobs.dataScope.users', 'firstName lastName email')
      .lean();
    if (!role) throw new AppError('Role not found', 404);
    // Every page, not only the ones already granted. Role Jobs used to list
    // just the granted ones, which left no way to reach a page that had never
    // been ticked in Roles Permissions — the Parts Scan screen would tell an
    // operator to ask for "Create" on a card that was nowhere to be found.
    const pages = await Page.find({ isActive: { $ne: false } })
      .select('name label module path group sortOrder')
      .sort({ sortOrder: 1 })
      .lean();
    // Both tables below are keyed by the page names this build was written
    // with, and the screen looks each card up by the name the page carries in
    // *this* database. Those differ wherever a page was added by hand — live
    // holds the parts scanner as "Parts Barcode Scan" — and a card that finds no
    // entry falls back to offering every action. That put Create, Delete and
    // Approve on the read-only Dispatch report, which `saveRoleJobs` then
    // silently dropped, and left five pages with no column controls at all.
    // Re-keying here means the screen asks about the page in front of it.
    const canonical = new Map(pages.map((page) => [page.name, canonicalKey(page.name, role.permissions)]));
    const forPages = (table) => Object.fromEntries(
      pages.map((page) => [page.name, table[canonical.get(page.name)]]).filter(([, value]) => value),
    );
    const catalogByKey = Object.fromEntries(catalogForUi().map((entry) => [entry.pageKey, entry]));

    res.json({
      success: true,
      data: {
        role,
        jobs: role.jobs || [],
        pages,
        fieldCatalog: Object.entries(forPages(catalogByKey))
          .map(([pageKey, entry]) => ({ ...entry, pageKey })),
        // So the screen can offer each page only the actions it really has.
        capabilities: forPages(PAGE_CAPABILITIES),
        actionLabels: ACTION_LABELS,
      },
    });
  } catch (error) { next(error); }
};

exports.getFieldCatalog = async (req, res, next) => {
  try {
    res.json({ success: true, data: catalogForUi() });
  } catch (error) { next(error); }
};

exports.saveRoleJobs = async (req, res, next) => {
  try {
    const role = await Role.findById(req.params.id);
    if (!role) throw new AppError('Role not found', 404);
    if (role.name === 'super_admin') throw new AppError('Super admin always has full access', 403);
    const pages = await Page.find({ isActive: { $ne: false } }).select('name label module path').lean();
    const pageByKey = new Map(pages.map((page) => [page.name, page]));

    const incoming = Array.isArray(req.body.jobs) ? req.body.jobs : [];
    // The screen now lists every page with its own "Allow this page" switch, so
    // this is where page access is granted as well as what may be done with it.
    const requestedPages = new Set(incoming.filter((job) => job.allowed !== false).map((job) => job.pageKey));

    // Rows for keys that are not live pages (`sales`, `payments`, and other
    // leftovers from before the pages were split) are carried through
    // untouched: this screen did not offer them, so it must not revoke them.
    const legacy = (role.permissions || []).filter((item) => !pageByKey.has(item.pageKey));
    const existing = new Map((role.permissions || []).map((item) => [item.pageKey, item]));
    role.permissions = [
      ...legacy,
      ...[...requestedPages].filter((key) => pageByKey.has(key)).map((key) => {
        const page = pageByKey.get(key);
        return {
          pageKey: key,
          path: existing.get(key)?.path || page.path,
          module: existing.get(key)?.module || page.module,
          canView: true,
          isActive: true,
        };
      }),
    ];

    const allowedPages = new Map([...requestedPages]
      .filter((key) => pageByKey.has(key))
      .map((key) => [key, { pageKey: key, module: pageByKey.get(key).module || key }]));

    role.jobs = incoming.filter((job) => allowedPages.has(job.pageKey)).map((job) => {
      const page = allowedPages.get(job.pageKey);
      const capability = capabilitiesFor(job.pageKey);
      // An action the page does not implement is stored as false whatever the
      // client sent, so the saved role never claims a permission that has no
      // endpoint behind it.
      const granted = (action) => capability.actions.includes(action) && job.actions?.[action] === true;
      // Pages whose records belong to the whole company are never scoped by
      // creator; storing "own" there would read as a restriction that no
      // controller applies.
      const requested = ['own', 'selected_roles', 'selected_users', 'all'].includes(job.dataScope?.mode) ? job.dataScope.mode : 'own';
      const mode = capability.dataScope ? requested : 'all';
      return {
        pageKey: job.pageKey,
        module: page.module || job.module || job.pageKey,
        actions: {
          view: true,
          create: granted('create'),
          edit: granted('edit'),
          delete: granted('delete'),
          sendEmail: granted('sendEmail'),
          downloadPdf: granted('downloadPdf'),
          export: granted('export'),
          approve: granted('approve'),
          adjustStock: granted('adjustStock'),
        },
        dataScope: {
          mode,
          roles: mode === 'selected_roles' ? (job.dataScope?.roles || []) : [],
          users: mode === 'selected_users' ? (job.dataScope?.users || []) : [],
        },
        fields: normalizeJobFields(job.pageKey, job.fields),
      };
    });
    role.updatedBy = getUserId(req); await role.save();
    const updated = await Role.findById(role._id).select('name displayName permissions jobs');
    await createAuditLog(getUserId(req), 'Update Role Jobs', 'Server Management', `Role jobs saved for ${role.name}`, req);
    res.json({ success: true, message: 'Role jobs saved', data: { role: updated, jobs: updated.jobs } });
  } catch (error) { next(error); }
};

exports.updateUserLogsPermissions = async (req, res, next) => {
  try {
    const userId = req.params.id;
    if (!userId) throw new AppError('User id is required', 400);
    const user = await User.findById(userId);
    if (!user) throw new AppError('User not found', 404);
    user.logPermissionSource = req.body.logPermissionSource === 'user' ? 'user' : 'role';
    if (req.body.logsPermissions !== undefined || req.body.logPermissions !== undefined) {
      user.logsPermissions = withLogPermissionMeta(req.body.logsPermissions || req.body.logPermissions, getUserId(req));
    }
    await user.save();
    const populated = await User.findById(user._id)
      .select('email firstName lastName role logPermissionSource logsPermissions')
      .populate('role', 'name displayName permissions logsPermissions');
    res.json({ success: true, message: 'Log permissions saved for user', data: { user: populated } });
  } catch (error) {
    next(error);
  }
};

exports.createUser = async (req, res, next) => {
  try {
    const { email, password, firstName, lastName, phone, roleId, department, jobTitle } = req.body;

    if (!email || !password || !firstName || !lastName || !roleId) {
      throw new AppError("Missing required fields: email, password, firstName, lastName, roleId", 400);
    }

    const existing = await User.findOne({ email: email.toLowerCase().trim() });
    if (existing) {
      throw new AppError("A user with this email already exists", 400);
    }

    const role = await Role.findById(roleId);
    if (!role) {
      throw new AppError("Role not found", 400);
    }

    const now = new Date();
    const user = await User.create({
      email,
      password,
      firstName,
      lastName,
      phone: phone || "",
      role: roleId,
      department: department || "",
      designation: jobTitle || "",
      joinedAt: now,
      createdBy: getUserId(req),
      updatedBy: getUserId(req),
    });

    const populated = await User.findById(user._id)
      .select("email firstName lastName phone role department designation logPermissionSource logsPermissions createdAt updatedBy createdBy")
      .populate("role", "name displayName permissions");

    res.status(201).json({
      success: true,
      message: "User created successfully",
      data: { user: populated },
    });
  } catch (error) {
    if (error.code === 11000) {
      return next(new AppError("A user with this email already exists", 400));
    }
    next(error);
  }
};

exports.updateUser = async (req, res, next) => {
  try {
    const { id } = req.params;
    const user = await User.findById(id);
    if (!user) throw new AppError("User not found", 404);

    const { email, password, firstName, lastName, phone, roleId, department, jobTitle } = req.body;

    if (email !== undefined && email !== user.email) {
      const existing = await User.findOne({ email: email.toLowerCase().trim(), _id: { $ne: id } });
      if (existing) throw new AppError("A user with this email already exists", 400);
      user.email = email;
    }

    if (firstName !== undefined) user.firstName = firstName;
    if (lastName !== undefined) user.lastName = lastName;
    if (phone !== undefined) user.phone = phone;
    if (roleId !== undefined) user.role = roleId;
    if (department !== undefined) user.department = department;
    if (jobTitle !== undefined) user.designation = jobTitle;
    if (password !== undefined && password !== "") user.password = password;

    user.updatedBy = getUserId(req);

    await user.save();
    await syncFromUser(user, getUserId(req));

    const populated = await User.findById(user._id)
      .select("email firstName lastName phone role department designation logPermissionSource logsPermissions createdAt updatedBy createdBy")
      .populate("role", "name displayName permissions");

    res.json({
      success: true,
      message: "User updated successfully",
      data: { user: populated },
    });
  } catch (error) {
    if (error.code === 11000) {
      return next(new AppError("A user with this email already exists", 400));
    }
    next(error);
  }
};
