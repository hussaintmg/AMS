/**
 * Dashboard Routes - Professional Analytics Dashboard API
 * Created by LOGIXINVENTOR (PVT) Ltd.
 * info@logixinventor.com +92 333 3836851
 * www.logixinventor.com | AMS
 *
 * Compatibility note: Queries use `created_by` instead of `sales_executive_id` / `technician_id`
 * and `assigned_to` instead of `created_by` on leads because the current DB schema
 * differs from the original expected schema. See PROJECT_MEMORY.md for details.
 */

const express = require('express');
const router = express.Router();
const { query } = require('../config/database');
const { authenticate } = require('../middleware/auth');

/** HR / finance counts — safe if tables are missing (older DBs). */
const getHrSummary = async () => {
    try {
        const [emp, leaves, pp, exp] = await Promise.all([
            query('SELECT COUNT(*) AS count FROM employees WHERE is_active = TRUE'),
            query("SELECT COUNT(*) AS count FROM leave_requests WHERE status = 'pending'"),
            query("SELECT COUNT(*) AS count FROM payroll_periods WHERE status = 'draft'"),
            query("SELECT COUNT(*) AS count FROM expenses WHERE status IN ('draft','submitted')")
        ]);
        return {
            activeEmployees: Number(emp[0]?.count) || 0,
            pendingLeaveRequests: Number(leaves[0]?.count) || 0,
            draftPayrollPeriods: Number(pp[0]?.count) || 0,
            pendingExpenseLines: Number(exp[0]?.count) || 0
        };
    } catch {
        return {
            activeEmployees: 0,
            pendingLeaveRequests: 0,
            draftPayrollPeriods: 0,
            pendingExpenseLines: 0
        };
    }
};

const getDashboardStatsData = async (user) => {
    const userId = user.id;
    const roleName = user.role_name || 'user';
    const isAdmin = ['super_admin', 'admin', 'manager'].includes(roleName);

    const [
        leadsResult,
        customersResult,
        vehiclesResult,
        deliveriesResult,
        jobCardsResult,
        invoicesResult,
        monthlySalesResult,
        appointmentsResult,
        lowStockResult
    ] = await Promise.all([
        query(`SELECT COUNT(*) as count FROM leads WHERE status NOT IN ('converted', 'lost')
               ${isAdmin ? '' : `AND assigned_to = ${userId}`}`),
        query('SELECT COUNT(*) as count FROM customers WHERE is_active = TRUE'),
        query('SELECT COUNT(*) as count FROM vehicles WHERE status = "at_yard"'),
        query(`SELECT COUNT(*) as count FROM sales_orders WHERE status IN ('confirmed', 'invoiced')
               ${isAdmin ? '' : `AND created_by = ${userId}`}`),
        query(`SELECT COUNT(*) as count FROM job_cards WHERE status IN ('open', 'in_progress')
               ${isAdmin ? '' : `AND created_by = ${userId}`}`),
        query('SELECT COALESCE(SUM(balance_amount), 0) as total FROM invoices WHERE status NOT IN ("paid", "cancelled")'),
        query(`SELECT COUNT(*) as count, COALESCE(SUM(total_amount), 0) as revenue FROM sales_orders 
               WHERE MONTH(order_date) = MONTH(CURDATE()) AND YEAR(order_date) = YEAR(CURDATE()) AND status != 'cancelled'
               ${isAdmin ? '' : `AND created_by = ${userId}`}`),
        query(`SELECT COUNT(*) as count FROM service_appointments WHERE appointment_date = CURDATE()
               ${isAdmin ? '' : `AND created_by = ${userId}`}`),
        isAdmin ? query('SELECT COUNT(*) as count FROM parts WHERE current_stock <= COALESCE(reorder_level, min_stock, 0) AND is_active = TRUE') : Promise.resolve([{ count: 0 }])
    ]);

    const hr = await getHrSummary();

    return {
        activeLeads: leadsResult[0]?.count || 0,
        totalCustomers: customersResult[0]?.count || 0,
        vehiclesInStock: vehiclesResult[0]?.count || 0,
        pendingDeliveries: deliveriesResult[0]?.count || 0,
        openJobCards: jobCardsResult[0]?.count || 0,
        outstandingReceivables: invoicesResult[0]?.total || 0,
        monthlySalesCount: monthlySalesResult[0]?.count || 0,
        monthlyRevenue: monthlySalesResult[0]?.revenue || 0,
        todayAppointments: appointmentsResult[0]?.count || 0,
        lowStockParts: lowStockResult[0]?.count || 0,
        isAdmin,
        hr
    };
};

/**
 * @swagger
 * tags:
 *   name: Dashboard
 *   description: Dashboard analytics and statistics
 */

/**
 * @swagger
 * /api/dashboard/stats:
 *   get:
 *     summary: Get dashboard statistics (role-based)
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Dashboard statistics retrieved successfully
 */
router.get('/stats', authenticate, async (req, res, next) => {
    try {
        const data = await getDashboardStatsData(req.user);

        res.json({
            success: true,
            data
        });
    } catch (error) { next(error); }
});

// Legacy compatibility endpoint used by older frontend bundles
router.get('/overview', authenticate, async (req, res, next) => {
    try {
        const data = await getDashboardStatsData(req.user);
        res.json({ success: true, data });
    } catch (error) { next(error); }
});

// Legacy compatibility endpoint used by older frontend bundles
router.get('/monthly-summary', authenticate, async (req, res, next) => {
    try {
        const data = await getDashboardStatsData(req.user);
        res.json({
            success: true,
            data: {
                monthlySalesCount: data.monthlySalesCount,
                monthlyRevenue: data.monthlyRevenue
            }
        });
    } catch (error) { next(error); }
});

/**
 * @swagger
 * /api/dashboard/sales-trend:
 *   get:
 *     summary: Get sales trend data for charts
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: months
 *         schema:
 *           type: integer
 *           default: 12
 *         description: Number of months to retrieve
 *     responses:
 *       200:
 *         description: Sales trend data retrieved successfully
 */
router.get('/sales-trend', authenticate, async (req, res, next) => {
    try {
        const months = parseInt(req.query.months) || 12;
        const userId = req.user.id;
        const roleName = req.user.role_name || 'user';
        const isAdmin = ['super_admin', 'admin', 'manager'].includes(roleName);

        const data = await query(`
            SELECT 
                DATE_FORMAT(order_date, '%Y-%m') AS month,
                DATE_FORMAT(order_date, '%b') AS label,
                COUNT(*) AS orders,
                COALESCE(SUM(total_amount), 0) AS revenue,
                COALESCE(AVG(total_amount), 0) AS avg_value
            FROM sales_orders
            WHERE order_date >= DATE_SUB(CURDATE(), INTERVAL ? MONTH)
                AND status != 'cancelled'
                ${isAdmin ? '' : `AND created_by = ${userId}`}
            GROUP BY DATE_FORMAT(order_date, '%Y-%m'), DATE_FORMAT(order_date, '%b')
            ORDER BY month
        `, [months]);

        // Generate labels and datasets for Chart.js
        const labels = data.map(d => d.label);
        const revenues = data.map(d => parseFloat(d.revenue));
        const orders = data.map(d => parseInt(d.orders));

        res.json({
            success: true,
            data: {
                labels,
                datasets: {
                    revenue: revenues,
                    orders: orders
                },
                raw: data
            }
        });
    } catch (error) { next(error); }
});

/**
 * @swagger
 * /api/dashboard/inventory-distribution:
 *   get:
 *     summary: Get inventory distribution for pie charts
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Inventory distribution data retrieved successfully
 */
router.get('/inventory-distribution', authenticate, async (req, res, next) => {
    try {
        // Vehicle status distribution
        const vehicleStatus = await query(`
            SELECT status AS label, COUNT(*) AS value
            FROM vehicles
            GROUP BY status
        `);

        // Vehicle make distribution
        const vehicleMakes = await query(`
            SELECT COALESCE(vm.name, 'Unknown') AS label, COUNT(*) AS value
            FROM vehicles v
            LEFT JOIN vehicle_variants vv ON v.variant_id = vv.id
            LEFT JOIN vehicle_models vmo ON vv.model_id = vmo.id
            LEFT JOIN vehicle_makes vm ON vmo.make_id = vm.id
            GROUP BY vm.name
            ORDER BY value DESC
            LIMIT 8
        `);

        // Parts category distribution
        const partsCategories = await query(`
            SELECT COALESCE(pc.name, 'Uncategorized') AS label, COUNT(*) AS value
            FROM parts p
            LEFT JOIN part_categories pc ON p.category_id = pc.id
            WHERE p.is_active = TRUE
            GROUP BY pc.name
            ORDER BY value DESC
            LIMIT 8
        `);

        res.json({
            success: true,
            data: {
                vehicleStatus: {
                    labels: vehicleStatus.map(v => v.label),
                    data: vehicleStatus.map(v => parseInt(v.value))
                },
                vehicleMakes: {
                    labels: vehicleMakes.map(v => v.label),
                    data: vehicleMakes.map(v => parseInt(v.value))
                },
                partsCategories: {
                    labels: partsCategories.map(v => v.label),
                    data: partsCategories.map(v => parseInt(v.value))
                }
            }
        });
    } catch (error) { next(error); }
});

/**
 * @swagger
 * /api/dashboard/top-performers:
 *   get:
 *     summary: Get top performing salespeople and technicians
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: period
 *         schema:
 *           type: string
 *           enum: [week, month, quarter, year]
 *           default: month
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 5
 *     responses:
 *       200:
 *         description: Top performers data retrieved successfully
 */
router.get('/top-performers', authenticate, async (req, res, next) => {
    try {
        const period = req.query.period || 'month';
        const limit = parseInt(req.query.limit) || 5;

        let startDate;
        switch (period) {
            case 'week': startDate = 'DATE_SUB(CURDATE(), INTERVAL 7 DAY)'; break;
            case 'quarter': startDate = 'DATE_SUB(CURDATE(), INTERVAL 3 MONTH)'; break;
            case 'year': startDate = 'DATE_SUB(CURDATE(), INTERVAL 1 YEAR)'; break;
            default: startDate = 'DATE_SUB(CURDATE(), INTERVAL 1 MONTH)';
        }

        // Top Salespeople
        const salesPerformers = await query(`
            SELECT 
                u.id,
                CONCAT(u.first_name, ' ', u.last_name) AS name,
                SUBSTRING(u.first_name, 1, 1) AS initials,
                COUNT(so.id) AS deals,
                COALESCE(SUM(so.total_amount), 0) AS revenue
            FROM users u
            INNER JOIN sales_orders so ON u.id = so.created_by
            WHERE so.order_date >= ${startDate}
                AND so.status NOT IN ('cancelled')
            GROUP BY u.id, u.first_name, u.last_name
            ORDER BY revenue DESC
            LIMIT ?
        `, [limit]);

        // Top Technicians
        const servicePerformers = await query(`
            SELECT 
                u.id,
                CONCAT(u.first_name, ' ', u.last_name) AS name,
                SUBSTRING(u.first_name, 1, 1) AS initials,
                COUNT(jc.id) AS jobs,
                COALESCE(SUM(jc.total_amount), 0) AS revenue
            FROM users u
            INNER JOIN job_cards jc ON u.id = jc.created_by
            WHERE jc.created_at >= ${startDate}
                AND jc.status = 'completed'
            GROUP BY u.id, u.first_name, u.last_name
            ORDER BY jobs DESC
            LIMIT ?
        `, [limit]);

        res.json({
            success: true,
            data: {
                sales: salesPerformers,
                service: servicePerformers,
                period
            }
        });
    } catch (error) { next(error); }
});

/**
 * @swagger
 * /api/dashboard/activities:
 *   get:
 *     summary: Get recent activities feed
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *     responses:
 *       200:
 *         description: Recent activities retrieved successfully
 */
router.get('/activities', authenticate, async (req, res, next) => {
    try {
        const limit = parseInt(req.query.limit) || 10;
        const userId = req.user.id;
        const roleName = req.user.role_name || 'user';
        const isAdmin = ['super_admin', 'admin', 'manager'].includes(roleName);

        const activities = await query(`
            (SELECT 
                'lead' AS type,
                l.id AS record_id,
                CONCAT('New lead created: ', COALESCE(l.name, l.customer_name)) AS description,
                l.created_at AS time,
                NULL AS user_name,
                NULL AS user_initial
            FROM leads l
            WHERE l.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
                ${isAdmin ? '' : `AND l.assigned_to = ${userId}`}
            ORDER BY l.created_at DESC
            LIMIT ?)
            
            UNION ALL
            
            (SELECT 
                'sale' AS type,
                so.id AS record_id,
                CONCAT('Sale order #', so.order_number, ' created - PKR ', FORMAT(so.total_amount, 0)) AS description,
                so.created_at AS time,
                CONCAT(u.first_name, ' ', u.last_name) AS user_name,
                SUBSTRING(u.first_name, 1, 1) AS user_initial
            FROM sales_orders so
            LEFT JOIN users u ON so.created_by = u.id
            WHERE so.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
                ${isAdmin ? '' : `AND so.created_by = ${userId}`}
            ORDER BY so.created_at DESC
            LIMIT ?)
            
            UNION ALL
            
            (SELECT 
                'invoice' AS type,
                i.id AS record_id,
                CONCAT('Invoice #', i.invoice_number, ' - ', i.status) AS description,
                i.created_at AS time,
                CONCAT(u.first_name, ' ', u.last_name) AS user_name,
                SUBSTRING(u.first_name, 1, 1) AS user_initial
            FROM invoices i
            LEFT JOIN users u ON i.created_by = u.id
            WHERE i.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
            ORDER BY i.created_at DESC
            LIMIT ?)
            
            UNION ALL
            
            (SELECT 
                'service' AS type,
                jc.id AS record_id,
                CONCAT('Job card #', jc.job_card_number, ' - ', jc.status) AS description,
                jc.created_at AS time,
                CONCAT(u.first_name, ' ', u.last_name) AS user_name,
                SUBSTRING(u.first_name, 1, 1) AS user_initial
            FROM job_cards jc
            LEFT JOIN users u ON jc.created_by = u.id
            WHERE jc.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
                ${isAdmin ? '' : `AND jc.created_by = ${userId}`}
            ORDER BY jc.created_at DESC
            LIMIT ?)
            
            ORDER BY time DESC
            LIMIT ?
        `, [limit, limit, limit, limit, limit]);

        res.json({
            success: true,
            data: activities
        });
    } catch (error) { next(error); }
});

/**
 * @swagger
 * /api/dashboard/kpis:
 *   get:
 *     summary: Get key performance indicators (Admin only)
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: KPIs retrieved successfully
 */
router.get('/kpis', authenticate, async (req, res, next) => {
    try {
        const roleName = req.user.role_name || 'user';
        const isAdmin = ['super_admin', 'admin', 'manager'].includes(roleName);

        if (!isAdmin) {
            return res.status(403).json({ success: false, message: 'Access denied' });
        }

        // Current Month vs Previous Month Comparisons
        const [currentRevenue, previousRevenue, currentLeads, previousLeads, conversionRate] = await Promise.all([
            query(`SELECT COALESCE(SUM(total_amount), 0) AS value FROM sales_orders 
                   WHERE MONTH(order_date) = MONTH(CURDATE()) AND YEAR(order_date) = YEAR(CURDATE()) AND status != 'cancelled'`),
            query(`SELECT COALESCE(SUM(total_amount), 0) AS value FROM sales_orders 
                   WHERE MONTH(order_date) = MONTH(DATE_SUB(CURDATE(), INTERVAL 1 MONTH)) 
                   AND YEAR(order_date) = YEAR(DATE_SUB(CURDATE(), INTERVAL 1 MONTH)) AND status != 'cancelled'`),
            query(`SELECT COUNT(*) AS value FROM leads WHERE MONTH(created_at) = MONTH(CURDATE()) AND YEAR(created_at) = YEAR(CURDATE())`),
            query(`SELECT COUNT(*) AS value FROM leads WHERE MONTH(created_at) = MONTH(DATE_SUB(CURDATE(), INTERVAL 1 MONTH)) 
                   AND YEAR(created_at) = YEAR(DATE_SUB(CURDATE(), INTERVAL 1 MONTH))`),
            query(`SELECT 
                    ROUND(COUNT(CASE WHEN status = 'converted' THEN 1 END) * 100.0 / NULLIF(COUNT(*), 0), 2) AS value
                   FROM leads WHERE MONTH(created_at) = MONTH(CURDATE()) AND YEAR(created_at) = YEAR(CURDATE())`)
        ]);

        const currRev = parseFloat(currentRevenue[0]?.value || 0);
        const prevRev = parseFloat(previousRevenue[0]?.value || 0);
        const currLeads = parseInt(currentLeads[0]?.value || 0);
        const prevLeads = parseInt(previousLeads[0]?.value || 0);

        res.json({
            success: true,
            data: {
                revenue: {
                    current: currRev,
                    previous: prevRev,
                    change: prevRev > 0 ? Math.round((currRev - prevRev) / prevRev * 100) : 0,
                    trend: currRev >= prevRev ? 'up' : 'down'
                },
                leads: {
                    current: currLeads,
                    previous: prevLeads,
                    change: prevLeads > 0 ? Math.round((currLeads - prevLeads) / prevLeads * 100) : 0,
                    trend: currLeads >= prevLeads ? 'up' : 'down'
                },
                conversionRate: parseFloat(conversionRate[0]?.value || 0)
            }
        });
    } catch (error) { next(error); }
});

/**
 * @swagger
 * /api/dashboard/alerts:
 *   get:
 *     summary: Get system alerts and notifications
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Alerts retrieved successfully
 */
router.get('/alerts', authenticate, async (req, res, next) => {
    try {
        const roleName = req.user.role_name || 'user';
        const isAdmin = ['super_admin', 'admin', 'manager'].includes(roleName);

        const alerts = [];

        if (isAdmin) {
            // Low stock alerts
            const lowStock = await query(`
                SELECT id, name, current_stock, COALESCE(reorder_level, min_stock, 0) AS minimum_stock
                FROM parts
                WHERE current_stock <= COALESCE(reorder_level, min_stock, 0) AND is_active = TRUE
                LIMIT 5
            `);
            lowStock.forEach(item => {
                alerts.push({
                    type: 'warning',
                    category: 'inventory',
                    message: `Low stock: ${item.name} (${item.current_stock}/${item.minimum_stock})`,
                    recordId: item.id,
                    recordTable: 'parts'
                });
            });

            // Overdue invoices
            const overdueInvoices = await query(`
                SELECT id, invoice_number, balance_amount, due_date
                FROM invoices
                WHERE due_date < CURDATE() AND status NOT IN ('paid', 'cancelled')
                LIMIT 5
            `);
            overdueInvoices.forEach(inv => {
                alerts.push({
                    type: 'danger',
                    category: 'finance',
                    message: `Overdue invoice #${inv.invoice_number} - PKR ${inv.balance_amount?.toLocaleString()}`,
                    recordId: inv.id,
                    recordTable: 'invoices'
                });
            });

            // Pending old deliveries
            const pendingDeliveries = await query(`
                SELECT id, order_number, order_date
                FROM sales_orders
                WHERE status IN ('confirmed', 'invoiced') AND order_date < DATE_SUB(CURDATE(), INTERVAL 7 DAY)
                LIMIT 5
            `);
            pendingDeliveries.forEach(order => {
                alerts.push({
                    type: 'info',
                    category: 'sales',
                    message: `Pending delivery: Order #${order.order_number}`,
                    recordId: order.id,
                    recordTable: 'sales_orders'
                });
            });
        }

        // Sort by severity
        alerts.sort((a, b) => {
            const severity = { danger: 0, warning: 1, info: 2 };
            return severity[a.type] - severity[b.type];
        });

        res.json({
            success: true,
            data: alerts
        });
    } catch (error) { next(error); }
});

// Legacy endpoints for backward compatibility
router.get('/recent-leads', authenticate, async (req, res, next) => {
    try {
        const leads = await query(
            `SELECT l.id, l.lead_code AS lead_number, COALESCE(l.name, l.customer_name) as name, l.phone, l.status, l.created_at
             FROM leads l ORDER BY l.created_at DESC LIMIT 10`
        );
        res.json({ success: true, data: leads });
    } catch (error) { next(error); }
});

router.get('/recent-sales', authenticate, async (req, res, next) => {
    try {
        const sales = await query(
            `SELECT so.id, so.order_number, CONCAT(c.first_name, ' ', c.last_name) as customer, so.total_amount AS grand_total, so.status, so.order_date
             FROM sales_orders so JOIN customers c ON so.customer_id = c.id ORDER BY so.created_at DESC LIMIT 10`
        );
        res.json({ success: true, data: sales });
    } catch (error) { next(error); }
});

router.get('/sales-chart', authenticate, async (req, res, next) => {
    try {
        const data = await query(
            `SELECT DATE_FORMAT(order_date, '%Y-%m') as month, COUNT(*) as count, SUM(total_amount) as revenue
             FROM sales_orders WHERE order_date >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH) AND status != 'cancelled'
             GROUP BY DATE_FORMAT(order_date, '%Y-%m') ORDER BY month`
        );
        res.json({ success: true, data });
    } catch (error) { next(error); }
});

router.get('/inventory-by-status', authenticate, async (req, res, next) => {
    try {
        const data = await query('SELECT status, COUNT(*) as count FROM vehicles GROUP BY status');
        res.json({ success: true, data });
    } catch (error) { next(error); }
});

module.exports = router;
