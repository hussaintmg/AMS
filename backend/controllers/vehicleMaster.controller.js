const {
  VehicleMake, VehicleModel, VehicleVariant,
  VehicleColor, PartCategory, Supplier, VehicleCondition,
} = require('../models/VehicleMaster.model');
const { AppError } = require('../middleware/errorHandler');
const logger = require('../utils/logger');
const { normalizePhone } = require('../utils/phone.util');
const { logFileOperation } = require('../utils/apiLogger');
const Log = require('../models/mongo/Log.model');

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

const masterModels = {
  makes: VehicleMake,
  models: VehicleModel,
  variants: VehicleVariant,
  colors: VehicleColor,
  categories: PartCategory,
  suppliers: Supplier,
  conditions: VehicleCondition,
};

const toggleActive = async (req, res, next) => {
  try {
    const Model = masterModels[req.params.type];
    if (!Model) throw new AppError('Invalid vehicle master type', 400);
    const doc = await Model.findById(req.params.id);
    if (!doc) throw new AppError('Vehicle master record not found', 404);
    doc.is_active = !doc.is_active;
    await doc.save();
    await createAuditLog(req.user?.id, 'Toggle Status', 'Vehicle Master Data', `${req.params.type} ${req.params.id} ${doc.is_active ? 'activated' : 'deactivated'}`, req);
    res.json({ success: true, message: `Record ${doc.is_active ? 'activated' : 'deactivated'}`, data: { is_active: doc.is_active } });
  } catch (error) { next(error); }
};

// ═══════════════════════════════════════════════════════════════════════════
// VEHICLE MAKES
// ═══════════════════════════════════════════════════════════════════════════

const getMakes = async (req, res, next) => {
  try {
    const { search = '', is_active, page = 1, limit = 100 } = req.query;
    const filter = {};
    if (search) filter.name = { $regex: search, $options: 'i' };
    if (is_active !== undefined) filter.is_active = is_active === 'true';

    const total = await VehicleMake.countDocuments(filter);
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const makes = await VehicleMake.aggregate([
      { $match: filter },
      { $sort: { createdAt: -1 } },
      { $skip: skip },
      { $limit: parseInt(limit) },
      {
        $lookup: {
          from: 'vehiclemodels',
          localField: '_id',
          foreignField: 'make_id',
          as: 'models',
        },
      },
      { $addFields: { model_count: { $size: '$models' } } },
      {
        $lookup: {
          from: 'vehicles',
          let: { mkName: '$name' },
          pipeline: [
            { $match: { $expr: { $and: [{ $eq: ['$make.name', '$$mkName'] }, { $ne: ['$isActive', false] }] } } },
            { $count: 'c' },
          ],
          as: 'vc',
        },
      },
      { $addFields: { vehicle_count: { $ifNull: [{ $arrayElemAt: ['$vc.c', 0] }, 0] } } },
    ]);
    res.json({
      success: true,
      data: {
        makes: makes.map(m => ({ ...m, id: m._id.toString(), _id: undefined, models: undefined, vc: undefined })),
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          totalPages: Math.ceil(total / parseInt(limit)),
        },
      },
    });
  } catch (error) {
    logger.error('Error fetching makes:', error);
    next(error);
  }
};

const createMake = async (req, res, next) => {
  try {
    const { name, country, logo, description, establishedYear, website, isActive } = req.body;
    if (!name) throw new AppError('Brand name is required', 400);

    const doc = await VehicleMake.create({
      name, country, logo,
      description: description || '',
      established_year: establishedYear || null,
      website: website || '',
      is_active: isActive,
    });

    await createAuditLog(req.user.id, 'Create Brand', 'Vehicle Master Data', `Brand "${name}" created`, req);
    logFileOperation(req, { action: 'createMake', name: name.trim() });
    logger.info(`Make created: ${name} by ${req.user.email}`);

    res.status(201).json({
      success: true,
      message: 'Make created successfully',
      data: { id: doc._id.toString(), name },
    });
  } catch (error) {
    logger.error('Error creating make:', error);
    next(error);
  }
};

const updateMake = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, country, logo, description, establishedYear, website, isActive } = req.body;

    const doc = await VehicleMake.findByIdAndUpdate(
      id,
      {
        name, country, logo,
        description: description || '',
        established_year: establishedYear || null,
        website: website || '',
        is_active: isActive,
      },
      { new: true, runValidators: true },
    );
    if (!doc) throw new AppError('Brand not found', 404);

    await createAuditLog(req.user.id, 'Update Brand', 'Vehicle Master Data', `Brand ID ${id} updated`, req);
    logFileOperation(req, { action: 'updateMake', makeId: id });
    logger.info(`Make updated: ID ${id} by ${req.user.email}`);

    res.json({ success: true, message: 'Make updated successfully' });
  } catch (error) {
    logger.error('Error updating make:', error);
    next(error);
  }
};

const deleteMake = async (req, res, next) => {
  try {
    const { id } = req.params;
    const doc = await VehicleMake.findByIdAndDelete(id);
    if (!doc) throw new AppError('Make not found', 404);

    await createAuditLog(req.user.id, 'Delete Make', 'Vehicle Master Data', `Make ID ${id} deleted`, req);
    logFileOperation(req, { action: 'deleteMake', makeId: id });
    logger.info(`Make deleted: ID ${id} by ${req.user.email}`);

    res.json({ success: true, message: 'Make deleted successfully' });
  } catch (error) {
    logger.error('Error deleting make:', error);
    next(error);
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// VEHICLE MODELS
// ═══════════════════════════════════════════════════════════════════════════

const getModels = async (req, res, next) => {
  try {
    const { make_id, search = '', is_active, page = 1, limit = 100 } = req.query;
    const filter = {};
    if (make_id) filter.make_id = new (require('mongoose').Types.ObjectId)(make_id);
    if (search) filter.name = { $regex: search, $options: 'i' };
    if (is_active !== undefined) filter.is_active = is_active === 'true';

    const total = await VehicleModel.countDocuments(filter);
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const models = await VehicleModel.aggregate([
      { $match: filter },
      { $sort: { createdAt: -1 } },
      { $skip: skip },
      { $limit: parseInt(limit) },
      {
        $lookup: {
          from: 'vehiclemakes',
          localField: 'make_id',
          foreignField: '_id',
          as: 'make',
        },
      },
      { $unwind: { path: '$make', preserveNullAndEmptyArrays: true } },
      { $addFields: { make_name: '$make.name', make_id: '$make._id' } },
      {
        $lookup: {
          from: 'vehiclevariants',
          localField: '_id',
          foreignField: 'model_id',
          as: 'variants',
        },
      },
      { $addFields: { variant_count: { $size: '$variants' } } },
      {
        $lookup: {
          from: 'vehicles',
          let: { mdName: '$name', mkName: '$make_name' },
          pipeline: [
            { $match: { $expr: { $and: [{ $eq: ['$model.name', '$$mdName'] }, { $eq: ['$make.name', '$$mkName'] }, { $ne: ['$isActive', false] }] } } },
            { $count: 'c' },
          ],
          as: 'vc',
        },
      },
      { $addFields: { vehicle_count: { $ifNull: [{ $arrayElemAt: ['$vc.c', 0] }, 0] } } },
      { $project: { make: 0, variants: 0, vc: 0 } },
    ]);

    res.json({
      success: true,
      data: {
        models: models.map(m => ({ ...m, id: m._id.toString(), _id: undefined, make_id: m.make_id?.toString?.() || m.make_id, make: undefined })),
      },
    });
  } catch (error) {
    logger.error('Error fetching models:', error);
    next(error);
  }
};

const createModel = async (req, res, next) => {
  try {
    const { makeId, name, year, bodyType, fuelType, transmission, engineCapacity, seatingCapacity, isActive } = req.body;
    if (!makeId || !name) throw new AppError('Make ID and Model name are required', 400);

    const doc = await VehicleModel.create({
      make_id: makeId,
      name,
      year,
      body_type: bodyType,
      fuel_type: fuelType,
      transmission,
      engine_capacity: engineCapacity,
      seating_capacity: seatingCapacity,
      is_active: isActive,
    });

    await createAuditLog(req.user.id, 'Create Model', 'Vehicle Master Data', `Model "${name}" created`, req);
    logFileOperation(req, { action: 'createModel', makeId, name: name.trim() });
    logger.info(`Model created: ${name} by ${req.user.email}`);

    res.status(201).json({
      success: true,
      message: 'Model created successfully',
      data: { id: doc._id.toString(), name },
    });
  } catch (error) {
    logger.error('Error creating model:', error);
    next(error);
  }
};

const updateModel = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { makeId, name, year, bodyType, fuelType, transmission, engineCapacity, seatingCapacity, isActive } = req.body;

    const doc = await VehicleModel.findByIdAndUpdate(
      id,
      {
        make_id: makeId,
        name, year,
        body_type: bodyType,
        fuel_type: fuelType,
        transmission,
        engine_capacity: engineCapacity,
        seating_capacity: seatingCapacity,
        is_active: isActive,
      },
      { new: true, runValidators: true },
    );
    if (!doc) throw new AppError('Model not found', 404);

    await createAuditLog(req.user.id, 'Update Model', 'Vehicle Master Data', `Model ID ${id} updated`, req);
    logFileOperation(req, { action: 'updateModel', modelId: id });
    logger.info(`Model updated: ID ${id} by ${req.user.email}`);

    res.json({ success: true, message: 'Model updated successfully' });
  } catch (error) {
    logger.error('Error updating model:', error);
    next(error);
  }
};

const deleteModel = async (req, res, next) => {
  try {
    const { id } = req.params;
    const doc = await VehicleModel.findByIdAndDelete(id);
    if (!doc) throw new AppError('Model not found', 404);

    await createAuditLog(req.user.id, 'Delete Model', 'Vehicle Master Data', `Model ID ${id} deleted`, req);
    logFileOperation(req, { action: 'deleteModel', modelId: id });
    logger.info(`Model deleted: ID ${id} by ${req.user.email}`);

    res.json({ success: true, message: 'Model deleted successfully' });
  } catch (error) {
    logger.error('Error deleting model:', error);
    next(error);
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// VEHICLE VARIANTS
// ═══════════════════════════════════════════════════════════════════════════

const getVariants = async (req, res, next) => {
  try {
    const { model_id, make_id, search = '', is_active, page = 1, limit = 100 } = req.query;
    const filter = {};
    if (model_id) filter.model_id = new (require('mongoose').Types.ObjectId)(model_id);
    if (make_id) filter.make_id = new (require('mongoose').Types.ObjectId)(make_id);
    if (search) filter.name = { $regex: search, $options: 'i' };
    if (is_active !== undefined) filter.is_active = is_active === 'true';

    const total = await VehicleVariant.countDocuments(filter);
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const variants = await VehicleVariant.aggregate([
      { $match: filter },
      { $sort: { createdAt: -1 } },
      { $skip: skip },
      { $limit: parseInt(limit) },
      {
        $lookup: {
          from: 'vehiclemodels',
          localField: 'model_id',
          foreignField: '_id',
          as: 'model',
        },
      },
      { $unwind: { path: '$model', preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: 'vehiclemakes',
          localField: 'model.make_id',
          foreignField: '_id',
          as: 'make',
        },
      },
      { $unwind: { path: '$make', preserveNullAndEmptyArrays: true } },
      { $addFields: { model_name: '$model.name', make_name: '$make.name', make_id: '$make._id', model_id: '$model._id' } },
      {
        $lookup: {
          from: 'vehicles',
          let: { vName: '$name', mdName: '$model.name' },
          pipeline: [
            { $match: { $expr: { $and: [{ $eq: ['$variant.name', '$$vName'] }, { $eq: ['$model.name', '$$mdName'] }, { $ne: ['$isActive', false] }] } } },
            { $count: 'c' },
          ],
          as: 'vc',
        },
      },
      { $addFields: { vehicle_count: { $ifNull: [{ $arrayElemAt: ['$vc.c', 0] }, 0] } } },
      { $project: { model: 0, make: 0, vc: 0 } },
    ]);

    res.json({
      success: true,
      data: {
        variants: variants.map(v => ({ ...v, id: v._id.toString(), _id: undefined, make_id: v.make_id?.toString?.() || v.make_id, model_id: v.model_id?.toString?.() || v.model_id })),
      },
    });
  } catch (error) {
    logger.error('Error fetching variants:', error);
    next(error);
  }
};

const createVariant = async (req, res, next) => {
  try {
    const { modelId, makeId, name, basePrice, features, specifications, isActive } = req.body;
    if (!modelId || !name) throw new AppError('Model ID and Variant name are required', 400);

    const doc = await VehicleVariant.create({
      model_id: modelId,
      name,
      base_price: basePrice || 0,
      features,
      specifications: specifications || null,
      is_active: isActive,
    });

    await createAuditLog(req.user.id, 'Create Variant', 'Vehicle Master Data', `Variant "${name}" created`, req);
    logFileOperation(req, { action: 'createVariant', modelId, name: name.trim() });
    logger.info(`Variant created: ${name} by ${req.user.email}`);

    res.status(201).json({
      success: true,
      message: 'Variant created successfully',
      data: { id: doc._id.toString(), name },
    });
  } catch (error) {
    logger.error('Error creating variant:', error);
    next(error);
  }
};

const updateVariant = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { modelId, name, basePrice, features, specifications, isActive } = req.body;

    const doc = await VehicleVariant.findByIdAndUpdate(
      id,
      {
        model_id: modelId,
        name,
        base_price: basePrice,
        features,
        specifications: specifications || null,
        is_active: isActive,
      },
      { new: true, runValidators: true },
    );
    if (!doc) throw new AppError('Variant not found', 404);

    await createAuditLog(req.user.id, 'Update Variant', 'Vehicle Master Data', `Variant ID ${id} updated`, req);
    logFileOperation(req, { action: 'updateVariant', variantId: id });
    logger.info(`Variant updated: ID ${id} by ${req.user.email}`);

    res.json({ success: true, message: 'Variant updated successfully' });
  } catch (error) {
    logger.error('Error updating variant:', error);
    next(error);
  }
};

const deleteVariant = async (req, res, next) => {
  try {
    const { id } = req.params;
    const doc = await VehicleVariant.findByIdAndDelete(id);
    if (!doc) throw new AppError('Variant not found', 404);

    await createAuditLog(req.user.id, 'Delete Variant', 'Vehicle Master Data', `Variant ID ${id} deleted`, req);
    logFileOperation(req, { action: 'deleteVariant', variantId: id });
    logger.info(`Variant deleted: ID ${id} by ${req.user.email}`);

    res.json({ success: true, message: 'Variant deleted successfully' });
  } catch (error) {
    logger.error('Error deleting variant:', error);
    next(error);
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// VEHICLE COLORS
// ═══════════════════════════════════════════════════════════════════════════

const getColors = async (req, res, next) => {
  try {
    const { search = '', is_active, page = 1, limit = 100 } = req.query;
    const filter = {};
    if (search) filter.name = { $regex: search, $options: 'i' };
    if (is_active !== undefined) filter.is_active = is_active === 'true';

    const total = await VehicleColor.countDocuments(filter);
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const colors = await VehicleColor.aggregate([
      { $match: filter },
      { $sort: { createdAt: -1 } },
      { $skip: skip },
      { $limit: parseInt(limit) },
      {
        $lookup: {
          from: 'vehicles',
          let: { clName: '$name' },
          pipeline: [
            { $match: { $expr: { $and: [{ $eq: ['$color.name', '$$clName'] }, { $ne: ['$isActive', false] }] } } },
            { $count: 'c' },
          ],
          as: 'vc',
        },
      },
      { $addFields: { vehicle_count: { $ifNull: [{ $arrayElemAt: ['$vc.c', 0] }, 0] } } },
    ]);

    res.json({
      success: true,
      data: {
        colors: colors.map(c => ({ ...c, id: c._id.toString(), _id: undefined, vc: undefined })),
      },
    });
  } catch (error) {
    logger.error('Error fetching colors:', error);
    next(error);
  }
};

const createColor = async (req, res, next) => {
  try {
    const { name, hexCode, isMetallic, additionalCost, isActive } = req.body;
    if (!name) throw new AppError('Color name is required', 400);

    const doc = await VehicleColor.create({
      name,
      hex_code: hexCode,
      is_metallic: isMetallic,
      additional_cost: additionalCost,
      is_active: isActive,
    });

    await createAuditLog(req.user.id, 'Create Color', 'Vehicle Master Data', `Color "${name}" created`, req);
    logFileOperation(req, { action: 'createColor', name: name.trim() });
    logger.info(`Color created: ${name} by ${req.user.email}`);

    res.status(201).json({
      success: true,
      message: 'Color created successfully',
      data: { id: doc._id.toString(), name },
    });
  } catch (error) {
    logger.error('Error creating color:', error);
    next(error);
  }
};

const updateColor = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, hexCode, isMetallic, additionalCost, isActive } = req.body;

    const doc = await VehicleColor.findByIdAndUpdate(
      id,
      {
        name,
        hex_code: hexCode,
        is_metallic: isMetallic,
        additional_cost: additionalCost,
        is_active: isActive,
      },
      { new: true, runValidators: true },
    );
    if (!doc) throw new AppError('Color not found', 404);

    await createAuditLog(req.user.id, 'Update Color', 'Vehicle Master Data', `Color ID ${id} updated`, req);
    logFileOperation(req, { action: 'updateColor', colorId: id });
    logger.info(`Color updated: ID ${id} by ${req.user.email}`);

    res.json({ success: true, message: 'Color updated successfully' });
  } catch (error) {
    logger.error('Error updating color:', error);
    next(error);
  }
};

const deleteColor = async (req, res, next) => {
  try {
    const { id } = req.params;
    const doc = await VehicleColor.findByIdAndDelete(id);
    if (!doc) throw new AppError('Color not found', 404);

    await createAuditLog(req.user.id, 'Delete Color', 'Vehicle Master Data', `Color ID ${id} deleted`, req);
    logFileOperation(req, { action: 'deleteColor', colorId: id });
    logger.info(`Color deleted: ID ${id} by ${req.user.email}`);

    res.json({ success: true, message: 'Color deleted successfully' });
  } catch (error) {
    logger.error('Error deleting color:', error);
    next(error);
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// STATS
// ═══════════════════════════════════════════════════════════════════════════

const getStats = async (req, res, next) => {
  try {
    const [
      makeCount, modelCount, variantCount,
      colorCount, categoryCount, supplierCount,
    ] = await Promise.all([
      VehicleMake.countDocuments({ is_active: true }),
      VehicleModel.countDocuments({ is_active: true }),
      VehicleVariant.countDocuments({ is_active: true }),
      VehicleColor.countDocuments({ is_active: true }),
      PartCategory.countDocuments({ is_active: true }),
      Supplier.countDocuments({ is_active: true }),
    ]);

    res.json({
      success: true,
      data: {
        total_makes: makeCount,
        total_models: modelCount,
        total_variants: variantCount,
        total_colors: colorCount,
        total_categories: categoryCount,
        total_suppliers: supplierCount,
      },
    });
  } catch (error) {
    logger.error('Error fetching stats:', error);
    next(error);
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// PART CATEGORIES
// ═══════════════════════════════════════════════════════════════════════════

const getCategories = async (req, res, next) => {
  try {
    const { search = '', is_active, parent_id, page = 1, limit = 100 } = req.query;
    const filter = {};
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
      ];
    }
    if (is_active !== undefined) filter.is_active = is_active === 'true';
    if (parent_id !== undefined) {
      filter.parent_id = parent_id === '' ? null : new (require('mongoose').Types.ObjectId)(parent_id);
    }

    const total = await PartCategory.countDocuments(filter);
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const categories = await PartCategory.aggregate([
      { $match: filter },
      { $sort: { createdAt: -1 } },
      { $skip: skip },
      { $limit: parseInt(limit) },
      {
        $lookup: {
          from: 'partcategories',
          localField: 'parent_id',
          foreignField: '_id',
          as: 'parent',
        },
      },
      { $unwind: { path: '$parent', preserveNullAndEmptyArrays: true } },
      { $addFields: { parent_name: { $ifNull: ['$parent.name', null] } } },
      {
        $lookup: {
          from: 'partcategories',
          localField: '_id',
          foreignField: 'parent_id',
          as: 'children',
        },
      },
      { $addFields: { sub_category_count: { $size: '$children' } } },
      {
        $lookup: {
          from: 'parts',
          let: { catName: '$name' },
          pipeline: [
            { $match: { $expr: { $and: [{ $eq: ['$category.name', '$$catName'] }, { $ne: ['$isActive', false] }] } } },
            { $count: 'c' },
          ],
          as: 'pc',
        },
      },
      { $addFields: { parts_count: { $ifNull: [{ $arrayElemAt: ['$pc.c', 0] }, 0] } } },
      { $project: { parent: 0, children: 0, pc: 0 } },
    ]);

    res.json({
      success: true,
      data: {
        categories: categories.map(c => ({ ...c, id: c._id.toString(), _id: undefined, parent_id: c.parent_id?.toString?.() || null })),
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          totalPages: Math.ceil(total / parseInt(limit)),
        },
      },
    });
  } catch (error) {
    logger.error('Error fetching categories:', error);
    next(error);
  }
};

const createCategory = async (req, res, next) => {
  try {
    const { name, description, parentId, isActive } = req.body;
    if (!name) throw new AppError('Category name is required', 400);

    const doc = await PartCategory.create({
      name,
      description,
      parent_id: parentId || null,
      is_active: isActive,
    });

    await createAuditLog(req.user.id, 'Create Category', 'Vehicle Master Data', `Category "${name}" created`, req);
    logFileOperation(req, { action: 'createCategory', name: name.trim() });
    logger.info(`Category created: ${name} by ${req.user.email}`);

    res.status(201).json({
      success: true,
      message: 'Category created successfully',
      data: { id: doc._id.toString(), name },
    });
  } catch (error) {
    logger.error('Error creating category:', error);
    next(error);
  }
};

const updateCategory = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, description, parentId, isActive } = req.body;

    const doc = await PartCategory.findByIdAndUpdate(
      id,
      {
        name,
        description,
        parent_id: parentId !== undefined ? (parentId || null) : undefined,
        is_active: isActive,
      },
      { new: true, runValidators: true },
    );
    if (!doc) throw new AppError('Category not found', 404);

    await createAuditLog(req.user.id, 'Update Category', 'Vehicle Master Data', `Category ID ${id} updated`, req);
    logFileOperation(req, { action: 'updateCategory', categoryId: id });
    logger.info(`Category updated: ID ${id} by ${req.user.email}`);

    res.json({ success: true, message: 'Category updated successfully' });
  } catch (error) {
    logger.error('Error updating category:', error);
    next(error);
  }
};

const deleteCategory = async (req, res, next) => {
  try {
    const { id } = req.params;
    const doc = await PartCategory.findByIdAndDelete(id);
    if (!doc) throw new AppError('Category not found', 404);

    await createAuditLog(req.user.id, 'Delete Category', 'Vehicle Master Data', `Category ID ${id} deleted`, req);
    logFileOperation(req, { action: 'deleteCategory', categoryId: id });
    logger.info(`Category deleted: ID ${id} by ${req.user.email}`);

    res.json({ success: true, message: 'Category deleted successfully' });
  } catch (error) {
    logger.error('Error deleting category:', error);
    next(error);
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// SUPPLIERS
// ═══════════════════════════════════════════════════════════════════════════

const getSuppliers = async (req, res, next) => {
  try {
    const { search = '', is_active, page = 1, limit = 100 } = req.query;
    const filter = {};
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { supplier_code: { $regex: search, $options: 'i' } },
        { contact_person: { $regex: search, $options: 'i' } },
      ];
    }
    if (is_active !== undefined) filter.is_active = is_active === 'true';

    const total = await Supplier.countDocuments(filter);
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const suppliers = await Supplier.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    res.json({
      success: true,
      data: {
        suppliers: suppliers.map(s => ({ ...s, id: s._id.toString(), _id: undefined })),
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          totalPages: Math.ceil(total / parseInt(limit)),
        },
      },
    });
  } catch (error) {
    logger.error('Error fetching suppliers:', error);
    next(error);
  }
};

const createSupplier = async (req, res, next) => {
  try {
    const {
      supplierCode, name, type, contactPerson, email, phone,
      address, city, country, taxNumber, paymentTerms, creditLimit, isActive,
    } = req.body;
    const normalizedPhone = phone ? normalizePhone(phone) : null;

    if (!supplierCode || !name || !type) {
      throw new AppError('Supplier code, name and type are required', 400);
    }

    const doc = await Supplier.create({
      supplier_code: supplierCode,
      name, type,
      contact_person: contactPerson,
      email,
      phone: normalizedPhone,
      address, city, country,
      tax_number: taxNumber,
      payment_terms: paymentTerms,
      credit_limit: creditLimit,
      is_active: isActive,
    });

    await createAuditLog(req.user.id, 'Create Supplier', 'Vehicle Master Data', `Supplier "${name}" (${supplierCode}) created`, req);
    logFileOperation(req, { action: 'createSupplier', name: name.trim(), supplierCode });
    logger.info(`Supplier created: ${name} (${supplierCode}) by ${req.user.email}`);

    res.status(201).json({
      success: true,
      message: 'Supplier created successfully',
      data: { id: doc._id.toString(), name, supplierCode },
    });
  } catch (error) {
    logger.error('Error creating supplier:', error);
    if (error.code === 11000) {
      return next(new AppError('Supplier code already exists', 400));
    }
    next(error);
  }
};

const updateSupplier = async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      supplierCode, name, type, contactPerson, email, phone,
      address, city, country, taxNumber, paymentTerms, creditLimit, isActive,
    } = req.body;
    const normalizedPhone = phone !== undefined && phone !== null && phone !== '' ? normalizePhone(phone) : null;

    const doc = await Supplier.findByIdAndUpdate(
      id,
      {
        supplier_code: supplierCode,
        name, type,
        contact_person: contactPerson,
        email,
        phone: normalizedPhone,
        address, city, country,
        tax_number: taxNumber,
        payment_terms: paymentTerms,
        credit_limit: creditLimit,
        is_active: isActive,
      },
      { new: true, runValidators: true },
    );
    if (!doc) throw new AppError('Supplier not found', 404);

    await createAuditLog(req.user.id, 'Update Supplier', 'Vehicle Master Data', `Supplier ID ${id} updated`, req);
    logFileOperation(req, { action: 'updateSupplier', supplierId: id });
    logger.info(`Supplier updated: ID ${id} by ${req.user.email}`);

    res.json({ success: true, message: 'Supplier updated successfully' });
  } catch (error) {
    logger.error('Error updating supplier:', error);
    if (error.code === 11000) {
      return next(new AppError('Supplier code already exists', 400));
    }
    next(error);
  }
};

const deleteSupplier = async (req, res, next) => {
  try {
    const { id } = req.params;
    const doc = await Supplier.findByIdAndDelete(id);
    if (!doc) throw new AppError('Supplier not found', 404);

    await createAuditLog(req.user.id, 'Delete Supplier', 'Vehicle Master Data', `Supplier ID ${id} deleted`, req);
    logFileOperation(req, { action: 'deleteSupplier', supplierId: id });
    logger.info(`Supplier deleted: ID ${id} by ${req.user.email}`);

    res.json({ success: true, message: 'Supplier deleted successfully' });
  } catch (error) {
    logger.error('Error deleting supplier:', error);
    next(error);
  }
};

/* ═══════════════════════════════════════════════════════════════════════════
   VEHICLE CONDITIONS
   ═══════════════════════════════════════════════════════════════════════════ */

const getConditions = async (req, res, next) => {
  try {
    const { search = '', is_active, page = 1, limit = 100 } = req.query;
    const filter = {};
    if (search) filter.name = { $regex: search, $options: 'i' };
    if (is_active !== undefined) filter.is_active = is_active === 'true';

    const total = await VehicleCondition.countDocuments(filter);
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const conditions = await VehicleCondition.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    res.json({
      success: true,
      data: {
        conditions: conditions.map(c => ({ ...c, id: c._id.toString(), _id: undefined })),
        pagination: { page: parseInt(page), limit: parseInt(limit), total, totalPages: Math.ceil(total / parseInt(limit)) },
      },
    });
  } catch (error) {
    logger.error('Error fetching conditions:', error);
    next(error);
  }
};

const createCondition = async (req, res, next) => {
  try {
    const { name, description, isActive } = req.body;
    if (!name) throw new AppError('Condition name is required', 400);

    const doc = await VehicleCondition.create({ name, description, is_active: isActive });
    await createAuditLog(req.user.id, 'Create Condition', 'Vehicle Master Data', `Condition "${name}" created`, req);

    res.status(201).json({
      success: true,
      message: 'Condition created successfully',
      data: { id: doc._id.toString(), name },
    });
  } catch (error) {
    logger.error('Error creating condition:', error);
    next(error);
  }
};

const updateCondition = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, description, isActive } = req.body;

    const doc = await VehicleCondition.findByIdAndUpdate(
      id,
      { name, description, is_active: isActive },
      { new: true, runValidators: true }
    );
    if (!doc) throw new AppError('Condition not found', 404);

    await createAuditLog(req.user.id, 'Update Condition', 'Vehicle Master Data', `Condition "${name}" updated`, req);

    res.json({ success: true, message: 'Condition updated successfully' });
  } catch (error) {
    logger.error('Error updating condition:', error);
    next(error);
  }
};

const deleteCondition = async (req, res, next) => {
  try {
    const { id } = req.params;
    const doc = await VehicleCondition.findByIdAndDelete(id);
    if (!doc) throw new AppError('Condition not found', 404);

    await createAuditLog(req.user.id, 'Delete Condition', 'Vehicle Master Data', `Condition "${doc.name}" deleted`, req);

    res.json({ success: true, message: 'Condition deleted successfully' });
  } catch (error) {
    logger.error('Error deleting condition:', error);
    next(error);
  }
};

module.exports = {
  toggleActive,
  getMakes, createMake, updateMake, deleteMake,
  getModels, createModel, updateModel, deleteModel,
  getVariants, createVariant, updateVariant, deleteVariant,
  getColors, createColor, updateColor, deleteColor,
  getCategories, createCategory, updateCategory, deleteCategory,
  getSuppliers, createSupplier, updateSupplier, deleteSupplier,
  getConditions, createCondition, updateCondition, deleteCondition,
  getStats,
};
