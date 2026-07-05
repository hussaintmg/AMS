const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const payroll = require('../controllers/payroll.controller');

const roles = ['super_admin', 'admin', 'payroll_clerk', 'accountant'];

router.get('/periods', authenticate, authorize(...roles), payroll.listPeriods);
router.post('/periods', authenticate, authorize(...roles), payroll.createPeriod);
router.get('/periods/:id/lines', authenticate, authorize(...roles), payroll.getPeriodLines);
router.post('/periods/:id/generate', authenticate, authorize(...roles), payroll.generateLines);
router.post('/periods/:id/lock', authenticate, authorize(...roles), payroll.lockPeriod);
router.post('/periods/:id/post', authenticate, authorize(...roles), payroll.postPeriod);
router.patch('/lines/:lineId', authenticate, authorize(...roles), payroll.updateLine);

module.exports = router;
