/**
 * Service Master Data Routes
 * RESTful API for managing Service Types, Labor Rates, Packages, and Warranty
 * Created by LOGIXINVENTOR (PVT) Ltd.
 * info@logixinventor.com +92 333 3836851
 * www.logixinventor.com | AMS
 * Date: 2026-01-09
 */

const express = require('express');
const router = express.Router();
const serviceMasterController = require('../controllers/serviceMasterController');
const { authenticate } = require('../middleware/auth');

// ═══════════════════════════════════════════════════════════════════════════
// STATISTICS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * @swagger
 * /api/service-master/stats:
 *   get:
 *     summary: Get master data statistics
 *     tags: [Service Master Data]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Statistics retrieved successfully
 */
router.get('/stats', authenticate, serviceMasterController.getStats);

// ═══════════════════════════════════════════════════════════════════════════
// SERVICE TYPES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * @swagger
 * /api/service-master/types:
 *   get:
 *     summary: Get all service types
 *     tags: [Service Master Data]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *       - in: query
 *         name: categoryId
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: List of service types
 */
router.get('/types', authenticate, serviceMasterController.getServiceTypes);

/**
 * @swagger
 * /api/service-master/types:
 *   post:
 *     summary: Create new service type
 *     tags: [Service Master Data]
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
 *               - basePrice
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               basePrice:
 *                 type: number
 *               estimatedHours:
 *                 type: number
 *               categoryId:
 *                 type: integer
 *     responses:
 *       201:
 *         description: Created successfully
 */
router.post('/types', authenticate, serviceMasterController.createServiceType);

/**
 * @swagger
 * /api/service-master/types/{id}:
 *   put:
 *     summary: Update service type
 *     tags: [Service Master Data]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Updated successfully
 */
router.put('/types/:id', authenticate, serviceMasterController.updateServiceType);

/**
 * @swagger
 * /api/service-master/types/{id}:
 *   delete:
 *     summary: Delete service type
 *     tags: [Service Master Data]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Deleted successfully
 */
router.delete('/types/:id', authenticate, serviceMasterController.deleteServiceType);

// ═══════════════════════════════════════════════════════════════════════════
// LABOR RATES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * @swagger
 * /api/service-master/labor-rates:
 *   get:
 *     summary: Get all labor rates
 *     tags: [Service Master Data]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of labor rates
 */
router.get('/labor-rates', authenticate, serviceMasterController.getLaborRates);

router.post('/labor-rates', authenticate, serviceMasterController.createLaborRate);
router.put('/labor-rates/:id', authenticate, serviceMasterController.updateLaborRate);
router.delete('/labor-rates/:id', authenticate, serviceMasterController.deleteLaborRate);

// ═══════════════════════════════════════════════════════════════════════════
// SERVICE PACKAGES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * @swagger
 * /api/service-master/packages:
 *   get:
 *     summary: Get all service packages
 *     tags: [Service Master Data]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of packages
 */
router.get('/packages', authenticate, serviceMasterController.getServicePackages);
router.get('/packages/:id', authenticate, serviceMasterController.getPackageById);

router.post('/packages', authenticate, serviceMasterController.createPackage);
router.put('/packages/:id', authenticate, serviceMasterController.updatePackage);
router.delete('/packages/:id', authenticate, serviceMasterController.deletePackage);

// Package Items
router.post('/packages/:id/items', authenticate, serviceMasterController.addPackageItem);
router.delete('/packages/:id/items/:itemId', authenticate, serviceMasterController.removePackageItem);

// ═══════════════════════════════════════════════════════════════════════════
// WARRANTY TYPES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * @swagger
 * /api/service-master/warranties:
 *   get:
 *     summary: Get all warranty types
 *     tags: [Service Master Data]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of warranty types
 */
router.get('/warranties', authenticate, serviceMasterController.getWarranties);

router.post('/warranties', authenticate, serviceMasterController.createWarranty);
router.put('/warranties/:id', authenticate, serviceMasterController.updateWarranty);
router.delete('/warranties/:id', authenticate, serviceMasterController.deleteWarranty);

// ═══════════════════════════════════════════════════════════════════════════
// LOOKUPS
// ═══════════════════════════════════════════════════════════════════════════

router.get('/categories', authenticate, serviceMasterController.getCategories);

module.exports = router;
