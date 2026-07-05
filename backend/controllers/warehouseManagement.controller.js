/**
 * Warehouse Management Controller
 * Full CRUD operations for warehouse management
 * Created by LOGIXINVENTOR (PVT) Ltd.
 * info@logixinventor.com +92 333 3836851
 * www.logixinventor.com | AMS
 * Date: 2026-01-07
 */

const { query, pool } = require('../config/database');
const { AppError } = require('../middleware/errorHandler');
const logger = require('../utils/logger');

/**
 * Get all warehouses with pagination, filtering, and search
 * @route GET /api/warehouses
 */
/**
 * Get all warehouses with pagination, filtering, and search
 * @route GET /api/warehouses
 */
const getAllWarehouses = async (req, res, next) => {
    try {
        const { page = 1, limit = 15, search = '', city = '', isActive } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);

        // Build WHERE clause
        let whereConditions = ['1=1'];
        const params = [];

        if (search) {
            whereConditions.push('(name LIKE ? OR code LIKE ? OR city LIKE ?)');
            params.push(`%${search}%`, `%${search}%`, `%${search}%`);
        }

        if (city) {
            whereConditions.push('city = ?');
            params.push(city);
        }

        if (isActive !== undefined && isActive !== '') {
            whereConditions.push('is_active = ?');
            params.push(isActive === 'true' || isActive === '1' ? 1 : 0);
        }

        const whereClause = whereConditions.join(' AND ');

        // Get total count
        const countQuery = `SELECT COUNT(*) as total FROM vw_warehouses_full WHERE ${whereClause}`;
        const countResult = await query(countQuery, params);
        const total = countResult[0]?.total || 0;

        // Get warehouses with details from VIEW
        const warehouseQuery = `
            SELECT 
                id, name, code, type, address, city, state, country,
                capacity, manager_id, manager_name, manager_email, manager_phone,
                is_active, created_at, vehicle_count, parts_count, vehicle_value, parts_value
            FROM vw_warehouses_full
            WHERE ${whereClause}
            ORDER BY created_at DESC
            LIMIT ? OFFSET ?
        `;

        const warehouses = await query(warehouseQuery, [...params, parseInt(limit), offset]);

        // Calculate total value for each warehouse
        const warehousesWithTotal = warehouses.map(w => ({
            ...w,
            total_value: parseFloat(w.vehicle_value || 0) + parseFloat(w.parts_value || 0),
            total_items: parseInt(w.vehicle_count || 0) + parseInt(w.parts_count || 0)
        }));

        res.json({
            success: true,
            data: {
                warehouses: warehousesWithTotal,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total,
                    totalPages: Math.ceil(total / parseInt(limit))
                }
            }
        });
    } catch (error) {
        logger.error('Error fetching warehouses:', error);
        next(new AppError('Failed to fetch warehouses', 500, 'DATABASE_ERROR'));
    }
};

/**
 * Get single warehouse by ID
 * @route GET /api/warehouses/:id
 */
const getWarehouseById = async (req, res, next) => {
    try {
        const { id } = req.params;

        // Use VIEW
        const warehouseQuery = `
            SELECT 
                *,
                (SELECT COUNT(*) FROM vehicles WHERE warehouse_id = vw_warehouses_full.id) AS vehicle_count,
                (SELECT COUNT(*) FROM parts WHERE warehouse_id = vw_warehouses_full.id) AS parts_count,
                (SELECT COALESCE(SUM(selling_price), 0) FROM vehicles WHERE warehouse_id = vw_warehouses_full.id) AS vehicle_value,
                (SELECT COALESCE(SUM(current_stock * selling_price), 0) FROM parts WHERE warehouse_id = vw_warehouses_full.id) AS parts_value
            FROM vw_warehouses_full
            WHERE id = ?
        `;

        const result = await query(warehouseQuery, [id]);

        if (result.length === 0) {
            return next(new AppError('Warehouse not found', 404, 'NOT_FOUND'));
        }

        const warehouse = {
            ...result[0],
            total_value: parseFloat(result[0].vehicle_value || 0) + parseFloat(result[0].parts_value || 0),
            total_items: parseInt(result[0].vehicle_count || 0) + parseInt(result[0].parts_count || 0)
        };

        res.json({
            success: true,
            data: warehouse
        });
    } catch (error) {
        logger.error('Error fetching warehouse:', error);
        next(new AppError('Failed to fetch warehouse', 500, 'DATABASE_ERROR'));
    }
};

/**
 * Create new warehouse
 * @route POST /api/warehouses
 */
const createWarehouse = async (req, res, next) => {
    try {
        const { name, code, address, city, phone, email, managerId, capacity } = req.body;
        const userId = req.user?.id;

        // Validate required fields
        if (!name || !code) {
            return next(new AppError('Name and code are required', 400, 'VALIDATION_ERROR'));
        }

        // Safer sanitization
        const toDB = (val) => {
            if (val === undefined || val === '' || val === null) return null;
            return val;
        };

        // Call SP - sp_create_warehouse handles validation & auditing
        await query(
            'CALL sp_create_warehouse(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, @warehouse_id)',
            [
                toDB(name), 
                toDB(code), 
                'General', 
                toDB(address), 
                toDB(city), 
                null, // state
                null, // country
                parseInt(capacity) || 0, 
                toDB(managerId), 
                userId
            ]
        );

        const result = await query('SELECT @warehouse_id as warehouseId');
        const warehouseId = result[0]?.warehouseId;

        logger.info(`Warehouse created: ${code} by user ${userId}`);

        res.status(201).json({
            success: true,
            message: 'Warehouse created successfully',
            data: { id: warehouseId, name, code }
        });
    } catch (error) {
        logger.error('Error creating warehouse:', error);
        
        if (error.sqlState === '45000') {
            return next(new AppError(error.message, 400, 'VALIDATION_ERROR'));
        }
        
        next(new AppError('Failed to create warehouse: ' + error.message, 500, 'DATABASE_ERROR'));
    }
};

/**
 * Update warehouse
 * @route PUT /api/warehouses/:id
 */
const updateWarehouse = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { name, code, address, city, phone, email, managerId, capacity, isActive } = req.body;
        const userId = req.user?.id;

        // Safer sanitization for database fields
        const toDB = (val) => {
            if (val === undefined || val === '' || val === null) return null;
            return val;
        };

        // Call SP - handles existing check, code uniqueness, and auditing
        await query(
            'CALL sp_update_warehouse(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [
                id, 
                toDB(name), 
                toDB(code), 
                'General', 
                toDB(address), 
                toDB(city),
                null, // state
                null, // country
                toDB(capacity) || 0, 
                toDB(managerId), 
                isActive !== undefined ? (isActive ? 1 : 0) : null, 
                userId
            ]
        );

        logger.info(`Warehouse updated: ${id} by user ${userId}`);

        res.json({
            success: true,
            message: 'Warehouse updated successfully'
        });
    } catch (error) {
        logger.error('Error updating warehouse:', error);
        
        // Pass through database error messages if they are from our SP (SQLSTATE 45000)
        if (error.sqlState === '45000') {
            return next(new AppError(error.message, 400, 'VALIDATION_ERROR'));
        }
        
        next(new AppError('Failed to update warehouse: ' + error.message, 500, 'DATABASE_ERROR'));
    }
};

/**
 * Delete warehouse (soft delete)
 * @route DELETE /api/warehouses/:id
 */
const deleteWarehouse = async (req, res, next) => {
    try {
        const { id } = req.params;
        const userId = req.user?.id;

        // Call SP - handles existing check, inventory check, and auditing
        await query('CALL sp_delete_warehouse(?, ?)', [id, userId]);

        logger.info(`Warehouse deleted: ${id} by user ${userId}`);

        res.json({
            success: true,
            message: 'Warehouse deleted successfully'
        });
    } catch (error) {
        logger.error('Error deleting warehouse:', error);
        next(new AppError('Failed to delete warehouse', 500, 'DATABASE_ERROR'));
    }
};

/**
 * Get warehouse statistics
 * @route GET /api/warehouses/stats
 */
const getWarehouseStats = async (req, res, next) => {
    try {
        const statsQuery = `
            SELECT 
                (SELECT COUNT(*) FROM warehouses WHERE is_active = TRUE) AS total_warehouses,
                (SELECT COUNT(*) FROM warehouses WHERE is_active = FALSE) AS inactive_warehouses,
                (SELECT COUNT(*) FROM vehicles WHERE warehouse_id IS NOT NULL) AS total_vehicles,
                (SELECT COUNT(*) FROM parts WHERE warehouse_id IS NOT NULL) AS total_parts,
                (SELECT COALESCE(SUM(selling_price), 0) FROM vehicles WHERE warehouse_id IS NOT NULL) AS vehicle_value,
                (SELECT COALESCE(SUM(current_stock * selling_price), 0) FROM parts WHERE warehouse_id IS NOT NULL) AS parts_value,
                (SELECT COUNT(DISTINCT city) FROM warehouses WHERE is_active = TRUE) AS cities_covered
        `;

        const result = await query(statsQuery);
        const stats = result[0] || {};

        res.json({
            success: true,
            data: {
                ...stats,
                total_value: parseFloat(stats.vehicle_value || 0) + parseFloat(stats.parts_value || 0),
                total_items: parseInt(stats.total_vehicles || 0) + parseInt(stats.total_parts || 0)
            }
        });
    } catch (error) {
        logger.error('Error fetching warehouse stats:', error);
        next(new AppError('Failed to fetch warehouse statistics', 500, 'DATABASE_ERROR'));
    }
};

/**
 * Get warehouse inventory (vehicles and parts)
 * @route GET /api/warehouses/:id/inventory
 */
const getWarehouseInventory = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { type = 'all' } = req.query;

        // Check if warehouse exists
        const existing = await query('SELECT id, name FROM warehouses WHERE id = ?', [id]);
        if (existing.length === 0) {
            return next(new AppError('Warehouse not found', 404, 'NOT_FOUND'));
        }

        let vehicles = [];
        let parts = [];

        if (type === 'all' || type === 'vehicles') {
            const vehicleQuery = `
                SELECT 
                    v.id, v.vin, v.engine_number, v.year, v.status, v.condition_type,
                    v.purchase_price, v.selling_price, v.arrival_date,
                    vv.name AS variant_name,
                    vm.name AS model_name,
                    vmk.name AS make_name,
                    vc.name AS color_name
                FROM vehicles v
                LEFT JOIN vehicle_variants vv ON v.variant_id = vv.id
                LEFT JOIN vehicle_models vm ON vv.model_id = vm.id
                LEFT JOIN vehicle_makes vmk ON vm.make_id = vmk.id
                LEFT JOIN vehicle_colors vc ON v.color_id = vc.id
                WHERE v.warehouse_id = ?
                ORDER BY v.created_at DESC
            `;
            vehicles = await query(vehicleQuery, [id]);
        }

        if (type === 'all' || type === 'parts') {
            const partsQuery = `
                SELECT 
                    p.id, p.part_code, p.name, p.brand,
                    p.current_stock, p.unit, p.cost_price, p.selling_price,
                    pc.name AS category_name
                FROM parts p
                LEFT JOIN part_categories pc ON p.category_id = pc.id
                WHERE p.warehouse_id = ? AND p.is_active = TRUE
                ORDER BY p.name ASC
            `;
            parts = await query(partsQuery, [id]);
        }

        res.json({
            success: true,
            data: {
                warehouse: existing[0],
                vehicles,
                parts,
                summary: {
                    vehicleCount: vehicles.length,
                    partsCount: parts.length,
                    vehicleValue: vehicles.reduce((sum, v) => sum + parseFloat(v.selling_price || 0), 0),
                    partsValue: parts.reduce((sum, p) => sum + (parseFloat(p.current_stock || 0) * parseFloat(p.selling_price || 0)), 0)
                }
            }
        });
    } catch (error) {
        logger.error('Error fetching warehouse inventory:', error);
        next(new AppError('Failed to fetch warehouse inventory', 500, 'DATABASE_ERROR'));
    }
};

/**
 * Get list of cities for filter dropdown
 * @route GET /api/warehouses/cities/list
 */
const getCities = async (req, res, next) => {
    try {
        const result = await query(
            'SELECT DISTINCT city FROM warehouses WHERE city IS NOT NULL AND city != "" ORDER BY city'
        );

        res.json({
            success: true,
            data: result.map(r => r.city)
        });
    } catch (error) {
        logger.error('Error fetching cities:', error);
        next(new AppError('Failed to fetch cities', 500, 'DATABASE_ERROR'));
    }
};

/**
 * Get managers list for dropdown
 * @route GET /api/warehouses/managers/list
 */
const getManagers = async (req, res, next) => {
    try {
        const result = await query(`
            SELECT u.id, CONCAT(u.first_name, ' ', u.last_name) AS name, u.email
            FROM users u
            WHERE u.is_active = TRUE
            ORDER BY u.first_name, u.last_name
        `);

        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        logger.error('Error fetching managers:', error);
        next(new AppError('Failed to fetch managers', 500, 'DATABASE_ERROR'));
    }
};

module.exports = {
    getAllWarehouses,
    getWarehouseById,
    createWarehouse,
    updateWarehouse,
    deleteWarehouse,
    getWarehouseStats,
    getWarehouseInventory,
    getCities,
    getManagers
};
