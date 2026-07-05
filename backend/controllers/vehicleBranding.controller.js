/**
 * Vehicle Branding Controller
 * Full CRUD operations for managing vehicle brands
 * Professional corporate implementation with error handling and logging
 * Created by LOGIXINVENTOR (PVT) Ltd.
 * info@logixinventor.com +92 333 3836851
 * www.logixinventor.com | AMS
 * Date: 2026-05-08
 */

const { query } = require('../config/database');
const { AppError } = require('../middleware/errorHandler');
const logger = require('../utils/logger');

// ═══════════════════════════════════════════════════════════════════════════
// GET ALL VEHICLE BRANDS WITH PAGINATION & FILTERING
// ═══════════════════════════════════════════════════════════════════════════

const getAllBrands = async (req, res, next) => {
    try {
        const {
            page = 1,
            limit = 20,
            search = '',
            is_active,
            sortBy = 'display_order',
            sortOrder = 'ASC'
        } = req.query;

        const offset = (parseInt(page) - 1) * parseInt(limit);

        logger.info(`[Vehicle Branding] Fetching brands - Page: ${page}, Limit: ${limit}, Search: ${search}`);

        // Build the main query
        let queryStr = `
            SELECT
                vb.id,
                vb.name,
                vb.description,
                vb.logo_url,
                vb.country_of_origin,
                vb.established_year,
                vb.website,
                vb.is_active,
                vb.display_order,
                vb.created_at,
                vb.updated_at,
                COUNT(DISTINCT vm.id) AS total_makes,
                COUNT(DISTINCT v.id) AS total_vehicles,
                CONCAT(u_created.first_name, ' ', u_created.last_name) AS created_by_user,
                CONCAT(u_updated.first_name, ' ', u_updated.last_name) AS updated_by_user
            FROM vehicle_brands vb
            LEFT JOIN vehicle_makes vm ON vb.id = vm.brand_id
            LEFT JOIN vehicle_models vmo ON vm.id = vmo.make_id
            LEFT JOIN vehicle_variants vv ON vmo.id = vv.model_id
            LEFT JOIN vehicles v ON vv.id = v.variant_id AND v.is_active = TRUE
            LEFT JOIN users u_created ON vb.created_by = u_created.id
            LEFT JOIN users u_updated ON vb.updated_by = u_updated.id
            WHERE vb.deleted_at IS NULL
        `;

        let params = [];
        let whereConditions = [];

        // Add search filter
        if (search && search.trim() !== '') {
            whereConditions.push('(vb.name LIKE ? OR vb.description LIKE ?)');
            params.push(`%${search}%`, `%${search}%`);
        }

        // Add active filter
        if (is_active !== undefined) {
            whereConditions.push('vb.is_active = ?');
            params.push(is_active === 'true' ? 1 : 0);
        }

        // Add WHERE clause if conditions exist
        if (whereConditions.length > 0) {
            queryStr += ' AND ' + whereConditions.join(' AND ');
        }

        // Add GROUP BY
        queryStr += `
            GROUP BY
                vb.id, vb.name, vb.description, vb.logo_url, vb.country_of_origin,
                vb.established_year, vb.website, vb.is_active, vb.display_order,
                vb.created_at, vb.updated_at, u_created.first_name, u_created.last_name,
                u_updated.first_name, u_updated.last_name
        `;

        // Add sorting
        const validSortFields = ['name', 'display_order', 'created_at', 'is_active'];
        const sortField = validSortFields.includes(sortBy) ? sortBy : 'display_order';
        const sortDir = sortOrder.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
        queryStr += ` ORDER BY vb.${sortField} ${sortDir}, vb.name ASC`;

        // Add pagination
        queryStr += ' LIMIT ? OFFSET ?';
        params.push(parseInt(limit), offset);

        const brands = await query(queryStr, params);

        // Get total count
        let countQuery = 'SELECT COUNT(*) as total FROM `vehicle_brands` WHERE deleted_at IS NULL';
        let countParams = [];

        if (search && search.trim() !== '') {
            countQuery += ' AND (name LIKE ? OR description LIKE ?)';
            countParams = [`%${search}%`, `%${search}%`];
        }

        if (is_active !== undefined) {
            countQuery += ' AND is_active = ?';
            countParams.push(is_active === 'true' ? 1 : 0);
        }

        const countResult = await query(countQuery, countParams);
        const total = countResult[0]?.total || 0;

        logger.info(`[Vehicle Branding] Retrieved ${brands.length} brands successfully`);

        res.json({
            success: true,
            status: 200,
            message: 'Brands retrieved successfully',
            data: {
                brands,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total,
                    totalPages: Math.ceil(total / parseInt(limit))
                }
            }
        });
    } catch (error) {
        logger.error(`[Vehicle Branding] Error fetching brands: ${error.message}`);
        next(new AppError(`Failed to fetch brands: ${error.message}`, 500));
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// GET SINGLE BRAND BY ID
// ═══════════════════════════════════════════════════════════════════════════

const getBrandById = async (req, res, next) => {
    try {
        const { id } = req.params;

        if (!id || isNaN(id)) {
            return next(new AppError('Invalid brand ID', 400));
        }

        logger.info(`[Vehicle Branding] Fetching brand with ID: ${id}`);

        const result = await query(`
            SELECT
                vb.id,
                vb.name,
                vb.description,
                vb.logo_url,
                vb.country_of_origin,
                vb.established_year,
                vb.website,
                vb.is_active,
                vb.display_order,
                vb.created_at,
                vb.updated_at,
                COUNT(DISTINCT vm.id) AS total_makes,
                COUNT(DISTINCT v.id) AS total_vehicles,
                CONCAT(u_created.first_name, ' ', u_created.last_name) AS created_by_user,
                CONCAT(u_updated.first_name, ' ', u_updated.last_name) AS updated_by_user
            FROM vehicle_brands vb
            LEFT JOIN vehicle_makes vm ON vb.id = vm.brand_id
            LEFT JOIN vehicle_models vmo ON vm.id = vmo.make_id
            LEFT JOIN vehicle_variants vv ON vmo.id = vv.model_id
            LEFT JOIN vehicles v ON vv.id = v.variant_id AND v.is_active = TRUE
            LEFT JOIN users u_created ON vb.created_by = u_created.id
            LEFT JOIN users u_updated ON vb.updated_by = u_updated.id
            WHERE vb.id = ? AND vb.deleted_at IS NULL
            GROUP BY
                vb.id, vb.name, vb.description, vb.logo_url, vb.country_of_origin,
                vb.established_year, vb.website, vb.is_active, vb.display_order,
                vb.created_at, vb.updated_at, u_created.first_name, u_created.last_name,
                u_updated.first_name, u_updated.last_name
        `, [parseInt(id)]);

        if (!result || result.length === 0) {
            return next(new AppError('Brand not found', 404));
        }

        const brand = result[0];

        logger.info(`[Vehicle Branding] Retrieved brand: ${brand.name}`);

        res.json({
            success: true,
            status: 200,
            message: 'Brand retrieved successfully',
            data: { brand }
        });
    } catch (error) {
        logger.error(`[Vehicle Branding] Error fetching brand by ID: ${error.message}`);
        next(new AppError(`Failed to fetch brand: ${error.message}`, 500));
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// CREATE NEW BRAND
// ═══════════════════════════════════════════════════════════════════════════

const createBrand = async (req, res, next) => {
    try {
        const {
            name,
            description,
            logo_url,
            country_of_origin,
            established_year,
            website
        } = req.body;

        // Validation
        if (!name || name.trim() === '') {
            return next(new AppError('Brand name is required', 400));
        }

        const userId = req.user?.id || 1;

        logger.info(`[Vehicle Branding] Creating new brand: ${name}`);

        // Check for duplicates
        const duplicateCheck = await query(
            'SELECT COUNT(*) as count FROM `vehicle_brands` WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) AND deleted_at IS NULL',
            [name.trim()]
        );

        if (duplicateCheck[0].count > 0) {
            logger.warn(`[Vehicle Branding] Brand creation failed: Brand name already exists`);
            return next(new AppError('Brand name already exists', 400));
        }

        // Insert new brand
        const insertResult = await query(`
            INSERT INTO \`vehicle_brands\` (
                name, description, logo_url, country_of_origin,
                established_year, website, is_active, created_by, updated_by
            ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
        `, [
            name.trim(),
            description || null,
            logo_url || null,
            country_of_origin || null,
            established_year || null,
            website || null,
            userId,
            userId
        ]);

        const brandId = insertResult.insertId;

        // Get created brand details
        const createdBrand = await query(`
            SELECT
                vb.id,
                vb.name,
                vb.description,
                vb.logo_url,
                vb.country_of_origin,
                vb.established_year,
                vb.website,
                vb.is_active,
                vb.display_order,
                vb.created_at,
                vb.updated_at,
                COUNT(DISTINCT vm.id) AS total_makes,
                COUNT(DISTINCT v.id) AS total_vehicles,
                CONCAT(u_created.first_name, ' ', u_created.last_name) AS created_by_user,
                CONCAT(u_updated.first_name, ' ', u_updated.last_name) AS updated_by_user
            FROM \`vehicle_brands\` vb
            LEFT JOIN \`vehicle_makes\` vm ON vb.id = vm.brand_id
            LEFT JOIN \`vehicle_models\` vmo ON vm.id = vmo.make_id
            LEFT JOIN \`vehicle_variants\` vv ON vmo.id = vv.model_id
            LEFT JOIN \`vehicles\` v ON vv.id = v.variant_id AND v.is_active = TRUE
            LEFT JOIN \`users\` u_created ON vb.created_by = u_created.id
            LEFT JOIN \`users\` u_updated ON vb.updated_by = u_updated.id
            WHERE vb.id = ? AND vb.deleted_at IS NULL
            GROUP BY
                vb.id, vb.name, vb.description, vb.logo_url, vb.country_of_origin,
                vb.established_year, vb.website, vb.is_active, vb.display_order,
                vb.created_at, vb.updated_at, u_created.first_name, u_created.last_name,
                u_updated.first_name, u_updated.last_name
        `, [brandId]);

        logger.info(`[Vehicle Branding] Brand created successfully - ID: ${brandId}`);

        res.status(201).json({
            success: true,
            status: 201,
            message: 'Brand created successfully',
            data: {
                brand: createdBrand[0]
            }
        });
    } catch (error) {
        logger.error(`[Vehicle Branding] Error creating brand: ${error.message}`);
        next(new AppError(`Failed to create brand: ${error.message}`, 500));
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// UPDATE BRAND
// ═══════════════════════════════════════════════════════════════════════════

const updateBrand = async (req, res, next) => {
    try {
        const { id } = req.params;
        const {
            name,
            description,
            logo_url,
            country_of_origin,
            established_year,
            website,
            is_active,
            display_order
        } = req.body;

        if (!id || isNaN(id)) {
            return next(new AppError('Invalid brand ID', 400));
        }

        if (!name || name.trim() === '') {
            return next(new AppError('Brand name is required', 400));
        }

        // Check if brand exists
        const existingBrand = await query(`
            SELECT id, name FROM \`vehicle_brands\` WHERE id = ? AND deleted_at IS NULL
        `, [parseInt(id)]);

        if (!existingBrand || existingBrand.length === 0) {
            return next(new AppError('Brand not found', 404));
        }

        const userId = req.user?.id || 1;

        logger.info(`[Vehicle Branding] Updating brand - ID: ${id}, Name: ${name}`);

        // Check for duplicates (excluding current brand)
        const duplicateCheck = await query(
            'SELECT COUNT(*) as count FROM `vehicle_brands` WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) AND id != ? AND deleted_at IS NULL',
            [name.trim(), parseInt(id)]
        );

        if (duplicateCheck[0].count > 0) {
            logger.warn(`[Vehicle Branding] Brand update failed: Brand name already exists`);
            return next(new AppError('Brand name already exists', 400));
        }

        // Update brand
        await query(`
            UPDATE \`vehicle_brands\` SET
                name = ?,
                description = ?,
                logo_url = ?,
                country_of_origin = ?,
                established_year = ?,
                website = ?,
                is_active = ?,
                display_order = ?,
                updated_by = ?
            WHERE id = ? AND deleted_at IS NULL
        `, [
            name.trim(),
            description || null,
            logo_url || null,
            country_of_origin || null,
            established_year || null,
            website || null,
            is_active !== undefined ? (is_active ? 1 : 0) : 1,
            display_order || 0,
            userId,
            parseInt(id)
        ]);

        // Get updated brand details
        const updatedBrand = await query(`
            SELECT
                vb.id,
                vb.name,
                vb.description,
                vb.logo_url,
                vb.country_of_origin,
                vb.established_year,
                vb.website,
                vb.is_active,
                vb.display_order,
                vb.created_at,
                vb.updated_at,
                COUNT(DISTINCT vm.id) AS total_makes,
                COUNT(DISTINCT v.id) AS total_vehicles,
                CONCAT(u_created.first_name, ' ', u_created.last_name) AS created_by_user,
                CONCAT(u_updated.first_name, ' ', u_updated.last_name) AS updated_by_user
            FROM \`vehicle_brands\` vb
            LEFT JOIN \`vehicle_makes\` vm ON vb.id = vm.brand_id
            LEFT JOIN \`vehicle_models\` vmo ON vm.id = vmo.make_id
            LEFT JOIN \`vehicle_variants\` vv ON vmo.id = vv.model_id
            LEFT JOIN \`vehicles\` v ON vv.id = v.variant_id AND v.is_active = TRUE
            LEFT JOIN \`users\` u_created ON vb.created_by = u_created.id
            LEFT JOIN \`users\` u_updated ON vb.updated_by = u_updated.id
            WHERE vb.id = ? AND vb.deleted_at IS NULL
            GROUP BY
                vb.id, vb.name, vb.description, vb.logo_url, vb.country_of_origin,
                vb.established_year, vb.website, vb.is_active, vb.display_order,
                vb.created_at, vb.updated_at, u_created.first_name, u_created.last_name,
                u_updated.first_name, u_updated.last_name
        `, [parseInt(id)]);

        logger.info(`[Vehicle Branding] Brand updated successfully - ID: ${id}`);

        res.json({
            success: true,
            status: 200,
            message: 'Brand updated successfully',
            data: {
                brand: updatedBrand[0]
            }
        });
    } catch (error) {
        logger.error(`[Vehicle Branding] Error updating brand: ${error.message}`);
        next(new AppError(`Failed to update brand: ${error.message}`, 500));
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// DELETE BRAND
// ═══════════════════════════════════════════════════════════════════════════

const deleteBrand = async (req, res, next) => {
    try {
        const { id } = req.params;

        if (!id || isNaN(id)) {
            return next(new AppError('Invalid brand ID', 400));
        }

        // Check if brand exists
        const existingBrand = await query(`
            SELECT id, name FROM \`vehicle_brands\` WHERE id = ? AND deleted_at IS NULL
        `, [parseInt(id)]);

        if (!existingBrand || existingBrand.length === 0) {
            return next(new AppError('Brand not found', 404));
        }

        const userId = req.user?.id || 1;

        logger.info(`[Vehicle Branding] Deleting brand - ID: ${id}`);

        // Check for related makes
        const relatedMakes = await query(`
            SELECT COUNT(*) as count FROM \`vehicle_makes\` WHERE brand_id = ?
        `, [parseInt(id)]);

        if (relatedMakes[0].count > 0) {
            logger.warn(`[Vehicle Branding] Brand deletion failed: Brand has ${relatedMakes[0].count} vehicle makes associated`);
            return next(new AppError(`Cannot delete brand. It has ${relatedMakes[0].count} vehicle makes associated with it.`, 400));
        }

        // Soft delete
        await query(`
            UPDATE \`vehicle_brands\` SET deleted_at = NOW() WHERE id = ?
        `, [parseInt(id)]);

        logger.info(`[Vehicle Branding] Brand deleted successfully - ID: ${id}`);

        res.json({
            success: true,
            status: 200,
            message: 'Brand deleted successfully',
            data: {
                brandId: parseInt(id)
            }
        });
    } catch (error) {
        logger.error(`[Vehicle Branding] Error deleting brand: ${error.message}`);
        next(new AppError(`Failed to delete brand: ${error.message}`, 500));
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// GET ACTIVE BRANDS (For Dropdown/Select)
// ═══════════════════════════════════════════════════════════════════════════

const getActiveBrands = async (req, res, next) => {
    try {
        logger.info('[Vehicle Branding] Fetching active brands for dropdown');

        const result = await query(`
            SELECT
                id,
                name,
                logo_url,
                country_of_origin
            FROM \`vehicle_brands\`
            WHERE is_active = 1 AND deleted_at IS NULL
            ORDER BY display_order ASC, name ASC
        `);

        logger.info(`[Vehicle Branding] Retrieved ${result.length} active brands`);

        res.json({
            success: true,
            status: 200,
            message: 'Active brands retrieved successfully',
            data: {
                brands: result
            }
        });
    } catch (error) {
        logger.error(`[Vehicle Branding] Error fetching active brands: ${error.message}`);
        next(new AppError(`Failed to fetch active brands: ${error.message}`, 500));
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// GET BRAND STATISTICS
// ═══════════════════════════════════════════════════════════════════════════

const getBrandStats = async (req, res, next) => {
    try {
        logger.info('[Vehicle Branding] Fetching brand statistics');

        const stats = await query(`
            SELECT 
                COUNT(*) as total_brands,
                SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) as active_brands,
                SUM(CASE WHEN is_active = 0 THEN 1 ELSE 0 END) as inactive_brands,
                COUNT(DISTINCT vm.id) as total_makes,
                COUNT(DISTINCT v.id) as total_vehicles
            FROM \`vehicle_brands\` vb
            LEFT JOIN \`vehicle_makes\` vm ON vb.id = vm.brand_id
            LEFT JOIN \`vehicle_models\` vmo ON vm.id = vmo.make_id
            LEFT JOIN \`vehicle_variants\` vv ON vmo.id = vv.model_id
            LEFT JOIN \`vehicles\` v ON vv.id = v.variant_id AND v.is_active = TRUE
            WHERE vb.deleted_at IS NULL
        `);

        logger.info('[Vehicle Branding] Statistics retrieved successfully');

        res.json({
            success: true,
            status: 200,
            message: 'Statistics retrieved successfully',
            data: {
                stats: stats[0] || {}
            }
        });
    } catch (error) {
        logger.error(`[Vehicle Branding] Error fetching statistics: ${error.message}`);
        next(new AppError(`Failed to fetch statistics: ${error.message}`, 500));
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// BULK UPDATE STATUS
// ═══════════════════════════════════════════════════════════════════════════

const bulkUpdateStatus = async (req, res, next) => {
    try {
        const { brandIds, is_active } = req.body;

        if (!Array.isArray(brandIds) || brandIds.length === 0) {
            return next(new AppError('No brand IDs provided', 400));
        }

        const userId = req.user?.id || 1;

        logger.info(`[Vehicle Branding] Bulk updating status for ${brandIds.length} brands`);

        const placeholders = brandIds.map(() => '?').join(',');
        const updateParams = [is_active ? 1 : 0, userId, ...brandIds];

        await query(
            `UPDATE vehicle_brands 
             SET is_active = ?, updated_by = ? 
             WHERE deleted_at IS NULL AND id IN (${placeholders})`,
            updateParams
        );

        logger.info(`[Vehicle Branding] Bulk status update completed for ${brandIds.length} brands`);

        res.json({
            success: true,
            status: 200,
            message: `${brandIds.length} brands updated successfully`,
            data: {
                updatedCount: brandIds.length
            }
        });
    } catch (error) {
        logger.error(`[Vehicle Branding] Error bulk updating status: ${error.message}`);
        next(new AppError(`Failed to update brands: ${error.message}`, 500));
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════════════════════════════════

module.exports = {
    getAllBrands,
    getBrandById,
    createBrand,
    updateBrand,
    deleteBrand,
    getActiveBrands,
    getBrandStats,
    bulkUpdateStatus
};
