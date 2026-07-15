/**
 * Sales Order Routes
 * Full CRUD operations with role-based permissions
 * Maintained by Hussain Developer
 * hussaintmerng@gmail.com | +92 319 1634446
 * AMS ERP
 * Date: 2026-01-06
 * Updated: 2026-01-10 - Added direct order creation, status updates, invoice generation
 * 
 * @swagger
 * tags:
 *   - name: Sales Orders
 *     description: Sales order management CRUD operations
 */

const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const salesController = require('../controllers/salesManagement.controller');
const bulkPermission = require('../middleware/bulkSalesPermission');

/**
 * @swagger
 * /api/sales/stats:
 *   get:
 *     tags: [Sales Orders]
 *     summary: Get overall sales statistics
 *     security: [{ bearerAuth: [] }]
 */
router.get('/stats', authenticate, salesController.getSalesStats);
router.post('/bulk', authenticate, bulkPermission('sales_orders'), salesController.bulkSalesDocuments);

/**
 * @swagger
 * /api/sales/order-stats:
 *   get:
 *     tags: [Sales Orders]
 *     summary: Get sales order statistics
 *     security: [{ bearerAuth: [] }]
 */
router.get('/order-stats', authenticate, salesController.getOrderStats);

/**
 * @swagger
 * /api/sales/with-invoices:
 *   get:
 *     tags: [Sales Orders]
 *     summary: Get all sales orders with invoice information
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: status
 *         in: query
 *         schema: { type: string, enum: [confirmed, invoiced, delivered, cancelled] }
 *       - name: customerId
 *         in: query
 *         schema: { type: integer }
 *       - name: search
 *         in: query
 *         schema: { type: string }
 */
router.get('/with-invoices', authenticate, salesController.getSalesOrdersWithInvoices);

/**
 * @swagger
 * /api/sales:
 *   get:
 *     tags: [Sales Orders]
 *     summary: Get all sales orders with filters
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: status
 *         in: query
 *         schema: { type: string, enum: [pending, confirmed, invoiced, delivered, cancelled] }
 *       - name: customerId
 *         in: query
 *         schema: { type: integer }
 *       - name: search
 *         in: query
 *         schema: { type: string }
 */
router.get('/', authenticate, salesController.getAllSalesOrders);

/**
 * @swagger
 * /api/sales/{id}:
 *   get:
 *     tags: [Sales Orders]
 *     summary: Get sales order by ID
 *     security: [{ bearerAuth: [] }]
 */
router.get('/:id', authenticate, salesController.getSalesOrderById);

/**
 * @swagger
 * /api/sales/{id}/history:
 *   get:
 *     tags: [Sales Orders]
 *     summary: Get sales order audit history
 *     security: [{ bearerAuth: [] }]
 */
router.get('/:id/history', authenticate, salesController.getSalesOrderHistory);

/**
 * @swagger
 * /api/sales:
 *   post:
 *     tags: [Sales Orders]
 *     summary: Create new sales order (from booking)
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [customerId, vehicleId]
 *             properties:
 *               bookingId: { type: integer }
 *               customerId: { type: integer }
 *               vehicleId: { type: integer }
 *               vehiclePrice: { type: number }
 *               accessoriesTotal: { type: number }
 *               discountAmount: { type: number }
 *               taxAmount: { type: number }
 *               registrationCharges: { type: number }
 *               insuranceCharges: { type: number }
 *               paidAmount: { type: number }
 *               paymentMode: { type: string, enum: [cash, bank_finance, lease, exchange] }
 */
router.post('/', authenticate, authorize('super_admin', 'sales_manager'), salesController.createSalesOrder);

/**
 * @swagger
 * /api/sales/direct:
 *   post:
 *     tags: [Sales Orders]
 *     summary: Create direct sales order (without booking)
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [customerId, vehicleId, vehiclePrice]
 *             properties:
 *               customerId: { type: integer, description: Customer ID }
 *               vehicleId: { type: integer, description: Vehicle ID from inventory }
 *               vehiclePrice: { type: number, description: Vehicle selling price }
 *               accessoriesTotal: { type: number, default: 0 }
 *               discountAmount: { type: number, default: 0 }
 *               taxAmount: { type: number, default: 0 }
 *               registrationCharges: { type: number, default: 0 }
 *               insuranceCharges: { type: number, default: 0 }
 *               otherCharges: { type: number, default: 0 }
 *               paidAmount: { type: number, default: 0 }
 *               paymentMode: { type: string, enum: [cash, bank_finance, lease, exchange], default: cash }
 *               financeCompany: { type: string }
 *               financeAmount: { type: number }
 *               exchangeVehicleDetails: { type: string }
 *               exchangeValue: { type: number }
 *               expectedDeliveryDate: { type: string, format: date }
 *               notes: { type: string }
 */
router.post('/direct', authenticate, authorize('super_admin', 'admin', 'sales_manager'), salesController.createDirectSalesOrder);

router.post('/:id/send-email', authenticate, authorize('super_admin', 'admin', 'sales_manager', 'sales_executive'), salesController.sendSalesOrderEmail);

/**
 * @swagger
 * /api/sales/{id}:
 *   put:
 *     tags: [Sales Orders]
 *     summary: Update sales order
 *     security: [{ bearerAuth: [] }]
 */
router.put('/:id', authenticate, authorize('super_admin', 'sales_manager'), salesController.updateSalesOrder);

/**
 * @swagger
 * /api/sales/{id}/status:
 *   put:
 *     tags: [Sales Orders]
 *     summary: Update sales order status
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status: { type: string, enum: [confirmed, invoiced, delivered, cancelled] }
 *               notes: { type: string, description: Reason or notes for status change }
 */
router.put('/:id/status', authenticate, authorize('super_admin', 'admin', 'sales_manager'), salesController.updateSalesOrderStatus);

/**
 * @swagger
 * /api/sales/{id}:
 *   delete:
 *     tags: [Sales Orders]
 *     summary: Cancel sales order
 *     security: [{ bearerAuth: [] }]
 */
router.delete('/:id', authenticate, authorize('super_admin'), salesController.deleteSalesOrder);

/**
 * @swagger
 * /api/sales/{id}/deliver:
 *   post:
 *     tags: [Sales Orders]
 *     summary: Mark order as delivered
 *     security: [{ bearerAuth: [] }]
 */
router.post('/:id/deliver', authenticate, authorize('super_admin', 'sales_manager'), salesController.deliverSalesOrder);

/**
 * @swagger
 * /api/sales/{id}/invoice:
 *   post:
 *     tags: [Sales Orders]
 *     summary: Generate invoice from sales order
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               dueDays: { type: integer, default: 30, description: Number of days until invoice is due }
 */
router.post('/:id/invoice', authenticate, authorize('super_admin', 'admin', 'sales_manager', 'accountant'), salesController.generateInvoiceFromOrder);

module.exports = router;
