const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/serviceMasterController');
const { authenticate, authorizeAction } = require('../middleware/auth');

/**
 * @swagger
 * tags:
 *   name: Service Master Data
 *   description: Service Types, Labor Rates, Service Packages, Warranty Types
 */

// ═══════════════════════════════════════════════════════════════════════════
// STATS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * @swagger
 * /api/service-master/stats:
 *   get:
 *     summary: Get counts for all service master entities
 *     tags: [Service Master Data]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Stats retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     serviceTypes:
 *                       type: number
 *                     laborRates:
 *                       type: number
 *                     packages:
 *                       type: number
 *                     warranties:
 *                       type: number
 */
router.get('/stats', authenticate, ctrl.getStats);

// ═══════════════════════════════════════════════════════════════════════════
// SERVICE TYPES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * @swagger
 * /api/service-master/types:
 *   get:
 *     summary: Get all service types
 *     tags: [Service Master Data]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *       - in: query
 *         name: is_active
 *         schema: { type: boolean }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 100 }
 *     responses:
 *       200:
 *         description: List of service types
 */
router.get('/types', authenticate, ctrl.getServiceTypes);

/**
 * @swagger
 * /api/service-master/types:
 *   post:
 *     summary: Create a service type
 *     tags: [Service Master Data]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name: { type: string }
 *               code: { type: string }
 *               description: { type: string }
 *               basePrice: { type: number }
 *               estimatedHours: { type: number }
 *               category: { type: string }
 *               isActive: { type: boolean }
 *     responses:
 *       201:
 *         description: Created
 */
router.post('/types', authenticate, authorizeAction('service_master', 'create'), ctrl.createServiceType);

/**
 * @swagger
 * /api/service-master/types/{id}:
 *   put:
 *     summary: Update a service type
 *     tags: [Service Master Data]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Updated
 *   delete:
 *     summary: Delete a service type
 *     tags: [Service Master Data]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Deleted
 */
router.put('/types/:id', authenticate, authorizeAction('service_master', 'edit'), ctrl.updateServiceType);
router.delete('/types/:id', authenticate, authorizeAction('service_master', 'delete'), ctrl.deleteServiceType);

// ═══════════════════════════════════════════════════════════════════════════
// LABOR RATES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * @swagger
 * /api/service-master/labor-rates:
 *   get:
 *     summary: Get all labor rates
 *     tags: [Service Master Data]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *       - in: query
 *         name: is_active
 *         schema: { type: boolean }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 100 }
 *     responses:
 *       200:
 *         description: List of labor rates
 *   post:
 *     summary: Create a labor rate
 *     tags: [Service Master Data]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name: { type: string }
 *               code: { type: string }
 *               rate: { type: number }
 *               duration: { type: number }
 *               description: { type: string }
 *               isActive: { type: boolean }
 *     responses:
 *       201:
 *         description: Created
 */
router.get('/labor-rates', authenticate, ctrl.getLaborRates);
router.post('/labor-rates', authenticate, authorizeAction('service_master', 'create'), ctrl.createLaborRate);

/**
 * @swagger
 * /api/service-master/labor-rates/{id}:
 *   put:
 *     summary: Update a labor rate
 *     tags: [Service Master Data]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Updated
 *   delete:
 *     summary: Delete a labor rate
 *     tags: [Service Master Data]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Deleted
 */
router.put('/labor-rates/:id', authenticate, authorizeAction('service_master', 'edit'), ctrl.updateLaborRate);
router.delete('/labor-rates/:id', authenticate, authorizeAction('service_master', 'delete'), ctrl.deleteLaborRate);

// ═══════════════════════════════════════════════════════════════════════════
// SERVICE PACKAGES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * @swagger
 * /api/service-master/packages:
 *   get:
 *     summary: Get all service packages
 *     tags: [Service Master Data]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *       - in: query
 *         name: is_active
 *         schema: { type: boolean }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 100 }
 *     responses:
 *       200:
 *         description: List of packages
 *   post:
 *     summary: Create a service package
 *     tags: [Service Master Data]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [packageName]
 *             properties:
 *               packageName: { type: string }
 *               services:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     name: { type: string }
 *                     quantity: { type: integer }
 *                     price: { type: number }
 *               price: { type: number }
 *               duration: { type: number }
 *               warranty: { type: string }
 *               description: { type: string }
 *               isActive: { type: boolean }
 *     responses:
 *       201:
 *         description: Created
 */
router.get('/packages', authenticate, ctrl.getServicePackages);
router.post('/packages', authenticate, authorizeAction('service_master', 'create'), ctrl.createServicePackage);

/**
 * @swagger
 * /api/service-master/packages/{id}:
 *   get:
 *     summary: Get a service package by ID
 *     tags: [Service Master Data]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Package details
 *   put:
 *     summary: Update a service package
 *     tags: [Service Master Data]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Updated
 *   delete:
 *     summary: Delete a service package
 *     tags: [Service Master Data]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Deleted
 */
router.get('/packages/:id', authenticate, ctrl.getPackageById);
router.put('/packages/:id', authenticate, authorizeAction('service_master', 'edit'), ctrl.updateServicePackage);
router.delete('/packages/:id', authenticate, authorizeAction('service_master', 'delete'), ctrl.deleteServicePackage);

// ═══════════════════════════════════════════════════════════════════════════
// WARRANTY TYPES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * @swagger
 * /api/service-master/warranties:
 *   get:
 *     summary: Get all warranty types
 *     tags: [Service Master Data]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *       - in: query
 *         name: is_active
 *         schema: { type: boolean }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 100 }
 *     responses:
 *       200:
 *         description: List of warranty types
 *   post:
 *     summary: Create a warranty type
 *     tags: [Service Master Data]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name: { type: string }
 *               code: { type: string }
 *               description: { type: string }
 *               durationMonths: { type: integer }
 *               durationKm: { type: integer }
 *               terms: { type: string }
 *               isActive: { type: boolean }
 *     responses:
 *       201:
 *         description: Created
 */
router.get('/warranties', authenticate, ctrl.getWarrantyTypes);
router.post('/warranties', authenticate, authorizeAction('service_master', 'create'), ctrl.createWarrantyType);

/**
 * @swagger
 * /api/service-master/warranties/{id}:
 *   put:
 *     summary: Update a warranty type
 *     tags: [Service Master Data]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Updated
 *   delete:
 *     summary: Delete a warranty type
 *     tags: [Service Master Data]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Deleted
 */
router.put('/warranties/:id', authenticate, authorizeAction('service_master', 'edit'), ctrl.updateWarrantyType);
router.delete('/warranties/:id', authenticate, authorizeAction('service_master', 'delete'), ctrl.deleteWarrantyType);

module.exports = router;
