const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const ledger = require('../controllers/ledger.controller');

router.get('/stats', authenticate, authorize('super_admin', 'admin', 'accountant', 'payroll_clerk', 'hr_admin'), ledger.getStats);
router.get('/accounts', authenticate, authorize('super_admin', 'admin', 'accountant', 'payroll_clerk', 'hr_admin'), ledger.getAccounts);
router.get('/', authenticate, authorize('super_admin', 'admin', 'accountant', 'payroll_clerk', 'hr_admin'), ledger.listLedger);
router.post('/', authenticate, authorize('super_admin', 'admin', 'accountant'), ledger.createManualEntry);
router.get('/:id', authenticate, authorize('super_admin', 'admin', 'accountant', 'payroll_clerk', 'hr_admin'), ledger.getLedgerEntry);

module.exports = router;
