/**
 * Parts Inventory Routes
 * Full CRUD operations for vehicle parts inventory
 * Maintained by Hussain Developer
 * hussaintmerng@gmail.com | +92 319 1634446
 * AMS ERP
 * Date: 2026-01-06
 */

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const partsController = require('../controllers/partsInventory.controller');

// Reference data routes (must come before /:id routes)
router.get('/stats', authenticate, partsController.getPartStats);
router.get('/low-stock', authenticate, partsController.getLowStockParts);
router.get('/categories/list', authenticate, partsController.getCategories);
router.get('/suppliers/list', authenticate, partsController.getSuppliers);

// CRUD routes
router.get('/', authenticate, partsController.getAllParts);
router.get('/:id', authenticate, partsController.getPartById);
router.post('/', authenticate, partsController.createPart);
router.put('/:id', authenticate, partsController.updatePart);
router.delete('/:id', authenticate, partsController.deletePart);

// Stock adjustment
router.post('/:id/adjust', authenticate, partsController.adjustStock);

module.exports = router;
