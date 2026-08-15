/**
 * Parts Inventory Routes
 * Full CRUD operations for vehicle parts inventory
 * Maintained by Hussain Developer
 * hussaintmerng@gmail.com | +92 319 1634446
 * AMS ERP
 * Date: 2026-01-06
 *
 * Every route is guarded by the role's `parts` page permission and the specific
 * action it performs, so a role that was never granted the Parts page cannot
 * reach parts data by calling the API directly.
 */

const express = require('express');
const router = express.Router();
const { fieldMask } = require('../utils/fieldPermissions');

// Withhold the columns this role may not read, whatever the endpoint returns.
router.use(fieldMask('parts'));
const { authenticate, authorizeAction } = require('../middleware/auth');
const partsController = require('../controllers/partsInventory.controller');

const canView = authorizeAction('parts', 'view');
const canCreate = authorizeAction('parts', 'create');
const canEdit = authorizeAction('parts', 'edit');
const canDelete = authorizeAction('parts', 'delete');

// Raising and lowering are separate grants, so the direction in the request
// decides which one an adjust call needs. Each direction gets its own route
// below — that keeps a real, statically-auditable guard on each — and
// `whenType` passes a request on to the next route until the direction fits.
const whenType = (...types) => (req, res, next) =>
    (types.includes(String(req.body?.adjustmentType || '').toLowerCase()) ? next() : next('route'));

// Reference data routes (must come before /:id routes)
router.get('/stats', authenticate, canView, partsController.getPartStats);
router.get('/low-stock', authenticate, canView, partsController.getLowStockParts);
router.get('/categories/list', authenticate, canView, partsController.getCategories);
router.get('/suppliers/list', authenticate, canView, partsController.getSuppliers);

// Source types (Manufacturer / 3rd Party / dealer-defined) — client managed
router.get('/source-types/list', authenticate, canView, partsController.getSourceTypes);
router.post('/source-types', authenticate, canCreate, partsController.createSourceType);
router.put('/source-types/:id', authenticate, canEdit, partsController.updateSourceType);
router.delete('/source-types/:id', authenticate, canDelete, partsController.deleteSourceType);

// CRUD routes
router.get('/', authenticate, canView, partsController.getAllParts);
router.get('/:id', authenticate, canView, partsController.getPartById);
router.post('/', authenticate, canCreate, partsController.createPart);
router.put('/:id', authenticate, canEdit, partsController.updatePart);
router.delete('/:id', authenticate, canDelete, partsController.deletePart);

// Raising or lowering a holding is its own pair of grants (Role Jobs →
// "Increase stock" / "Decrease stock"), separate from editing the part record.
router.post('/:id/adjust', authenticate, whenType('increase'), authorizeAction('parts', 'stockIncrease'), partsController.adjustStock);
router.post('/:id/adjust', authenticate, whenType('decrease'), authorizeAction('parts', 'stockDecrease'), partsController.adjustStock);
// "set" can move the level either way, so which grant it needs is only known
// once the current stock is read — the controller enforces the direction; this
// route just proves page access.
router.post('/:id/adjust', authenticate, canView, partsController.adjustStock);

module.exports = router;
