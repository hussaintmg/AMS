/**
 * Bulk import (CSV / XLSX) — server side.
 *
 * One route per page: Leads, Customers, Vehicles, Vehicle Brands, Parts,
 * Vehicle/Service/Sales/Lead Master Data (+ Sales Orders).
 *
 * Rules:
 *  - Reference columns (source, type, priority, city, status, department,
 *    warehouse, category, supplier, …) accept a NAME (or a Mongo id). Names
 *    are resolved server-side; an unknown name fails ONLY that row.
 *  - assigned_to accepts an email or a full name. The matched user's role
 *    must be listed in the `lead_assignment_roles` system setting.
 *  - Date columns accept flexible formats (YYYY-MM-DD, DD/MM/YYYY,
 *    MM-DD-YYYY, 13 Jul 2026, Excel serials, …).
 *  - A bad row never blocks other rows: valid rows are written with
 *    insertMany({ ordered: false }) and all row errors are returned together.
 */

const xlsx = require('xlsx');
const logger = require('../utils/logger');
const { AppError } = require('../middleware/errorHandler');
const { parseSpreadsheet } = require('../utils/bulkImport.parse');
const { normalizePhone } = require('../utils/phone.util');
const { leadNumberSequence } = require('../utils/leadNumber.util');

const Lead = require('../models/Lead.model');
const Customer = require('../models/Customer.model');
const LeadSource = require('../models/LeadSource.model');
const LeadType = require('../models/LeadType.model');
const LeadPriority = require('../models/LeadPriority.model');
const LeadCity = require('../models/LeadCity.model');
const StatusCollection = require('../models/StatusCollection.model');
const StatusItem = require('../models/StatusItem.model');
const SystemSetting = require('../models/SystemSetting.model');
const User = require('../models/User.model');
const Department = require('../models/Department.model');
const Vehicle = require('../models/Vehicle.model');
const Warehouse = require('../models/Warehouse.model');
const Part = require('../models/Part.model');
const { VehicleMake, VehicleModel, VehicleVariant, VehicleColor, PartCategory, Supplier, VehicleCondition } = require('../models/VehicleMaster.model');
const SalesOrder = require('../models/SalesOrder.model');
const Employee = require('../models/Employee.model');

/* ═══ generic helpers ═══════════════════════════════════════════════════ */

const MONGO_ID = /^[0-9a-f]{24}$/i;

function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function slugify(text) {
  return String(text).toLowerCase().trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w-]+/g, '')
    .replace(/--+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function toNum(v, def = 0) {
  if (v === undefined || v === null || String(v).trim() === '') return def;
  const n = parseFloat(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : def;
}

function toInt(v, def = 0) {
  if (v === undefined || v === null || String(v).trim() === '') return def;
  const n = parseInt(String(v).replace(/,/g, ''), 10);
  return Number.isFinite(n) ? n : def;
}

function toBool(v, def = true) {
  if (v === undefined || v === null || String(v).trim() === '') return def;
  return !['0', 'false', 'no', 'inactive', 'n'].includes(String(v).trim().toLowerCase());
}

const MONTH_NAMES = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
  may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8,
  sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11,
  dec: 12, december: 12
};

function buildDate(y, m, d) {
  if (y < 1900 || y > 2200 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return date;
}

function fixYear(y) {
  if (y >= 100) return y;
  return y >= 70 ? 1900 + y : 2000 + y;
}

/**
 * Parse the widest possible set of user-entered date formats.
 * Ambiguous numeric dates (05/07/2026) are treated as DD/MM (PK locale);
 * when one part is > 12 the order is inferred automatically.
 * Returns { date, ok, msg } — empty input is ok with date null.
 */
function parseFlexibleDate(raw, label = 'date') {
  if (raw === undefined || raw === null) return { date: null, ok: true };
  const s = String(raw).trim();
  if (!s) return { date: null, ok: true };

  // Excel serial number (days since 1899-12-30)
  if (/^\d+(\.\d+)?$/.test(s)) {
    const serial = parseFloat(s);
    if (serial > 20000 && serial < 80000) {
      const d = new Date(Math.round((serial - 25569) * 86400 * 1000));
      if (!Number.isNaN(d.getTime())) return { date: d, ok: true };
    }
    return { date: null, ok: false, msg: `Invalid ${label} "${raw}".` };
  }

  // ISO / year-first: 2026-07-13, 2026/7/3, 2026.07.13 (optional time part)
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s].*)?$/);
  if (m) {
    const d = buildDate(+m[1], +m[2], +m[3]);
    if (d) return { date: d, ok: true };
  }

  // Day-first / month-first numeric: 13/07/2026, 7-13-26, 13.07.2026 (optional time)
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})(?:[T\s].*)?$/);
  if (m) {
    const a = +m[1];
    const b = +m[2];
    const y = fixYear(+m[3]);
    let d = null;
    if (a > 12 && b <= 12) d = buildDate(y, b, a);        // DD/MM
    else if (b > 12 && a <= 12) d = buildDate(y, a, b);   // MM/DD
    else d = buildDate(y, b, a) || buildDate(y, a, b);    // ambiguous → DD/MM first
    if (d) return { date: d, ok: true };
  }

  // "13 Jul 2026", "13-July-2026", "13 jul, 26"
  m = s.match(/^(\d{1,2})(?:st|nd|rd|th)?[\s,./-]+([A-Za-z]{3,9})[\s,./-]+(\d{2,4})$/);
  if (m) {
    const mo = MONTH_NAMES[m[2].toLowerCase()];
    if (mo) {
      const d = buildDate(fixYear(+m[3]), mo, +m[1]);
      if (d) return { date: d, ok: true };
    }
  }

  // "Jul 13 2026", "July 13th, 2026"
  m = s.match(/^([A-Za-z]{3,9})[\s,./-]+(\d{1,2})(?:st|nd|rd|th)?[\s,./-]+(\d{2,4})$/);
  if (m) {
    const mo = MONTH_NAMES[m[1].toLowerCase()];
    if (mo) {
      const d = buildDate(fixYear(+m[3]), mo, +m[2]);
      if (d) return { date: d, ok: true };
    }
  }

  // "2026 Jul 13"
  m = s.match(/^(\d{4})[\s,./-]+([A-Za-z]{3,9})[\s,./-]+(\d{1,2})$/);
  if (m) {
    const mo = MONTH_NAMES[m[2].toLowerCase()];
    if (mo) {
      const d = buildDate(+m[1], mo, +m[3]);
      if (d) return { date: d, ok: true };
    }
  }

  // last resort — native parser (handles "13 July 2026 10:30", ISO with tz, …)
  const native = new Date(s);
  if (!Number.isNaN(native.getTime())) return { date: native, ok: true };

  return { date: null, ok: false, msg: `Unrecognized ${label} "${raw}". Use e.g. 2026-07-13 or 13/07/2026.` };
}

/** Map list items by lower-cased name for O(1) lookups. */
function byLowerName(list, key = 'name') {
  const map = new Map();
  (list || []).forEach((item) => {
    const n = item && item[key];
    if (n) map.set(String(n).toLowerCase().trim(), item);
  });
  return map;
}

/**
 * Resolve a reference cell (name or Mongo id) against a preloaded map.
 * Empty → ok/null. Unknown name → row error message.
 */
function makeResolver(map, label, idField = '_id') {
  const availableNames = () => [...map.values()]
    .map((v) => v.name || v.warehouseName || v.label)
    .filter(Boolean).slice(0, 25).join(', ') || 'none';
  return (raw) => {
    const val = String(raw === undefined || raw === null ? '' : raw).trim();
    if (!val) return { value: null, ok: true };
    if (MONGO_ID.test(val)) {
      const hit = [...map.values()].find((v) => String(v[idField]) === val.toLowerCase() || String(v[idField]) === val);
      if (hit) return { value: hit[idField], ok: true, item: hit };
      return { value: null, ok: false, msg: `${label} id "${val}" not found.` };
    }
    const item = map.get(val.toLowerCase());
    if (item) return { value: item[idField], ok: true, item };
    return { value: null, ok: false, msg: `${label} "${val}" not found. Available: ${availableNames()}` };
  };
}

/**
 * Validate docs (mongoose validateSync) and write valid ones with
 * insertMany({ ordered: false }). Any write error (duplicates, …) is mapped
 * back to its source row; other rows still insert.
 */
async function insertManyMapped(Model, docs, rowNums, errors) {
  if (!docs.length) return 0;
  const instances = [];
  const instRows = [];
  docs.forEach((doc, i) => {
    const inst = new Model(doc);
    const vErr = inst.validateSync();
    if (vErr) {
      const msg = Object.values(vErr.errors || {}).map((e) => e.message).join('; ') || vErr.message;
      errors.push({ row: rowNums[i], message: msg });
      return;
    }
    instances.push(inst);
    instRows.push(rowNums[i]);
  });
  if (!instances.length) return 0;
  try {
    await Model.insertMany(instances, { ordered: false });
    return instances.length;
  } catch (err) {
    const writeErrors = err.writeErrors || (Array.isArray(err.results) ? [] : null) || [];
    if (writeErrors.length) {
      writeErrors.forEach((we) => {
        const idx = typeof we.index === 'number' ? we.index : we.err?.index;
        const rowNum = instRows[idx] !== undefined ? instRows[idx] : '?';
        let msg = we.errmsg || we.err?.errmsg || we.message || 'Insert failed';
        if ((we.code || we.err?.code) === 11000) msg = 'Duplicate value — this record already exists.';
        errors.push({ row: rowNum, message: msg });
      });
      return instances.length - writeErrors.length;
    }
    const inserted = Array.isArray(err.insertedDocs) ? err.insertedDocs.length : 0;
    instRows.slice(inserted).forEach((rowNum) => errors.push({ row: rowNum, message: err.message || 'Insert failed' }));
    return inserted;
  }
}

function requireFile(req, next) {
  if (!req.file || !req.file.buffer) {
    next(new AppError('No file uploaded', 400));
    return false;
  }
  return true;
}

function parseRows(req, next) {
  const { rows } = parseSpreadsheet(req.file.buffer, req.file.originalname);
  if (rows.length === 0) {
    next(new AppError('No data rows found after the header row.', 400));
    return null;
  }
  return rows;
}

function respond(res, rows, created, errors, updated = 0) {
  res.json({
    success: true,
    summary: { total: rows.length, created, updated, failed: errors.length },
    errors: errors.slice(0, 200)
  });
}

function handleImportError(err, next) {
  if (err.message && err.message.includes('Unsupported')) {
    return next(new AppError(err.message, 400));
  }
  return next(err);
}

/* ═══ CRM shared reference data ═════════════════════════════════════════ */

async function loadLeadStatusItems() {
  let collection = null;
  const setting = await SystemSetting.findOne({ key: 'lead_status_collection_id' }).lean();
  if (setting && setting.value) {
    collection = await StatusCollection.findOne({ _id: setting.value, isActive: true }).lean();
  }
  if (!collection) {
    collection = await StatusCollection.findOne({ key: 'leads', isActive: true }).lean();
  }
  if (!collection) return [];
  return StatusItem.find({ collection: collection._id, isActive: true }).sort({ order: 1 }).lean();
}

/**
 * Users allowed as lead/customer assignees + the configured role ids.
 * assigned_to must resolve to a user whose role is in lead_assignment_roles.
 */
async function loadAssignableUsers() {
  const setting = await SystemSetting.findOne({ key: 'lead_assignment_roles' }).lean();
  const allowedRoleIds = Array.isArray(setting && setting.value) ? setting.value.map(String) : [];
  const users = await User.find({ isActive: true }).select('firstName lastName email role').lean();
  return { users, allowedRoleIds };
}

function makeUserResolver(users, allowedRoleIds) {
  const byEmail = new Map();
  const byName = new Map();
  users.forEach((u) => {
    if (u.email) byEmail.set(String(u.email).toLowerCase().trim(), u);
    const full = `${u.firstName || ''} ${u.lastName || ''}`.trim().toLowerCase();
    if (full) byName.set(full, u);
  });
  return (raw) => {
    const val = String(raw === undefined || raw === null ? '' : raw).trim();
    if (!val) return { value: null, ok: true };
    let user = null;
    if (MONGO_ID.test(val)) user = users.find((u) => String(u._id) === val.toLowerCase() || String(u._id) === val);
    if (!user) user = byEmail.get(val.toLowerCase()) || byName.get(val.toLowerCase());
    if (!user) return { value: null, ok: false, msg: `Assigned user "${val}" not found (use the user's email or full name).` };
    if (allowedRoleIds.length === 0) {
      return { value: null, ok: false, msg: 'Lead assignment roles are not configured in Server Management — cannot assign users.' };
    }
    const roleId = user.role && (user.role._id || user.role);
    if (!allowedRoleIds.includes(String(roleId))) {
      return { value: null, ok: false, msg: `User "${val}" is not allowed as an assignee (role not in lead assignment roles).` };
    }
    return { value: user._id, ok: true, item: user };
  };
}

function makeStatusResolver(statusItems) {
  const map = new Map();
  statusItems.forEach((s) => {
    if (s.value) map.set(String(s.value).toLowerCase().trim(), s);
    if (s.label) map.set(String(s.label).toLowerCase().trim(), s);
  });
  return (raw) => {
    const val = String(raw === undefined || raw === null ? '' : raw).trim();
    if (!val) return { value: '', ok: true };
    const item = map.get(val.toLowerCase());
    if (item) return { value: item.value, ok: true };
    const names = statusItems.map((s) => s.label || s.value).slice(0, 25).join(', ') || 'none';
    return { value: '', ok: false, msg: `Status "${val}" not found. Available: ${names}` };
  };
}

function parseCustomerType(raw) {
  const val = String(raw === undefined || raw === null ? '' : raw).trim().toLowerCase();
  if (!val) return { value: undefined, ok: true };
  if (val === 'individual') return { value: 'individual', ok: true };
  if (val === 'corporate') return { value: 'corporate', ok: true };
  return { value: null, ok: false, msg: `customer_type "${raw}" is invalid. Allowed: individual, corporate.` };
}

/* ═══ template specs (CSV/XLSX downloads — real MongoDB data) ══════════ */

const TEMPLATE_META = {
  leads: {
    filename: 'ams_leads_import_template',
    headers: ['customer_name', 'email', 'phone', 'alternate_phone', 'address', 'city', 'state', 'country', 'zip_code', 'source', 'type', 'priority', 'status', 'customer_type', 'lead_value', 'probability', 'expected_close_date', 'next_follow_up', 'description', 'assigned_to', 'department']
  },
  customers: {
    filename: 'ams_customers_import_template',
    headers: ['first_name', 'last_name', 'email', 'phone', 'alternate_phone', 'customer_type', 'company_name', 'source', 'type', 'status', 'description', 'assigned_to', 'department', 'address', 'city', 'state', 'country', 'zip_code']
  },
  vehicles: {
    filename: 'ams_vehicles_import_template',
    headers: ['vin', 'engine_number', 'make_name', 'model_name', 'variant_name', 'color_name', 'year', 'purchase_price', 'selling_price', 'status', 'condition_type', 'mileage', 'warehouse_name', 'location', 'arrival_date', 'notes']
  },
  parts: {
    filename: 'ams_parts_import_template',
    headers: ['part_number', 'name', 'purchase_price', 'selling_price', 'category_name', 'description', 'brand', 'source_type', 'supplier_name', 'unit', 'current_stock', 'minimum_stock', 'maximum_stock', 'reorder_level', 'warehouse_name', 'bin_location']
  },
  'sales-orders': {
    filename: 'ams_sales_orders_import_template',
    headers: ['customer_name', 'customer_email', 'vehicle_vin', 'vehicle_price', 'accessories_total', 'discount_amount', 'tax_amount', 'registration_charges', 'insurance_charges', 'other_charges', 'paid_amount', 'payment_mode', 'notes']
  },
  employees: {
    filename: 'ams_employees_import_template',
    headers: ['employee_code', 'first_name', 'last_name', 'email', 'phone', 'cnic', 'department', 'designation', 'joining_date', 'salary', 'status']
  }
};

/* ── helper: format a cell value for CSV output ── */
function csvCell(v) {
  return `"${String(v ?? '').replace(/"/g, '""')}"`;
}

/* ── helper: format a date for CSV output ── */
function fmtDate(d) {
  if (!d) return '';
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return '';
  return dt.toISOString().slice(0, 10);
}

function fmtNum(v) {
  if (v === undefined || v === null) return '';
  return String(v);
}

function yn(v) {
  return v === false ? 'false' : v === true ? 'true' : '';
}

/* ── helper: populate a source/type/priority name from an ObjectId ref ── */
function refName(map, id) {
  if (!id) return '';
  const item = map.get(String(id));
  return item ? (item.name || '') : '';
}

/** Build a Map keyed by lowercased _id for ObjectId→name lookups. */
function byLowerId(list) {
  const map = new Map();
  (list || []).forEach((item) => {
    if (item && item._id) map.set(String(item._id), item);
  });
  return map;
}

/* ═══ Sample-row builders: fetch first doc from each collection ═══════ */

async function buildLeadsSample() {
  const [doc, sources, types, priorities, depts, assignable] = await Promise.all([
    Lead.findOne().sort({ createdAt: -1 }).lean(),
    LeadSource.find({ isActive: true }).lean(),
    LeadType.find({ isActive: true }).lean(),
    LeadPriority.find({ isActive: true }).lean(),
    Department.find({ isActive: true }).lean(),
    loadAssignableUsers()
  ]);
  const srcMap = byLowerId(sources);
  const typMap = byLowerId(types);
  const priMap = byLowerId(priorities);
  const deptMap = byLowerId(depts);
  const userMap = new Map();
  (assignable.users || []).forEach((u) => {
    const full = `${u.firstName || ''} ${u.lastName || ''}`.trim();
    userMap.set(String(u._id), full || u.email || '');
  });
  const d = doc || {};
  return [
    d.customerName || 'John Doe',
    d.email || 'john@example.com',
    d.phone || '0300-1234567',
    d.alternatePhone || '',
    d.address || '123 Main Street',
    d.city || 'Karachi',
    d.state || 'Sindh',
    d.country || 'Pakistan',
    d.zipCode || '74000',
    refName(srcMap, d.source) || (sources.length ? sources[0].name : ''),
    refName(typMap, d.type) || (types.length ? types[0].name : ''),
    refName(priMap, d.priority) || (priorities.length ? priorities[0].name : ''),
    d.status || 'new',
    d.customerType || 'individual',
    fmtNum(d.leadValue) || '500000',
    fmtNum(d.probability) || '60',
    fmtDate(d.expectedCloseDate) || '',
    fmtDate(d.nextFollowUpAt) || '',
    d.description || 'Sample lead for demo purposes',
    userMap.get(String(d.assignedTo)) || (assignable.users && assignable.users.length ? `${assignable.users[0].firstName || ''} ${assignable.users[0].lastName || ''}`.trim() : ''),
    refName(deptMap, d.department) || (depts.length ? depts[0].name : '')
  ];
}

async function buildCustomersSample() {
  const [doc, sources, types, depts, assignable] = await Promise.all([
    Customer.findOne().sort({ createdAt: -1 }).lean(),
    LeadSource.find({ isActive: true }).lean(),
    LeadType.find({ isActive: true }).lean(),
    Department.find({ isActive: true }).lean(),
    loadAssignableUsers()
  ]);
  const srcMap = byLowerId(sources);
  const typMap = byLowerId(types);
  const deptMap = byLowerId(depts);
  const userMap = new Map();
  (assignable.users || []).forEach((u) => {
    const full = `${u.firstName || ''} ${u.lastName || ''}`.trim();
    userMap.set(String(u._id), full || u.email || '');
  });
  const d = doc || {};
  return [
    d.firstName || 'John',
    d.lastName || 'Doe',
    d.email || 'john@example.com',
    d.phone || '0300-1234567',
    d.alternatePhone || '',
    d.customerType || 'individual',
    d.companyName || '',
    refName(srcMap, d.source) || (sources.length ? sources[0].name : ''),
    refName(typMap, d.type) || (types.length ? types[0].name : ''),
    d.status || 'active',
    d.description || 'Sample customer record',
    userMap.get(String(d.assignedTo)) || (assignable.users && assignable.users.length ? `${assignable.users[0].firstName || ''} ${assignable.users[0].lastName || ''}`.trim() : ''),
    refName(deptMap, d.department) || (depts.length ? depts[0].name : ''),
    d.address || '123 Main Street',
    d.city || 'Karachi',
    d.state || 'Sindh',
    d.country || 'Pakistan',
    d.zipCode || '74000'
  ];
}

async function buildVehiclesSample() {
  const [doc, firstCondition] = await Promise.all([
    Vehicle.findOne().lean(),
    VehicleCondition.findOne({ is_active: true }).lean()
  ]);
  const d = doc || {};
  const condName = d.conditionType || (firstCondition && firstCondition.name) || 'new';
  return [
    d.vin || 'VIN-SAMPLE-001',
    d.engineNumber || 'ENG-SAMPLE-001',
    (d.make && d.make.name) || 'Toyota',
    (d.model && d.model.name) || 'Camry',
    (d.variant && d.variant.name) || 'XLE',
    (d.color && d.color.name) || 'White',
    fmtNum(d.year) || '2025',
    fmtNum(d.purchasePrice) || '3000000',
    fmtNum(d.salePrice) || fmtNum(Number(d.purchasePrice || 0) * 1.2) || '3600000',
    d.status || 'at_yard',
    condName,
    fmtNum(d.mileage) || '0',
    (d.warehouse && d.warehouse.name) || '',
    d.location || 'Main Showroom',
    fmtDate(d.arrivalDate) || fmtDate(new Date()),
    d.notes || 'Sample vehicle entry'
  ];
}

async function buildPartsSample() {
  const doc = await Part.findOne().lean();
  const d = doc || {};
  return [
    d.partCode || d.sku || 'SPARE-001',
    d.name || 'Sample Brake Pad',
    fmtNum(d.costPrice) || '1500',
    fmtNum(d.sellingPrice) || '2500',
    (d.category && d.category.name) || '',
    d.description || 'OEM quality brake pad set',
    d.brand || 'OEM',
    d.sourceType || 'manufacturer',
    (d.supplier && d.supplier.name) || '',
    d.unit || 'piece',
    fmtNum(d.currentStock) || fmtNum(d.quantity) || '10',
    fmtNum(d.minStock) || '2',
    fmtNum(d.maxStock) || '50',
    fmtNum(d.reorderLevel) || '5',
    (d.warehouse && d.warehouse.name) || '',
    d.binLocation || 'A-01'
  ];
}

async function buildSalesOrdersSample() {
  const doc = await SalesOrder.findOne().sort({ createdAt: -1 })
    .populate('customer', 'firstName lastName email')
    .populate('vehicle', 'vin salePrice')
    .lean();
  const d = doc || {};
  const cust = d.customer || {};
  const veh = d.vehicle || {};
  const custName = [cust.firstName, cust.lastName].filter(Boolean).join(' ') || 'John Doe';
  const items = d.items || [];
  const vehPrice = (items[0] && items[0].unitPrice) || veh.salePrice || 5000000;
  return [
    custName,
    cust.email || 'john@example.com',
    veh.vin || 'VIN-SO-001',
    fmtNum(vehPrice),
    '0',
    fmtNum(d.discountAmount) || '0',
    fmtNum(d.taxAmount) || '0',
    '0',
    '0',
    '0',
    fmtNum(d.paidAmount) || '0',
    'cash',
    ''
  ];
}

async function buildEmployeesSample() {
  const doc = await Employee.findOne().sort({ createdAt: -1 })
    .populate('department', 'name')
    .lean();
  const d = doc || {};
  const deptName = (d.department && d.department.name) || 'Sales';
  return [
    d.employeeCode || 'EMP-2026-00001',
    d.firstName || 'Jane',
    d.lastName || 'Doe',
    d.email || 'jane@example.com',
    d.phone || '0300-7654321',
    d.cnic || '42101-1234567-1',
    deptName,
    d.designation || 'Sales Executive',
    fmtDate(d.joiningDate) || fmtDate(new Date()),
    fmtNum(d.salary) || '50000',
    d.status || 'active'
  ];
}

const SAMPLE_BUILDERS = {
  leads: buildLeadsSample,
  customers: buildCustomersSample,
  vehicles: buildVehiclesSample,
  parts: buildPartsSample,
  'sales-orders': buildSalesOrdersSample,
  employees: buildEmployeesSample
};

exports.downloadTemplate = async (req, res, next) => {
  try {
    const { type } = req.params;
    const format = (req.query.format || 'csv').toLowerCase();
    const meta = TEMPLATE_META[type];
    if (!meta) {
      return next(new AppError('Unknown template type', 400));
    }
    if (format !== 'csv' && format !== 'xlsx') {
      return next(new AppError('format must be csv or xlsx', 400));
    }

    const builder = SAMPLE_BUILDERS[type];
    const sampleRows = builder ? await builder() : null;

    /* For single-row types, sampleRows is a flat array; for master types, it's an array of arrays. */
    const isMaster = Array.isArray(sampleRows) && sampleRows.length > 0 && Array.isArray(sampleRows[0]);
    const dataRows = isMaster ? sampleRows : (sampleRows ? [sampleRows] : []);

    /* Build the matrix: [headers, ...dataRows] */
    const matrix = [meta.headers, ...dataRows];

    if (format === 'csv') {
      const lines = matrix.map((row) => row.map(csvCell).join(','));
      const body = lines.join('\r\n');
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${meta.filename}.csv"`);
      return res.send('\uFEFF' + body);
    }

    /* XLSX */
    const wb = xlsx.utils.book_new();
    const ws = xlsx.utils.aoa_to_sheet(matrix);
    const colWidths = meta.headers.map((h) => ({ wch: Math.max(h.length + 2, 16) }));
    ws['!cols'] = colWidths;
    xlsx.utils.book_append_sheet(wb, ws, 'Import');
    const buf = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', `attachment; filename="${meta.filename}.xlsx"`);
    return res.send(Buffer.from(buf));
  } catch (err) {
    logger.error('downloadTemplate error', err);
    next(err);
  }
};

/* ═══ Leads ═════════════════════════════════════════════════════════════ */


exports.importLeads = async (req, res, next) => {
  try {
    if (!requireFile(req, next)) return;
    const rows = parseRows(req, next);
    if (!rows) return;

    const userId = req.user && (req.user._id || req.user.id);
    const errors = [];

    const [sources, types, priorities, cities, departments, statusItems, assignable] = await Promise.all([
      LeadSource.find({ isActive: true }).lean(),
      LeadType.find({ isActive: true }).lean(),
      LeadPriority.find({ isActive: true }).lean(),
      LeadCity.find({ isActive: true }).lean(),
      Department.find({ isActive: true }).select('name').lean(),
      loadLeadStatusItems(),
      loadAssignableUsers()
    ]);

    const resolveSource = makeResolver(byLowerName(sources), 'Source');
    const resolveType = makeResolver(byLowerName(types), 'Type');
    const resolvePriority = makeResolver(byLowerName(priorities), 'Priority');
    const resolveCity = makeResolver(byLowerName(cities), 'City');
    const resolveDepartment = makeResolver(byLowerName(departments), 'Department');
    const resolveStatus = makeStatusResolver(statusItems);
    const resolveUser = makeUserResolver(assignable.users, assignable.allowedRoleIds);
    const defaultStatus = statusItems.length ? statusItems[0].value : '';

    const nextLeadNo = await leadNumberSequence();
    const docs = [];
    const docRows = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 1;
      const customerName = String(row.customer_name || '').trim();
      const emailRaw = String(row.email || '').trim();
      const phoneRaw = String(row.phone || '').trim();

      if (!customerName || !emailRaw || !phoneRaw) {
        errors.push({ row: rowNum, message: 'Missing required field(s): customer_name, email, and phone are required.' });
        continue;
      }
      const email = emailRaw.toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        errors.push({ row: rowNum, message: `Invalid email "${emailRaw}".` });
        continue;
      }

      const src = resolveSource(row.source);
      if (!src.ok) { errors.push({ row: rowNum, message: src.msg }); continue; }
      const typ = resolveType(row.type);
      if (!typ.ok) { errors.push({ row: rowNum, message: typ.msg }); continue; }
      const prio = resolvePriority(row.priority);
      if (!prio.ok) { errors.push({ row: rowNum, message: prio.msg }); continue; }
      const city = resolveCity(row.city);
      if (!city.ok) { errors.push({ row: rowNum, message: city.msg }); continue; }
      const dept = resolveDepartment(row.department);
      if (!dept.ok) { errors.push({ row: rowNum, message: dept.msg }); continue; }
      const status = resolveStatus(row.status);
      if (!status.ok) { errors.push({ row: rowNum, message: status.msg }); continue; }
      const assigned = resolveUser(row.assigned_to || row.assign_to);
      if (!assigned.ok) { errors.push({ row: rowNum, message: assigned.msg }); continue; }
      const custType = parseCustomerType(row.customer_type);
      if (!custType.ok) { errors.push({ row: rowNum, message: custType.msg }); continue; }

      const expClose = parseFlexibleDate(row.expected_close_date, 'expected_close_date');
      if (!expClose.ok) { errors.push({ row: rowNum, message: expClose.msg }); continue; }
      const nextFollow = parseFlexibleDate(row.next_follow_up || row.next_follow_up_date || row.next_followup, 'next_follow_up');
      if (!nextFollow.ok) { errors.push({ row: rowNum, message: nextFollow.msg }); continue; }

      const probability = toNum(row.probability, 0);
      if (probability < 0 || probability > 100) {
        errors.push({ row: rowNum, message: `probability must be between 0 and 100 (got "${row.probability}").` });
        continue;
      }

      const leadNo = nextLeadNo();

      docs.push({
        leadNo,
        customerName,
        email,
        phone: normalizePhone(phoneRaw),
        alternatePhone: row.alternate_phone ? normalizePhone(row.alternate_phone) : '',
        address: row.address || '',
        city: city.item ? city.item.name : '',
        state: row.state || '',
        country: row.country || '',
        zipCode: row.zip_code || '',
        source: src.value,
        type: typ.value,
        priority: prio.value,
        status: status.value || defaultStatus,
        customerType: custType.value || 'individual',
        leadValue: toNum(row.lead_value !== undefined && row.lead_value !== '' ? row.lead_value : row.budget_range, 0),
        probability,
        expectedCloseDate: expClose.date,
        nextFollowUpAt: nextFollow.date,
        description: row.description || row.notes || '',
        assignedTo: assigned.value,
        department: dept.value,
        createdBy: userId,
        activities: [{ type: 'created', description: `Lead ${leadNo} created via bulk import`, performedBy: userId, performedAt: new Date() }]
      });
      docRows.push(rowNum);
    }

    const created = await insertManyMapped(Lead, docs, docRows, errors);
    respond(res, rows, created, errors);
  } catch (err) {
    logger.error('importLeads error', err);
    handleImportError(err, next);
  }
};

/* ═══ Customers ═════════════════════════════════════════════════════════ */

async function nextCustomerNumber() {
  const last = await Customer.findOne({ customerCode: { $regex: /^CUS-/ } }).sort({ createdAt: -1 }).lean();
  let nextNum = 1;
  if (last && last.customerCode) {
    const match = last.customerCode.match(/CUS-(\d+)/);
    if (match) nextNum = parseInt(match[1], 10) + 1;
  }
  return nextNum;
}

exports.importCustomers = async (req, res, next) => {
  try {
    if (!requireFile(req, next)) return;
    const rows = parseRows(req, next);
    if (!rows) return;

    const userId = req.user && (req.user._id || req.user.id);
    const errors = [];

    const [sources, types, cities, departments, statusItems, assignable] = await Promise.all([
      LeadSource.find({ isActive: true }).lean(),
      LeadType.find({ isActive: true }).lean(),
      LeadCity.find({ isActive: true }).lean(),
      Department.find({ isActive: true }).select('name').lean(),
      loadLeadStatusItems(),
      loadAssignableUsers()
    ]);

    const resolveSource = makeResolver(byLowerName(sources), 'Source');
    const resolveType = makeResolver(byLowerName(types), 'Type');
    const resolveCity = makeResolver(byLowerName(cities), 'City');
    const resolveDepartment = makeResolver(byLowerName(departments), 'Department');
    const resolveStatus = makeStatusResolver(statusItems);
    const resolveUser = makeUserResolver(assignable.users, assignable.allowedRoleIds);

    let custSeq = await nextCustomerNumber();
    const docs = [];
    const docRows = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 1;
      const firstName = String(row.first_name || row.firstname || '').trim();
      const emailRaw = String(row.email || '').trim();
      const phoneRaw = String(row.phone || '').trim();

      if (!firstName || !emailRaw || !phoneRaw) {
        errors.push({ row: rowNum, message: 'Missing required field(s): first_name, email, and phone are required.' });
        continue;
      }
      const email = emailRaw.toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        errors.push({ row: rowNum, message: `Invalid email "${emailRaw}".` });
        continue;
      }

      // Old templates used `type` for individual/company — treat that as customer_type.
      const legacyType = ['individual', 'corporate'].includes(String(row.type || '').trim().toLowerCase());
      const custType = parseCustomerType(row.customer_type || (legacyType ? row.type : ''));
      if (!custType.ok) { errors.push({ row: rowNum, message: custType.msg }); continue; }

      const src = resolveSource(row.source);
      if (!src.ok) { errors.push({ row: rowNum, message: src.msg }); continue; }
      const typ = resolveType(legacyType ? '' : row.type);
      if (!typ.ok) { errors.push({ row: rowNum, message: typ.msg }); continue; }
      const city = resolveCity(row.city);
      if (!city.ok) { errors.push({ row: rowNum, message: city.msg }); continue; }
      const dept = resolveDepartment(row.department);
      if (!dept.ok) { errors.push({ row: rowNum, message: dept.msg }); continue; }
      const status = resolveStatus(row.status);
      if (!status.ok) { errors.push({ row: rowNum, message: status.msg }); continue; }
      const assigned = resolveUser(row.assigned_to || row.assign_to);
      if (!assigned.ok) { errors.push({ row: rowNum, message: assigned.msg }); continue; }

      const customerCode = `CUS-${String(custSeq).padStart(6, '0')}`;
      custSeq += 1;

      docs.push({
        customerCode,
        firstName,
        lastName: String(row.last_name || row.lastname || '').trim(),
        email,
        phone: normalizePhone(phoneRaw),
        alternatePhone: row.alternate_phone ? normalizePhone(row.alternate_phone) : '',
        customerType: custType.value || 'individual',
        companyName: row.company_name || '',
        source: src.value,
        type: typ.value,
        status: status.value || '',
        description: row.description || row.notes || '',
        assignedTo: assigned.value,
        department: dept.value,
        address: row.address || '',
        city: city.item ? city.item.name : '',
        state: row.state || '',
        country: row.country || 'Pakistan',
        zipCode: row.zip_code || '',
        isActive: true,
        createdBy: userId
      });
      docRows.push(rowNum);
    }

    const created = await insertManyMapped(Customer, docs, docRows, errors);
    respond(res, rows, created, errors);
  } catch (err) {
    logger.error('importCustomers error', err);
    handleImportError(err, next);
  }
};

/* ═══ Vehicles (inventory) ══════════════════════════════════════════════ */

exports.importVehicles = async (req, res, next) => {
  try {
    if (!requireFile(req, next)) return;
    const rows = parseRows(req, next);
    if (!rows) return;

    const userId = req.user && (req.user._id || req.user.id);
    const errors = [];
    let created = 0;
    let updated = 0;

    const [makes, models, variants, colors, warehouses, conditions] = await Promise.all([
      VehicleMake.find({ is_active: true }).lean(),
      VehicleModel.find({ is_active: true }).lean(),
      VehicleVariant.find({ is_active: true }).lean(),
      VehicleColor.find({ is_active: true }).lean(),
      Warehouse.find({ isActive: true }).lean(),
      VehicleCondition.find({ is_active: true }).lean()
    ]);

    const makesByName = byLowerName(makes);
    const colorsByName = byLowerName(colors);
    const warehousesByName = byLowerName(warehouses, 'warehouseName');
    const conditionsByName = byLowerName(conditions);
    const modelsByMake = new Map();
    models.forEach((m) => {
      const k = String(m.make_id);
      if (!modelsByMake.has(k)) modelsByMake.set(k, new Map());
      modelsByMake.get(k).set(String(m.name).toLowerCase().trim(), m);
    });
    const variantsByModel = new Map();
    variants.forEach((v) => {
      const k = String(v.model_id);
      if (!variantsByModel.has(k)) variantsByModel.set(k, new Map());
      variantsByModel.get(k).set(String(v.name).toLowerCase().trim(), v);
    });

    // Load existing vehicles by VIN for UPSERT
    const existingVins = await Vehicle.find().select('vin engineNumber').lean();
    const existingByVin = new Map();
    existingVins.forEach((v) => {
      if (v.vin) existingByVin.set(v.vin.toUpperCase(), v._id);
    });
    const seenVins = new Set();

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 1;
      const vin = String(row.vin || '').trim().toUpperCase();
      const engineNumber = String(row.engine_number || '').trim();
      const makeName = String(row.make_name || '').trim();
      const modelName = String(row.model_name || '').trim();
      const variantName = String(row.variant_name || '').trim();
      const colorName = String(row.color_name || '').trim();
      const year = row.year;

      if (!vin || !engineNumber || !makeName || !modelName || !variantName || !colorName || !year) {
        errors.push({ row: rowNum, message: 'Missing required field(s): vin, engine_number, make_name, model_name, variant_name, color_name, year are required.' });
        continue;
      }
      if (!row.purchase_price || !row.selling_price) {
        errors.push({ row: rowNum, message: 'purchase_price and selling_price are required.' });
        continue;
      }

      if (seenVins.has(vin)) {
        errors.push({ row: rowNum, message: `Duplicate VIN "${vin}" in this file (skipped).` });
        continue;
      }
      seenVins.add(vin);

      const vehicleMake = makesByName.get(makeName.toLowerCase());
      if (!vehicleMake) {
        errors.push({ row: rowNum, message: `Make "${makeName}" not found in Vehicle Master. Available: ${makes.map((m) => m.name).slice(0, 25).join(', ') || 'none'}` });
        continue;
      }
      const makeModels = modelsByMake.get(String(vehicleMake._id)) || new Map();
      const vehicleModel = makeModels.get(modelName.toLowerCase());
      if (!vehicleModel) {
        errors.push({ row: rowNum, message: `Model "${modelName}" not found under make "${makeName}". Available: ${[...makeModels.values()].map((m) => m.name).join(', ') || 'none'}` });
        continue;
      }
      const modelVariants = variantsByModel.get(String(vehicleModel._id)) || new Map();
      const vehicleVariant = modelVariants.get(variantName.toLowerCase());
      if (!vehicleVariant) {
        errors.push({ row: rowNum, message: `Variant "${variantName}" not found under model "${modelName}". Available: ${[...modelVariants.values()].map((v) => v.name).join(', ') || 'none'}` });
        continue;
      }
      const vehicleColor = colorsByName.get(colorName.toLowerCase());
      if (!vehicleColor) {
        errors.push({ row: rowNum, message: `Color "${colorName}" not found. Available: ${colors.map((c) => c.name).slice(0, 25).join(', ') || 'none'}` });
        continue;
      }

      const condRaw = String(row.condition_type || '').trim();
      let conditionName = condRaw || 'new';
      if (condRaw && !conditionsByName.get(condRaw.toLowerCase())) {
        errors.push({ row: rowNum, message: `Condition "${condRaw}" not found. Available: ${conditions.map((c) => c.name).join(', ') || 'none'}` });
        continue;
      }

      let warehouseData = {};
      const warehouseRaw = String(row.warehouse_name || row.warehouse_id || '').trim();
      if (warehouseRaw) {
        let wh = null;
        if (MONGO_ID.test(warehouseRaw)) wh = warehouses.find((w) => String(w._id) === warehouseRaw.toLowerCase() || String(w._id) === warehouseRaw);
        if (!wh) wh = warehousesByName.get(warehouseRaw.toLowerCase());
        if (!wh) {
          errors.push({ row: rowNum, message: `Warehouse "${warehouseRaw}" not found. Available: ${warehouses.map((w) => w.warehouseName).join(', ') || 'none'}` });
          continue;
        }
        warehouseData = { name: wh.warehouseName, code: wh.code };
      }

      const arrival = parseFlexibleDate(row.arrival_date, 'arrival_date');
      if (!arrival.ok) { errors.push({ row: rowNum, message: arrival.msg }); continue; }

      const vehicleData = {
        vin,
        engineNumber,
        year: toInt(year),
        status: row.status || 'at_yard',
        conditionType: conditionName,
        mileage: toInt(row.mileage, 0),
        purchasePrice: toNum(row.purchase_price),
        salePrice: toNum(row.selling_price),
        location: row.location || 'Main Yard',
        arrivalDate: arrival.date,
        notes: row.notes || '',
        isActive: true,
        updatedBy: userId,
        make: {
          name: vehicleMake.name,
          code: vehicleMake.name.substring(0, 3).toUpperCase(),
          country: vehicleMake.country || ''
        },
        model: {
          name: vehicleModel.name,
          code: vehicleModel.name.substring(0, 3).toUpperCase(),
          yearFrom: vehicleModel.year,
          yearTo: vehicleModel.year
        },
        variant: {
          name: vehicleVariant.name,
          code: vehicleVariant.name.substring(0, 3).toUpperCase(),
          engineType: (vehicleVariant.specifications && vehicleVariant.specifications.engineType) || '',
          transmission: vehicleModel.transmission || '',
          fuelType: vehicleModel.fuel_type || '',
          price: vehicleVariant.base_price
        },
        color: {
          name: vehicleColor.name,
          code: vehicleColor.name.substring(0, 3).toUpperCase(),
          hexCode: vehicleColor.hex_code
        },
        warehouse: warehouseData
      };

      const existingId = existingByVin.get(vin);
      if (existingId) {
        try {
          await Vehicle.findByIdAndUpdate(existingId, vehicleData, { runValidators: true });
          updated += 1;
        } catch (e) {
          errors.push({ row: rowNum, message: e.message || 'Update failed' });
        }
      } else {
        try {
          await Vehicle.create({ ...vehicleData, createdBy: userId });
          created += 1;
        } catch (e) {
          errors.push({ row: rowNum, message: e.message || 'Create failed' });
        }
      }
    }

    respond(res, rows, created, errors, updated);
  } catch (err) {
    logger.error('importVehicles error', err);
    handleImportError(err, next);
  }
};

/* ═══ Parts ═════════════════════════════════════════════════════════════ */

exports.importParts = async (req, res, next) => {
  try {
    if (!requireFile(req, next)) return;
    const rows = parseRows(req, next);
    if (!rows) return;

    const userId = req.user && (req.user._id || req.user.id);
    const errors = [];
    let created = 0;
    let updated = 0;

    const [categories, suppliers, warehouses] = await Promise.all([
      PartCategory.find({ is_active: true }).lean(),
      Supplier.find({ is_active: true }).lean(),
      Warehouse.find({ isActive: true }).lean()
    ]);
    const categoriesByName = byLowerName(categories);
    const suppliersByName = byLowerName(suppliers);
    const warehousesByName = byLowerName(warehouses, 'warehouseName');

    // Load existing parts by partCode for UPSERT
    const existingParts = await Part.find().select('partCode sku').lean();
    const existingByPartCode = new Map();
    existingParts.forEach((p) => {
      const code = (p.partCode || p.sku || '').toLowerCase().trim();
      if (code) existingByPartCode.set(code, p._id);
    });
    const seenInFile = new Set();

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 1;
      const partNumber = String(row.part_number || row.partnumber || '').trim();
      const name = String(row.name || '').trim();
      const purchasePrice = row.purchase_price || row.purchaseprice;
      const sellingPrice = row.selling_price || row.sellingprice;
      if (!partNumber || !name || !purchasePrice || !sellingPrice) {
        errors.push({ row: rowNum, message: 'Missing required field(s): part_number, name, purchase_price, selling_price.' });
        continue;
      }

      const pnKey = partNumber.toLowerCase();
      if (seenInFile.has(pnKey)) {
        errors.push({ row: rowNum, message: `Duplicate part_number "${partNumber}" in this file (skipped).` });
        continue;
      }
      seenInFile.add(pnKey);

      let categoryData = {};
      const catRaw = String(row.category_name || row.category || '').trim();
      if (catRaw) {
        const cat = MONGO_ID.test(catRaw)
          ? categories.find((c) => String(c._id) === catRaw.toLowerCase() || String(c._id) === catRaw)
          : categoriesByName.get(catRaw.toLowerCase());
        if (!cat) {
          errors.push({ row: rowNum, message: `Category "${catRaw}" not found. Available: ${categories.map((c) => c.name).join(', ') || 'none'}` });
          continue;
        }
        categoryData = { name: cat.name, code: String(cat._id) };
      }

      let supplierData = {};
      const supRaw = String(row.supplier_name || row.supplier || '').trim();
      if (supRaw) {
        const sup = MONGO_ID.test(supRaw)
          ? suppliers.find((s) => String(s._id) === supRaw.toLowerCase() || String(s._id) === supRaw)
          : suppliersByName.get(supRaw.toLowerCase());
        if (!sup) {
          errors.push({ row: rowNum, message: `Supplier "${supRaw}" not found. Available: ${suppliers.map((s) => s.name).join(', ') || 'none'}` });
          continue;
        }
        supplierData = { name: sup.name, code: sup.supplier_code, phone: sup.phone, email: sup.email };
      }

      let warehouseData = {};
      const whRaw = String(row.warehouse_name || row.warehouse_id || '').trim();
      if (whRaw) {
        let wh = null;
        if (MONGO_ID.test(whRaw)) wh = warehouses.find((w) => String(w._id) === whRaw.toLowerCase() || String(w._id) === whRaw);
        if (!wh) wh = warehousesByName.get(whRaw.toLowerCase());
        if (!wh) {
          errors.push({ row: rowNum, message: `Warehouse "${whRaw}" not found. Available: ${warehouses.map((w) => w.warehouseName).join(', ') || 'none'}` });
          continue;
        }
        warehouseData = { name: wh.warehouseName, code: wh.code };
      }

      const currentStock = toInt(row.current_stock, 0);
      const partData = {
        partCode: partNumber,
        sku: partNumber,
        name,
        description: row.description || '',
        category: categoryData,
        supplier: supplierData,
        warehouse: warehouseData,
        brand: row.brand || '',
        unit: row.unit || 'piece',
        costPrice: toNum(purchasePrice),
        sellingPrice: toNum(sellingPrice),
        quantity: currentStock,
        currentStock,
        minStock: toInt(row.minimum_stock, 5),
        maxStock: toInt(row.maximum_stock, 100),
        reorderLevel: toInt(row.reorder_level, 10),
        binLocation: row.bin_location || '',
        sourceType: row.source_type || 'manufacturer',
        isActive: true,
        updatedBy: userId
      };

      const existingId = existingByPartCode.get(pnKey);
      if (existingId) {
        try {
          await Part.findByIdAndUpdate(existingId, partData, { runValidators: true });
          updated += 1;
        } catch (e) {
          errors.push({ row: rowNum, message: e.message || 'Update failed' });
        }
      } else {
        try {
          await Part.create({ ...partData, createdBy: userId });
          created += 1;
        } catch (e) {
          errors.push({ row: rowNum, message: e.message || 'Create failed' });
        }
      }
    }

    respond(res, rows, created, errors, updated);
  } catch (err) {
    logger.error('importParts error', err);
    handleImportError(err, next);
  }
};

/* ═══ Sales orders (direct) — unchanged per-row flow ════════════════════ */

async function generateOrderNumber() {
  const year = new Date().getFullYear();
  const prefix = `SO-${year}-`;
  const lastOrder = await SalesOrder.findOne({ orderNumber: { $regex: new RegExp(`^${prefix.replace(/[-]/g, '\\-')}`) } })
    .sort({ createdAt: -1 })
    .lean();
  let nextNum = 1;
  if (lastOrder && lastOrder.orderNumber) {
    const match = lastOrder.orderNumber.match(/SO-\d+-(\d+)/);
    if (match) nextNum = parseInt(match[1], 10) + 1;
  }
  return `${prefix}${String(nextNum).padStart(5, '0')}`;
}

async function generateEmployeeCode() {
  const year = new Date().getFullYear();
  const prefix = `EMP-${year}-`;
  const lastEmp = await Employee.findOne({ employeeCode: { $regex: new RegExp(`^${prefix.replace(/[-]/g, '\\-')}`) } })
    .sort({ createdAt: -1 })
    .lean();
  let nextNum = 1;
  if (lastEmp && lastEmp.employeeCode) {
    const match = lastEmp.employeeCode.match(/EMP-\d+-(\d+)/);
    if (match) nextNum = parseInt(match[1], 10) + 1;
  }
  return `${prefix}${String(nextNum).padStart(5, '0')}`;
}

exports.importSalesOrders = async (req, res, next) => {
  try {
    if (!requireFile(req, next)) return;
    const rows = parseRows(req, next);
    if (!rows) return;

    const errors = [];
    let created = 0;
    const userId = req.user && (req.user._id || req.user.id);

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 1;
      const customerName = String(row.customer_name || '').trim();
      const customerEmail = String(row.customer_email || '').trim().toLowerCase();
      const vehicleVin = String(row.vehicle_vin || '').trim().toUpperCase();
      const vehiclePrice = parseFloat(row.vehicle_price);

      if (!customerName && !customerEmail) {
        errors.push({ row: rowNum, message: 'customer_name or customer_email is required.' });
        continue;
      }
      if (!vehicleVin) {
        errors.push({ row: rowNum, message: 'vehicle_vin is required.' });
        continue;
      }
      if (!vehiclePrice || vehiclePrice <= 0) {
        errors.push({ row: rowNum, message: 'vehicle_price must be greater than zero.' });
        continue;
      }

      try {
        let customer = null;
        if (customerEmail) {
          customer = await Customer.findOne({
            email: { $regex: new RegExp(`^${escapeRegex(customerEmail)}$`, 'i') },
            deletedAt: null
          }).lean();
        }
        if (!customer && customerName) {
          const nameParts = customerName.split(/\s+/);
          const firstName = nameParts[0] || '';
          const lastName = nameParts.slice(1).join(' ') || '';
          customer = await Customer.findOne({
            firstName: { $regex: new RegExp(`^${escapeRegex(firstName)}$`, 'i') },
            lastName: { $regex: new RegExp(`^${escapeRegex(lastName)}$`, 'i') },
            deletedAt: null
          }).lean();
        }
        if (!customer) {
          errors.push({ row: rowNum, message: `Customer "${customerName || customerEmail}" not found.` });
          continue;
        }

        const vehicle = await Vehicle.findOne({ vin: vehicleVin }).lean();
        if (!vehicle) {
          errors.push({ row: rowNum, message: `Vehicle with VIN "${vehicleVin}" not found.` });
          continue;
        }
        if (!['at_yard', 'in_transit'].includes(vehicle.status)) {
          errors.push({ row: rowNum, message: `Vehicle not available for sale (status: ${vehicle.status}).` });
          continue;
        }

        const orderNumber = await generateOrderNumber();

        const accessoriesTotal = toNum(row.accessories_total);
        const discountAmount = toNum(row.discount_amount);
        const taxAmount = toNum(row.tax_amount);
        const registrationCharges = toNum(row.registration_charges);
        const insuranceCharges = toNum(row.insurance_charges);
        const otherCharges = toNum(row.other_charges);
        const paidAmount = toNum(row.paid_amount);

        const subtotal = vehiclePrice + accessoriesTotal + registrationCharges + insuranceCharges + otherCharges;
        const totalAmount = subtotal + taxAmount - discountAmount;
        const balanceAmount = totalAmount - paidAmount;

        const items = [
          {
            description: `${vehicle.make?.name || ''} ${vehicle.model?.name || ''} ${vehicle.variant?.name || ''} (${vehicleVin})`.trim(),
            quantity: 1,
            unitPrice: vehiclePrice,
            totalPrice: vehiclePrice,
            type: 'vehicle'
          }
        ];

        if (accessoriesTotal > 0) items.push({ description: 'Accessories', quantity: 1, unitPrice: accessoriesTotal, totalPrice: accessoriesTotal, type: 'accessories' });
        if (registrationCharges > 0) items.push({ description: 'Registration Charges', quantity: 1, unitPrice: registrationCharges, totalPrice: registrationCharges, type: 'registration' });
        if (insuranceCharges > 0) items.push({ description: 'Insurance Charges', quantity: 1, unitPrice: insuranceCharges, totalPrice: insuranceCharges, type: 'insurance' });
        if (otherCharges > 0) items.push({ description: 'Other Charges', quantity: 1, unitPrice: otherCharges, totalPrice: otherCharges, type: 'other' });

        await SalesOrder.create({
          orderNumber,
          customer: customer._id,
          vehicle: vehicle._id,
          status: 'pending',
          subtotal,
          taxAmount,
          discountAmount,
          totalAmount,
          paidAmount,
          balanceAmount,
          orderDate: new Date(),
          items,
          createdBy: userId
        });

        await Vehicle.findByIdAndUpdate(vehicle._id, { status: 'sold', updatedBy: userId });

        created += 1;
      } catch (e) {
        errors.push({ row: rowNum, message: e.message || 'Order creation failed' });
      }
    }

    respond(res, rows, created, errors);
  } catch (err) {
    logger.error('importSalesOrders error', err);
    handleImportError(err, next);
  }
};

/* ═══ Employees ════════════════════════════════════════════════════════════ */

exports.importEmployees = async (req, res, next) => {
  try {
    if (!requireFile(req, next)) return;
    const rows = parseRows(req, next);
    if (!rows) return;

    const userId = req.user && (req.user._id || req.user.id);
    const errors = [];

    const [departments] = await Promise.all([
      Department.find({ isActive: true }).select('name').lean()
    ]);
    const deptByName = byLowerName(departments);

    const docs = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 1;

      const firstName = String(row.first_name || row.firstname || '').trim();
      const lastName = String(row.last_name || row.lastname || '').trim();
      const emailRaw = String(row.email || '').trim();
      const phoneRaw = String(row.phone || '').trim();

      if (!firstName || !lastName || !emailRaw || !phoneRaw) {
        errors.push({ row: rowNum, message: 'Missing required field(s): first_name, last_name, email, phone.' });
        continue;
      }
      const email = emailRaw.toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        errors.push({ row: rowNum, message: `Invalid email "${emailRaw}".` });
        continue;
      }

      const deptName = String(row.department || '').trim();
      let departmentId = null;
      if (deptName) {
        const dept = deptByName.get(deptName.toLowerCase());
        if (!dept) {
          errors.push({ row: rowNum, message: `Department "${deptName}" not found. Available: ${departments.map(d => d.name).join(', ') || 'none'}` });
          continue;
        }
        departmentId = dept._id;
      }

      const employeeCode = String(row.employee_code || row.employeecode || '').trim() || await generateEmployeeCode();

      docs.push({
        employeeCode,
        firstName,
        lastName,
        email,
        phone: String(row.phone || '').trim(),
        cnic: String(row.cnic || '').trim(),
        department: departmentId,
        designation: String(row.designation || '').trim(),
        joiningDate: row.joining_date ? new Date(row.joining_date) : undefined,
        salary: toNum(row.salary),
        status: String(row.status || 'active').trim(),
        isActive: true,
        createdBy: userId,
        updatedBy: userId
      });
    }

    const created = docs.length;
    if (created) {
      const inserted = await Employee.insertMany(docs, { ordered: false });
    }

    respond(res, rows, created, errors);
  } catch (err) {
    logger.error('importEmployees error', err);
    handleImportError(err, next);
  }
};
