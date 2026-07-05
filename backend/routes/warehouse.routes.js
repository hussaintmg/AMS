/**
 * Warehouse Management Routes
 * Full CRUD operations for warehouse management
 * Created by LOGIXINVENTOR (PVT) Ltd.
 * info@logixinventor.com +92 333 3836851
 * www.logixinventor.com | AMS
 * Date: 2026-01-07
 */

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const warehouseController = require('../controllers/warehouseManagement.controller');

/**
 * @swagger
 * tags:
 *   name: Warehouses
 *   description: Warehouse management operations
 */

/**
 * @swagger
 * /api/warehouses:
 *   get:
 *     summary: Get all warehouses
 *     tags: [Warehouses]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: Items per page
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by name, code, or city
 *       - in: query
 *         name: city
 *         schema:
 *           type: string
 *         description: Filter by city
 *       - in: query
 *         name: isActive
 *         schema:
 *           type: boolean
 *         description: Filter by active status
 *     responses:
 *       200:
 *         description: List of warehouses
 */

// Reference data routes (must come before /:id routes)
router.get('/stats', authenticate, warehouseController.getWarehouseStats);
router.get('/cities/list', authenticate, warehouseController.getCities);
router.get('/managers/list', authenticate, warehouseController.getManagers);

/**
 * @swagger
 * /api/warehouses:
 *   post:
 *     summary: Create a new warehouse
 *     tags: [Warehouses]
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
 *               - code
 *             properties:
 *               name:
 *                 type: string
 *               code:
 *                 type: string
 *               address:
 *                 type: string
 *               city:
 *                 type: string
 *               phone:
 *                 type: string
 *               email:
 *                 type: string
 *               managerId:
 *                 type: integer
 *               capacity:
 *                 type: integer
 *     responses:
 *       201:
 *         description: Warehouse created successfully
 */

// CRUD routes
router.get('/', authenticate, warehouseController.getAllWarehouses);
router.get('/:id', authenticate, warehouseController.getWarehouseById);
router.post('/', authenticate, warehouseController.createWarehouse);
router.put('/:id', authenticate, warehouseController.updateWarehouse);
router.delete('/:id', authenticate, warehouseController.deleteWarehouse);

/**
 * @swagger
 * /api/warehouses/{id}/inventory:
 *   get:
 *     summary: Get warehouse inventory (vehicles and parts)
 *     tags: [Warehouses]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Warehouse ID
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [all, vehicles, parts]
 *         description: Type of inventory to fetch
 *     responses:
 *       200:
 *         description: Warehouse inventory details
 */

// Inventory route
router.get('/:id/inventory', authenticate, warehouseController.getWarehouseInventory);

module.exports = router;
