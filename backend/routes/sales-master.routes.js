/**
 * Sales Master Data Routes - CRUD for Sales Statuses, Priorities, etc.
 * Created by LOGIXINVENTOR (PVT) Ltd.
 * info@logixinventor.com +92 333 3836851
 * www.logixinventor.com | AMS
 */

const express = require('express');
const router = express.Router();
const { query } = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { AppError } = require('../middleware/errorHandler');

/**
 * @swagger
 * /api/sales-master/stats:
 *   get:
 *     summary: Get sales master data statistics
 *     tags: [Sales Master Data]
 */
router.get('/stats', authenticate, async (req, res, next) => {
    try {
        const stats = {
            quotationStatuses: { total: 0, active: 0 },
            bookingStatuses: { total: 0, active: 0 },
            orderStatuses: { total: 0, active: 0 },
            invoiceStatuses: { total: 0, active: 0 },
            priorities: { total: 0, active: 0 }
        };

        const [qResult] = await query('SELECT COUNT(*) as total, SUM(is_active) as active FROM sales_quotation_statuses');
        stats.quotationStatuses = { total: qResult.total, active: qResult.active || 0 };

        const [bResult] = await query('SELECT COUNT(*) as total, SUM(is_active) as active FROM sales_booking_statuses');
        stats.bookingStatuses = { total: bResult.total, active: bResult.active || 0 };

        const [oResult] = await query('SELECT COUNT(*) as total, SUM(is_active) as active FROM sales_order_statuses');
        stats.orderStatuses = { total: oResult.total, active: oResult.active || 0 };

        const [iResult] = await query('SELECT COUNT(*) as total, SUM(is_active) as active FROM sales_invoice_statuses');
        stats.invoiceStatuses = { total: iResult.total, active: iResult.active || 0 };

        const [pResult] = await query('SELECT COUNT(*) as total, SUM(is_active) as active FROM sales_booking_priorities');
        stats.priorities = { total: pResult.total, active: pResult.active || 0 };

        res.json({ success: true, data: stats });
    } catch (error) {
        next(error);
    }
});

// Helper function to create standard CRUD routes
const createHelperRoutes = (entityName, tableName, linkedTable, linkedColumn) => {
    // GET
    router.get(`/${entityName}`, authenticate, async (req, res, next) => {
        try {
            const activeOnly = req.query.active === 'true';
            let sql = `
                SELECT t.*, 
                       (SELECT COUNT(*) FROM ${linkedTable} l WHERE l.${linkedColumn} = t.name) AS usage_count
                FROM ${tableName} t
            `;
            if (activeOnly) sql += ' WHERE t.is_active = 1';
            sql += ' ORDER BY t.sort_order, t.name';

            const results = await query(sql);
            res.json({ success: true, data: results });
        } catch (error) {
            next(error);
        }
    });

    // POST
    router.post(`/${entityName}`, authenticate, async (req, res, next) => {
        try {
            const { name, display_name, color, sort_order } = req.body;
            if (!name) throw new AppError('Name is required', 400);

            const result = await query(
                `INSERT INTO ${tableName} (name, display_name, color, sort_order, is_active) VALUES (?, ?, ?, ?, 1)`,
                [name, display_name || name, color || 'gray', sort_order || 0]
            );
            res.status(201).json({ success: true, data: { id: result.insertId }, message: 'Created successfully' });
        } catch (error) {
            next(error);
        }
    });

    // PUT
    router.put(`/${entityName}/:id`, authenticate, async (req, res, next) => {
        try {
            const { name, display_name, color, sort_order, is_active } = req.body;
            await query(
                `UPDATE ${tableName} SET name = ?, display_name = ?, color = ?, sort_order = ?, is_active = ? WHERE id = ?`,
                [name, display_name, color, sort_order, is_active ? 1 : 0, req.params.id]
            );
            res.json({ success: true, message: 'Updated successfully' });
        } catch (error) {
            next(error);
        }
    });

    // DELETE
    router.delete(`/${entityName}/:id`, authenticate, async (req, res, next) => {
        try {
            const [item] = await query(`SELECT name FROM ${tableName} WHERE id = ?`, [req.params.id]);
            if (item) {
                const [countResult] = await query(`SELECT COUNT(*) as count FROM ${linkedTable} WHERE ${linkedColumn} = ?`, [item.name]);
                if (countResult.count > 0) {
                    throw new AppError('Cannot delete: Currently in use by records', 400);
                }
            }
            await query(`DELETE FROM ${tableName} WHERE id = ?`, [req.params.id]);
            res.json({ success: true, message: 'Deleted successfully' });
        } catch (error) {
            next(error);
        }
    });
};

// Register Routes
createHelperRoutes('quotation-statuses', 'sales_quotation_statuses', 'quotations', 'status');
createHelperRoutes('booking-statuses', 'sales_booking_statuses', 'bookings', 'status');
createHelperRoutes('order-statuses', 'sales_order_statuses', 'sales_orders', 'status');
createHelperRoutes('invoice-statuses', 'sales_invoice_statuses', 'invoices', 'status');
createHelperRoutes('priorities', 'sales_booking_priorities', 'bookings', 'priority');

module.exports = router;
