const User = require('../../models/User.model');
const Employee = require('../../models/Employee.model');
require('../../models/Role.model');
const { debugEvent } = require('./importDebugAudit');

const normalize = (value) => String(value == null ? '' : value)
  .replace(/\s+/g, ' ')
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9@.+-]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

function addIndex(map, key, value) {
  if (!key) return;
  const entries = map.get(key) || [];
  entries.push(value);
  map.set(key, entries);
}

function roleNames(role) {
  if (!role || typeof role !== 'object') return [];
  return [role.name, role.displayName].map(normalize).filter(Boolean);
}

class SellerIndex {
  constructor(users = [], employees = []) {
    this.users = users;
    this.employees = employees;
    this.userKeys = new Map();
    this.employeeKeys = new Map();

    users.forEach((user) => {
      const fullName = user.fullName || [user.firstName, user.lastName].filter(Boolean).join(' ');
      [fullName, user.email, user.employeeId].map(normalize).filter(Boolean)
        .forEach((key) => addIndex(this.userKeys, key, user));
    });
    employees.forEach((employee) => this.addEmployee(employee));
  }

  static async load({ session = null } = {}) {
    let usersQuery = User.find({ status: 'active', isActive: { $ne: false } }).populate('role').lean();
    let employeesQuery = Employee.find({ status: 'active', isActive: { $ne: false }, isDeleted: { $ne: true } })
      .populate('role')
      .populate('user')
      .lean();
    if (session) {
      usersQuery = usersQuery.session(session);
      employeesQuery = employeesQuery.session(session);
    }
    const [users, employees] = await Promise.all([usersQuery, employeesQuery]);
    return new SellerIndex(users, employees);
  }

  addEmployee(employee) {
    if (!employee?._id) return;
    const id = String(employee._id);
    if (!this.employees.some((candidate) => String(candidate._id) === id)) this.employees.push(employee);
    const fullName = [employee.firstName, employee.lastName].filter(Boolean).join(' ');
    [fullName, employee.email, employee.employeeCode].map(normalize).filter(Boolean)
      .forEach((key) => addIndex(this.employeeKeys, key, employee));
  }

  async resolveOrCreate({ sellerName, sellerRole, _meta = null } = {}) {
    const resolved = this.resolve({ sellerName, sellerRole, _meta });
    debugEvent('seller.auto_creation.checked', {
      _meta,
      sourceSellerText: sellerName || '',
      requestedRole: sellerRole || '',
      matchedUserId: resolved.user?._id ? String(resolved.user._id) : null,
      matchedEmployeeId: resolved.employee?._id ? String(resolved.employee._id) : null,
      autoCreated: false,
      policy: 'lookup-only',
    });
    return { ...resolved, created: false };
  }

  resolve({ sellerName, sellerRole, _meta = null } = {}) {
    const key = normalize(sellerName);
    if (!key) {
      const empty = { user: null, employee: null, matchBy: null };
      debugEvent('seller.lookup', {
        _meta,
        sourceSellerText: sellerName || '',
        normalizedSellerText: key,
        requestedRole: sellerRole || '',
        existingMatch: false,
        autoCreated: false,
      }, { section: 'sellers', bucket: 'unresolved', level: 'warn' });
      return empty;
    }
    const users = this.userKeys.get(key) || [];
    const employees = this.employeeKeys.get(key) || [];
    const requiredRole = normalize(sellerRole);
    const candidateSummary = [
      ...users.map((user) => ({
        type: 'User',
        id: String(user._id),
        name: user.fullName || [user.firstName, user.lastName].filter(Boolean).join(' '),
        active: user.status === 'active' && user.isActive !== false,
        roles: roleNames(user.role),
      })),
      ...employees.map((employee) => ({
        type: 'Employee',
        id: String(employee._id),
        userId: employee.user?._id ? String(employee.user._id) : null,
        name: [employee.firstName, employee.lastName].filter(Boolean).join(' '),
        active: employee.status === 'active' && employee.isActive !== false,
        roles: roleNames(employee.role),
      })),
    ];
    const finish = (result) => {
      const resolved = Boolean(result.user || result.employee);
      const bucket = result.ambiguous ? 'ambiguous' : (resolved ? 'resolved' : 'unresolved');
      debugEvent('seller.lookup', {
        _meta,
        sourceSellerText: sellerName || '',
        normalizedSellerText: key,
        requestedRole: sellerRole || '',
        existingMatch: resolved,
        matchMethod: result.matchBy || null,
        matchedUserId: result.user?._id ? String(result.user._id) : null,
        matchedEmployeeId: result.employee?._id ? String(result.employee._id) : null,
        matchedRole: result.user ? roleNames(result.user.role) : roleNames(result.employee?.role),
        active: result.user
          ? result.user.status === 'active' && result.user.isActive !== false
          : result.employee
            ? result.employee.status === 'active' && result.employee.isActive !== false
            : null,
        ambiguous: Boolean(result.ambiguous),
        roleMismatch: Boolean(result.roleMismatch),
        expectedRole: result.expectedRole || '',
        actualRoles: result.actualRoles || [],
        candidates: candidateSummary,
        autoCreated: false,
        sourceTextPreserved: true,
      }, {
        section: 'sellers',
        bucket,
        level: result.ambiguous ? 'error' : (!resolved ? 'warn' : 'info'),
      });
      return result;
    };
    const checkRole = (user, employee) => {
      const availableRoles = new Set([
        ...roleNames(user?.role),
        ...roleNames(employee?.role),
      ]);
      if (requiredRole && !availableRoles.has(requiredRole)) {
        return {
          user: null,
          employee: null,
          matchBy: 'name',
          roleMismatch: true,
          expectedRole: sellerRole,
          actualRoles: [...availableRoles],
        };
      }
      return null;
    };

    if (users.length > 1) {
      return finish({ user: null, employee: null, matchBy: 'name', ambiguous: true, count: users.length });
    }
    if (users.length === 1) {
      const roleError = checkRole(users[0], null);
      return finish(roleError || { user: users[0], employee: null, matchBy: 'user' });
    }
    if (employees.length > 1) {
      return finish({ user: null, employee: null, matchBy: 'name', ambiguous: true, count: employees.length });
    }
    if (employees.length === 1) {
      const employee = employees[0];
      const linkedUser = employee.user && typeof employee.user === 'object' ? employee.user : null;
      const roleError = checkRole(linkedUser, employee);
      return finish(roleError || { user: linkedUser, employee, matchBy: 'employee' });
    }
    return finish({ user: null, employee: null, matchBy: null });
  }
}

module.exports = { SellerIndex, normalizeSellerKey: normalize };
