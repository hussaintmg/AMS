/**
 * Sales Master Data Routes
 * MongoDB entities + backward-compat MySQL status routes
 */

const express = require('express');
const router = express.Router();
const { query } = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { AppError } = require('../middleware/errorHandler');
const ctrl = require('../controllers/salesMasterController');

// ═══════════════════════════════════════════════════════════════════════════
// NEW MONGODB ENTITY ROUTES (6 sections)
// ═══════════════════════════════════════════════════════════════════════════

const swaggerTags = 'Sales Master Data';

/**
 * @swagger
 * tags:
 *   name: Sales Master Data
 *   description: Payment Terms, Delivery Terms, Quotation Validities, Discount Types, Sales Order Types, Invoice Types
 */

/**
 * @swagger
 * /api/sales-master/stats:
 *   get:
 *     summary: Get counts for all sales master entities (MongoDB + MySQL)
 *     tags: [Sales Master Data]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Stats retrieved
 */
router.get('/stats', authenticate, ctrl.getStats);

// ── Payment Terms ──────────────────────────────────────────────────────

/**
 * @swagger
 * /api/sales-master/payment-terms:
 *   get:
 *     summary: List payment terms
 *     tags: [Sales Master Data]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *       - in: query
 *         name: is_active
 *         schema: { type: boolean }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 100 }
 *     responses:
 *       200:
 *         description: List of payment terms
 *   post:
 *     summary: Create a payment term
 *     tags: [Sales Master Data]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name: { type: string }
 *               code: { type: string }
 *               days: { type: integer, description: 'Net days (e.g. 30 for Net 30)' }
 *               description: { type: string }
 *               isActive: { type: boolean }
 *     responses:
 *       201:
 *         description: Created
 */
router.get('/payment-terms', authenticate, ctrl.getPaymentTerms);
router.post('/payment-terms', authenticate, ctrl.createPaymentTerm);

/**
 * @swagger
 * /api/sales-master/payment-terms/{id}:
 *   put:
 *     summary: Update a payment term
 *     tags: [Sales Master Data]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Updated
 *   delete:
 *     summary: Delete a payment term
 *     tags: [Sales Master Data]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Deleted
 */
router.put('/payment-terms/:id', authenticate, ctrl.updatePaymentTerm);
router.delete('/payment-terms/:id', authenticate, ctrl.deletePaymentTerm);

// ── Delivery Terms ─────────────────────────────────────────────────────

/**
 * @swagger
 * /api/sales-master/delivery-terms:
 *   get:
 *     summary: List delivery terms
 *     tags: [Sales Master Data]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *       - in: query
 *         name: is_active
 *         schema: { type: boolean }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 100 }
 *     responses:
 *       200:
 *         description: List
 *   post:
 *     summary: Create a delivery term
 *     tags: [Sales Master Data]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name: { type: string }
 *               code: { type: string }
 *               description: { type: string }
 *               isActive: { type: boolean }
 *     responses:
 *       201:
 *         description: Created
 */
router.get('/delivery-terms', authenticate, ctrl.getDeliveryTerms);
router.post('/delivery-terms', authenticate, ctrl.createDeliveryTerm);

/**
 * @swagger
 * /api/sales-master/delivery-terms/{id}:
 *   put:
 *     summary: Update a delivery term
 *     tags: [Sales Master Data]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Updated
 *   delete:
 *     summary: Delete a delivery term
 *     tags: [Sales Master Data]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Deleted
 */
router.put('/delivery-terms/:id', authenticate, ctrl.updateDeliveryTerm);
router.delete('/delivery-terms/:id', authenticate, ctrl.deleteDeliveryTerm);

// ── Quotation Validities ───────────────────────────────────────────────

/**
 * @swagger
 * /api/sales-master/quotation-validities:
 *   get:
 *     summary: List quotation validities
 *     tags: [Sales Master Data]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *       - in: query
 *         name: is_active
 *         schema: { type: boolean }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 100 }
 *     responses:
 *       200:
 *         description: List
 *   post:
 *     summary: Create a quotation validity
 *     tags: [Sales Master Data]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name: { type: string }
 *               code: { type: string }
 *               days: { type: integer }
 *               description: { type: string }
 *               isActive: { type: boolean }
 *     responses:
 *       201:
 *         description: Created
 */
router.get('/quotation-validities', authenticate, ctrl.getQuotationValidities);
router.post('/quotation-validities', authenticate, ctrl.createQuotationValidity);

/**
 * @swagger
 * /api/sales-master/quotation-validities/{id}:
 *   put:
 *     summary: Update a quotation validity
 *     tags: [Sales Master Data]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Updated
 *   delete:
 *     summary: Delete a quotation validity
 *     tags: [Sales Master Data]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Deleted
 */
router.put('/quotation-validities/:id', authenticate, ctrl.updateQuotationValidity);
router.delete('/quotation-validities/:id', authenticate, ctrl.deleteQuotationValidity);

// ── Discount Types ─────────────────────────────────────────────────────

/**
 * @swagger
 * /api/sales-master/discount-types:
 *   get:
 *     summary: List discount types
 *     tags: [Sales Master Data]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *       - in: query
 *         name: is_active
 *         schema: { type: boolean }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 100 }
 *     responses:
 *       200:
 *         description: List
 *   post:
 *     summary: Create a discount type
 *     tags: [Sales Master Data]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name: { type: string }
 *               code: { type: string }
 *               type: { type: string, enum: [percentage, fixed] }
 *               value: { type: number }
 *               description: { type: string }
 *               isActive: { type: boolean }
 *     responses:
 *       201:
 *         description: Created
 */
router.get('/discount-types', authenticate, ctrl.getDiscountTypes);
router.post('/discount-types', authenticate, ctrl.createDiscountType);

/**
 * @swagger
 * /api/sales-master/discount-types/{id}:
 *   put:
 *     summary: Update a discount type
 *     tags: [Sales Master Data]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Updated
 *   delete:
 *     summary: Delete a discount type
 *     tags: [Sales Master Data]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Deleted
 */
router.put('/discount-types/:id', authenticate, ctrl.updateDiscountType);
router.delete('/discount-types/:id', authenticate, ctrl.deleteDiscountType);

// ── Sales Order Types ──────────────────────────────────────────────────

/**
 * @swagger
 * /api/sales-master/sales-order-types:
 *   get:
 *     summary: List sales order types
 *     tags: [Sales Master Data]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *       - in: query
 *         name: is_active
 *         schema: { type: boolean }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 100 }
 *     responses:
 *       200:
 *         description: List
 *   post:
 *     summary: Create a sales order type
 *     tags: [Sales Master Data]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name: { type: string }
 *               code: { type: string }
 *               description: { type: string }
 *               isActive: { type: boolean }
 *     responses:
 *       201:
 *         description: Created
 */
router.get('/sales-order-types', authenticate, ctrl.getSalesOrderTypes);
router.post('/sales-order-types', authenticate, ctrl.createSalesOrderType);

/**
 * @swagger
 * /api/sales-master/sales-order-types/{id}:
 *   put:
 *     summary: Update a sales order type
 *     tags: [Sales Master Data]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Updated
 *   delete:
 *     summary: Delete a sales order type
 *     tags: [Sales Master Data]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Deleted
 */
router.put('/sales-order-types/:id', authenticate, ctrl.updateSalesOrderType);
router.delete('/sales-order-types/:id', authenticate, ctrl.deleteSalesOrderType);

// ── Invoice Types ──────────────────────────────────────────────────────

/**
 * @swagger
 * /api/sales-master/invoice-types:
 *   get:
 *     summary: List invoice types
 *     tags: [Sales Master Data]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *       - in: query
 *         name: is_active
 *         schema: { type: boolean }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 100 }
 *     responses:
 *       200:
 *         description: List
 *   post:
 *     summary: Create an invoice type
 *     tags: [Sales Master Data]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name: { type: string }
 *               code: { type: string }
 *               description: { type: string }
 *               isActive: { type: boolean }
 *     responses:
 *       201:
 *         description: Created
 */
router.get('/invoice-types', authenticate, ctrl.getInvoiceTypes);
router.post('/invoice-types', authenticate, ctrl.createInvoiceType);

/**
 * @swagger
 * /api/sales-master/invoice-types/{id}:
 *   put:
 *     summary: Update an invoice type
 *     tags: [Sales Master Data]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Updated
 *   delete:
 *     summary: Delete an invoice type
 *     tags: [Sales Master Data]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Deleted
 */
router.put('/invoice-types/:id', authenticate, ctrl.updateInvoiceType);
router.delete('/invoice-types/:id', authenticate, ctrl.deleteInvoiceType);

// ═══════════════════════════════════════════════════════════════════════════
// BACKWARD-COMPAT MYSQL ROUTES (original Sales Master status lookups)
// ═══════════════════════════════════════════════════════════════════════════

const createHelperRoutes = (entityName, tableName, linkedTable, linkedColumn) => {
    router.get(`/${entityName}`, authenticate, async (req, res, next) => {
        try {
            const activeOnly = req.query.active === 'true';
            let sql = `
                SELECT t.*, (SELECT COUNT(*) FROM ${linkedTable} l WHERE l.${linkedColumn} = t.name) AS usage_count
                FROM ${tableName} t
            `;
            if (activeOnly) sql += ' WHERE t.is_active = 1';
            sql += ' ORDER BY t.sort_order, t.name';
            const results = await query(sql);
            res.json({ success: true, data: results });
        } catch (error) { next(error); }
    });

    router.post(`/${entityName}`, authenticate, async (req, res, next) => {
        try {
            const { name, display_name, color, sort_order } = req.body;
            if (!name) throw new AppError('Name is required', 400);
            const result = await query(
                `INSERT INTO ${tableName} (name, display_name, color, sort_order, is_active) VALUES (?, ?, ?, ?, 1)`,
                [name, display_name || name, color || 'gray', sort_order || 0]
            );
            res.status(201).json({ success: true, data: { id: result.insertId }, message: 'Created successfully' });
        } catch (error) { next(error); }
    });

    router.put(`/${entityName}/:id`, authenticate, async (req, res, next) => {
        try {
            const { name, display_name, color, sort_order, is_active } = req.body;
            await query(
                `UPDATE ${tableName} SET name = ?, display_name = ?, color = ?, sort_order = ?, is_active = ? WHERE id = ?`,
                [name, display_name, color, sort_order, is_active ? 1 : 0, req.params.id]
            );
            res.json({ success: true, message: 'Updated successfully' });
        } catch (error) { next(error); }
    });

    router.delete(`/${entityName}/:id`, authenticate, async (req, res, next) => {
        try {
            const [item] = await query(`SELECT name FROM ${tableName} WHERE id = ?`, [req.params.id]);
            if (item) {
                const [countResult] = await query(`SELECT COUNT(*) as count FROM ${linkedTable} WHERE ${linkedColumn} = ?`, [item.name]);
                if (countResult.count > 0) throw new AppError('Cannot delete: Currently in use by records', 400);
            }
            await query(`DELETE FROM ${tableName} WHERE id = ?`, [req.params.id]);
            res.json({ success: true, message: 'Deleted successfully' });
        } catch (error) { next(error); }
    });
};

createHelperRoutes('quotation-statuses', 'sales_quotation_statuses', 'quotations', 'status');
createHelperRoutes('booking-statuses', 'sales_booking_statuses', 'bookings', 'status');
createHelperRoutes('order-statuses', 'sales_order_statuses', 'sales_orders', 'status');
createHelperRoutes('invoice-statuses', 'sales_invoice_statuses', 'invoices', 'status');
createHelperRoutes('priorities', 'sales_booking_priorities', 'bookings', 'priority');

module.exports = router;
