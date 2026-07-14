const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const ctrl = require('../controllers/warehouseManagement.controller');

/**
 * @swagger
 * tags:
 *   name: Warehouses
 *   description: Warehouse management
 */

/**
 * @swagger
 * /api/warehouses/stats:
 *   get:
 *     summary: Get warehouse statistics
 *     tags: [Warehouses]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Stats retrieved
 */
router.get('/stats', authenticate, ctrl.getWarehouseStats);

/**
 * @swagger
 * /api/warehouses/cities/list:
 *   get:
 *     summary: Get list of cities with warehouses
 *     tags: [Warehouses]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Cities list
 */
router.get('/cities/list', authenticate, ctrl.getCities);

/**
 * @swagger
 * /api/warehouses:
 *   get:
 *     summary: Get all warehouses with pagination, search, and filters
 *     tags: [Warehouses]
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
 *         schema: { type: integer, default: 15 }
 *     responses:
 *       200:
 *         description: List of warehouses
 *   post:
 *     summary: Create a warehouse
 *     tags: [Warehouses]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [warehouseName, code]
 *             properties:
 *               warehouseName: { type: string }
 *               code: { type: string }
 *               type: { type: string }
 *               manager: { type: string }
 *               phone: { type: string }
 *               email: { type: string }
 *               address: { type: string }
 *               city: { type: string }
 *               capacity: { type: integer }
 *               isActive: { type: boolean }
 *     responses:
 *       201:
 *         description: Created
 */
router.get('/', authenticate, ctrl.getAllWarehouses);
router.post('/', authenticate, ctrl.createWarehouse);

/**
 * @swagger
 * /api/warehouses/{id}:
 *   get:
 *     summary: Get a warehouse by ID
 *     tags: [Warehouses]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Warehouse details
 *   put:
 *     summary: Update a warehouse
 *     tags: [Warehouses]
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
 *     summary: Delete a warehouse
 *     tags: [Warehouses]
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
router.get('/:id', authenticate, ctrl.getWarehouseById);
router.put('/:id', authenticate, ctrl.updateWarehouse);
router.delete('/:id', authenticate, ctrl.deleteWarehouse);

module.exports = router;
