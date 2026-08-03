const Part = require('../models/Part.model');
const PartSourceType = require('../models/PartSourceType.model');
const Warehouse = require('../models/Warehouse.model');
const { PartCategory, Supplier } = require('../models/VehicleMaster.model');
const { AppError } = require('../middleware/errorHandler');
const logger = require('../utils/logger');
const { nextBarcode } = require('../utils/barcode');

const DEFAULT_SOURCE_TYPES = [
  { value: 'manufacturer', name: 'Manufacturer (OEM)', sortOrder: 1, isSystem: true },
  { value: 'third_party', name: '3rd Party', sortOrder: 2, isSystem: true },
];

// Imports and older records store free text ("OEM", "3rd Party"). Without folding
// these into the built-ins, each spelling becomes its own tab meaning the same thing.
const SOURCE_TYPE_ALIASES = {
    oem: 'manufacturer',
    manufacturer_oem: 'manufacturer',
    oem_manufacturer: 'manufacturer',
    '3rd_party': 'third_party',
    '3rdparty': 'third_party',
    thirdparty: 'third_party',
    third: 'third_party',
    aftermarket: 'third_party',
};

const slugifySourceType = (value) => String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

const normalizeSourceType = (value) => {
    const slug = slugifySourceType(value);
    return SOURCE_TYPE_ALIASES[slug] || slug;
};

const titleizeSourceType = (value) => String(value || '')
    .split('_')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

// Keeps the source-type list authoritative: the two built-ins always exist, and any
// value already sitting on a part (legacy rows, bulk imports) is registered too so
// no part can end up invisible to every tab.
const ensureSourceTypes = async () => {
    for (const preset of DEFAULT_SOURCE_TYPES) {
        await PartSourceType.updateOne(
            { value: preset.value },
            { $setOnInsert: preset },
            { upsert: true }
        );
    }

    // An alias never gets its own type — it always folds into the built-in it means.
    await PartSourceType.deleteMany({
        value: { $in: Object.keys(SOURCE_TYPE_ALIASES) },
        isSystem: { $ne: true },
    });

    const known = new Set((await PartSourceType.find().select('value').lean()).map((type) => type.value));
    const used = await Part.distinct('sourceType', { sourceType: { $nin: [null, ''] } });
    for (const value of used) {
        const slug = normalizeSourceType(value);
        if (!slug) continue;
        // Rewrite the stored spelling so the part answers to its tab's filter.
        if (slug !== value) {
            await Part.updateMany({ sourceType: value }, { $set: { sourceType: slug } });
        }
        if (known.has(slug)) continue;
        await PartSourceType.updateOne(
            { value: slug },
            { $setOnInsert: { value: slug, name: titleizeSourceType(slug), sortOrder: 100 } },
            { upsert: true }
        );
        known.add(slug);
    }
};

const listSourceTypes = async () => {
    await ensureSourceTypes();
    return PartSourceType.find({ isActive: true }).sort({ sortOrder: 1, name: 1 }).lean();
};

// Accepts whatever the caller sent (slug or label) and guarantees the returned value
// exists in the source-type list, registering it when it does not.
const resolveSourceType = async (value) => {
    const slug = normalizeSourceType(value);
    if (!slug) return DEFAULT_SOURCE_TYPES[0].value;
    const existing = await PartSourceType.findOne({ value: slug }).select('value').lean();
    if (!existing) {
        await PartSourceType.updateOne(
            { value: slug },
            { $setOnInsert: { value: slug, name: titleizeSourceType(slug), sortOrder: 100 } },
            { upsert: true }
        );
    }
    return slug;
};

const flattenSourceType = (type) => ({
    id: type._id,
    value: type.value,
    name: type.name,
    description: type.description || '',
    sort_order: type.sortOrder,
    is_system: type.isSystem === true,
    is_active: type.isActive !== false,
});

/**
 * Purchase (cost) price is commercially sensitive: only the super admin may
 * read it, add it or change it. The rule is enforced here rather than in the
 * UI alone, so hitting the API directly with another role's token still comes
 * back without the field and still cannot write it.
 */
const canSeePurchasePrice = (req) => req.user?.isSuperAdmin === true;

const flattenPart = (p, showPurchasePrice = false) => ({
    id: p._id,
    part_number: p.partCode,
    name: p.name,
    category_id: p.categoryId || null,
    category_name: p.category?.name || '',
    description: p.description,
    brand: p.brand,
    supplier_id: p.supplierId || null,
    supplier_name: p.supplier?.name || '',
    unit: p.unit,
    ...(showPurchasePrice ? { purchase_price: p.costPrice } : {}),
    selling_price: p.sellingPrice,
    current_stock: p.currentStock,
    minimum_stock: p.minStock,
    maximum_stock: p.maxStock,
    reorder_level: p.reorderLevel,
    bin_location: p.binLocation || '',
    warehouse_id: p.warehouseId || null,
    warehouse_name: p.warehouse?.name || '',
    source_type: p.sourceType || 'manufacturer',
    barcode: p.barcode || '',
    stock_status: p.currentStock === 0
        ? 'out_of_stock'
        : p.currentStock <= (p.reorderLevel || p.minStock || 0)
            ? 'low_stock'
            : 'normal',
    is_active: p.isActive,
    created_at: p.createdAt,
    updated_at: p.updatedAt
});

const getAllParts = async (req, res, next) => {
    try {
        const {
            page = 1,
            limit = 20,
            search = '',
            sourceType = '',
            categoryId = '',
            supplierId = '',
            warehouseId = '',
            stockStatus = ''
        } = req.query;

        const pageNum = parseInt(page);
        const limitNum = Math.min(1000, Math.max(1, parseInt(limit, 10) || 20));
        const skip = (pageNum - 1) * limitNum;

        const filter = { isActive: true };

        if (search) {
            const regex = new RegExp(search, 'i');
            filter.$or = [
                { partCode: regex },
                { name: regex },
                { brand: regex }
            ];
        }

        if (sourceType) {
            filter.sourceType = sourceType;
        }

        if (categoryId) {
            filter['category.name'] = categoryId;
        }

        if (supplierId) {
            filter['supplier.code'] = supplierId;
        }

        let parts = await Part.find(filter)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limitNum)
            .lean();

        if (stockStatus) {
            parts = parts.filter((p) => {
                const threshold = p.reorderLevel || p.minStock || 0;
                if (stockStatus === 'out_of_stock') return p.currentStock === 0;
                if (stockStatus === 'low_stock') return p.currentStock > 0 && p.currentStock <= threshold;
                if (stockStatus === 'normal') return p.currentStock > threshold;
                return true;
            });
        }

        const total = await Part.countDocuments(filter);

        const showPurchasePrice = canSeePurchasePrice(req);
        const mapped = parts.map((p) => {
            const threshold = p.reorderLevel || p.minStock || 0;
            let computedStatus = 'normal';
            if (p.currentStock === 0) {
                computedStatus = 'out_of_stock';
            } else if (p.currentStock <= threshold) {
                computedStatus = 'low_stock';
            }
            return {
                id: p._id,
                part_number: p.partCode,
                name: p.name,
                category_id: null,
                category_name: p.category?.name || '',
                description: p.description,
                brand: p.brand,
                supplier_id: null,
                supplier_name: p.supplier?.name || '',
                unit: p.unit,
                ...(showPurchasePrice ? { purchase_price: p.costPrice } : {}),
                selling_price: p.sellingPrice,
                current_stock: p.currentStock,
                minimum_stock: p.minStock,
                reorder_level: p.reorderLevel,
                warehouse_id: null,
                warehouse_name: p.warehouse?.name || '',
                source_type: p.sourceType || 'manufacturer',
                barcode: p.barcode || '',
                stock_status: stockStatus ? computedStatus : undefined,
                is_active: p.isActive,
                created_at: p.createdAt,
                updated_at: p.updatedAt
            };
        });

        res.json({
            success: true,
            data: {
                parts: mapped,
                pagination: {
                    page: pageNum,
                    limit: limitNum,
                    total,
                    totalPages: Math.ceil(total / limitNum)
                }
            }
        });
    } catch (error) {
        logger.error('Error fetching parts:', error);
        next(error);
    }
};

const getPartById = async (req, res, next) => {
    try {
        const { id } = req.params;
        const part = await Part.findById(id).lean();

        if (!part) {
            throw new AppError('Part not found', 404);
        }

        res.json({
            success: true,
            data: flattenPart(part, canSeePurchasePrice(req))
        });
    } catch (error) {
        logger.error('Error fetching part:', error);
        next(error);
    }
};

const createPart = async (req, res, next) => {
    try {
        const {
            partNumber, name, categoryId, description, brand, sourceType,
            supplierId, unit, purchasePrice, sellingPrice, currentStock,
            minimumStock, maximumStock, reorderLevel, warehouseId, binLocation
        } = req.body;

        if (!name || !String(name).trim()) {
            throw new AppError('Part name is required', 400);
        }

        // Part number is the primary inventory identifier — two parts sharing it
        // makes stock and sales reporting ambiguous.
        if (partNumber && String(partNumber).trim()) {
            const duplicate = await Part.findOne({ partCode: String(partNumber).trim() }).select('_id').lean();
            if (duplicate) {
                throw new AppError(`Part number "${String(partNumber).trim()}" already exists`, 409);
            }
        }

        let categoryData = {};
        if (categoryId) {
            const cat = await PartCategory.findById(categoryId).lean();
            if (cat) {
                categoryData = { name: cat.name, code: cat._id.toString() };
            }
        }

        let supplierData = {};
        if (supplierId) {
            const sup = await Supplier.findById(supplierId).lean();
            if (sup) {
                supplierData = { name: sup.name, code: sup.supplier_code, phone: sup.phone, email: sup.email };
            }
        }

        const partCode = (partNumber && String(partNumber).trim()) || `PART-${Date.now()}`;

        let warehouseData = {};
        if (warehouseId) {
            const wh = await Warehouse.findById(warehouseId).lean();
            if (wh) {
                warehouseData = { name: wh.warehouseName, code: wh.code };
            }
        }

        const part = new Part({
            partCode,
            sku: partNumber || partCode,
            name,
            description: description || '',
            category: categoryData,
            supplier: supplierData,
            warehouse: warehouseData,
            brand: brand || '',
            unit: unit || 'piece',
            // A non-super-admin cannot introduce a purchase price: the field is
            // dropped from their payload rather than rejected, so adding a part
            // still works — it just starts with no cost recorded.
            costPrice: canSeePurchasePrice(req) ? (purchasePrice || 0) : 0,
            sellingPrice: sellingPrice || 0,
            quantity: currentStock || 0,
            currentStock: currentStock || 0,
            minStock: minimumStock || 5,
            maxStock: maximumStock || 100,
            reorderLevel: reorderLevel || 10,
            binLocation: binLocation || '',
            isActive: true,
            sourceType: await resolveSourceType(sourceType),
            // Every new part is scannable from the moment it exists.
            barcode: await nextBarcode(Part, 'part'),
            createdBy: req.user?.id || null,
            updatedBy: req.user?.id || null
        });

        await part.save();

        logger.info(`Part created: ${partCode} by ${req.user?.email || 'system'}`);

        res.status(201).json({
            success: true,
            message: 'Part created successfully',
            data: { id: part._id, partNumber: part.partCode }
        });
    } catch (error) {
        logger.error('Error creating part:', error);
        next(error);
    }
};

const updatePart = async (req, res, next) => {
    try {
        const { id } = req.params;
        const {
            partNumber, name, categoryId, description, brand, sourceType,
            supplierId, unit, purchasePrice, sellingPrice,
            minimumStock, maximumStock, reorderLevel, warehouseId, binLocation
        } = req.body;

        const part = await Part.findById(id);
        if (!part) {
            throw new AppError('Part not found', 404);
        }

        if (partNumber !== undefined && String(partNumber).trim() !== part.partCode) {
            const duplicate = await Part.findOne({
                partCode: String(partNumber).trim(),
                _id: { $ne: part._id },
            }).select('_id').lean();
            if (duplicate) {
                throw new AppError(`Part number "${String(partNumber).trim()}" already exists`, 409);
            }
        }

        if (categoryId) {
            const cat = await PartCategory.findById(categoryId).lean();
            if (cat) {
                part.category = { name: cat.name, code: cat._id.toString() };
            }
        }

        if (supplierId) {
            const sup = await Supplier.findById(supplierId).lean();
            if (sup) {
                part.supplier = { name: sup.name, code: sup.supplier_code, phone: sup.phone, email: sup.email };
            }
        }

        if (warehouseId !== undefined) {
            if (warehouseId === '' || warehouseId === null) {
                part.warehouse = {};
            } else {
                const wh = await Warehouse.findById(warehouseId).lean();
                if (wh) {
                    part.warehouse = { name: wh.warehouseName, code: wh.code };
                }
            }
        }

        if (partNumber !== undefined) part.partCode = partNumber;
        if (name !== undefined) part.name = name;
        if (description !== undefined) part.description = description;
        if (brand !== undefined) part.brand = brand;
        if (sourceType !== undefined) part.sourceType = await resolveSourceType(sourceType);
        if (unit !== undefined) part.unit = unit;
        // Ignored for everyone but the super admin — an edit from another role
        // leaves the stored cost untouched instead of zeroing it.
        if (purchasePrice !== undefined && canSeePurchasePrice(req)) part.costPrice = purchasePrice;
        if (sellingPrice !== undefined) part.sellingPrice = sellingPrice;
        if (minimumStock !== undefined) part.minStock = minimumStock;
        if (maximumStock !== undefined) part.maxStock = maximumStock;
        if (reorderLevel !== undefined) part.reorderLevel = reorderLevel;
        if (binLocation !== undefined) part.binLocation = binLocation;

        part.updatedBy = req.user?.id || null;

        await part.save();

        logger.info(`Part updated: ID ${id} by ${req.user?.email || 'system'}`);

        res.json({ success: true, message: 'Part updated successfully' });
    } catch (error) {
        logger.error('Error updating part:', error);
        next(error);
    }
};

const deletePart = async (req, res, next) => {
    try {
        const { id } = req.params;

        const part = await Part.findById(id);
        if (!part) {
            throw new AppError('Part not found', 404);
        }

        await Part.deleteOne({ _id: part._id });

        logger.info(`Part deleted: ID ${id} by ${req.user?.email || 'system'}`);

        res.json({ success: true, message: 'Part deleted successfully' });
    } catch (error) {
        logger.error('Error deleting part:', error);
        next(error);
    }
};

const adjustStock = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { adjustmentType, quantity, reason } = req.body;

        if (!adjustmentType || quantity === undefined || quantity === null) {
            throw new AppError('Adjustment type and quantity are required', 400);
        }

        const part = await Part.findById(id);
        if (!part) {
            throw new AppError('Part not found', 404);
        }

        const qty = Number(quantity);
        let newStock;

        if (adjustmentType === 'increase') {
            newStock = part.currentStock + qty;
        } else if (adjustmentType === 'decrease') {
            newStock = part.currentStock - qty;
            if (newStock < 0) {
                throw new AppError('Stock cannot be negative', 400);
            }
        } else if (adjustmentType === 'set') {
            newStock = qty;
        } else {
            throw new AppError('Invalid adjustment type. Use: increase, decrease, or set', 400);
        }

        part.currentStock = newStock;
        part.quantity = newStock;
        part.updatedBy = req.user?.id || null;
        await part.save();

        const message = `Stock ${adjustmentType}d by ${qty}. New stock: ${newStock}${reason ? ` Reason: ${reason}` : ''}`;
        logger.info(`Stock adjusted for part ID ${id}: ${message}`);

        res.json({
            success: true,
            message,
            data: { newStock }
        });
    } catch (error) {
        logger.error('Error adjusting stock:', error);
        next(error);
    }
};

const getPartStats = async (req, res, next) => {
    try {
        const [sourceTypes, countsBySource] = await Promise.all([
            listSourceTypes(),
            Part.aggregate([
                { $match: { isActive: true } },
                { $group: { _id: { $ifNull: ['$sourceType', 'manufacturer'] }, count: { $sum: 1 } } },
            ]),
        ]);
        const countOf = new Map(countsBySource.map((entry) => [entry._id, entry.count]));

        const results = await Part.aggregate([
            { $match: { isActive: true } },
            {
                $group: {
                    _id: null,
                    total_parts: { $sum: 1 },
                    low_stock_count: {
                        $sum: {
                            $cond: [
                                {
                                    $and: [
                                        { $gt: ['$currentStock', 0] },
                                        { $lte: ['$currentStock', { $ifNull: ['$reorderLevel', { $ifNull: ['$minStock', 0] }] }] }
                                    ]
                                },
                                1,
                                0
                            ]
                        }
                    },
                    total_inventory_value: {
                        $sum: { $multiply: [{ $ifNull: ['$costPrice', 0] }, { $ifNull: ['$currentStock', 0] }] }
                    }
                }
            }
        ]);

        const stats = results[0] || {
            total_parts: 0,
            low_stock_count: 0,
            total_inventory_value: 0
        };
        delete stats._id;

        // Inventory value is stock × purchase price, so for a part held as a
        // single unit it *is* the purchase price. It goes out with the same
        // restriction as the field it is derived from.
        if (!canSeePurchasePrice(req)) delete stats.total_inventory_value;

        // One entry per configured source type so the UI can render a card/tab per
        // type without knowing which ones the dealer created.
        stats.by_source = sourceTypes.map((type) => ({
            value: type.value,
            name: type.name,
            count: countOf.get(type.value) || 0,
        }));
        // Kept for callers that still read the two original figures by name.
        stats.manufacturer_parts = countOf.get('manufacturer') || 0;
        stats.third_party_parts = countOf.get('third_party') || 0;

        res.json({
            success: true,
            data: stats
        });
    } catch (error) {
        logger.error('Error fetching part stats:', error);
        next(error);
    }
};

const getSourceTypes = async (req, res, next) => {
    try {
        const types = await listSourceTypes();
        res.json({ success: true, data: types.map(flattenSourceType) });
    } catch (error) {
        logger.error('Error fetching source types:', error);
        next(error);
    }
};

const createSourceType = async (req, res, next) => {
    try {
        const { name, value, description, sortOrder } = req.body;

        if (!name || !String(name).trim()) {
            throw new AppError('Source type name is required', 400);
        }

        const slug = normalizeSourceType(value || name);
        if (!slug) {
            throw new AppError('Source type name must contain at least one letter or number', 400);
        }

        await ensureSourceTypes();

        const existing = await PartSourceType.findOne({ value: slug });
        if (existing) {
            // Re-activating beats erroring out: the client deleted it, then re-added it.
            if (existing.isActive === false) {
                existing.isActive = true;
                existing.name = String(name).trim();
                existing.updatedBy = req.user?.id || null;
                await existing.save();
                return res.status(201).json({ success: true, message: 'Source type restored', data: flattenSourceType(existing.toObject()) });
            }
            throw new AppError(`Source type "${existing.name}" already exists`, 409);
        }

        const created = await PartSourceType.create({
            value: slug,
            name: String(name).trim(),
            description: description || '',
            sortOrder: sortOrder ?? 100,
            createdBy: req.user?.id || null,
            updatedBy: req.user?.id || null,
        });

        logger.info(`Part source type created: ${slug} by ${req.user?.email || 'system'}`);

        res.status(201).json({ success: true, message: 'Source type created successfully', data: flattenSourceType(created.toObject()) });
    } catch (error) {
        logger.error('Error creating source type:', error);
        next(error);
    }
};

const updateSourceType = async (req, res, next) => {
    try {
        const { name, description, sortOrder, isActive } = req.body;
        const type = await PartSourceType.findById(req.params.id);
        if (!type) {
            throw new AppError('Source type not found', 404);
        }

        if (type.isSystem && isActive === false) {
            throw new AppError('Built-in source types cannot be deactivated', 400);
        }

        if (name !== undefined) type.name = String(name).trim() || type.name;
        if (description !== undefined) type.description = description;
        if (sortOrder !== undefined) type.sortOrder = sortOrder;
        if (isActive !== undefined) type.isActive = isActive;
        type.updatedBy = req.user?.id || null;
        await type.save();

        res.json({ success: true, message: 'Source type updated successfully', data: flattenSourceType(type.toObject()) });
    } catch (error) {
        logger.error('Error updating source type:', error);
        next(error);
    }
};

const deleteSourceType = async (req, res, next) => {
    try {
        const type = await PartSourceType.findById(req.params.id);
        if (!type) {
            throw new AppError('Source type not found', 404);
        }
        if (type.isSystem) {
            throw new AppError('Built-in source types cannot be deleted', 400);
        }

        // Deleting a type that parts still point at would hide those parts from
        // every tab, so the parts have to be moved first.
        const inUse = await Part.countDocuments({ sourceType: type.value });
        if (inUse > 0) {
            throw new AppError(`${inUse} part(s) still use "${type.name}". Move them to another source type first.`, 409);
        }

        await PartSourceType.deleteOne({ _id: type._id });

        logger.info(`Part source type deleted: ${type.value} by ${req.user?.email || 'system'}`);

        res.json({ success: true, message: 'Source type deleted successfully' });
    } catch (error) {
        logger.error('Error deleting source type:', error);
        next(error);
    }
};

const getCategories = async (req, res, next) => {
    try {
        const categories = await PartCategory.find({ is_active: true }).sort('name').lean();
        const mapped = categories.map((c) => ({ id: c._id, name: c.name }));
        res.json({ success: true, data: mapped });
    } catch (error) {
        logger.error('Error fetching categories:', error);
        next(error);
    }
};

const getSuppliers = async (req, res, next) => {
    try {
        const suppliers = await Supplier.find({ is_active: true }).sort('name').lean();
        const mapped = suppliers.map((s) => ({ id: s._id, name: s.name }));
        res.json({ success: true, data: mapped });
    } catch (error) {
        logger.error('Error fetching suppliers:', error);
        next(error);
    }
};

const getLowStockParts = async (req, res, next) => {
    try {
        const parts = await Part.find({
            isActive: true,
            currentStock: { $gt: 0 }
        }).lean();

        const thresholdFiltered = parts.filter(
            (p) => p.currentStock <= (p.reorderLevel || p.minStock || 0)
        ).slice(0, 20);

        const showPurchasePrice = canSeePurchasePrice(req);
        const mapped = thresholdFiltered.map((p) => flattenPart(p, showPurchasePrice));

        res.json({ success: true, data: mapped });
    } catch (error) {
        logger.error('Error fetching low stock parts:', error);
        next(error);
    }
};

module.exports = {
    getAllParts,
    getPartById,
    createPart,
    updatePart,
    deletePart,
    adjustStock,
    getPartStats,
    getLowStockParts,
    getCategories,
    getSuppliers,
    getSourceTypes,
    createSourceType,
    updateSourceType,
    deleteSourceType,
    // Shared with the bulk importer so an imported part lands under the same
    // source-type tab a manually created one would.
    resolveSourceType,
    canSeePurchasePrice
};
