const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const ledger = require('../controllers/ledger.controller');

router.get('/', authenticate, authorize('super_admin', 'admin', 'accountant', 'payroll_clerk', 'hr_admin'), ledger.listLedger);

module.exports = router;
