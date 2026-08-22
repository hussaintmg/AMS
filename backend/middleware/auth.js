const jwt = require('jsonwebtoken');
const { User } = require('../models');
const { AppError } = require('./errorHandler');
const { getPermissionSettings, resolvePagePermissions, canAccessTarget, routeTarget } = require('../utils/permissionResolver');
const { resolveEffectiveLogPermission } = require('../utils/logPermissionResolver');
const { canDo, getJob } = require('../utils/roleJobs');
const { pathFor } = require('../utils/pageRegistry');
const logger = require('../utils/logger');

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

/**
 * Pages that grant the same vehicle-sales endpoint.
 *
 * The barcode scanner raises quotations, bookings and orders without the
 * operator ever opening the Sales pages, so holding Vehicle Scan has to be
 * enough on its own. The action is still judged against *that* page's job — a
 * scanner-only role needs "create" on Vehicle Scan, not on Quotations.
 *
 * `actions` is what makes this safe: the scan screen only ever raises new
 * documents, so it grants `create` and nothing else. Holding it must never
 * become a way to edit or delete a document raised somewhere else.
 *
 * The parts routers pass their own list explicitly rather than appearing here:
 * a role that may raise a parts quotation has no business raising a vehicle one.
 */
const SCAN_CREATE_ONLY = { page: 'vehicle_scan', actions: ['create'] };
const PAGE_ALIASES = {
  quotations: ['quotations', SCAN_CREATE_ONLY],
  bookings: ['bookings', SCAN_CREATE_ONLY],
  sales_orders: ['sales_orders', SCAN_CREATE_ONLY],
  invoices: ['invoices', SCAN_CREATE_ONLY],
};

/**
 * Normalise whatever a route passed into the pages that may satisfy `action`.
 * Accepts a page name, a list of page names, or entries of the shape
 * `{ page, actions }` that only count for the actions they name.
 */
const pageKeysFor = (pageKey, action) => {
  const raw = Array.isArray(pageKey) ? pageKey : (PAGE_ALIASES[pageKey] || [pageKey]);
  return raw
    .flat(Infinity)
    .filter(Boolean)
    .filter((entry) => typeof entry === 'string' || !entry.actions || entry.actions.includes(action))
    .map((entry) => (typeof entry === 'string' ? entry : entry.page));
};

/**
 * Permission-based authorization middleware.
 * Flow:
 *   1. Super admin → always allowed
 *   2. Resolve page access: customPermissions > role.permissions (via canAccessTarget)
 *   3. Resolve action permission: role.jobs (via canDo)
 *   Both must pass, on the same page, for access to be granted. Where several
 *   pages lead to the endpoint (see PAGE_ALIASES) any one of them suffices.
 */
const authorizeAction = (pageKey, action = 'view') => {
  const candidates = pageKeysFor(pageKey, action);
  return (req, res, next) => {
    if (!req.user) return next(new AppError('Authentication required', 401));
    if (req.user.isSuperAdmin) return next();

    // The page's real *path* goes into the target — a role granted before the
    // screen moved carries the old path, and that is the only thing still tying
    // its grant to this page.
    //
    // `module` stays the key. A permission row is also matched on its module,
    // and a module is shared by several pages: Customers and Leads are both
    // "crm", Quotations and Invoices are both "sales". Putting the page's real
    // module here made a grant on any one page in a module open every other
    // page in it. The key keeps that comparison as the dead legacy branch it
    // was meant to be — it only fires for a row whose module literally names
    // the page.
    const target = (key) => ({ pageKey: key, path: pathFor(key) || key, module: key });
    const reachable = candidates.filter((key) => canAccessTarget(req.user, target(key)));
    if (!reachable.length) {
      logDenial(req, candidates, action, 'page not granted');
      return next(new AppError(`Access denied: no access to ${candidates[0]}`, 403));
    }

    if (!reachable.some((key) => canDo(req.user, key, action))) {
      logDenial(req, reachable, action, `no job row grants "${action}"`);
      return next(new AppError(`Permission denied: cannot ${action} ${candidates[0]}`, 403));
    }

    next();
  };
};

/**
 * Pass if ANY of these guards passes.
 *
 * `authorizeAction` ORs several *pages* for one action, but converting is a
 * case where two different actions both legitimately allow it: the source
 * document's Convert right, or Create on whatever the conversion produces.
 * Written as two guards in a row they would AND, which is how ticking
 * "Convert" on Parts Quotations still ended in "cannot create part_invoices".
 *
 * The first refusal is what the caller is told, so put the grant a user is
 * most likely to be missing first.
 */
const authorizeAny = (...guards) => (req, res, next) => {
  let firstError = null;
  const attempt = (index) => {
    if (index >= guards.length) return next(firstError);
    guards[index](req, res, (error) => {
      if (!error) return next();
      if (!firstError) firstError = error;
      return attempt(index + 1);
    });
  };
  attempt(0);
};

/**
 * Say enough about a refusal to settle it without a debugger.
 *
 * "Permission denied: cannot create part_scan" on its own cannot distinguish a
 * role that was never given the action from one whose job row is filed under a
 * key this guard does not use — and those need opposite fixes. Printing the
 * page's path, the request it came in on and the keys the role actually holds
 * makes the difference visible in the log line itself.
 */
const logDenial = (req, keys, action, reason) => {
  const jobs = (req.user?.role?.jobs || []).map((job) => job.pageKey);
  logger.warn(
    `[permission] ${req.user?.email || req.user?.id} (role ${req.user?.role_name}) denied ${action} — ${reason}. ` +
    `wanted=${keys.join('|')} paths=${keys.map((key) => pathFor(key) || '?').join('|')} ` +
    `request=${req.method} ${String(req.originalUrl || '').split('?')[0]} roleJobs=${jobs.join(',') || 'none'}`,
  );
};

const METHOD_ACTIONS = { GET: 'view', HEAD: 'view', POST: 'create', PUT: 'edit', PATCH: 'edit', DELETE: 'delete' };

/**
 * Guard a whole router in one line, deriving the action from the HTTP method.
 *
 * Written for the routers built before Role Jobs existed, which gate nothing
 * beyond "are you signed in" — master data, service appointments, job cards.
 * Listing thirty routes individually there is churn with no reader benefit;
 * the method already says what the request does.
 *
 * `overrides` handles the cases where it does not: a POST to a sub-path of an
 * existing record (adding a part to a job card, completing it) edits that
 * record rather than creating a new one. Each entry is
 * `{ pattern, method?, action }`, matched against the router-relative path,
 * first match wins.
 *
 * Mount it *instead of* the per-route `authenticate`, not alongside it, or
 * every request verifies its token twice.
 */
const authorizeRouter = (pageKey, overrides = []) => (req, res, next) => {
  const rule = overrides.find((entry) => (
    entry.pattern.test(req.path) && (!entry.method || entry.method === req.method)
  ));
  const action = rule?.action || METHOD_ACTIONS[req.method] || 'view';
  return authorizeAction(pageKey, action)(req, res, next);
};

module.exports = {
  authenticate,
  authorize,
  authorizeAction,
  authorizeAny,
  authorizeRouter,
  authorizePage,
  checkPermission,
  generateToken,
  generateRefreshToken,
  getCookieValue,
  normalizeRole,
};
