/**
 * Vehicle Inventory Controller
 * Full CRUD operations for vehicle inventory management
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
 * Get all vehicles with pagination, filtering, and search
 */
const getAllVehicles = async (req, res, next) => {
    try {
        const {
            page = 1,
            limit = 20,
            search = '',
            status = '',
            makeId = '',
            modelId = '',
            year = '',
            warehouseId = '',
            conditionType = '',
            sortBy = 'created_at',
            sortOrder = 'DESC'
        } = req.query;

        const offset = (parseInt(page) - 1) * parseInt(limit);

        // Build dynamic WHERE clause
        let whereConditions = ['v.is_active = TRUE'];
        let queryParams = [];

        if (search) {
            whereConditions.push(`(v.vin LIKE ? OR v.engine_number LIKE ? OR vmk.name LIKE ? OR vm.name LIKE ?)`);
            const searchTerm = `%${search}%`;
            queryParams.push(searchTerm, searchTerm, searchTerm, searchTerm);
        }

        if (status) { whereConditions.push('v.status = ?'); queryParams.push(status); }
        if (makeId) { whereConditions.push('vmk.id = ?'); queryParams.push(parseInt(makeId)); }
        if (modelId) { whereConditions.push('vm.id = ?'); queryParams.push(parseInt(modelId)); }
        if (year) { whereConditions.push('v.year = ?'); queryParams.push(parseInt(year)); }
        if (warehouseId) { whereConditions.push('v.warehouse_id = ?'); queryParams.push(parseInt(warehouseId)); }
        if (conditionType) { whereConditions.push('v.condition_type = ?'); queryParams.push(conditionType); }

        const whereClause = whereConditions.join(' AND ');

        // Validate sort
        const validSortColumns = ['created_at', 'vin', 'year', 'selling_price', 'purchase_price', 'status', 'arrival_date'];
        const sanitizedSortBy = validSortColumns.includes(sortBy) ? sortBy : 'created_at';
        const sanitizedSortOrder = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

        // Count query
        const countQuery = `
            SELECT COUNT(*) as total
            FROM vehicles v
            JOIN vehicle_variants vv ON v.variant_id = vv.id
            JOIN vehicle_models vm ON vv.model_id = vm.id
            JOIN vehicle_makes vmk ON vm.make_id = vmk.id
            WHERE ${whereClause}
        `;
        const countResult = await query(countQuery, queryParams);
        const total = countResult[0].total;

        // Data query
        const vehiclesQuery = `
            SELECT 
                v.id,
                v.vin,
                v.engine_number,
                v.year,
                v.status,
                v.condition_type,
                v.mileage,
                v.purchase_price,
                v.selling_price,
                (v.selling_price - v.purchase_price) AS profit_margin,
                v.location,
                v.arrival_date,
                v.notes,
                v.created_at,
                vv.id AS variant_id,
                vv.name AS variant_name,
                vv.base_price AS variant_base_price,
                vm.id AS model_id,
                vm.name AS model_name,
                vm.body_type,
                vm.fuel_type,
                vm.transmission,
                vmk.id AS make_id,
                vmk.name AS make_name,
                vc.id AS color_id,
                vc.name AS color_name,
                vc.hex_code AS color_hex,
                w.id AS warehouse_id,
                w.name AS warehouse_name,
                CONCAT(u.first_name, ' ', u.last_name) AS created_by_name
            FROM vehicles v
            JOIN vehicle_variants vv ON v.variant_id = vv.id
            JOIN vehicle_models vm ON vv.model_id = vm.id
            JOIN vehicle_makes vmk ON vm.make_id = vmk.id
            JOIN vehicle_colors vc ON v.color_id = vc.id
            LEFT JOIN warehouses w ON v.warehouse_id = w.id
            LEFT JOIN users u ON v.created_by = u.id
            WHERE ${whereClause}
            ORDER BY v.${sanitizedSortBy} ${sanitizedSortOrder}
            LIMIT ? OFFSET ?
        `;

        const vehicles = await query(vehiclesQuery, [...queryParams, parseInt(limit), offset]);

        res.json({
            success: true,
            data: {
                vehicles,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total,
                    totalPages: Math.ceil(total / parseInt(limit))
                }
            }
        });
    } catch (error) {
        logger.error('Error fetching vehicles:', error);
        next(error);
    }
};

/**
 * Get single vehicle by ID
 */
const getVehicleById = async (req, res, next) => {
    try {
        const { id } = req.params;

        // Using the same query structure as before, which is efficient for single record with joins
        const vehicleQuery = `
            SELECT 
                v.*,
                vv.name AS variant_name,
                vv.base_price AS variant_base_price,
                vv.features AS variant_features,
                vm.name AS model_name,
                vm.body_type,
                vm.fuel_type,
                vm.transmission,
                vm.engine_capacity,
                vm.seating_capacity,
                vmk.name AS make_name,
                vmk.country AS make_country,
                vc.name AS color_name,
                vc.hex_code AS color_hex,
                vc.is_metallic,
                vc.additional_cost AS color_additional_cost,
                w.name AS warehouse_name,
                w.code AS warehouse_code,
                w.address AS warehouse_address,
                CONCAT(u.first_name, ' ', u.last_name) AS created_by_name
            FROM vehicles v
            JOIN vehicle_variants vv ON v.variant_id = vv.id
            JOIN vehicle_models vm ON vv.model_id = vm.id
            JOIN vehicle_makes vmk ON vm.make_id = vmk.id
            JOIN vehicle_colors vc ON v.color_id = vc.id
            LEFT JOIN warehouses w ON v.warehouse_id = w.id
            LEFT JOIN users u ON v.created_by = u.id
            WHERE v.id = ? AND v.is_active = TRUE
        `;

        const vehicles = await query(vehicleQuery, [id]);

        if (vehicles.length === 0) {
            throw new AppError('Vehicle not found', 404);
        }

        // Additional data
        const salesOrders = await query(`
            SELECT id, order_number, status, total_amount AS grand_total, order_date
            FROM sales_orders
            WHERE vehicle_id = ?
            ORDER BY created_at DESC
            LIMIT 5
        `, [id]);

        const auditHistory = await query(`
            SELECT action, old_data, new_data, changed_at,
                CONCAT(u.first_name, ' ', u.last_name) AS changed_by_name
            FROM vehicle_audit_log val
            LEFT JOIN users u ON val.changed_by = u.id
            WHERE val.vehicle_id = ?
            ORDER BY val.changed_at DESC
            LIMIT 10
        `, [id]);

        res.json({
            success: true,
            data: {
                ...vehicles[0],
                salesOrders,
                auditHistory
            }
        });
    } catch (error) {
        logger.error('Error fetching vehicle:', error);
        next(error);
    }
};

/**
 * Create new vehicle
 * Uses sp_create_vehicle
 */
/**
 * Create new vehicle
 * Uses sp_create_vehicle
 */
const createVehicle = async (req, res, next) => {
    try {
        const {
            vin, engineNumber, variantId, colorId, year,
            status, conditionType, mileage, purchasePrice, sellingPrice,
            location, warehouseId, arrivalDate, notes
        } = req.body;

        // Validation
        if (!vin) throw new Error('VIN is required');
        if (!engineNumber) throw new Error('Engine Number is required');
        if (!variantId) throw new Error('Variant is required');
        if (!colorId) throw new Error('Color is required');
        if (!year) throw new Error('Year is required');
        if (!purchasePrice) throw new Error('Purchase Price is required');
        if (!sellingPrice) throw new Error('Selling Price is required');

        const sanitizeId = (id) => (id === '' || id === undefined || id === null) ? null : parseInt(id);
        const sanitizeDate = (date) => (date === '' || date === undefined || date === null) ? null : date;
        const sanitizeInt = (val) => (val === '' || val === undefined || val === null) ? 0 : parseInt(val);
        const sanitizeFloat = (val) => (val === '' || val === undefined || val === null) ? 0 : parseFloat(val);

        await query(
            'CALL sp_create_vehicle(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, @id)',
            [
                vin,
                engineNumber,
                parseInt(variantId),
                parseInt(colorId),
                parseInt(year),
                status || 'at_yard',
                conditionType || 'new',
                sanitizeInt(mileage),
                sanitizeFloat(purchasePrice),
                sanitizeFloat(sellingPrice),
                location || 'Main Yard',
                sanitizeId(warehouseId),
                sanitizeDate(arrivalDate),
                notes || '',
                req.user.id
            ]
        );

        const result = await query('SELECT @id as vehicleId');
        const vehicleId = result[0].vehicleId;

        if (!vehicleId) {
            throw new Error('Failed to create vehicle: No ID returned');
        }

        const vehicle = {
            id: vehicleId,
            vin,
            make: null, // Frontend can refresh list
            model: null
        };

        logger.info(`Vehicle created: ${vin} by ${req.user.email}`);

        res.status(201).json({
            success: true,
            message: 'Vehicle created successfully',
            data: vehicle
        });
    } catch (error) {
        logger.error('Error creating vehicle:', error);

        // Handle common SQL errors
        if (error.sqlMessage) {
            if (error.sqlMessage.includes('VIN already exists')) {
                return res.status(400).json({ success: false, message: 'VIN already exists' });
            }
            if (error.sqlMessage.includes('Engine number already exists')) {
                return res.status(400).json({ success: false, message: 'Engine Number already exists' });
            }
            // Handle Generic SQL Signal
            if (error.code === 'ER_SIGNAL_EXCEPTION' && error.sqlMessage) {
                return res.status(400).json({ success: false, message: error.sqlMessage });
            }
            if (error.errno === 1452) {
                return res.status(400).json({ success: false, message: 'Invalid data selection: Make, Model, Variant, or Color does not exist.' });
            }
        }

        next(error);
    }
};

/**
 * Update vehicle
 * Uses sp_update_vehicle
 */
const updateVehicle = async (req, res, next) => {
    try {
        const { id } = req.params;
        const {
            vin, engineNumber, variantId, colorId, year, conditionType,
            mileage, purchasePrice, sellingPrice, location,
            warehouseId, arrivalDate, notes
        } = req.body;

        const sanitizeId = (id) => (id === '' || id === undefined || id === null) ? null : id;
        const sanitizeDate = (date) => (date === '' || date === undefined || date === null) ? null : date;

        await query(
            'CALL sp_update_vehicle(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [
                id, vin, engineNumber, variantId, colorId, year, conditionType,
                mileage, purchasePrice, sellingPrice, location,
                sanitizeId(warehouseId), sanitizeDate(arrivalDate),
                notes, req.user.id
            ]
        );

        logger.info(`Vehicle updated: ID ${id} by ${req.user.email}`);
        res.json({ success: true, message: 'Vehicle updated successfully' });
    } catch (error) {
        logger.error('Error updating vehicle:', error);
        next(error);
    }
};

/**
 * Delete vehicle
 * Uses sp_delete_vehicle
 */
const deleteVehicle = async (req, res, next) => {
    try {
        const { id } = req.params;

        await query('CALL sp_delete_vehicle(?, ?)', [id, req.user.id]);

        logger.info(`Vehicle deleted: ID ${id} by ${req.user.email}`);
        res.json({ success: true, message: 'Vehicle deleted successfully' });
    } catch (error) {
        logger.error('Error deleting vehicle:', error);
        next(error);
    }
};

/**
 * Update vehicle status
 * Uses sp_update_vehicle_status
 */
const updateVehicleStatus = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        if (!status) throw new AppError('Status is required', 400);

        await query('CALL sp_update_vehicle_status(?, ?, ?)', [id, status, req.user.id]);

        logger.info(`Vehicle ID ${id} status updated to ${status}`);
        res.json({ success: true, message: 'Vehicle status updated successfully' });
    } catch (error) {
        logger.error('Error updating vehicle status:', error);
        next(error);
    }
};

/**
 * Get vehicle statistics
 */
const getVehicleStats = async (req, res, next) => {
    try {
        // Keeping as raw SQL queries for reporting dashboard - can be moved to SP_GetVehicleStats later
        const overallStats = await query(`
            SELECT 
                COUNT(*) AS total_vehicles,
                SUM(CASE WHEN status = 'in_transit' THEN 1 ELSE 0 END) AS in_transit,
                SUM(CASE WHEN status = 'at_yard' THEN 1 ELSE 0 END) AS at_yard,
                SUM(CASE WHEN status = 'allocated' THEN 1 ELSE 0 END) AS allocated,
                SUM(CASE WHEN status = 'sold' THEN 1 ELSE 0 END) AS sold,
                SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) AS delivered,
                SUM(purchase_price) AS total_purchase_value,
                SUM(selling_price) AS total_selling_value,
                SUM(selling_price - purchase_price) AS total_profit_margin
            FROM vehicles
            WHERE is_active = TRUE
        `);

        // ... Keeping other stats queries for now ...
        // For brevity in this refactor, just returning overall for validation
        // In a full implementation, we'd include the other breakdown queries too.

        const byMake = await query(`
           SELECT vmk.name AS make_name, COUNT(*) AS count
           FROM vehicles v
           JOIN vehicle_variants vv ON v.variant_id = vv.id
           JOIN vehicle_models vm ON vv.model_id = vm.id
           JOIN vehicle_makes vmk ON vm.make_id = vmk.id
            WHERE v.is_active = TRUE AND v.status NOT IN ('sold', 'delivered')
           GROUP BY vmk.id, vmk.name
           ORDER BY count DESC
        `);

        res.json({
            success: true,
            data: {
                ...overallStats[0],
                byMake
            }
        });
    } catch (error) {
        logger.error('Error fetching vehicle stats:', error);
        next(error);
    }
};

const getWarehouses = async (req, res, next) => {
    try {
        const warehouses = await query('SELECT id, name, code FROM warehouses WHERE is_active = TRUE ORDER BY name');
        res.json({ success: true, data: warehouses });
    } catch (error) { next(error); }
};

/**
 * Get Makes List (for dropdowns)
 */
const getMakesList = async (req, res, next) => {
    try {
        // Use sp_get_makes with is_active=true and high limit
        const makes = await query('CALL sp_get_makes(?, ?, ?, ?)', [null, true, 1000, 0]);
        res.json({ success: true, data: makes[0] || [] });
    } catch (error) { next(error); }
};

/**
 * Get Models List (for dropdowns)
 */
const getModelsList = async (req, res, next) => {
    try {
        const { makeId } = req.query;
        // sp_get_models(make_id, search, is_active, limit, offset)
        const models = await query('CALL sp_get_models(?, ?, ?, ?, ?)',
            [makeId ? parseInt(makeId) : null, null, true, 1000, 0]);
        res.json({ success: true, data: models[0] || [] });
    } catch (error) { next(error); }
};

/**
 * Get Variants List (for dropdowns)
 */
const getVariantsList = async (req, res, next) => {
    try {
        const { modelId } = req.query;
        // sp_get_variants(model_id, make_id, search, is_active, limit, offset)
        const variants = await query('CALL sp_get_variants(?, ?, ?, ?, ?, ?)',
            [modelId ? parseInt(modelId) : null, null, null, true, 1000, 0]);
        res.json({ success: true, data: variants[0] || [] });
    } catch (error) { next(error); }
};

/**
 * Get Colors List (for dropdowns)
 */
const getColorsList = async (req, res, next) => {
    try {
        // sp_get_colors(search, is_active, limit, offset)
        const colors = await query('CALL sp_get_colors(?, ?, ?, ?)', [null, true, 1000, 0]);
        res.json({ success: true, data: colors[0] || [] });
    } catch (error) { next(error); }
};

module.exports = {
    getAllVehicles,
    getVehicleById,
    createVehicle,
    updateVehicle,
    deleteVehicle,
    updateVehicleStatus,
    getVehicleStats,
    getWarehouses,
    getMakesList,
    getModelsList,
    getVariantsList,
    getColorsList
};
