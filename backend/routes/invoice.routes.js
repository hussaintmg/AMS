/**
 * Invoice Routes
 * Full CRUD operations with role-based permissions
 * Maintained by Hussain Developer
 * hussaintmerng@gmail.com | +92 319 1634446
 * AMS ERP
 * Date: 2026-01-08
 * 
 * @swagger
 * tags:
 *   - name: Invoices
 *     description: Invoice management CRUD operations
 */

const express = require('express');
const router = express.Router();
const { fieldMask } = require('../utils/fieldPermissions');

// Withhold the columns this role may not read, whatever the endpoint returns.
router.use(fieldMask('invoices'));
const { authenticate, authorizeAction } = require('../middleware/auth');

/** Reading an invoice needs the page — see the note in quotation.routes.js. */
const canView = authorizeAction('invoices', 'view');
const invoiceController = require('../controllers/invoiceManagement.controller');
const bulkPermission = require('../middleware/bulkSalesPermission');

/**
 * @swagger
 * /api/invoices/stats:
 *   get:
 *     tags: [Invoices]
 *     summary: Get invoice statistics
 *     security: [{ bearerAuth: [] }]
 */
router.get('/stats', authenticate, canView, invoiceController.getInvoiceStats);
// Card figures: total / paid / credit / outstanding / overdue.
router.get('/summary', authenticate, canView, invoiceController.getInvoiceSummary);
router.post('/bulk', authenticate, bulkPermission('invoices'), invoiceController.bulkInvoices);

/**
 * @swagger
 * /api/invoices/payment-methods:
 *   get:
 *     tags: [Invoices]
 *     summary: Get available payment methods
 *     security: [{ bearerAuth: [] }]
 */
router.get('/payment-methods', authenticate, invoiceController.getPaymentMethods);

/**
 * @swagger
 * /api/invoices:
 *   get:
 *     tags: [Invoices]
 *     summary: Get all invoices with filters
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: status
 *         in: query
 *         schema: { type: string, enum: [draft, sent, partial, paid, overdue, cancelled] }
 *       - name: type
 *         in: query
 *         schema: { type: string, enum: [sales, service, parts] }
 *       - name: customerId
 *         in: query
 *         schema: { type: integer }
 *       - name: salesOrderId
 *         in: query
 *         schema: { type: integer }
 *       - name: dateFrom
 *         in: query
 *         schema: { type: string, format: date }
 *       - name: dateTo
 *         in: query
 *         schema: { type: string, format: date }
 *       - name: search
 *         in: query
 *         schema: { type: string }
 *       - name: page
 *         in: query
 *         schema: { type: integer, default: 1 }
 *       - name: limit
 *         in: query
 *         schema: { type: integer, default: 20 }
 */
router.get('/', authenticate, canView, invoiceController.getAllInvoices);

/**
 * @swagger
 * /api/invoices/{id}:
 *   get:
 *     tags: [Invoices]
 *     summary: Get invoice by ID with items and payments
 *     security: [{ bearerAuth: [] }]
 */
router.get('/:id', authenticate, canView, invoiceController.getInvoiceById);

/**
 * @swagger
 * /api/invoices/{id}/qr-data:
 *   get:
 *     tags: [Invoices]
 *     summary: Get QR code data for invoice
 *     security: [{ bearerAuth: [] }]
 */
router.get('/:id/qr-data', authenticate, canView, invoiceController.getQRCodeData);

/**
 * @swagger
 * /api/invoices:
 *   post:
 *     tags: [Invoices]
 *     summary: Create new invoice manually
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [customerId]
 *             properties:
 *               invoiceType: { type: string, enum: [sales, service, parts], default: sales }
 *               customerId: { type: integer }
 *               salesOrderId: { type: integer }
 *               jobCardId: { type: integer }
 *               dueDays: { type: integer, default: 30 }
 *               subtotal: { type: number }
 *               discountAmount: { type: number }
 *               taxAmount: { type: number }
 *               notes: { type: string }
 *               items: { type: array }
 */
// Issuing on credit is its own grant on top of create: `whenCredit` passes a
// paid invoice down to the plain create route (parts.routes.js dispatches
// stock adjustments the same way).
const whenCredit = (req, res, next) => (String(req.body?.paymentTerm || '').toLowerCase() === 'credit' ? next() : next('route'));
router.post('/', authenticate, whenCredit, authorizeAction('invoices', 'changePaymentTerm'), authorizeAction('invoices', 'create'), invoiceController.createInvoice);
router.post('/', authenticate, authorizeAction('invoices', 'create'), invoiceController.createInvoice);

/**
 * @swagger
 * /api/invoices/from-sales-order:
 *   post:
 *     tags: [Invoices]
 *     summary: Create invoice from sales order
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [salesOrderId]
 *             properties:
 *               salesOrderId: { type: integer }
 *               dueDays: { type: integer, default: 30 }
 */
router.post('/from-sales-order', authenticate, authorizeAction('invoices', 'create'), invoiceController.createFromSalesOrder);

/**
 * @swagger
 * /api/invoices/{id}:
 *   put:
 *     tags: [Invoices]
 *     summary: Update invoice (draft only)
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               dueDays: { type: integer }
 *               discountAmount: { type: number }
 *               taxAmount: { type: number }
 *               notes: { type: string }
 *               termsAndConditions: { type: string }
 */
router.put('/:id', authenticate, authorizeAction('invoices', 'edit'), invoiceController.updateInvoice);

/**
 * @swagger
 * /api/invoices/{id}:
 *   delete:
 *     tags: [Invoices]
 *     summary: Cancel invoice
 *     security: [{ bearerAuth: [] }]
 */
router.delete('/:id', authenticate, authorizeAction('invoices', 'delete'), invoiceController.deleteInvoice);

/**
 * @swagger
 * /api/invoices/{id}/status:
 *   put:
 *     tags: [Invoices]
 *     summary: Update invoice status
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status: { type: string, enum: [draft, sent, partial, paid, overdue, cancelled] }
 */
router.put('/:id/status', authenticate, authorizeAction('invoices', 'edit'), invoiceController.updateInvoiceStatus);
router.put('/:id/payment-method', authenticate, authorizeAction('invoices', 'recordPayment'), invoiceController.updatePaymentMethod);

/**
 * @swagger
 * /api/invoices/{id}/items:
 *   post:
 *     tags: [Invoices]
 *     summary: Add item to invoice
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [description, unitPrice]
 *             properties:
 *               description: { type: string }
 *               quantity: { type: integer, default: 1 }
 *               unitPrice: { type: number }
 *               taxId: { type: integer }
 */
router.post('/:id/items', authenticate, authorizeAction('invoices', 'edit'), invoiceController.addInvoiceItem);

/**
 * @swagger
 * /api/invoices/{id}/items/{itemId}:
 *   put:
 *     tags: [Invoices]
 *     summary: Update invoice item
 *     security: [{ bearerAuth: [] }]
 */
router.put('/:id/items/:itemId', authenticate, authorizeAction('invoices', 'edit'), invoiceController.updateInvoiceItem);

/**
 * @swagger
 * /api/invoices/{id}/items/{itemId}:
 *   delete:
 *     tags: [Invoices]
 *     summary: Remove invoice item
 *     security: [{ bearerAuth: [] }]
 */
router.delete('/:id/items/:itemId', authenticate, authorizeAction('invoices', 'delete'), invoiceController.removeInvoiceItem);

/**
 * @swagger
 * /api/invoices/{id}/payments:
 *   post:
 *     tags: [Invoices]
 *     summary: Record payment against invoice
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [amount, paymentMethodId]
 *             properties:
 *               amount: { type: number }
 *               paymentMethodId: { type: integer }
 *               referenceNumber: { type: string }
 *               notes: { type: string }
 */
// Taking money against an invoice is its own grant, not part of edit.
router.post('/:id/payments', authenticate, authorizeAction('invoices', 'recordPayment'), invoiceController.recordPayment);

/**
 * @swagger
 * /api/invoices/{id}/send:
 *   post:
 *     tags: [Invoices]
 *     summary: Send invoice to customer (changes status to sent)
 *     security: [{ bearerAuth: [] }]
 */
router.post('/:id/send', authenticate, authorizeAction('invoices', 'sendEmail'), invoiceController.sendInvoice);

router.post('/:id/send-email', authenticate, authorizeAction('invoices', 'sendEmail'), invoiceController.sendInvoiceEmail);

/**
 * @swagger
 * /api/invoices/{id}/history:
 *   get:
 *     tags: [Invoices]
 *     summary: Get invoice audit history
 *     security: [{ bearerAuth: [] }]
 */
router.get('/:id/history', authenticate, canView, invoiceController.getInvoiceHistory);

module.exports = router;
