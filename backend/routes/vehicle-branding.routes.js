/**
 * Vehicle Branding Routes
 * API endpoints for vehicle brand management
 * Created by LOGIXINVENTOR (PVT) Ltd.
 * info@logixinventor.com +92 333 3836851
 * www.logixinventor.com | AMS
 * Date: 2026-05-08
 */

const express = require('express');
const router = express.Router();
const vehicleBrandingController = require('../controllers/vehicleBranding.controller');
const { authenticate, authorize } = require('../middleware/auth');
const { validateRequest } = require('../middleware/validation');
const logger = require('../utils/logger');

// ═══════════════════════════════════════════════════════════════════════════
// MIDDLEWARE: Authentication & Authorization
// ═══════════════════════════════════════════════════════════════════════════

// All routes require authentication
router.use(authenticate); // Enables token-based access control

// ═══════════════════════════════════════════════════════════════════════════
// GET ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /api/vehicle-branding
 * Get all vehicle brands with pagination and filtering
 * Query Parameters:
 *   - page: Page number (default: 1)
 *   - limit: Items per page (default: 20)
 *   - search: Search term for brand name/description
 *   - is_active: Filter by active status (true/false)
 *   - sortBy: Sort column (default: display_order)
 *   - sortOrder: Sort order ASC/DESC (default: ASC)
 * Roles: super_admin, admin, inventory_manager
 */
router.get(
    '/',
    authorize(['super_admin', 'admin', 'inventory_manager']),
    (req, res, next) => {
        logger.info(`[Route] GET /api/vehicle-branding - Query: ${JSON.stringify(req.query)}`);
        vehicleBrandingController.getAllBrands(req, res, next);
    }
);

/**
 * GET /api/vehicle-branding/active
 * Get all active vehicle brands (for dropdown/select)
 * Roles: super_admin, admin, inventory_manager, sales_manager, sales_executive
 */
router.get(
    '/active',
    authorize(['super_admin', 'admin', 'inventory_manager', 'sales_manager', 'sales_executive']),
    (req, res, next) => {
        logger.info('[Route] GET /api/vehicle-branding/active');
        vehicleBrandingController.getActiveBrands(req, res, next);
    }
);

/**
 * GET /api/vehicle-branding/stats
 * Get vehicle brand statistics
 * Roles: super_admin, admin, inventory_manager
 */
router.get(
    '/stats',
    authorize(['super_admin', 'admin', 'inventory_manager']),
    (req, res, next) => {
        logger.info('[Route] GET /api/vehicle-branding/stats');
        vehicleBrandingController.getBrandStats(req, res, next);
    }
);

/**
 * GET /api/vehicle-branding/:id
 * Get single vehicle brand by ID
 * Roles: super_admin, admin, inventory_manager
 */
router.get(
    '/:id',
    authorize(['super_admin', 'admin', 'inventory_manager']),
    (req, res, next) => {
        logger.info(`[Route] GET /api/vehicle-branding/${req.params.id}`);
        vehicleBrandingController.getBrandById(req, res, next);
    }
);

// ═══════════════════════════════════════════════════════════════════════════
// POST ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * POST /api/vehicle-branding
 * Create new vehicle brand
 * Body:
 *   - name: string (required)
 *   - description: string (optional)
 *   - logo_url: string (optional)
 *   - country_of_origin: string (optional)
 *   - established_year: year (optional)
 *   - website: string (optional)
 * Roles: super_admin, admin, inventory_manager
 */
router.post(
    '/',
    authorize(['super_admin', 'admin', 'inventory_manager']),
    validateRequest({
        name: {
            in: 'body',
            notEmpty: true,
            errorMessage: 'Brand name is required',
            trim: true
        }
    }),
    (req, res, next) => {
        logger.info(`[Route] POST /api/vehicle-branding - Body: ${JSON.stringify(req.body)}`);
        vehicleBrandingController.createBrand(req, res, next);
    }
);

/**
 * POST /api/vehicle-branding/bulk-update-status
 * Bulk update status of multiple brands
 * Body:
 *   - brandIds: array of integers (required)
 *   - is_active: boolean (required)
 * Roles: super_admin, admin, inventory_manager
 */
router.post(
    '/bulk-update-status',
    authorize(['super_admin', 'admin', 'inventory_manager']),
    (req, res, next) => {
        logger.info(`[Route] POST /api/vehicle-branding/bulk-update-status - Body: ${JSON.stringify(req.body)}`);
        vehicleBrandingController.bulkUpdateStatus(req, res, next);
    }
);

// ═══════════════════════════════════════════════════════════════════════════
// PUT ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * PUT /api/vehicle-branding/:id
 * Update vehicle brand
 * Body:
 *   - name: string (required)
 *   - description: string (optional)
 *   - logo_url: string (optional)
 *   - country_of_origin: string (optional)
 *   - established_year: year (optional)
 *   - website: string (optional)
 *   - is_active: boolean (optional)
 *   - display_order: integer (optional)
 * Roles: super_admin, admin, inventory_manager
 */
router.put(
    '/:id',
    authorize(['super_admin', 'admin', 'inventory_manager']),
    validateRequest({
        name: {
            in: 'body',
            notEmpty: true,
            errorMessage: 'Brand name is required',
            trim: true
        }
    }),
    (req, res, next) => {
        logger.info(`[Route] PUT /api/vehicle-branding/${req.params.id} - Body: ${JSON.stringify(req.body)}`);
        vehicleBrandingController.updateBrand(req, res, next);
    }
);

// ═══════════════════════════════════════════════════════════════════════════
// DELETE ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * DELETE /api/vehicle-branding/:id
 * Delete vehicle brand (soft delete)
 * Roles: super_admin, admin, inventory_manager
 */
router.delete(
    '/:id',
    authorize(['super_admin', 'admin', 'inventory_manager']),
    (req, res, next) => {
        logger.info(`[Route] DELETE /api/vehicle-branding/${req.params.id}`);
        vehicleBrandingController.deleteBrand(req, res, next);
    }
);

module.exports = router;
