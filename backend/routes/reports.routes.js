const express = require('express');
const router = express.Router();
const reportsController = require('../controllers/reports.controller');
const { authenticate, authorize } = require('../middleware/auth');

// Routes
router.post('/', authenticate, authorize('super_admin', 'admin', 'manager'), reportsController.createReport);
router.post('/:id/execute', authenticate, authorize('super_admin', 'admin', 'manager'), reportsController.executeReport); // New Execution Route
router.get('/', authenticate, authorize('super_admin', 'admin', 'manager', 'sales_manager', 'sales_executive'), reportsController.getReports);
// Simple Predefined Reports Routes (Must be before parameterized routes to avoid ID conflict)
router.get('/sales-performance', authenticate, authorize('super_admin', 'admin', 'manager', 'sales_manager', 'sales_executive'), reportsController.getSalesPerformance);
router.get('/sales-by-model', authenticate, authorize('super_admin', 'admin', 'manager', 'sales_manager', 'sales_executive'), reportsController.getSalesByModel);
router.get('/inventory-health', authenticate, authorize('super_admin', 'admin', 'manager', 'inventory_manager'), reportsController.getInventoryHealth);
router.get('/inventory-stock-movement', authenticate, authorize('super_admin', 'admin', 'manager', 'inventory_manager'), reportsController.getInventoryStockMovement);
router.get('/inventory-stock-snapshot', authenticate, authorize('super_admin', 'admin', 'manager', 'inventory_manager'), reportsController.getInventoryStockSnapshot);
router.get('/pending-deliveries', authenticate, authorize('super_admin', 'admin', 'manager', 'sales_manager', 'sales_executive'), reportsController.getPendingDeliveries);
router.get('/customer-receivables', authenticate, authorize('super_admin', 'admin', 'manager', 'accountant', 'sales_manager'), reportsController.getCustomerReceivables);
router.get('/receivables-aging', authenticate, authorize('super_admin', 'admin', 'manager', 'accountant', 'sales_manager'), reportsController.getReceivablesAging);
router.get('/lead-statistics', authenticate, authorize('super_admin', 'admin', 'manager', 'sales_manager', 'sales_executive'), reportsController.getLeadStatistics);
router.get('/service-analytics', authenticate, authorize('super_admin', 'admin', 'manager', 'service_manager', 'service_advisor'), reportsController.getServiceAnalytics);
router.get('/service-kpi-detail', authenticate, authorize('super_admin', 'admin', 'manager', 'service_manager', 'service_advisor'), reportsController.getServiceKpiDetail);
router.get('/low-stock-parts', authenticate, authorize('super_admin', 'admin', 'manager', 'inventory_manager'), reportsController.getLowStockParts);
router.get('/expenses', authenticate, authorize('super_admin', 'admin', 'manager', 'accountant'), reportsController.getExpenseReport);
router.get('/payments', authenticate, authorize('super_admin', 'admin', 'manager', 'accountant'), reportsController.getPaymentReport);
router.get('/employees', authenticate, authorize('super_admin', 'admin', 'manager', 'hr_admin'), reportsController.getEmployeeReport);

// Parameterized Routes
router.get('/:id', authenticate, authorize('super_admin', 'admin', 'manager'), reportsController.getReportById);
router.put('/:id', authenticate, authorize('super_admin', 'admin', 'manager'), reportsController.updateReport);
router.delete('/:id', authenticate, authorize('super_admin', 'admin'), reportsController.deleteReport);

module.exports = router;
