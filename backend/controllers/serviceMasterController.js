const ServiceType = require('../models/ServiceType.model');
const LaborRate = require('../models/LaborRate.model');
const ServicePackage = require('../models/ServicePackage.model');
const WarrantyType = require('../models/WarrantyType.model');
const Log = require('../models/mongo/Log.model');
const { AppError } = require('../middleware/errorHandler');
const logger = require('../utils/logger');
const { assertUniqueName } = require('../utils/uniqueness.util');
const { logFileOperation } = require('../utils/apiLogger');

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

function paginate(page = 1, limit = 100) {
  const p = Math.max(1, parseInt(page));
  const l = Math.min(1000, Math.max(1, parseInt(limit)));
  return { skip: (p - 1) * l, limit: l, page: p, limit: l };
}

function buildSearchFilter(search, extra = {}) {
  const filter = { ...extra };
  if (search) {
    filter.$or = [
      { name: { $regex: search, $options: 'i' } },
      { description: { $regex: search, $options: 'i' } },
    ];
  }
  return filter;
}

// ═══════════════════════════════════════════════════════════════════════════
// STATS
// ═══════════════════════════════════════════════════════════════════════════

const getStats = async (req, res, next) => {
  try {
    const [serviceTypes, laborRates, packages, warranties] = await Promise.all([
      ServiceType.countDocuments(),
      LaborRate.countDocuments(),
      ServicePackage.countDocuments(),
      WarrantyType.countDocuments(),
    ]);
    res.json({
      success: true,
      data: { serviceTypes, laborRates, packages, warranties },
    });
  } catch (error) {
    logger.error('Error fetching service master stats:', error);
    next(error);
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// SERVICE TYPES
// ═══════════════════════════════════════════════════════════════════════════

const getServiceTypes = async (req, res, next) => {
  try {
    const { search = '', is_active, page = 1, limit = 100 } = req.query;
    const { skip, limit: lim, page: p, limit: l } = paginate(page, limit);
    const filter = buildSearchFilter(search);
    if (is_active !== undefined) filter.isActive = is_active === 'true';

    const [items, total] = await Promise.all([
      ServiceType.find(filter).sort({ name: 1 }).skip(skip).limit(lim).lean(),
      ServiceType.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: items,
      pagination: { page: p, limit: l, total, totalPages: Math.ceil(total / l) },
    });
  } catch (error) {
    logger.error('Error fetching service types:', error);
    next(error);
  }
};

const createServiceType = async (req, res, next) => {
  try {
    const { name, code, description, basePrice, estimatedHours, category, isActive } = req.body;
    if (!name) throw new AppError('Name is required', 400);
    await assertUniqueName(ServiceType, 'name', name, { label: 'Service type' });

    const item = await ServiceType.create({
      name, code, description, basePrice, estimatedHours, category,
      isActive: isActive !== undefined ? isActive : true,
      createdBy: req.user.id,
    });

    await createAuditLog(req.user.id, 'Create Service Type', 'Service Master Data', `Service type "${name}" created`, req);
    logFileOperation(req, { action: 'createServiceType', name: name.trim() });
    logger.info(`Service type created: ${name} by ${req.user.email}`);

    res.status(201).json({ success: true, message: 'Service type created successfully', data: item });
  } catch (error) {
    logger.error('Error creating service type:', error);
    next(error);
  }
};

const updateServiceType = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, code, description, basePrice, estimatedHours, category, isActive } = req.body;

    const item = await ServiceType.findByIdAndUpdate(id,
      { $set: { name, code, description, basePrice, estimatedHours, category, isActive, updatedBy: req.user.id } },
      { new: true, runValidators: true }
    );
    if (!item) throw new AppError('Service type not found', 404);

    await createAuditLog(req.user.id, 'Update Service Type', 'Service Master Data', `Service type ID ${id} updated`, req);
    logFileOperation(req, { action: 'updateServiceType', serviceTypeId: id });
    logger.info(`Service type updated: ID ${id} by ${req.user.email}`);

    res.json({ success: true, message: 'Service type updated successfully', data: item });
  } catch (error) {
    logger.error('Error updating service type:', error);
    next(error);
  }
};

const deleteServiceType = async (req, res, next) => {
  try {
    const { id } = req.params;
    const item = await ServiceType.findByIdAndDelete(id);
    if (!item) throw new AppError('Service type not found', 404);

    await createAuditLog(req.user.id, 'Delete Service Type', 'Service Master Data', `Service type "${item.name}" deleted`, req);
    logFileOperation(req, { action: 'deleteServiceType', serviceTypeId: id });
    logger.info(`Service type deleted: ID ${id} by ${req.user.email}`);

    res.json({ success: true, message: 'Service type deleted successfully' });
  } catch (error) {
    logger.error('Error deleting service type:', error);
    next(error);
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// LABOR RATES
// ═══════════════════════════════════════════════════════════════════════════

const getLaborRates = async (req, res, next) => {
  try {
    const { search = '', is_active, page = 1, limit = 100 } = req.query;
    const { skip, limit: lim, page: p, limit: l } = paginate(page, limit);
    const filter = buildSearchFilter(search);
    if (is_active !== undefined) filter.isActive = is_active === 'true';

    const [items, total] = await Promise.all([
      LaborRate.find(filter).sort({ name: 1 }).skip(skip).limit(lim).lean(),
      LaborRate.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: items,
      pagination: { page: p, limit: l, total, totalPages: Math.ceil(total / l) },
    });
  } catch (error) {
    logger.error('Error fetching labor rates:', error);
    next(error);
  }
};

const createLaborRate = async (req, res, next) => {
  try {
    const { name, code, rate, duration, description, isActive } = req.body;
    if (!name) throw new AppError('Name is required', 400);

    const item = await LaborRate.create({
      name, code, rate, duration, description,
      isActive: isActive !== undefined ? isActive : true,
      createdBy: req.user.id,
    });

    await createAuditLog(req.user.id, 'Create Labor Rate', 'Service Master Data', `Labor rate "${name}" created`, req);
    logFileOperation(req, { action: 'createLaborRate', name: name.trim() });
    logger.info(`Labor rate created: ${name} by ${req.user.email}`);

    res.status(201).json({ success: true, message: 'Labor rate created successfully', data: item });
  } catch (error) {
    logger.error('Error creating labor rate:', error);
    next(error);
  }
};

const updateLaborRate = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, code, rate, duration, description, isActive } = req.body;

    const item = await LaborRate.findByIdAndUpdate(id,
      { $set: { name, code, rate, duration, description, isActive, updatedBy: req.user.id } },
      { new: true, runValidators: true }
    );
    if (!item) throw new AppError('Labor rate not found', 404);

    await createAuditLog(req.user.id, 'Update Labor Rate', 'Service Master Data', `Labor rate ID ${id} updated`, req);
    logFileOperation(req, { action: 'updateLaborRate', laborRateId: id });
    logger.info(`Labor rate updated: ID ${id} by ${req.user.email}`);

    res.json({ success: true, message: 'Labor rate updated successfully', data: item });
  } catch (error) {
    logger.error('Error updating labor rate:', error);
    next(error);
  }
};

const deleteLaborRate = async (req, res, next) => {
  try {
    const { id } = req.params;
    const item = await LaborRate.findByIdAndDelete(id);
    if (!item) throw new AppError('Labor rate not found', 404);

    await createAuditLog(req.user.id, 'Delete Labor Rate', 'Service Master Data', `Labor rate "${item.name}" deleted`, req);
    logFileOperation(req, { action: 'deleteLaborRate', laborRateId: id });
    logger.info(`Labor rate deleted: ID ${id} by ${req.user.email}`);

    res.json({ success: true, message: 'Labor rate deleted successfully' });
  } catch (error) {
    logger.error('Error deleting labor rate:', error);
    next(error);
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// SERVICE PACKAGES
// ═══════════════════════════════════════════════════════════════════════════

const getServicePackages = async (req, res, next) => {
  try {
    const { search = '', is_active, page = 1, limit = 100 } = req.query;
    const { skip, limit: lim, page: p, limit: l } = paginate(page, limit);
    const filter = buildSearchFilter(search);
    if (is_active !== undefined) filter.isActive = is_active === 'true';

    const [items, total] = await Promise.all([
      ServicePackage.find(filter).sort({ packageName: 1 }).skip(skip).limit(lim).lean(),
      ServicePackage.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: items,
      pagination: { page: p, limit: l, total, totalPages: Math.ceil(total / l) },
    });
  } catch (error) {
    logger.error('Error fetching service packages:', error);
    next(error);
  }
};

const getPackageById = async (req, res, next) => {
  try {
    const item = await ServicePackage.findById(req.params.id).lean();
    if (!item) throw new AppError('Service package not found', 404);
    res.json({ success: true, data: item });
  } catch (error) {
    logger.error('Error fetching service package:', error);
    next(error);
  }
};

const createServicePackage = async (req, res, next) => {
  try {
    const { packageName, services, price, duration, warranty, description, isActive } = req.body;
    if (!packageName) throw new AppError('Package name is required', 400);

    const item = await ServicePackage.create({
      packageName, services, price, duration, warranty, description,
      isActive: isActive !== undefined ? isActive : true,
      createdBy: req.user.id,
    });

    await createAuditLog(req.user.id, 'Create Service Package', 'Service Master Data', `Service package "${packageName}" created`, req);
    logFileOperation(req, { action: 'createServicePackage', packageName: packageName.trim() });
    logger.info(`Service package created: ${packageName} by ${req.user.email}`);

    res.status(201).json({ success: true, message: 'Service package created successfully', data: item });
  } catch (error) {
    logger.error('Error creating service package:', error);
    next(error);
  }
};

const updateServicePackage = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { packageName, services, price, duration, warranty, description, isActive } = req.body;

    const item = await ServicePackage.findByIdAndUpdate(id,
      { $set: { packageName, services, price, duration, warranty, description, isActive, updatedBy: req.user.id } },
      { new: true, runValidators: true }
    );
    if (!item) throw new AppError('Service package not found', 404);

    await createAuditLog(req.user.id, 'Update Service Package', 'Service Master Data', `Service package ID ${id} updated`, req);
    logFileOperation(req, { action: 'updateServicePackage', packageId: id });
    logger.info(`Service package updated: ID ${id} by ${req.user.email}`);

    res.json({ success: true, message: 'Service package updated successfully', data: item });
  } catch (error) {
    logger.error('Error updating service package:', error);
    next(error);
  }
};

const deleteServicePackage = async (req, res, next) => {
  try {
    const { id } = req.params;
    const item = await ServicePackage.findByIdAndDelete(id);
    if (!item) throw new AppError('Service package not found', 404);

    await createAuditLog(req.user.id, 'Delete Service Package', 'Service Master Data', `Service package "${item.packageName}" deleted`, req);
    logFileOperation(req, { action: 'deleteServicePackage', packageId: id });
    logger.info(`Service package deleted: ID ${id} by ${req.user.email}`);

    res.json({ success: true, message: 'Service package deleted successfully' });
  } catch (error) {
    logger.error('Error deleting service package:', error);
    next(error);
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// WARRANTY TYPES
// ═══════════════════════════════════════════════════════════════════════════

const getWarrantyTypes = async (req, res, next) => {
  try {
    const { search = '', is_active, page = 1, limit = 100 } = req.query;
    const { skip, limit: lim, page: p, limit: l } = paginate(page, limit);
    const filter = buildSearchFilter(search);
    if (is_active !== undefined) filter.isActive = is_active === 'true';

    const [items, total] = await Promise.all([
      WarrantyType.find(filter).sort({ name: 1 }).skip(skip).limit(lim).lean(),
      WarrantyType.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: items,
      pagination: { page: p, limit: l, total, totalPages: Math.ceil(total / l) },
    });
  } catch (error) {
    logger.error('Error fetching warranty types:', error);
    next(error);
  }
};

const createWarrantyType = async (req, res, next) => {
  try {
    const { name, code, description, durationMonths, durationKm, terms, isActive } = req.body;
    if (!name) throw new AppError('Name is required', 400);

    const item = await WarrantyType.create({
      name, code, description, durationMonths, durationKm, terms,
      isActive: isActive !== undefined ? isActive : true,
      createdBy: req.user.id,
    });

    await createAuditLog(req.user.id, 'Create Warranty Type', 'Service Master Data', `Warranty type "${name}" created`, req);
    logFileOperation(req, { action: 'createWarrantyType', name: name.trim() });
    logger.info(`Warranty type created: ${name} by ${req.user.email}`);

    res.status(201).json({ success: true, message: 'Warranty type created successfully', data: item });
  } catch (error) {
    logger.error('Error creating warranty type:', error);
    next(error);
  }
};

const updateWarrantyType = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, code, description, durationMonths, durationKm, terms, isActive } = req.body;

    const item = await WarrantyType.findByIdAndUpdate(id,
      { $set: { name, code, description, durationMonths, durationKm, terms, isActive, updatedBy: req.user.id } },
      { new: true, runValidators: true }
    );
    if (!item) throw new AppError('Warranty type not found', 404);

    await createAuditLog(req.user.id, 'Update Warranty Type', 'Service Master Data', `Warranty type ID ${id} updated`, req);
    logFileOperation(req, { action: 'updateWarrantyType', warrantyTypeId: id });
    logger.info(`Warranty type updated: ID ${id} by ${req.user.email}`);

    res.json({ success: true, message: 'Warranty type updated successfully', data: item });
  } catch (error) {
    logger.error('Error updating warranty type:', error);
    next(error);
  }
};

const deleteWarrantyType = async (req, res, next) => {
  try {
    const { id } = req.params;
    const item = await WarrantyType.findByIdAndDelete(id);
    if (!item) throw new AppError('Warranty type not found', 404);

    await createAuditLog(req.user.id, 'Delete Warranty Type', 'Service Master Data', `Warranty type "${item.name}" deleted`, req);
    logFileOperation(req, { action: 'deleteWarrantyType', warrantyTypeId: id });
    logger.info(`Warranty type deleted: ID ${id} by ${req.user.email}`);

    res.json({ success: true, message: 'Warranty type deleted successfully' });
  } catch (error) {
    logger.error('Error deleting warranty type:', error);
    next(error);
  }
};

module.exports = {
  getStats,
  getServiceTypes, createServiceType, updateServiceType, deleteServiceType,
  getLaborRates, createLaborRate, updateLaborRate, deleteLaborRate,
  getServicePackages, getPackageById, createServicePackage, updateServicePackage, deleteServicePackage,
  getWarrantyTypes, createWarrantyType, updateWarrantyType, deleteWarrantyType,
};
