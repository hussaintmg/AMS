/**
 * Vehicle Master Data Controller
 * Full CRUD operations for managing vehicle makes, models, variants, and colors
 * Created by LOGIXINVENTOR (PVT) Ltd.
 * info@logixinventor.com +92 333 3836851
 * www.logixinventor.com | AMS
 * Date: 2026-01-08
 */

const { query } = require('../config/database');
const { AppError } = require('../middleware/errorHandler');
const logger = require('../utils/logger');
const { normalizePhone } = require('../utils/phone.util');

// ═══════════════════════════════════════════════════════════════════════════
// VEHICLE MAKES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get all vehicle makes with stats
 */
const getMakes = async (req, res, next) => {
    try {
        const { search = '', is_active, page = 1, limit = 100 } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);

        const makes = await query(
            'CALL sp_get_makes(?, ?, ?, ?)',
            [search || null, is_active !== undefined ? is_active === 'true' : null, parseInt(limit), offset]
        );

        // Get total count
        const countResult = await query(
            `SELECT COUNT(*) as total FROM vehicle_makes 
             WHERE (? IS NULL OR ? = '' OR name LIKE CONCAT('%', ?, '%'))
               AND (? IS NULL OR is_active = ?)`,
            [search, search, search, is_active !== undefined ? is_active === 'true' : null, is_active === 'true']
        );

        res.json({
            success: true,
            data: {
                makes: makes[0] || [],
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total: countResult[0]?.total || 0,
                    totalPages: Math.ceil((countResult[0]?.total || 0) / parseInt(limit))
                }
            }
        });
    } catch (error) {
        logger.error('Error fetching makes:', error);
        next(error);
    }
};

/**
 * Create a new vehicle make
 */
const createMake = async (req, res, next) => {
    try {
        const { name, country, logo, isActive } = req.body;

        if (!name) {
            throw new AppError('Make name is required', 400);
        }

        await query('CALL sp_create_make(?, ?, ?, ?, @id)', [name, country, logo, isActive]);
        const result = await query('SELECT @id as makeId');

        logger.info(`Make created: ${name} by ${req.user.email}`);

        res.status(201).json({
            success: true,
            message: 'Make created successfully',
            data: { id: result[0].makeId, name }
        });
    } catch (error) {
        logger.error('Error creating make:', error);
        next(error);
    }
};

/**
 * Update a vehicle make
 */
const updateMake = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { name, country, logo, isActive } = req.body;

        await query('CALL sp_update_make(?, ?, ?, ?, ?)', [id, name, country, logo, isActive]);

        logger.info(`Make updated: ID ${id} by ${req.user.email}`);

        res.json({
            success: true,
            message: 'Make updated successfully'
        });
    } catch (error) {
        logger.error('Error updating make:', error);
        next(error);
    }
};

/**
 * Delete a vehicle make
 */
const deleteMake = async (req, res, next) => {
    try {
        const { id } = req.params;

        await query('CALL sp_delete_make(?)', [id]);

        logger.info(`Make deleted: ID ${id} by ${req.user.email}`);

        res.json({
            success: true,
            message: 'Make deleted successfully'
        });
    } catch (error) {
        logger.error('Error deleting make:', error);
        next(error);
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// VEHICLE MODELS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get all vehicle models
 */
const getModels = async (req, res, next) => {
    try {
        const { make_id, search = '', is_active, page = 1, limit = 100 } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);

        const models = await query(
            'CALL sp_get_models(?, ?, ?, ?, ?)',
            [make_id || null, search || null, is_active !== undefined ? is_active === 'true' : null, parseInt(limit), offset]
        );

        res.json({
            success: true,
            data: {
                models: models[0] || []
            }
        });
    } catch (error) {
        logger.error('Error fetching models:', error);
        next(error);
    }
};

/**
 * Create a new vehicle model
 */
const createModel = async (req, res, next) => {
    try {
        const { makeId, name, year, bodyType, fuelType, transmission, engineCapacity, seatingCapacity, isActive } = req.body;

        if (!makeId || !name) {
            throw new AppError('Make ID and Model name are required', 400);
        }

        await query('CALL sp_create_model(?, ?, ?, ?, ?, ?, ?, ?, ?, @id)',
            [makeId, name, year, bodyType, fuelType, transmission, engineCapacity, seatingCapacity, isActive]);
        const result = await query('SELECT @id as modelId');

        logger.info(`Model created: ${name} by ${req.user.email}`);

        res.status(201).json({
            success: true,
            message: 'Model created successfully',
            data: { id: result[0].modelId, name }
        });
    } catch (error) {
        logger.error('Error creating model:', error);
        next(error);
    }
};

/**
 * Update a vehicle model
 */
const updateModel = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { makeId, name, year, bodyType, fuelType, transmission, engineCapacity, seatingCapacity, isActive } = req.body;

        await query('CALL sp_update_model(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [id, makeId, name, year, bodyType, fuelType, transmission, engineCapacity, seatingCapacity, isActive]);

        logger.info(`Model updated: ID ${id} by ${req.user.email}`);

        res.json({
            success: true,
            message: 'Model updated successfully'
        });
    } catch (error) {
        logger.error('Error updating model:', error);
        next(error);
    }
};

/**
 * Delete a vehicle model
 */
const deleteModel = async (req, res, next) => {
    try {
        const { id } = req.params;

        await query('CALL sp_delete_model(?)', [id]);

        logger.info(`Model deleted: ID ${id} by ${req.user.email}`);

        res.json({
            success: true,
            message: 'Model deleted successfully'
        });
    } catch (error) {
        logger.error('Error deleting model:', error);
        next(error);
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// VEHICLE VARIANTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get all vehicle variants
 */
const getVariants = async (req, res, next) => {
    try {
        const { model_id, make_id, search = '', is_active, page = 1, limit = 100 } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);

        const variants = await query(
            'CALL sp_get_variants(?, ?, ?, ?, ?, ?)',
            [model_id || null, make_id || null, search || null, is_active !== undefined ? is_active === 'true' : null, parseInt(limit), offset]
        );

        res.json({
            success: true,
            data: {
                variants: variants[0] || []
            }
        });
    } catch (error) {
        logger.error('Error fetching variants:', error);
        next(error);
    }
};

/**
 * Create a new vehicle variant
 */
const createVariant = async (req, res, next) => {
    try {
        const { modelId, name, basePrice, features, specifications, isActive } = req.body;

        if (!modelId || !name) {
            throw new AppError('Model ID and Variant name are required', 400);
        }

        await query('CALL sp_create_variant(?, ?, ?, ?, ?, ?, @id)',
            [modelId, name, basePrice || 0, features, specifications ? JSON.stringify(specifications) : null, isActive]);
        const result = await query('SELECT @id as variantId');

        logger.info(`Variant created: ${name} by ${req.user.email}`);

        res.status(201).json({
            success: true,
            message: 'Variant created successfully',
            data: { id: result[0].variantId, name }
        });
    } catch (error) {
        logger.error('Error creating variant:', error);
        next(error);
    }
};

/**
 * Update a vehicle variant
 */
const updateVariant = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { modelId, name, basePrice, features, specifications, isActive } = req.body;

        await query('CALL sp_update_variant(?, ?, ?, ?, ?, ?, ?)',
            [id, modelId, name, basePrice, features, specifications ? JSON.stringify(specifications) : null, isActive]);

        logger.info(`Variant updated: ID ${id} by ${req.user.email}`);

        res.json({
            success: true,
            message: 'Variant updated successfully'
        });
    } catch (error) {
        logger.error('Error updating variant:', error);
        next(error);
    }
};

/**
 * Delete a vehicle variant
 */
const deleteVariant = async (req, res, next) => {
    try {
        const { id } = req.params;

        await query('CALL sp_delete_variant(?)', [id]);

        logger.info(`Variant deleted: ID ${id} by ${req.user.email}`);

        res.json({
            success: true,
            message: 'Variant deleted successfully'
        });
    } catch (error) {
        logger.error('Error deleting variant:', error);
        next(error);
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// VEHICLE COLORS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get all vehicle colors
 */
const getColors = async (req, res, next) => {
    try {
        const { search = '', is_active, page = 1, limit = 100 } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);

        const colors = await query(
            'CALL sp_get_colors(?, ?, ?, ?)',
            [search || null, is_active !== undefined ? is_active === 'true' : null, parseInt(limit), offset]
        );

        res.json({
            success: true,
            data: {
                colors: colors[0] || []
            }
        });
    } catch (error) {
        logger.error('Error fetching colors:', error);
        next(error);
    }
};

/**
 * Create a new vehicle color
 */
const createColor = async (req, res, next) => {
    try {
        const { name, hexCode, isMetallic, additionalCost, isActive } = req.body;

        if (!name) {
            throw new AppError('Color name is required', 400);
        }

        await query('CALL sp_create_color(?, ?, ?, ?, ?, @id)',
            [name, hexCode, isMetallic, additionalCost, isActive]);
        const result = await query('SELECT @id as colorId');

        logger.info(`Color created: ${name} by ${req.user.email}`);

        res.status(201).json({
            success: true,
            message: 'Color created successfully',
            data: { id: result[0].colorId, name }
        });
    } catch (error) {
        logger.error('Error creating color:', error);
        next(error);
    }
};

/**
 * Update a vehicle color
 */
const updateColor = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { name, hexCode, isMetallic, additionalCost, isActive } = req.body;

        await query('CALL sp_update_color(?, ?, ?, ?, ?, ?)',
            [id, name, hexCode, isMetallic, additionalCost, isActive]);

        logger.info(`Color updated: ID ${id} by ${req.user.email}`);

        res.json({
            success: true,
            message: 'Color updated successfully'
        });
    } catch (error) {
        logger.error('Error updating color:', error);
        next(error);
    }
};

/**
 * Delete a vehicle color
 */
const deleteColor = async (req, res, next) => {
    try {
        const { id } = req.params;

        await query('CALL sp_delete_color(?)', [id]);

        logger.info(`Color deleted: ID ${id} by ${req.user.email}`);

        res.json({
            success: true,
            message: 'Color deleted successfully'
        });
    } catch (error) {
        logger.error('Error deleting color:', error);
        next(error);
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// STATS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get vehicle master data stats
 */
const getStats = async (req, res, next) => {
    try {
        const stats = await query('SELECT * FROM vw_vehicle_master_stats');

        res.json({
            success: true,
            data: stats[0] || {}
        });
    } catch (error) {
        logger.error('Error fetching stats:', error);
        next(error);
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// PART CATEGORIES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get all part categories with stats
 * Supports search, active filter, and parent_id filter
 */
const getCategories = async (req, res, next) => {
    try {
        const { search = '', is_active, parent_id, page = 1, limit = 100 } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);

        const categories = await query(
            'CALL sp_get_part_categories(?, ?, ?, ?, ?)',
            [
                search || null,
                is_active !== undefined ? is_active === 'true' : null,
                parent_id !== undefined ? (parent_id === '' ? null : parseInt(parent_id)) : null,
                parseInt(limit),
                offset
            ]
        );

        // Get total count for pagination
        let whereConditions = ['1=1'];
        let params = [];
        if (search) {
            whereConditions.push('(name LIKE ? OR description LIKE ?)');
            const s = `%${search}%`;
            params.push(s, s);
        }
        if (is_active !== undefined) {
            whereConditions.push('is_active = ?');
            params.push(is_active === 'true');
        }

        const countResult = await query(
            `SELECT COUNT(*) as total FROM part_categories WHERE ${whereConditions.join(' AND ')}`,
            params
        );

        res.json({
            success: true,
            data: {
                categories: categories[0] || [],
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total: countResult[0]?.total || 0,
                    totalPages: Math.ceil((countResult[0]?.total || 0) / parseInt(limit))
                }
            }
        });
    } catch (error) {
        logger.error('Error fetching categories:', error);
        next(error);
    }
};

/**
 * Create a new part category
 */
const createCategory = async (req, res, next) => {
    try {
        const { name, description, parentId, isActive } = req.body;

        if (!name) {
            throw new AppError('Category name is required', 400);
        }

        await query(
            'CALL sp_create_part_category(?, ?, ?, ?, @id, @success, @message)',
            [name, description || null, parentId || null, isActive]
        );

        const result = await query('SELECT @id as categoryId, @success as success, @message as message');
        const { categoryId, success, message } = result[0];

        if (!success) {
            throw new AppError(message, 400);
        }

        logger.info(`Category created: ${name} by ${req.user.email}`);

        res.status(201).json({
            success: true,
            message: message,
            data: { id: categoryId, name }
        });
    } catch (error) {
        logger.error('Error creating category:', error);
        next(error);
    }
};

/**
 * Update a part category
 */
const updateCategory = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { name, description, parentId, isActive } = req.body;

        await query(
            'CALL sp_update_part_category(?, ?, ?, ?, ?, @success, @message)',
            [id, name, description, parentId !== undefined ? (parentId || null) : null, isActive]
        );

        const result = await query('SELECT @success as success, @message as message');
        const { success, message } = result[0];

        if (!success) {
            throw new AppError(message, 400);
        }

        logger.info(`Category updated: ID ${id} by ${req.user.email}`);

        res.json({
            success: true,
            message: message
        });
    } catch (error) {
        logger.error('Error updating category:', error);
        next(error);
    }
};

/**
 * Delete a part category
 */
const deleteCategory = async (req, res, next) => {
    try {
        const { id } = req.params;

        await query('CALL sp_delete_part_category(?, @success, @message)', [id]);

        const result = await query('SELECT @success as success, @message as message');
        const { success, message } = result[0];

        if (!success) {
            throw new AppError(message, 400);
        }

        logger.info(`Category deleted: ID ${id} by ${req.user.email}`);

        res.json({
            success: true,
            message: message
        });
    } catch (error) {
        logger.error('Error deleting category:', error);
        next(error);
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// SUPPLIERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get all suppliers with stats
 */
const getSuppliers = async (req, res, next) => {
    try {
        const { search = '', is_active, page = 1, limit = 100 } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);

        const suppliers = await query(
            'CALL sp_get_suppliers(?, ?, ?, ?)',
            [search || null, is_active !== undefined ? is_active === 'true' : null, parseInt(limit), offset]
        );

        // Get total count for pagination
        let whereConditions = ['1=1'];
        let params = [];
        if (search) {
            whereConditions.push('(name LIKE ? OR supplier_code LIKE ? OR contact_person LIKE ?)');
            const s = `%${search}%`;
            params.push(s, s, s);
        }
        if (is_active !== undefined) {
            whereConditions.push('is_active = ?');
            params.push(is_active === 'true');
        }

        const countResult = await query(
            `SELECT COUNT(*) as total FROM suppliers WHERE ${whereConditions.join(' AND ')}`,
            params
        );

        res.json({
            success: true,
            data: {
                suppliers: suppliers[0] || [],
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total: countResult[0]?.total || 0,
                    totalPages: Math.ceil((countResult[0]?.total || 0) / parseInt(limit))
                }
            }
        });
    } catch (error) {
        logger.error('Error fetching suppliers:', error);
        next(error);
    }
};

/**
 * Create a new supplier
 */
const createSupplier = async (req, res, next) => {
    try {
        const { 
            supplierCode, name, type, contactPerson, email, phone, 
            address, city, country, taxNumber, paymentTerms, creditLimit, isActive 
        } = req.body;
        const normalizedPhone = phone ? normalizePhone(phone) : null;

        if (!supplierCode || !name || !type) {
            throw new AppError('Supplier code, name and type are required', 400);
        }

        await query('CALL sp_create_supplier(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, @id)', [
            supplierCode, name, type, contactPerson, email, normalizedPhone,
            address, city, country, taxNumber, paymentTerms, creditLimit, isActive, 
        ]);
        const result = await query('SELECT @id as supplierId');

        logger.info(`Supplier created: ${name} (${supplierCode}) by ${req.user.email}`);

        res.status(201).json({
            success: true,
            message: 'Supplier created successfully',
            data: { id: result[0].supplierId, name, supplierCode }
        });
    } catch (error) {
        logger.error('Error creating supplier:', error);
        next(error);
    }
};

/**
 * Update a supplier
 */
const updateSupplier = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { 
            supplierCode, name, type, contactPerson, email, phone, 
            address, city, country, taxNumber, paymentTerms, creditLimit, isActive 
        } = req.body;
        const normalizedPhone = phone !== undefined && phone !== null && phone !== '' ? normalizePhone(phone) : null;

        await query('CALL sp_update_supplier(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [
            id, supplierCode, name, type, contactPerson, email, normalizedPhone,
            address, city, country, taxNumber, paymentTerms, creditLimit, isActive
        ]);

        logger.info(`Supplier updated: ID ${id} by ${req.user.email}`);

        res.json({
            success: true,
            message: 'Supplier updated successfully'
        });
    } catch (error) {
        logger.error('Error updating supplier:', error);
        next(error);
    }
};

/**
 * Delete a supplier
 */
const deleteSupplier = async (req, res, next) => {
    try {
        const { id } = req.params;

        await query('CALL sp_delete_supplier(?)', [id]);

        logger.info(`Supplier deleted: ID ${id} by ${req.user.email}`);

        res.json({
            success: true,
            message: 'Supplier deleted successfully'
        });
    } catch (error) {
        logger.error('Error deleting supplier:', error);
        next(error);
    }
};

module.exports = {
    // Makes
    getMakes,
    createMake,
    updateMake,
    deleteMake,
    // Models
    getModels,
    createModel,
    updateModel,
    deleteModel,
    // Variants
    getVariants,
    createVariant,
    updateVariant,
    deleteVariant,
    // Colors
    getColors,
    createColor,
    updateColor,
    deleteColor,
    // Categories
    getCategories,
    createCategory,
    updateCategory,
    deleteCategory,
    // Suppliers
    getSuppliers,
    createSupplier,
    updateSupplier,
    deleteSupplier,
    // Stats
    getStats
};
