const Warehouse = require('../models/Warehouse.model');
const Log = require('../models/mongo/Log.model');
const { AppError } = require('../middleware/errorHandler');
const logger = require('../utils/logger');
const { logFileOperation } = require('../utils/apiLogger');

async function createAuditLog(userId, action, module, details, req) {
  try {
    await Log.create({
      userId, action, module,
      details: typeof details === 'string' ? details : JSON.stringify(details),
      ip: req?.ip || '',
      userAgent: req?.headers?.['user-agent'] || '',
      timestamp: new Date(),
    });
  } catch (err) {
    console.error('Audit log error:', err.message);
  }
}

function paginate(page = 1, limit = 15) {
  const p = Math.max(1, parseInt(page));
  const l = Math.min(1000, Math.max(1, parseInt(limit)));
  return { skip: (p - 1) * l, limit: l, page: p, limit: l };
}

function buildSearchFilter(search, extra = {}) {
  const filter = { ...extra };
  if (search) {
    filter.$or = [
      { warehouseName: { $regex: search, $options: 'i' } },
      { code: { $regex: search, $options: 'i' } },
      { city: { $regex: search, $options: 'i' } },
      { manager: { $regex: search, $options: 'i' } },
    ];
  }
  return filter;
}

// ═══════════════════════════════════════════════════════════════════════════
// LIST
// ═══════════════════════════════════════════════════════════════════════════

const getAllWarehouses = async (req, res, next) => {
  try {
    const { search = '', is_active, page = 1, limit = 15 } = req.query;
    const { skip, limit: lim, page: p, limit: l } = paginate(page, limit);
    const filter = buildSearchFilter(search);
    if (is_active !== undefined) filter.isActive = is_active === 'true';
    // The vehicle form's Warehouse dropdown names itself so Role Jobs can narrow it.
    const { requestDropdownFilter, isHidden } = require('../utils/dropdownScope');
    const scope = await requestDropdownFilter(req, null, ['createdBy']);
    if (isHidden(scope)) return res.json({ success: true, data: [], pagination: { page: p, limit: l, total: 0, totalPages: 0 } });
    if (scope) Object.assign(filter, scope);

    const [items, total] = await Promise.all([
      Warehouse.find(filter).sort({ warehouseName: 1 }).skip(skip).limit(lim).lean(),
      Warehouse.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: items,
      pagination: { page: p, limit: l, total, totalPages: Math.ceil(total / l) },
    });
  } catch (error) {
    logger.error('Error fetching warehouses:', error);
    next(error);
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// GET BY ID
// ═══════════════════════════════════════════════════════════════════════════

const getWarehouseById = async (req, res, next) => {
  try {
    const item = await Warehouse.findById(req.params.id).lean();
    if (!item) throw new AppError('Warehouse not found', 404);
    res.json({ success: true, data: item });
  } catch (error) {
    logger.error('Error fetching warehouse:', error);
    next(error);
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// CREATE
// ═══════════════════════════════════════════════════════════════════════════

const createWarehouse = async (req, res, next) => {
  try {
    const { warehouseName, code, type, manager, phone, email, address, city, capacity, isActive } = req.body;
    if (!warehouseName) throw new AppError('Warehouse name is required', 400);
    if (!code) throw new AppError('Code is required', 400);

    // Departments already enforce code uniqueness; warehouses must match.
    const existing = await Warehouse.findOne({ code: String(code).trim() }).select('_id').lean();
    if (existing) throw new AppError(`Warehouse code "${String(code).trim()}" already exists`, 409);

    const item = await Warehouse.create({
      warehouseName, code, type, manager, phone, email, address, city,
      capacity: capacity || 0,
      isActive: isActive !== undefined ? isActive : true,
      createdBy: req.user.id,
    });

    await createAuditLog(req.user.id, 'Create Warehouse', 'Warehouse Management', `Warehouse "${warehouseName}" created`, req);
    logFileOperation(req, { action: 'createWarehouse', name: warehouseName.trim() });
    logger.info(`Warehouse created: ${warehouseName} by ${req.user.email}`);

    res.status(201).json({ success: true, message: 'Warehouse created successfully', data: item });
  } catch (error) {
    logger.error('Error creating warehouse:', error);
    next(error);
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// UPDATE
// ═══════════════════════════════════════════════════════════════════════════

const updateWarehouse = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { warehouseName, code, type, manager, phone, email, address, city, capacity, isActive } = req.body;

    const $set = {};
    if (warehouseName !== undefined) $set.warehouseName = warehouseName;
    if (code !== undefined) $set.code = code;
    if (type !== undefined) $set.type = type;
    if (manager !== undefined) $set.manager = manager;
    if (phone !== undefined) $set.phone = phone;
    if (email !== undefined) $set.email = email;
    if (address !== undefined) $set.address = address;
    if (city !== undefined) $set.city = city;
    if (capacity !== undefined) $set.capacity = capacity;
    if (isActive !== undefined) $set.isActive = isActive;
    $set.updatedBy = req.user.id;

    const item = await Warehouse.findByIdAndUpdate(id, { $set }, { new: true, runValidators: true });
    if (!item) throw new AppError('Warehouse not found', 404);

    await createAuditLog(req.user.id, 'Update Warehouse', 'Warehouse Management', `Warehouse ID ${id} updated`, req);
    logFileOperation(req, { action: 'updateWarehouse', warehouseId: id });
    logger.info(`Warehouse updated: ID ${id} by ${req.user.email}`);

    res.json({ success: true, message: 'Warehouse updated successfully', data: item });
  } catch (error) {
    logger.error('Error updating warehouse:', error);
    next(error);
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// DELETE
// ═══════════════════════════════════════════════════════════════════════════

const deleteWarehouse = async (req, res, next) => {
  try {
    const { id } = req.params;
    const item = await Warehouse.findByIdAndDelete(id);
    if (!item) throw new AppError('Warehouse not found', 404);

    const label = item.warehouseName || item.code;
    await createAuditLog(req.user.id, 'Delete Warehouse', 'Warehouse Management', `Warehouse "${label}" deleted`, req);
    logFileOperation(req, { action: 'deleteWarehouse', warehouseId: id });
    logger.info(`Warehouse deleted: ID ${id} by ${req.user.email}`);

    res.json({ success: true, message: 'Warehouse deleted successfully' });
  } catch (error) {
    logger.error('Error deleting warehouse:', error);
    next(error);
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// STATS
// ═══════════════════════════════════════════════════════════════════════════

const getWarehouseStats = async (req, res, next) => {
  try {
    const [total, active, cities] = await Promise.all([
      Warehouse.countDocuments(),
      Warehouse.countDocuments({ isActive: true }),
      Warehouse.distinct('city', { city: { $ne: '' } }),
    ]);
    const inactive = total - active;
    res.json({
      success: true,
      data: { total, active, inactive, citiesCovered: cities.length, cities },
    });
  } catch (error) {
    logger.error('Error fetching warehouse stats:', error);
    next(error);
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// CITIES LIST
// ═══════════════════════════════════════════════════════════════════════════

const getCities = async (req, res, next) => {
  try {
    const cities = await Warehouse.distinct('city', { city: { $ne: '' } });
    cities.sort();
    res.json({ success: true, data: cities });
  } catch (error) {
    logger.error('Error fetching cities:', error);
    next(error);
  }
};

module.exports = {
  getAllWarehouses,
  getWarehouseById,
  createWarehouse,
  updateWarehouse,
  deleteWarehouse,
  getWarehouseStats,
  getCities,
};
