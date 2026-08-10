const express = require('express');
const router = express.Router();
const { authenticate, authorizeAction } = require('../middleware/auth');
const { fieldMask } = require('../utils/fieldPermissions');
const payroll = require('../controllers/payroll.controller');

// Withhold the columns this role may not read, whatever the endpoint returns.
// Payslip lines are masked too — they hang off the period under `lines`.
router.use(fieldMask('payroll'));

router.get('/periods', authenticate, authorizeAction('payroll', 'view'), payroll.listPeriods);
router.post('/periods', authenticate, authorizeAction('payroll', 'create'), payroll.createPeriod);
router.get('/periods/:id/lines', authenticate, authorizeAction('payroll', 'view'), payroll.getPeriodLines);
router.post('/periods/:id/generate', authenticate, authorizeAction('payroll', 'create'), payroll.generateLines);
router.post('/periods/:id/lock', authenticate, authorizeAction('payroll', 'edit'), payroll.lockPeriod);
router.post('/periods/:id/post', authenticate, authorizeAction('payroll', 'edit'), payroll.postPeriod);
router.patch('/lines/:lineId', authenticate, authorizeAction('payroll', 'edit'), payroll.updateLine);

/**
 * @swagger
 * /api/payroll/lines/{lineId}/pay:
 *   post:
 *     tags: [Payroll]
 *     summary: Record a salary payment (full or partial) against one line
 *     security: [{ bearerAuth: [] }]
 */
router.post('/lines/:lineId/pay', authenticate, authorizeAction('payroll', 'edit'), payroll.payLine);
router.delete('/lines/:lineId/payments/:paymentId', authenticate, authorizeAction('payroll', 'delete'), payroll.deletePayment);

/**
 * @swagger
 * /api/payroll/periods/{id}/pay-all:
 *   post:
 *     tags: [Payroll]
 *     summary: Settle every unpaid salary in a period
 *     security: [{ bearerAuth: [] }]
 */
router.post('/periods/:id/pay-all', authenticate, authorizeAction('payroll', 'edit'), payroll.payPeriod);

/**
 * @swagger
 * /api/payroll/employees/{employeeId}/history:
 *   get:
 *     tags: [Payroll]
 *     summary: One employee's salary month by month, with totals
 *     security: [{ bearerAuth: [] }]
 */
router.get('/employees/:employeeId/history', authenticate, authorizeAction('payroll', 'view'), payroll.employeeHistory);
router.get('/outstanding', authenticate, authorizeAction('payroll', 'view'), payroll.outstandingSalaries);

module.exports = router;
