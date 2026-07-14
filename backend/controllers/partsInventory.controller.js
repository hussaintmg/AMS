const Part = require('../models/Part.model');
const Warehouse = require('../models/Warehouse.model');
const { PartCategory, Supplier } = require('../models/VehicleMaster.model');
const { AppError } = require('../middleware/errorHandler');
const logger = require('../utils/logger');

const flattenPart = (p) => ({
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
    purchase_price: p.costPrice,
    selling_price: p.sellingPrice,
    current_stock: p.currentStock,
    minimum_stock: p.minStock,
    maximum_stock: p.maxStock,
    reorder_level: p.reorderLevel,
    bin_location: p.binLocation || '',
    warehouse_id: p.warehouseId || null,
    warehouse_name: p.warehouse?.name || '',
    source_type: p.sourceType || 'manufacturer',
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
        const limitNum = parseInt(limit);
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
                purchase_price: p.costPrice,
                selling_price: p.sellingPrice,
                current_stock: p.currentStock,
                minimum_stock: p.minStock,
                reorder_level: p.reorderLevel,
                warehouse_id: null,
                warehouse_name: p.warehouse?.name || '',
                source_type: p.sourceType || 'manufacturer',
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
            data: flattenPart(part)
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

        const partCode = partNumber || `PART-${Date.now()}`;

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
            costPrice: purchasePrice || 0,
            sellingPrice: sellingPrice || 0,
            quantity: currentStock || 0,
            currentStock: currentStock || 0,
            minStock: minimumStock || 5,
            maxStock: maximumStock || 100,
            reorderLevel: reorderLevel || 10,
            binLocation: binLocation || '',
            isActive: true,
            sourceType: sourceType || 'manufacturer',
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
        if (sourceType !== undefined) part.sourceType = sourceType;
        if (unit !== undefined) part.unit = unit;
        if (purchasePrice !== undefined) part.costPrice = purchasePrice;
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

        part.isActive = false;
        part.updatedBy = req.user?.id || null;
        await part.save();

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
        const results = await Part.aggregate([
            { $match: { isActive: true } },
            {
                $group: {
                    _id: null,
                    total_parts: { $sum: 1 },
                    manufacturer_parts: {
                        $sum: { $cond: [{ $eq: ['$sourceType', 'manufacturer'] }, 1, 0] }
                    },
                    third_party_parts: {
                        $sum: { $cond: [{ $eq: ['$sourceType', 'third_party'] }, 1, 0] }
                    },
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
            manufacturer_parts: 0,
            third_party_parts: 0,
            low_stock_count: 0,
            total_inventory_value: 0
        };
        delete stats._id;

        res.json({
            success: true,
            data: stats
        });
    } catch (error) {
        logger.error('Error fetching part stats:', error);
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

        const mapped = thresholdFiltered.map(flattenPart);

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
    getSuppliers
};
