const express = require('express');
const router = express.Router();
const { authenticate, authorizeAction } = require('../middleware/auth');
const payroll = require('../controllers/payroll.controller');

router.get('/periods', authenticate, authorizeAction('payroll', 'view'), payroll.listPeriods);
router.post('/periods', authenticate, authorizeAction('payroll', 'create'), payroll.createPeriod);
router.get('/periods/:id/lines', authenticate, authorizeAction('payroll', 'view'), payroll.getPeriodLines);
router.post('/periods/:id/generate', authenticate, authorizeAction('payroll', 'create'), payroll.generateLines);
router.post('/periods/:id/lock', authenticate, authorizeAction('payroll', 'edit'), payroll.lockPeriod);
router.post('/periods/:id/post', authenticate, authorizeAction('payroll', 'edit'), payroll.postPeriod);
router.patch('/lines/:lineId', authenticate, authorizeAction('payroll', 'edit'), payroll.updateLine);

module.exports = router;
