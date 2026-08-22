/**
 * Quotation Routes
 * Full CRUD operations with role-based permissions
 * Maintained by Hussain Developer
 * hussaintmerng@gmail.com | +92 319 1634446
 * AMS ERP
 * Date: 2026-01-06
 * 
 * @swagger
 * tags:
 *   - name: Quotations
 *     description: Quotation management CRUD operations
 */

const express = require('express');
const router = express.Router();
const { fieldMask } = require('../utils/fieldPermissions');

// Withhold the columns this role may not read, whatever the endpoint returns.
router.use(fieldMask('quotations'));
const { authenticate, authorizeAction, authorizeAny } = require('../middleware/auth');

/**
 * Reading a quotation needs the page too.
 *
 * Every write here was guarded and none of the reads were, so any signed-in
 * account could fetch the whole quotation book — customer, phone, line items,
 * totals — from an endpoint whose page it had never been given. Field masking
 * did not cover it either: a role with no job for this page counts as
 * unrestricted, so it got the full record rather than a trimmed one.
 */
const canView = authorizeAction('quotations', 'view');
const salesController = require('../controllers/salesManagement.controller');
const bulkPermission = require('../middleware/bulkSalesPermission');

/**
 * @swagger
 * /api/quotations/stats:
 *   get:
 *     tags: [Quotations]
 *     summary: Get quotation statistics
 *     security: [{ bearerAuth: [] }]
 */
router.get('/stats', authenticate, canView, salesController.getQuotationStats);
router.post('/bulk', authenticate, bulkPermission('quotations'), salesController.bulkSalesDocuments);

/**
 * @swagger
 * /api/quotations:
 *   get:
 *     tags: [Quotations]
 *     summary: Get all quotations with pagination and filters
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: status
 *         in: query
 *         schema: { type: string, enum: [draft, sent, accepted, rejected, expired, converted] }
 *       - name: customerId
 *         in: query
 *         schema: { type: integer }
 *       - name: search
 *         in: query
 *         schema: { type: string }
 *       - name: page
 *         in: query
 *         schema: { type: integer, default: 1 }
 *       - name: limit
 *         in: query
 *         schema: { type: integer, default: 25 }
 */
router.get('/', authenticate, canView, salesController.getAllQuotations);

/**
 * @swagger
 * /api/quotations/{id}:
 *   get:
 *     tags: [Quotations]
 *     summary: Get quotation by ID
 *     security: [{ bearerAuth: [] }]
 */
router.get('/:id', authenticate, canView, salesController.getQuotationById);

/**
 * @swagger
 * /api/quotations:
 *   post:
 *     tags: [Quotations]
 *     summary: Create new quotation
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [vehicleVariantId, vehiclePrice]
 *             properties:
 *               customerId: { type: integer }
 *               leadId: { type: integer }
 *               vehicleVariantId: { type: integer }
 *               vehicleColorId: { type: integer }
 *               vehiclePrice: { type: number }
 *               discountAmount: { type: number }
 *               taxAmount: { type: number }
 *               validityDays: { type: integer, default: 7 }
 */
router.post('/', authenticate, authorizeAction('quotations', 'create'), salesController.createQuotation);

router.post('/:id/send-email', authenticate, authorizeAction('quotations', 'sendEmail'), salesController.sendQuotationEmail);

/**
 * @swagger
 * /api/quotations/{id}:
 *   put:
 *     tags: [Quotations]
 *     summary: Update quotation
 *     security: [{ bearerAuth: [] }]
 */
router.put('/:id', authenticate, authorizeAction('quotations', 'edit'), salesController.updateQuotation);

/**
 * @swagger
 * /api/quotations/{id}:
 *   delete:
 *     tags: [Quotations]
 *     summary: Delete (cancel) quotation
 *     security: [{ bearerAuth: [] }]
 */
router.delete('/:id', authenticate, authorizeAction('quotations', 'delete'), salesController.deleteQuotation);

/**
 * @swagger
 * /api/quotations/{id}/status:
 *   patch:
 *     tags: [Quotations]
 *     summary: Update quotation status
 *     security: [{ bearerAuth: [] }]
 */
router.patch('/:id/status', authenticate, authorizeAction('quotations', 'edit'), salesController.updateQuotationStatus);

/**
 * @swagger
 * /api/quotations/{id}/approve:
 *   post:
 *     tags: [Quotations]
 *     summary: Approve or reject a quotation (required before it can become a booking)
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               decision: { type: string, enum: [approved, rejected, pending] }
 *               notes: { type: string }
 */
router.post('/:id/approve', authenticate, authorizeAction('quotations', 'approve'), salesController.approveQuotation);

/**
 * @swagger
 * /api/quotations/{id}/estimate/pdf:
 *   get:
 *     tags: [Quotations]
 *     summary: Download the estimate PDF (lists every product on the quotation)
 *     security: [{ bearerAuth: [] }]
 */
router.get('/:id/estimate/pdf', authenticate, authorizeAction('quotations', 'downloadPdf'), salesController.downloadQuotationEstimate);

/**
 * @swagger
 * /api/quotations/{id}/estimate/email:
 *   post:
 *     tags: [Quotations]
 *     summary: Email the estimate (PDF attached, all products itemised) to the customer
 *     security: [{ bearerAuth: [] }]
 */
router.post('/:id/estimate/email', authenticate, authorizeAction('quotations', 'sendEmail'), salesController.sendQuotationEstimateEmail);

/**
 * @swagger
 * /api/quotations/{id}/convert:
 *   post:
 *     tags: [Quotations]
 *     summary: Convert an approved quotation to a booking
 *     security: [{ bearerAuth: [] }]
 */
// Convert is its own right now that the checkbox exists; edit still counts, so
// a role that has been converting all along does not lose it overnight.
router.post('/:id/convert', authenticate, authorizeAny(authorizeAction('quotations', 'convert'), authorizeAction('quotations', 'edit')), salesController.convertQuotationToBooking);

module.exports = router;
