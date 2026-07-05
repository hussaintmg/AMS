/**
 * Vehicle Master Data Routes
 * RESTful API routes for managing vehicle makes, models, variants, and colors
 * Created by LOGIXINVENTOR (PVT) Ltd.
 * info@logixinventor.com +92 333 3836851
 * www.logixinventor.com | AMS
 * Date: 2026-01-08
 */

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const vehicleMasterController = require('../controllers/vehicleMaster.controller');

/**
 * @swagger
 * tags:
 *   name: Vehicle Master Data
 *   description: Vehicle makes, models, variants, and colors management
 */

// ═══════════════════════════════════════════════════════════════════════════
// STATS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * @swagger
 * /api/vehicle-master/stats:
 *   get:
 *     summary: Get vehicle master data statistics
 *     tags: [Vehicle Master Data]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Statistics retrieved successfully
 */
router.get('/stats', authenticate, vehicleMasterController.getStats);

// ═══════════════════════════════════════════════════════════════════════════
// MAKES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * @swagger
 * /api/vehicle-master/makes:
 *   get:
 *     summary: Get all vehicle makes
 *     tags: [Vehicle Master Data]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by name
 *       - in: query
 *         name: is_active
 *         schema:
 *           type: boolean
 *         description: Filter by active status
 *     responses:
 *       200:
 *         description: Makes retrieved successfully
 */
router.get('/makes', authenticate, vehicleMasterController.getMakes);

/**
 * @swagger
 * /api/vehicle-master/makes:
 *   post:
 *     summary: Create a new vehicle make
 *     tags: [Vehicle Master Data]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *               country:
 *                 type: string
 *               logo:
 *                 type: string
 *               isActive:
 *                 type: boolean
 *     responses:
 *       201:
 *         description: Make created successfully
 */
router.post('/makes', authenticate, vehicleMasterController.createMake);

/**
 * @swagger
 * /api/vehicle-master/makes/{id}:
 *   put:
 *     summary: Update a vehicle make
 *     tags: [Vehicle Master Data]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               country:
 *                 type: string
 *               logo:
 *                 type: string
 *               isActive:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Make updated successfully
 */
router.put('/makes/:id', authenticate, vehicleMasterController.updateMake);

/**
 * @swagger
 * /api/vehicle-master/makes/{id}:
 *   delete:
 *     summary: Delete a vehicle make
 *     tags: [Vehicle Master Data]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Make deleted successfully
 */
router.delete('/makes/:id', authenticate, vehicleMasterController.deleteMake);

// ═══════════════════════════════════════════════════════════════════════════
// MODELS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * @swagger
 * /api/vehicle-master/models:
 *   get:
 *     summary: Get all vehicle models
 *     tags: [Vehicle Master Data]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: make_id
 *         schema:
 *           type: integer
 *         description: Filter by make
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Models retrieved successfully
 */
router.get('/models', authenticate, vehicleMasterController.getModels);

/**
 * @swagger
 * /api/vehicle-master/models:
 *   post:
 *     summary: Create a new vehicle model
 *     tags: [Vehicle Master Data]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - makeId
 *               - name
 *             properties:
 *               makeId:
 *                 type: integer
 *               name:
 *                 type: string
 *               year:
 *                 type: integer
 *               bodyType:
 *                 type: string
 *               fuelType:
 *                 type: string
 *               transmission:
 *                 type: string
 *               engineCapacity:
 *                 type: string
 *               seatingCapacity:
 *                 type: integer
 *     responses:
 *       201:
 *         description: Model created successfully
 */
router.post('/models', authenticate, vehicleMasterController.createModel);

/**
 * @swagger
 * /api/vehicle-master/models/{id}:
 *   put:
 *     summary: Update a vehicle model
 *     tags: [Vehicle Master Data]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Model updated successfully
 */
router.put('/models/:id', authenticate, vehicleMasterController.updateModel);

/**
 * @swagger
 * /api/vehicle-master/models/{id}:
 *   delete:
 *     summary: Delete a vehicle model
 *     tags: [Vehicle Master Data]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Model deleted successfully
 */
router.delete('/models/:id', authenticate, vehicleMasterController.deleteModel);

// ═══════════════════════════════════════════════════════════════════════════
// VARIANTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * @swagger
 * /api/vehicle-master/variants:
 *   get:
 *     summary: Get all vehicle variants
 *     tags: [Vehicle Master Data]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: model_id
 *         schema:
 *           type: integer
 *       - in: query
 *         name: make_id
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Variants retrieved successfully
 */
router.get('/variants', authenticate, vehicleMasterController.getVariants);

/**
 * @swagger
 * /api/vehicle-master/variants:
 *   post:
 *     summary: Create a new vehicle variant
 *     tags: [Vehicle Master Data]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - modelId
 *               - name
 *             properties:
 *               modelId:
 *                 type: integer
 *               name:
 *                 type: string
 *               basePrice:
 *                 type: number
 *               features:
 *                 type: string
 *     responses:
 *       201:
 *         description: Variant created successfully
 */
router.post('/variants', authenticate, vehicleMasterController.createVariant);

/**
 * @swagger
 * /api/vehicle-master/variants/{id}:
 *   put:
 *     summary: Update a vehicle variant
 *     tags: [Vehicle Master Data]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Variant updated successfully
 */
router.put('/variants/:id', authenticate, vehicleMasterController.updateVariant);

/**
 * @swagger
 * /api/vehicle-master/variants/{id}:
 *   delete:
 *     summary: Delete a vehicle variant
 *     tags: [Vehicle Master Data]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Variant deleted successfully
 */
router.delete('/variants/:id', authenticate, vehicleMasterController.deleteVariant);

// ═══════════════════════════════════════════════════════════════════════════
// COLORS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * @swagger
 * /api/vehicle-master/colors:
 *   get:
 *     summary: Get all vehicle colors
 *     tags: [Vehicle Master Data]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Colors retrieved successfully
 */
router.get('/colors', authenticate, vehicleMasterController.getColors);

/**
 * @swagger
 * /api/vehicle-master/colors:
 *   post:
 *     summary: Create a new vehicle color
 *     tags: [Vehicle Master Data]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *               hexCode:
 *                 type: string
 *               isMetallic:
 *                 type: boolean
 *               additionalCost:
 *                 type: number
 *     responses:
 *       201:
 *         description: Color created successfully
 */
router.post('/colors', authenticate, vehicleMasterController.createColor);

/**
 * @swagger
 * /api/vehicle-master/colors/{id}:
 *   put:
 *     summary: Update a vehicle color
 *     tags: [Vehicle Master Data]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Color updated successfully
 */
router.put('/colors/:id', authenticate, vehicleMasterController.updateColor);

/**
 * @swagger
 * /api/vehicle-master/colors/{id}:
 *   delete:
 *     summary: Delete a vehicle color
 *     tags: [Vehicle Master Data]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Color deleted successfully
 */
router.delete('/colors/:id', authenticate, vehicleMasterController.deleteColor);

// ═══════════════════════════════════════════════════════════════════════════
// PART CATEGORIES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * @swagger
 * /api/vehicle-master/categories:
 *   get:
 *     summary: Get all part categories
 *     tags: [Vehicle Master Data]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by name or description
 *       - in: query
 *         name: is_active
 *         schema:
 *           type: boolean
 *         description: Filter by active status
 *       - in: query
 *         name: parent_id
 *         schema:
 *           type: integer
 *         description: Filter by parent category (0 for root categories)
 *     responses:
 *       200:
 *         description: Categories retrieved successfully
 */
router.get('/categories', authenticate, vehicleMasterController.getCategories);

/**
 * @swagger
 * /api/vehicle-master/categories:
 *   post:
 *     summary: Create a new part category
 *     tags: [Vehicle Master Data]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               parentId:
 *                 type: integer
 *               isActive:
 *                 type: boolean
 *     responses:
 *       201:
 *         description: Category created successfully
 */
router.post('/categories', authenticate, vehicleMasterController.createCategory);

/**
 * @swagger
 * /api/vehicle-master/categories/{id}:
 *   put:
 *     summary: Update a part category
 *     tags: [Vehicle Master Data]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               parentId:
 *                 type: integer
 *               isActive:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Category updated successfully
 */
router.put('/categories/:id', authenticate, vehicleMasterController.updateCategory);

/**
 * @swagger
 * /api/vehicle-master/categories/{id}:
 *   delete:
 *     summary: Delete a part category
 *     tags: [Vehicle Master Data]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Category deleted successfully
 */
router.delete('/categories/:id', authenticate, vehicleMasterController.deleteCategory);

// ═══════════════════════════════════════════════════════════════════════════
// SUPPLIERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * @swagger
 * /api/vehicle-master/suppliers:
 *   get:
 *     summary: Get all suppliers
 *     tags: [Vehicle Master Data]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Suppliers retrieved successfully
 */
router.get('/suppliers', authenticate, vehicleMasterController.getSuppliers);

/**
 * @swagger
 * /api/vehicle-master/suppliers:
 *   post:
 *     summary: Create a new supplier
 *     tags: [Vehicle Master Data]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - supplierCode
 *               - name
 *               - type
 *     responses:
 *       201:
 *         description: Supplier created successfully
 */
router.post('/suppliers', authenticate, vehicleMasterController.createSupplier);

/**
 * @swagger
 * /api/vehicle-master/suppliers/{id}:
 *   put:
 *     summary: Update a supplier
 *     tags: [Vehicle Master Data]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Supplier updated successfully
 */
router.put('/suppliers/:id', authenticate, vehicleMasterController.updateSupplier);

/**
 * @swagger
 * /api/vehicle-master/suppliers/{id}:
 *   delete:
 *     summary: Delete a supplier
 *     tags: [Vehicle Master Data]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Supplier deleted successfully
 */
router.delete('/suppliers/:id', authenticate, vehicleMasterController.deleteSupplier);

module.exports = router;
