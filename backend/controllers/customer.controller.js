const mongoose = require('mongoose');
const Customer = require('../models/Customer.model');
const User = require('../models/User.model');
const SystemSetting = require('../models/SystemSetting.model');
const LeadSource = require('../models/LeadSource.model');
const LeadType = require('../models/LeadType.model');
const LeadCity = require('../models/LeadCity.model');
const StatusCollection = require('../models/StatusCollection.model');
const StatusItem = require('../models/StatusItem.model');
const Department = require('../models/Department.model');
const Log = require('../models/mongo/Log.model');
const { logFileOperation } = require('../utils/apiLogger');
const { isValidPhone } = require('../utils/phone.util');
const { sanitizeFields, containsMarkup } = require('../utils/sanitize.util');
const { syncFromCustomer } = require('../utils/relationshipSync');
const { allowedOwnerIds } = require('../utils/roleJobs');

async function generateCustomerCode() {
  const last = await Customer.findOne({ customerCode: { $regex: /^CUS-/ } }).sort({ createdAt: -1 }).lean();
  let nextNum = 1;
  if (last && last.customerCode) {
    const match = last.customerCode.match(/CUS-(\d+)/);
    if (match) nextNum = parseInt(match[1], 10) + 1;
  }
  return `CUS-${String(nextNum).padStart(6, '0')}`;
}

function validateEmail(email) {
  return email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function normalizePhone(val) {
  if (!val) return '';
  let cleaned = val.replace(/[\s\-\(\)\.]+/g, '');
  if (cleaned.startsWith('+')) return cleaned;
  if (cleaned.startsWith('00')) return '+' + cleaned.slice(2);
  if (cleaned.startsWith('0')) return '+92' + cleaned.slice(1);
  return '+92' + cleaned;
}

async function getSuperAdminRoleId() {
  try {
    const Role = require('../models/Role.model');
    const role = await Role.findOne({ name: 'super_admin' }).select('_id').lean();
    return role?._id?.toString();
  } catch { return null; }
}

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

exports.getCustomerMeta = async (req, res, next) => {
  try {
    const { filterRows } = require('../utils/dropdownScope');
    // The meta list serves the create form, the edit form and the filter bar.
    const FORMS = ['create', 'edit', 'filters'];
    const statusSetting = await SystemSetting.findOne({ key: 'lead_status_collection_id' }).lean();
    let statusCollection = null;
    if (statusSetting?.value) {
      statusCollection = await StatusCollection.findById(statusSetting.value).where('isActive').equals(true).lean();
    }
    if (!statusCollection) {
      statusCollection = await StatusCollection.findOne({ key: 'leads', isActive: true }).lean();
    }
    let statuses = [];
    if (statusCollection) {
      statuses = await StatusItem.find({ collection: statusCollection._id, isActive: true }).sort({ order: 1 }).lean();
    }

    let [sources, types, cities, departments] = await Promise.all([
      LeadSource.find({ isActive: true }).sort({ sortOrder: 1 }).lean(),
      LeadType.find({ isActive: true }).sort({ name: 1 }).lean(),
      LeadCity.find({ isActive: true }).sort({ sortOrder: 1, name: 1 }).lean(),
      Department.find({ isActive: true }).select('name createdBy').sort({ name: 1 }).lean(),
    ]);
    // Role Jobs → Customers → Forms: a master list can be hidden, a scoped
    // list (departments, users) narrowed to chosen creators.
    [sources, types, cities, departments] = await Promise.all([
      filterRows(req.user, 'customers', FORMS, 'source', sources, ['createdBy']),
      filterRows(req.user, 'customers', FORMS, 'type', types, ['createdBy']),
      filterRows(req.user, 'customers', FORMS, 'city', cities, ['createdBy']),
      filterRows(req.user, 'customers', FORMS, 'department', departments, ['createdBy', '_id']),
    ]);

    const setting = await SystemSetting.findOne({ key: 'lead_assignment_roles' }).lean();
    let allowedRoleIds = [];
    if (setting && Array.isArray(setting.value)) {
      allowedRoleIds = setting.value;
    }

    let users = [];
    if (allowedRoleIds.length > 0) {
      users = await User.find({ role: { $in: allowedRoleIds }, isActive: true })
        .select('firstName lastName email role createdBy')
        .sort({ firstName: 1 })
        .lean();
    }
    // A user "owns" their own row as well as the ones they created.
    users = await filterRows(req.user, 'customers', FORMS, 'assignedTo', users, ['_id', 'createdBy']);
    statuses = await filterRows(req.user, 'customers', FORMS, 'status', statuses, ['createdBy']);

    res.json({
      success: true,
      data: {
        statuses,
        statusCollectionId: statusCollection ? String(statusCollection._id) : null,
        statusCollectionName: statusCollection ? statusCollection.name : null,
        sources,
        types,
        cities,
        users,
        departments,
        leadAssignmentRolesConfigured: allowedRoleIds.length > 0,
      },
    });
  } catch (error) {
    console.error('getCustomerMeta error:', error);
    next(error);
  }
};

exports.getCustomers = async (req, res, next) => {
  try {
    const user = req.user;
    const isSuperAdmin = user?.role?.toString() === (await getSuperAdminRoleId());

    const {
      page = 1, limit = 20, search = '', customerType = '',
      city = '', isActive = 'all', sortBy = 'createdAt', sortOrder = 'desc',
      startDate = '', endDate = '', source = '', type = '', status = '',
      assignedTo = '', department = '',
    } = req.query;

    const filter = { deletedAt: null };
    if (isActive === 'true') filter.isActive = true;
    else if (isActive === 'false') filter.isActive = false;
    else if (isActive === 'all') { /* no filter */ }

    // PART 5: Ownership — non-super-admin only sees own customers
    const customerOwnerIds = await allowedOwnerIds(user, 'customers');
    if (customerOwnerIds !== null) filter.createdBy = { $in: customerOwnerIds };

    if (customerType) filter.customerType = customerType;
    if (city) filter.city = { $regex: city, $options: 'i' };
    if (source) filter.source = new mongoose.Types.ObjectId(source);
    if (type) filter.type = new mongoose.Types.ObjectId(type);
    if (status) filter.status = status;
    if (department) filter.department = new mongoose.Types.ObjectId(department);
    if (assignedTo === 'unassigned') filter.assignedTo = null;
    else if (assignedTo && mongoose.Types.ObjectId.isValid(assignedTo)) filter.assignedTo = new mongoose.Types.ObjectId(assignedTo);

    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        filter.createdAt.$lte = end;
      }
    }

    if (search) {
      const searchRegex = new RegExp(String(search).trim().split(/\s+/).map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'i');
      filter.$or = [
        { customerCode: searchRegex },
        { firstName: searchRegex },
        { lastName: searchRegex },
        { email: searchRegex },
        { phone: searchRegex },
        { status: searchRegex },
        // A plate, engine, chassis or PBO number finds the owner, so the gate
        // can look a customer up from what is written on the car.
        { 'vehicles.registrationNumber': searchRegex },
        { 'vehicles.engineNumber': searchRegex },
        { 'vehicles.chassisNumber': searchRegex },
        { 'vehicles.pboNumber': searchRegex },
      ];
    }

    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(1000, Math.max(1, parseInt(limit, 10)));
    const skip = (pageNum - 1) * limitNum;
    const sortObj = {};
    const allowedSortFields = ['createdAt', 'updatedAt', 'customerCode', 'firstName', 'lastName', 'email', 'customerType', 'status'];
    const safeSortBy = allowedSortFields.includes(sortBy) ? sortBy : 'createdAt';
    sortObj[safeSortBy] = sortOrder === 'asc' ? 1 : -1;

    const [customers, total] = await Promise.all([
      Customer.find(filter)
        .sort(sortObj)
        .skip(skip)
        .limit(limitNum)
        .populate('source', 'name code')
        .populate('type', 'name code category')
        .populate('assignedTo', 'firstName lastName email')
        .populate('department', 'name')
        .populate('leadRef', 'leadNo')
        .populate('user', 'email firstName lastName')
        .populate('createdBy', 'firstName lastName')
        .lean(),
      Customer.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: customers,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error('getCustomers error:', error);
    next(error);
  }
};

exports.getCustomerById = async (req, res, next) => {
  try {
    const customer = await Customer.findById(req.params.id)
      .populate('source', 'name code')
      .populate('type', 'name code category')
      .populate('assignedTo', 'firstName lastName email')
      .populate('department', 'name')
      .populate('leadRef', 'leadNo customerName email phone status')
      .populate('user', 'email firstName lastName phone isActive')
      .populate('createdBy', 'firstName lastName')
      .populate('updatedBy', 'firstName lastName')
      .lean();

    if (!customer) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    res.json({ success: true, data: customer });
  } catch (error) {
    console.error('getCustomerById error:', error);
    next(error);
  }
};

exports.createCustomer = async (req, res, next) => {
  try {
    const userId = req.user?._id || req.user?.id;

    if (!req.body.firstName || !req.body.firstName.trim()) {
      return res.status(400).json({ success: false, message: 'First name is required' });
    }
    if (containsMarkup(req.body.firstName) || containsMarkup(req.body.lastName)) {
      return res.status(400).json({ success: false, message: 'Name cannot contain HTML or script tags' });
    }
    if (!req.body.email || !req.body.email.trim()) {
      return res.status(400).json({ success: false, message: 'Email is required' });
    }

    const email = req.body.email.trim().toLowerCase();
    if (!validateEmail(email)) {
      return res.status(400).json({ success: false, message: 'Invalid email format' });
    }

    // Email identifies the customer across sales/invoices — duplicates make it
    // ambiguous which record a transaction belongs to.
    const existing = await Customer.findOne({ email, deletedAt: null }).select('_id customerCode').lean();
    if (existing) {
      return res.status(409).json({
        success: false,
        message: `A customer with email "${email}" already exists (${existing.customerCode || existing._id})`,
      });
    }

    const phone = req.body.phone ? normalizePhone(req.body.phone) : '';
    if (phone && !isValidPhone(phone)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid phone number — enter a valid number, e.g. 03001234567',
      });
    }

    // Get customer role config
    const roleConfigSetting = await SystemSetting.findOne({ key: 'customer_role_config' }).lean();
    let activeRoleId = null;
    if (roleConfigSetting && roleConfigSetting.value && roleConfigSetting.value.activeRoleId) {
      activeRoleId = roleConfigSetting.value.activeRoleId;
    }

    const customerCode = await generateCustomerCode();

    const customerData = {
      ...req.body,
      email,
      phone,
      customerCode,
      createdBy: userId,
    };
    // Names/addresses reach PDF invoices and email templates, which do not
    // escape — strip markup here rather than trusting every downstream surface.
    sanitizeFields(customerData, ['firstName', 'lastName', 'companyName', 'city', 'state', 'country'], 200);
    sanitizeFields(customerData, ['address'], 500);

    Object.keys(customerData).forEach((k) => {
      if (customerData[k] === '' || customerData[k] === null) customerData[k] = undefined;
    });
    const vehicles = normalizeVehicles(req.body.vehicles);
    if (vehicles && vehicles.length) customerData.vehicles = vehicles; else delete customerData.vehicles;

    let customer, createdUser;

    try {
      // Step 1: Create Customer
      customer = await Customer.create(customerData);

      // Step 2: Create User (skip if role not configured)
      if (activeRoleId) {
        const crypto = require('crypto');
        const rawPassword = crypto.randomBytes(4).toString('hex');
        try {
          createdUser = await User.create({
            email,
            password: rawPassword,
            firstName: customer.firstName || '',
            lastName: customer.lastName || '',
            phone: customer.phone || '',
            role: activeRoleId,
            customer: customer._id,
            isActive: true,
            createdBy: userId,
          });
        } catch (userErr) {
          if (userErr.code === 11000) {
            createdUser = await User.findOne({ email }).lean();
          } else {
            throw userErr;
          }
        }
      }

      // Step 3: Link user to customer
      if (createdUser && createdUser._id) {
        customer.user = createdUser._id;
        await customer.save();
      }
    } catch (txErr) {
      if (customer && customer._id) {
        await Customer.findByIdAndDelete(customer._id).catch(() => {});
      }
      if (createdUser && createdUser._id) {
        await User.findByIdAndDelete(createdUser._id).catch(() => {});
      }
      throw txErr;
    }

    await createAuditLog(userId, 'Create Customer', 'Customers', `Customer ${customerCode} created`, req);
    logFileOperation(req, { action: 'createCustomer', customerCode });

    res.status(201).json({
      success: true,
      message: 'Customer created successfully',
      data: { customer, user: createdUser ? { id: createdUser._id, email: createdUser.email } : null },
    });
  } catch (error) {
    console.error('createCustomer error:', error);
    next(error);
  }
};

/**
 * The customer's own vehicles, normalised.
 *
 * The gate asks for a registration, engine number, chassis number and PBO
 * every time; storing them on the customer means the second visit does not
 * have to ask again. Blank rows are dropped, and exactly one vehicle can be
 * the primary one.
 */
const normalizeVehicles = (raw) => {
  if (!Array.isArray(raw)) return null;
  const text = (value) => String(value == null ? '' : value).trim().slice(0, 120);
  const rows = raw
    .map((row) => ({
      registrationNumber: text(row.registrationNumber ?? row.registration_number ?? row.vehicleNumber ?? row.vehicle_number),
      make: text(row.make),
      model: text(row.model),
      variant: text(row.variant),
      year: text(row.year),
      color: text(row.color),
      engineNumber: text(row.engineNumber ?? row.engine_number),
      chassisNumber: text(row.chassisNumber ?? row.chassis_number),
      pboNumber: text(row.pboNumber ?? row.pbo_number ?? row.pbo),
      notes: String(row.notes || '').trim().slice(0, 500),
      isPrimary: row.isPrimary === true || row.is_primary === true,
    }))
    // A row with nothing on it is not a vehicle.
    .filter((row) => row.registrationNumber || row.engineNumber || row.chassisNumber || row.pboNumber || row.make || row.model);
  const primary = rows.findIndex((row) => row.isPrimary);
  return rows.map((row, index) => ({ ...row, isPrimary: index === (primary === -1 ? 0 : primary) }));
};

exports.updateCustomer = async (req, res, next) => {
  try {
    const userId = req.user?._id || req.user?.id;
    const customer = await Customer.findById(req.params.id);
    if (!customer) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    const patch = { ...req.body, updatedBy: userId };
    const vehicles = normalizeVehicles(req.body.vehicles);
    if (vehicles) patch.vehicles = vehicles; else delete patch.vehicles;
    Object.assign(customer, patch);
    await customer.save();
    await syncFromCustomer(customer, userId, { syncStatus: req.body.isActive !== undefined });

    await createAuditLog(userId, 'Update Customer', 'Customers', `Customer ${customer.customerCode} updated`, req);
    logFileOperation(req, { action: 'updateCustomer', customerCode: customer.customerCode });

    res.json({ success: true, message: 'Customer updated successfully', data: customer });
  } catch (error) {
    console.error('updateCustomer error:', error);
    next(error);
  }
};

exports.deleteCustomer = async (req, res, next) => {
  try {
    const userId = req.user?._id || req.user?.id;
    const customer = await Customer.findById(req.params.id);
    if (!customer) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    const { customerCode } = customer;
    await Customer.deleteOne({ _id: customer._id });

    await createAuditLog(userId, 'Delete Customer', 'Customers', `Customer ${customerCode} deleted`, req);
    logFileOperation(req, { action: 'deleteCustomer', customerCode });

    res.json({ success: true, message: 'Customer deleted successfully' });
  } catch (error) {
    console.error('deleteCustomer error:', error);
    next(error);
  }
};

exports.toggleCustomerStatus = async (req, res, next) => {
  try {
    const userId = req.user?._id || req.user?.id;
    const customer = await Customer.findById(req.params.id);
    if (!customer) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    customer.isActive = !customer.isActive;
    customer.updatedBy = userId;
    await customer.save();
    await syncFromCustomer(customer, userId, { syncStatus: true });

    await createAuditLog(userId, 'Toggle Customer Status', 'Customers', `Customer ${customer.customerCode} ${customer.isActive ? 'activated' : 'deactivated'}`, req);
    logFileOperation(req, { action: 'toggleCustomerStatus', customerCode: customer.customerCode, nowActive: customer.isActive });

    res.json({ success: true, message: `Customer ${customer.isActive ? 'activated' : 'deactivated'} successfully`, isActive: customer.isActive });
  } catch (error) {
    console.error('toggleCustomerStatus error:', error);
    next(error);
  }
};

exports.getCustomerStats = async (req, res, next) => {
  try {
    const now = new Date();
    const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [total, active, inactive, individual, corporate, convertedFromLead, newThisMonth] = await Promise.all([
      Customer.countDocuments({ deletedAt: null }),
      Customer.countDocuments({ isActive: true, deletedAt: null }),
      Customer.countDocuments({ isActive: false, deletedAt: null }),
      Customer.countDocuments({ customerType: 'individual', deletedAt: null }),
      Customer.countDocuments({ customerType: 'corporate', deletedAt: null }),
      Customer.countDocuments({ leadRef: { $ne: null }, deletedAt: null }),
      Customer.countDocuments({ createdAt: { $gte: last30Days }, deletedAt: null }),
    ]);

    res.json({
      success: true,
      data: { total, active, inactive, individual, corporate, convertedFromLead, newThisMonth },
    });
  } catch (error) {
    console.error('getCustomerStats error:', error);
    next(error);
  }
};

exports.getCustomerCities = async (req, res, next) => {
  try {
    const cities = await Customer.distinct('city', { city: { $ne: '' } });
    res.json({ success: true, data: cities.sort() });
  } catch (error) {
    console.error('getCustomerCities error:', error);
    next(error);
  }
};

exports.getAllForDropdown = async (req, res, next) => {
  try {
    // The document forms name the dropdown they are filling
    // (?forPage=invoices&forForm=create&forField=customer); a request that
    // names none is unrestricted, as before.
    const { requestDropdownFilter, isHidden } = require('../utils/dropdownScope');
    const scope = await requestDropdownFilter(req, null, ['createdBy', 'assignedTo']);
    if (isHidden(scope)) return res.json({ success: true, data: [] });
    const customers = await Customer.find({ isActive: true, deletedAt: null, ...(scope || {}) })
      // The vehicles come along so a form that asks for a registration, engine,
      // chassis or PBO number (the gate pass) can fill them in from the record
      // instead of asking the customer again on every visit.
      .select('customerCode firstName lastName phone email vehicles')
      .sort({ firstName: 1 })
      .lean();

    const mapped = customers.map((c) => ({
      ...c,
      id: c._id,
      customer_number: c.customerCode || '',
      first_name: c.firstName || '',
      last_name: c.lastName || '',
      name: [c.firstName, c.lastName].filter(Boolean).join(' '),
    }));

    res.json({ success: true, data: mapped });
  } catch (error) {
    console.error('getAllForDropdown error:', error);
    next(error);
  }
};
