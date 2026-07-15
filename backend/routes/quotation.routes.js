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
const { authenticate, authorize } = require('../middleware/auth');
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
router.get('/stats', authenticate, salesController.getQuotationStats);
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
router.get('/', authenticate, salesController.getAllQuotations);

/**
 * @swagger
 * /api/quotations/{id}:
 *   get:
 *     tags: [Quotations]
 *     summary: Get quotation by ID
 *     security: [{ bearerAuth: [] }]
 */
router.get('/:id', authenticate, salesController.getQuotationById);

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
router.post('/', authenticate, authorize('super_admin', 'sales_manager', 'sales_executive'), salesController.createQuotation);

router.post('/:id/send-email', authenticate, authorize('super_admin', 'admin', 'sales_manager', 'sales_executive'), salesController.sendQuotationEmail);

/**
 * @swagger
 * /api/quotations/{id}:
 *   put:
 *     tags: [Quotations]
 *     summary: Update quotation
 *     security: [{ bearerAuth: [] }]
 */
router.put('/:id', authenticate, authorize('super_admin', 'sales_manager'), salesController.updateQuotation);

/**
 * @swagger
 * /api/quotations/{id}:
 *   delete:
 *     tags: [Quotations]
 *     summary: Delete (cancel) quotation
 *     security: [{ bearerAuth: [] }]
 */
router.delete('/:id', authenticate, authorize('super_admin', 'sales_manager'), salesController.deleteQuotation);

/**
 * @swagger
 * /api/quotations/{id}/status:
 *   patch:
 *     tags: [Quotations]
 *     summary: Update quotation status
 *     security: [{ bearerAuth: [] }]
 */
router.patch('/:id/status', authenticate, authorize('super_admin', 'sales_manager'), salesController.updateQuotationStatus);

/**
 * @swagger
 * /api/quotations/{id}/convert:
 *   post:
 *     tags: [Quotations]
 *     summary: Convert quotation to booking
 *     security: [{ bearerAuth: [] }]
 */
router.post('/:id/convert', authenticate, authorize('super_admin', 'sales_manager'), salesController.convertQuotationToBooking);

module.exports = router;
