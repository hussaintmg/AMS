/**
 * Barcode routes — assign, render and scan inventory barcodes.
 *
 * @swagger
 * tags:
 *   - name: Barcode
 *     description: Inventory barcodes for parts and vehicles
 */
const express = require('express');
const router = express.Router();
const { authenticate, authorizeAction } = require('../middleware/auth');
const barcodeController = require('../controllers/barcode.controller');

// Which page a barcode action belongs to, so role permissions apply per page.
const pageFor = (req) => (req.params.kind === 'vehicle' ? 'vehicles' : 'parts');
const guard = (action) => (req, res, next) => authorizeAction(pageFor(req), action)(req, res, next);

/**
 * @swagger
 * /api/barcode/scan:
 *   post:
 *     tags: [Barcode]
 *     summary: Resolve a scanned barcode / part code / chassis number to a product line item
 *     security: [{ bearerAuth: [] }]
 */
router.post('/scan', authenticate, barcodeController.scan);
router.get('/scan', authenticate, barcodeController.scan);

/**
 * @swagger
 * /api/barcode/search:
 *   get:
 *     tags: [Barcode]
 *     summary: Free-text product lookup for stock that cannot be scanned
 *     security: [{ bearerAuth: [] }]
 */
router.get('/search', authenticate, barcodeController.search);

/**
 * @swagger
 * /api/barcode/{kind}/{id}:
 *   post:
 *     tags: [Barcode]
 *     summary: Assign (or return) the barcode for a part or vehicle
 *     security: [{ bearerAuth: [] }]
 */
/**
 * @swagger
 * /api/barcode/{kind}/labels:
 *   post:
 *     tags: [Barcode]
 *     summary: Printable sheet of labels for many parts or vehicles at once
 *     security: [{ bearerAuth: [] }]
 */
// Assigns a barcode to any selected record that has none, so this needs `edit`.
router.post('/:kind/labels', authenticate, guard('edit'), barcodeController.labels);
router.post('/:kind/backfill', authenticate, guard('edit'), barcodeController.backfill);
router.post('/:kind/:id', authenticate, guard('edit'), barcodeController.assign);

/**
 * @swagger
 * /api/barcode/{kind}/{id}/svg:
 *   get:
 *     tags: [Barcode]
 *     summary: Barcode image (SVG). Add ?download=true to save it.
 *     security: [{ bearerAuth: [] }]
 */
router.get('/:kind/:id/svg', authenticate, guard('view'), barcodeController.svg);

/**
 * @swagger
 * /api/barcode/{kind}/{id}/label:
 *   get:
 *     tags: [Barcode]
 *     summary: Printable barcode label (HTML) with name and price
 *     security: [{ bearerAuth: [] }]
 */
router.get('/:kind/:id/label', authenticate, guard('view'), barcodeController.label);

module.exports = router;
