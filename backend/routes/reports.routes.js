const express = require('express');
const router = express.Router();
const reportsController = require('../controllers/reports.controller');
const { authenticate, authorizeAction } = require('../middleware/auth');

// Routes
router.post('/', authenticate, authorizeAction('reports', 'create'), reportsController.createReport);
router.post('/:id/execute', authenticate, authorizeAction('reports', 'create'), reportsController.executeReport);
router.get('/', authenticate, authorizeAction('reports', 'view'), reportsController.getReports);
// Simple Predefined Reports Routes (Must be before parameterized routes to avoid ID conflict)
router.get('/sales-performance', authenticate, authorizeAction('reports', 'view'), reportsController.getSalesPerformance);
router.get('/sales-by-model', authenticate, authorizeAction('reports', 'view'), reportsController.getSalesByModel);
router.get('/inventory-health', authenticate, authorizeAction('reports', 'view'), reportsController.getInventoryHealth);
router.get('/inventory-stock-movement', authenticate, authorizeAction('reports', 'view'), reportsController.getInventoryStockMovement);
router.get('/inventory-stock-snapshot', authenticate, authorizeAction('reports', 'view'), reportsController.getInventoryStockSnapshot);
router.get('/pending-deliveries', authenticate, authorizeAction('reports', 'view'), reportsController.getPendingDeliveries);
router.get('/customer-receivables', authenticate, authorizeAction('reports', 'view'), reportsController.getCustomerReceivables);
router.get('/receivables-aging', authenticate, authorizeAction('reports', 'view'), reportsController.getReceivablesAging);
router.get('/lead-statistics', authenticate, authorizeAction('reports', 'view'), reportsController.getLeadStatistics);
router.get('/service-analytics', authenticate, authorizeAction('reports', 'view'), reportsController.getServiceAnalytics);
router.get('/service-kpi-detail', authenticate, authorizeAction('reports', 'view'), reportsController.getServiceKpiDetail);
router.get('/low-stock-parts', authenticate, authorizeAction('reports', 'view'), reportsController.getLowStockParts);
router.get('/expenses', authenticate, authorizeAction('reports', 'view'), reportsController.getExpenseReport);
router.get('/payments', authenticate, authorizeAction('reports', 'view'), reportsController.getPaymentReport);
router.get('/employees', authenticate, authorizeAction('reports', 'view'), reportsController.getEmployeeReport);

// Parameterized Routes
router.get('/:id', authenticate, authorizeAction('reports', 'view'), reportsController.getReportById);
router.put('/:id', authenticate, authorizeAction('reports', 'edit'), reportsController.updateReport);
router.delete('/:id', authenticate, authorizeAction('reports', 'delete'), reportsController.deleteReport);

module.exports = router;
