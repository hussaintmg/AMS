const express = require('express');
const router = express.Router();
const { authenticate, authorizeAction } = require('../middleware/auth');
const ledger = require('../controllers/ledger.controller');

router.get('/stats', authenticate, authorizeAction('ledger', 'view'), ledger.getStats);
router.get('/accounts', authenticate, authorizeAction('ledger', 'view'), ledger.getAccounts);
router.get('/', authenticate, authorizeAction('ledger', 'view'), ledger.listLedger);
router.post('/', authenticate, authorizeAction('ledger', 'create'), ledger.createManualEntry);
router.get('/:id', authenticate, authorizeAction('ledger', 'view'), ledger.getLedgerEntry);

module.exports = router;
