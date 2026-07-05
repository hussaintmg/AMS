/**
 * Parts Inventory Controller
 * Full CRUD operations for vehicle parts inventory management
 * Refactored to use Stored Procedures
 * Created by LOGIXINVENTOR (PVT) Ltd.
 * info@logixinventor.com +92 333 3836851
 * www.logixinventor.com | AMS
 * Date: 2026-01-07
 */

const { query } = require('../config/database');
const { AppError } = require('../middleware/errorHandler');
const logger = require('../utils/logger');

/**
 * Get all parts with pagination, filtering, and search
 * Uses SP_GetPartsBySourceType with fallback to direct query
 */
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

        let parts = [];
        const offset = (parseInt(page) - 1) * parseInt(limit);

        // Try stored procedure first, fallback to direct query if SP doesn't exist
        try {
            const results = await query(
                'CALL SP_GetPartsBySourceType(?, ?, ?, ?, ?, ?, ?, ?)',
                [
                    sourceType || null,
                    parseInt(page),
                    parseInt(limit),
                    search || null,
                    categoryId ? parseInt(categoryId) : null,
                    supplierId ? parseInt(supplierId) : null,
                    warehouseId ? parseInt(warehouseId) : null,
                    stockStatus || null
                ]
            );
            parts = results[0];
        } catch (spError) {
            // Fallback to direct query if stored procedure doesn't exist
            logger.warn('SP_GetPartsBySourceType not available, using fallback query:', spError.message);

            let whereConditions = ['p.is_active = TRUE'];
            let queryParams = [];

            if (search) {
                whereConditions.push('(p.part_code LIKE ? OR p.name LIKE ? OR p.brand LIKE ?)');
                const s = `%${search}%`;
                queryParams.push(s, s, s);
            }
            if (categoryId) { whereConditions.push('p.category_id = ?'); queryParams.push(parseInt(categoryId)); }
            if (supplierId) { whereConditions.push('p.supplier_id = ?'); queryParams.push(parseInt(supplierId)); }
            if (warehouseId) { whereConditions.push('p.warehouse_id = ?'); queryParams.push(parseInt(warehouseId)); }
            if (stockStatus) {
                if (stockStatus === 'low') whereConditions.push('p.current_stock <= COALESCE(p.reorder_level, p.min_stock, 0) AND p.current_stock > 0');
                if (stockStatus === 'out') whereConditions.push('p.current_stock = 0');
                if (stockStatus === 'normal') whereConditions.push('p.current_stock > COALESCE(p.reorder_level, p.min_stock, 0)');
            }

            const fallbackQuery = `
                SELECT 
                    p.id,
                    p.part_code,
                    p.name,
                    p.category_id,
                    pc.name AS category_name,
                    p.description,
                    p.brand,
                    p.supplier_id,
                    s.name AS supplier_name,
                    p.unit,
                    p.cost_price,
                    p.selling_price,
                    p.current_stock,
                    COALESCE(p.reorder_level, p.min_stock, 0) AS minimum_stock,
                    p.reorder_level,
                    p.warehouse_id,
                    w.name AS warehouse_name,
                    p.is_active,
                    p.created_at,
                    p.updated_at,
                    CASE 
                        WHEN p.current_stock = 0 THEN 'out_of_stock'
                        WHEN p.current_stock <= COALESCE(p.reorder_level, p.min_stock, 0) THEN 'low_stock'
                        ELSE 'normal'
                    END AS stock_status
                FROM parts p
                LEFT JOIN part_categories pc ON p.category_id = pc.id
                LEFT JOIN suppliers s ON p.supplier_id = s.id
                LEFT JOIN warehouses w ON p.warehouse_id = w.id
                WHERE ${whereConditions.join(' AND ')}
                ORDER BY p.created_at DESC
                LIMIT ? OFFSET ?
            `;
            queryParams.push(parseInt(limit), offset);
            parts = await query(fallbackQuery, queryParams);
        }

        // Get total count for pagination
        let whereConditions = ['1=1'];
        let params = [];

        if (search) {
            whereConditions.push('(part_code LIKE ? OR name LIKE ? OR brand LIKE ?)');
            const s = `%${search}%`;
            params.push(s, s, s);
        }
        if (categoryId) { whereConditions.push('category_id = ?'); params.push(categoryId); }
        if (supplierId) { whereConditions.push('supplier_id = ?'); params.push(supplierId); }
        if (warehouseId) { whereConditions.push('warehouse_id = ?'); params.push(warehouseId); }
        if (stockStatus) {
            if (stockStatus === 'low') whereConditions.push('current_stock <= COALESCE(reorder_level, min_stock, 0) AND current_stock > 0');
            if (stockStatus === 'out') whereConditions.push('current_stock = 0');
            if (stockStatus === 'normal') whereConditions.push('current_stock > COALESCE(reorder_level, min_stock, 0)');
        }

        const countQuery = `SELECT COUNT(*) as total FROM parts WHERE ${whereConditions.join(' AND ')}`;
        const countResult = await query(countQuery, params);
        const total = countResult[0].total;

        res.json({
            success: true,
            data: {
                parts: parts,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total,
                    totalPages: Math.ceil(total / parseInt(limit))
                }
            }
        });
    } catch (error) {
        logger.error('Error fetching parts:', error);
        next(error);
    }
};

/**
 * Get single part by ID
 */
const getPartById = async (req, res, next) => {
    try {
        const { id } = req.params;
        const parts = await query('SELECT * FROM vw_partsinventoryfull WHERE id = ?', [id]);

        if (parts.length === 0) {
            throw new AppError('Part not found', 404);
        }

        // Additional data (audit, movements) can be fetched here as before if needed
        // Assuming the view VW_PartsInventoryFull covers most details

        res.json({
            success: true,
            data: parts[0]
        });
    } catch (error) {
        logger.error('Error fetching part:', error);
        next(error);
    }
};

/**
 * Create new part
 * Uses SP_CreatePart
 */
const createPart = async (req, res, next) => {
    try {
        const {
            partNumber, name, categoryId, description, brand, sourceType,
            supplierId, unit, purchasePrice, sellingPrice, currentStock,
            minimumStock, maximumStock, reorderLevel, warehouseId, binLocation
        } = req.body;

        const sanitizeId = (id) => (id === '' || id === undefined || id === null) ? null : id;

        await query(
            'CALL SP_CreatePart(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, @partId, @success, @message)',
            [
                partNumber, name, sanitizeId(categoryId), description, brand,
                sourceType || 'manufacturer', sanitizeId(supplierId),
                unit || 'piece', purchasePrice, sellingPrice,
                currentStock || 0, minimumStock || 5, maximumStock || 100,
                reorderLevel || 10, sanitizeId(warehouseId), binLocation,
                req.user.id
            ]
        );

        const result = await query('SELECT @partId as partId, @success as success, @message as message');
        const { partId, success, message } = result[0];

        if (!success) {
            throw new AppError(message, 400);
        }

        logger.info(`Part created: ${partNumber} by ${req.user.email}`);

        res.status(201).json({
            success: true,
            message: message,
            data: { id: partId, partNumber }
        });
    } catch (error) {
        logger.error('Error creating part:', error);
        next(error);
    }
};

/**
 * Update part
 * Uses SP_UpdatePart
 */
const updatePart = async (req, res, next) => {
    try {
        const { id } = req.params;
        const {
            partNumber, name, categoryId, description, brand, sourceType,
            supplierId, unit, purchasePrice, sellingPrice,
            minimumStock, maximumStock, reorderLevel, warehouseId, binLocation
        } = req.body;

        const sanitizeId = (id) => (id === '' || id === undefined || id === null) ? null : id;

        // Current stock is not updated here, use AdjustStock for that

        await query(
            'CALL SP_UpdatePart(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, @success, @message)',
            [
                id, partNumber, name, sanitizeId(categoryId), description, brand,
                sourceType, sanitizeId(supplierId), unit, purchasePrice, sellingPrice,
                minimumStock, maximumStock, reorderLevel, sanitizeId(warehouseId),
                binLocation, req.user.id
            ]
        );

        const result = await query('SELECT @success as success, @message as message');
        const { success, message } = result[0];

        if (!success) {
            throw new AppError(message, 400);
        }

        logger.info(`Part updated: ID ${id} by ${req.user.email}`);
        res.json({ success: true, message });
    } catch (error) {
        logger.error('Error updating part:', error);
        next(error);
    }
};

/**
 * Delete part (soft delete)
 * Uses SP_DeletePart
 */
const deletePart = async (req, res, next) => {
    try {
        const { id } = req.params;

        await query('CALL SP_DeletePart(?, ?, @success, @message)', [id, req.user.id]);

        const result = await query('SELECT @success as success, @message as message');
        const { success, message } = result[0];

        if (!success) {
            throw new AppError(message, 400);
        }

        logger.info(`Part deleted: ID ${id} by ${req.user.email}`);
        res.json({ success: true, message });
    } catch (error) {
        logger.error('Error deleting part:', error);
        next(error);
    }
};

/**
 * Adjust part stock
 * Uses SP_AdjustPartStock
 */
const adjustStock = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { adjustmentType, quantity, reason } = req.body;

        if (!adjustmentType || !quantity) {
            throw new AppError('Adjustment type and quantity are required', 400);
        }

        await query(
            'CALL SP_AdjustPartStock(?, ?, ?, ?, ?, @success, @message, @newStock)',
            [id, adjustmentType, quantity, reason, req.user.id]
        );

        const result = await query('SELECT @success as success, @message as message, @newStock as newStock');
        const { success, message, newStock } = result[0];

        if (!success) {
            throw new AppError(message, 400);
        }

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

/**
 * Get parts statistics
 * Uses SP_GetPartsInventoryStats
 */
const getPartStats = async (req, res, next) => {
    try {
        const result = await query('CALL SP_GetPartsInventoryStats()');
        res.json({
            success: true,
            data: result[0][0] || {}
        });
    } catch (error) {
        logger.error('Error fetching part stats:', error);
        next(error);
    }
};

// ... Helper functions for categories and suppliers can remain as is or be refactored
// Keeping them simple for now

const getCategories = async (req, res, next) => {
    try {
        const categories = await query('SELECT id, name FROM part_categories WHERE is_active = TRUE ORDER BY name');
        res.json({ success: true, data: categories });
    } catch (error) { next(error); }
};

const getSuppliers = async (req, res, next) => {
    try {
        const suppliers = await query('SELECT id, name FROM suppliers WHERE is_active = TRUE ORDER BY name');
        res.json({ success: true, data: suppliers });
    } catch (error) { next(error); }
};

const getLowStockParts = async (req, res, next) => {
    try {
        const parts = await query('SELECT * FROM VW_LowStockAlerts LIMIT 20');
        res.json({ success: true, data: parts });
    } catch (error) { next(error); }
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
