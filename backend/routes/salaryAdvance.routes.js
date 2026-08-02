/**
 * Salary advance routes — issue, list, repay and cancel advances against pay.
 *
 * @swagger
 * tags:
 *   - name: Salary advances
 *     description: Money paid to employees ahead of payday, and what they owe back
 */
const express = require('express');
const router = express.Router();
const { authenticate, authorizeAction } = require('../middleware/auth');
const advances = require('../controllers/salaryAdvance.controller');

// Advances are part of paying people, so they sit behind the payroll page's
// permissions rather than a page of their own.
router.get('/', authenticate, authorizeAction('payroll', 'view'), advances.list);
router.get('/outstanding/:employeeId', authenticate, authorizeAction('payroll', 'view'), advances.outstanding);
router.post('/', authenticate, authorizeAction('payroll', 'create'), advances.create);
router.post('/:id/repay', authenticate, authorizeAction('payroll', 'edit'), advances.repay);
router.delete('/:id', authenticate, authorizeAction('payroll', 'delete'), advances.cancel);

module.exports = router;
