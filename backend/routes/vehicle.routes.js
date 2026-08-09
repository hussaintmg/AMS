/**
 * Vehicle Inventory Routes
 * Full CRUD operations for vehicle inventory management
 * Maintained by Hussain Developer
 * hussaintmerng@gmail.com | +92 319 1634446
 * AMS ERP
 * Date: 2026-01-06
 */

const express = require('express');
const router = express.Router();
const { fieldMask } = require('../utils/fieldPermissions');

// Withhold the columns this role may not read, whatever the endpoint returns.
router.use(fieldMask('vehicles'));
const { authenticate, authorizeAction } = require('../middleware/auth');
const vehicleController = require('../controllers/vehicleInventory.controller');
const { query } = require('../config/database');

const canView = authorizeAction('vehicles', 'view');
const canCreate = authorizeAction('vehicles', 'create');
const canEdit = authorizeAction('vehicles', 'edit');
const canDelete = authorizeAction('vehicles', 'delete');


// Reference data routes (must come before /:id routes)
router.get('/stats', authenticate, canView, vehicleController.getVehicleStats);
router.get('/warehouses/list', authenticate, canView, vehicleController.getWarehouses);

// Makes, Models, Variants, Colors - Reference data for dropdowns
router.get('/makes/list', authenticate, canView, vehicleController.getMakesList);
router.get('/models/list', authenticate, canView, vehicleController.getModelsList);
router.get('/variants/list', authenticate, canView, vehicleController.getVariantsList);
router.get('/colors/list', authenticate, canView, vehicleController.getColorsList);

// CRUD routes
router.get('/', authenticate, canView, vehicleController.getAllVehicles);
router.get('/:id', authenticate, canView, vehicleController.getVehicleById);
router.post('/', authenticate, canCreate, vehicleController.createVehicle);
router.put('/:id', authenticate, canEdit, vehicleController.updateVehicle);
router.delete('/:id', authenticate, canDelete, vehicleController.deleteVehicle);

// Status update
router.patch('/:id/status', authenticate, canEdit, vehicleController.updateVehicleStatus);

module.exports = router;
