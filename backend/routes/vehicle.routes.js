/**
 * Vehicle Inventory Routes
 * Full CRUD operations for vehicle inventory management
 * Created by LOGIXINVENTOR (PVT) Ltd.
 * info@logixinventor.com +92 333 3836851
 * www.logixinventor.com | AMS
 * Date: 2026-01-06
 */

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const vehicleController = require('../controllers/vehicleInventory.controller');
const { query } = require('../config/database');

// Reference data routes (must come before /:id routes)
router.get('/stats', authenticate, vehicleController.getVehicleStats);
router.get('/warehouses/list', authenticate, vehicleController.getWarehouses);

// Makes, Models, Variants, Colors - Reference data for dropdowns
router.get('/makes/list', authenticate, vehicleController.getMakesList);
router.get('/models/list', authenticate, vehicleController.getModelsList);
router.get('/variants/list', authenticate, vehicleController.getVariantsList);
router.get('/colors/list', authenticate, vehicleController.getColorsList);

// CRUD routes
router.get('/', authenticate, vehicleController.getAllVehicles);
router.get('/:id', authenticate, vehicleController.getVehicleById);
router.post('/', authenticate, vehicleController.createVehicle);
router.put('/:id', authenticate, vehicleController.updateVehicle);
router.delete('/:id', authenticate, vehicleController.deleteVehicle);

// Status update
router.patch('/:id/status', authenticate, vehicleController.updateVehicleStatus);

module.exports = router;
