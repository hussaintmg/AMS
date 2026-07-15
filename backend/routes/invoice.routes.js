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
const { authenticate, authorize } = require('../middleware/auth');
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
router.get('/stats', authenticate, invoiceController.getInvoiceStats);
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
router.get('/', authenticate, invoiceController.getAllInvoices);

/**
 * @swagger
 * /api/invoices/{id}:
 *   get:
 *     tags: [Invoices]
 *     summary: Get invoice by ID with items and payments
 *     security: [{ bearerAuth: [] }]
 */
router.get('/:id', authenticate, invoiceController.getInvoiceById);

/**
 * @swagger
 * /api/invoices/{id}/qr-data:
 *   get:
 *     tags: [Invoices]
 *     summary: Get QR code data for invoice
 *     security: [{ bearerAuth: [] }]
 */
router.get('/:id/qr-data', authenticate, invoiceController.getQRCodeData);

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
router.post('/', authenticate, authorize('super_admin', 'sales_manager', 'accountant'), invoiceController.createInvoice);

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
router.post('/from-sales-order', authenticate, authorize('super_admin', 'sales_manager'), invoiceController.createFromSalesOrder);

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
router.put('/:id', authenticate, authorize('super_admin', 'sales_manager', 'accountant'), invoiceController.updateInvoice);

/**
 * @swagger
 * /api/invoices/{id}:
 *   delete:
 *     tags: [Invoices]
 *     summary: Cancel invoice
 *     security: [{ bearerAuth: [] }]
 */
router.delete('/:id', authenticate, authorize('super_admin', 'sales_manager'), invoiceController.deleteInvoice);

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
router.put('/:id/status', authenticate, authorize('super_admin', 'sales_manager', 'accountant'), invoiceController.updateInvoiceStatus);

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
router.post('/:id/items', authenticate, authorize('super_admin', 'sales_manager', 'accountant'), invoiceController.addInvoiceItem);

/**
 * @swagger
 * /api/invoices/{id}/items/{itemId}:
 *   put:
 *     tags: [Invoices]
 *     summary: Update invoice item
 *     security: [{ bearerAuth: [] }]
 */
router.put('/:id/items/:itemId', authenticate, authorize('super_admin', 'sales_manager', 'accountant'), invoiceController.updateInvoiceItem);

/**
 * @swagger
 * /api/invoices/{id}/items/{itemId}:
 *   delete:
 *     tags: [Invoices]
 *     summary: Remove invoice item
 *     security: [{ bearerAuth: [] }]
 */
router.delete('/:id/items/:itemId', authenticate, authorize('super_admin', 'sales_manager', 'accountant'), invoiceController.removeInvoiceItem);

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
router.post('/:id/payments', authenticate, authorize('super_admin', 'sales_manager', 'accountant'), invoiceController.recordPayment);

/**
 * @swagger
 * /api/invoices/{id}/send:
 *   post:
 *     tags: [Invoices]
 *     summary: Send invoice to customer (changes status to sent)
 *     security: [{ bearerAuth: [] }]
 */
router.post('/:id/send', authenticate, authorize('super_admin', 'admin', 'sales_manager', 'accountant'), invoiceController.sendInvoice);

router.post('/:id/send-email', authenticate, authorize('super_admin', 'admin', 'sales_manager', 'accountant'), invoiceController.sendInvoiceEmail);

/**
 * @swagger
 * /api/invoices/{id}/history:
 *   get:
 *     tags: [Invoices]
 *     summary: Get invoice audit history
 *     security: [{ bearerAuth: [] }]
 */
router.get('/:id/history', authenticate, invoiceController.getInvoiceHistory);

module.exports = router;
