const jwt = require('jsonwebtoken');
const { User } = require('../models');
const { AppError } = require('./errorHandler');
const { getPermissionSettings, resolvePagePermissions, canAccessTarget, routeTarget } = require('../utils/permissionResolver');
const { resolveEffectiveLogPermission } = require('../utils/logPermissionResolver');
const { canDo, getJob } = require('../utils/roleJobs');

const JWT_SECRET = process.env.JWT_SECRET || 'ams_super_secret_key';

const getCookieValue = (req, name) => {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return null;
  const cookies = cookieHeader.split(';').reduce((acc, cookie) => {
    const [key, ...valueParts] = cookie.trim().split('=');
    if (!key) return acc;
    acc[key] = decodeURIComponent(valueParts.join('='));
    return acc;
  }, {});
  return cookies[name] || null;
};

const normalizeRole = (role) => {
  if (!role || typeof role !== 'string') return '';
  return role.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
};

const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const cookieToken = getCookieValue(req, 'token');
    const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;

    if (!cookieToken && !bearerToken) {
      throw new AppError('No token provided', 401);
    }

    const token = cookieToken || bearerToken;
    const decoded = jwt.verify(token, JWT_SECRET);

    const user = await User.findById(decoded.id || decoded.userId).populate('role');

    if (!user) {
      throw new AppError('User not found', 401);
    }

    if (user.status !== 'active' || user.isActive === false) {
      throw new AppError('Account is inactive', 403, 'Please contact your administrator.', 'USER_INACTIVE');
    }

    const roleName = normalizeRole(user.role?.name || '');
    const isSuperAdmin = roleName === 'super_admin';

    const pagePermissions = resolvePagePermissions(user);
    const effectiveLogPermission = resolveEffectiveLogPermission(user);

    req.user = {
      id: user._id.toString(),
      uuid: user.uuid,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone,
      avatar: user.avatar || "",
      role: user.role,
      role_name: roleName,
      isSuperAdmin,
      pagePermissions,
      effectiveLogPermission,
      customPermissions: user.customPermissions || [],
      logsPermissions: user.logsPermissions || [],
      logPermissionSource: user.logPermissionSource || 'role',
    };
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return next(new AppError('Invalid token', 401));
    }
    if (error.name === 'TokenExpiredError') {
      return next(new AppError('Token expired', 401));
    }
    next(error);
  }
};

const authorize = (...roles) => {
  const normalizedRoles = roles.flat(Infinity).filter(Boolean).map(normalizeRole);
  return (req, res, next) => {
    if (!req.user) return next(new AppError('Authentication required', 401));
    if (normalizedRoles.includes(normalizeRole(req.user.role_name))) return next();
    const base = String(req.baseUrl || '').split('/').filter(Boolean).pop();
    const resource = { quotations: 'quotations', bookings: 'bookings', sales: 'sales_orders', invoices: 'invoices', leads: 'leads', customers: 'customers', employees: 'employees' }[base];
    if (!resource || !getJob(req.user, resource)) return next(new AppError('Access denied', 403));
    let action = 'view';
    if (req.path.includes('send-email')) action = 'sendEmail';
    else if (req.path.includes('pdf')) action = 'downloadPdf';
    else if (req.method === 'POST') action = 'create';
    else if (req.method === 'PUT' || req.method === 'PATCH') action = 'edit';
    else if (req.method === 'DELETE') action = 'delete';
    if (!canDo(req.user, resource, action)) return next(new AppError('Access denied', 403));
    next();
  };
};

const authorizePage = (pageKey, _action) => {
  return (req, res, next) => {
    if (!req.user) return next(new AppError('Authentication required', 401));
    if (req.user.isSuperAdmin) return next();

    const target = { pageKey, path: pageKey, module: pageKey };

    if (!canAccessTarget(req.user, target)) {
      return next(new AppError('Access denied', 403));
    }

    next();
  };
};

const checkPermission = (module, action) => {
  return async (req, res, next) => {
    try {
      if (!req.user) return next(new AppError('Authentication required', 401));
      if (req.user.isSuperAdmin) return next();

      const permissions = resolvePagePermissions(req.user);
      const hasPermission = permissions.length === 0 || permissions.some((p) => {
        if (p.module !== module && p.pageKey !== module && p.path !== module) return false;
        if (action === 'view') return p.canView === true;
        return p.canView === true;
      });

      if (!hasPermission) {
        return next(new AppError(`Permission denied: Cannot ${action} ${module}`, 403));
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

const generateToken = (user, remember = true) => {
  return jwt.sign(
    {
      id: user._id.toString(),
      role: user.role?.name || user.role?.toString() || '',
      username: user.username || user.email,
      email: user.email
    },
    JWT_SECRET,
    { expiresIn: remember ? '7d' : '1d' }
  );
};

const generateRefreshToken = (userId) => {
  return jwt.sign(
    { userId, type: 'refresh' },
    JWT_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' }
  );
};

module.exports = {
  authenticate,
  authorize,
  authorizePage,
  checkPermission,
  generateToken,
  generateRefreshToken,
  getCookieValue,
  normalizeRole,
};
