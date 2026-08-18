/**
 * Accounts & Petty Cash — /api/accounts (page `accounts`).
 *
 * Every write is its own Role Jobs grant: create/edit/delete for the accounts
 * themselves and for payables, `transfer` for moving money (including the
 * petty-cash sweep), `recordPayment` for paying a payable.
 */
const express = require('express');
const router = express.Router();
const { authenticate, authorizeAction } = require('../middleware/auth');
const controller = require('../controllers/accounts.controller');


// Summary, balance sheet, limit rule — before /:id so the words never resolve as ids.
router.get('/summary', authenticate, authorizeAction('accounts', 'view'), controller.summary);
router.get('/balance-sheet', authenticate, authorizeAction('accounts', 'view'), controller.balanceSheet);
router.get('/limit-status', authenticate, authorizeAction('accounts', 'view'), controller.limitStatus);
router.post('/sweep', authenticate, authorizeAction('accounts', 'transfer'), controller.sweep);

router.get('/transfers', authenticate, authorizeAction('accounts', 'view'), controller.listTransfers);
router.post('/transfers', authenticate, authorizeAction('accounts', 'transfer'), controller.createTransfer);
router.post('/transfers/:id/reverse', authenticate, authorizeAction('accounts', 'transfer'), controller.reverseTransfer);

router.get('/payables', authenticate, authorizeAction('accounts', 'view'), controller.listPayables);
router.post('/payables', authenticate, authorizeAction('accounts', 'create'), controller.createPayable);
router.put('/payables/:id', authenticate, authorizeAction('accounts', 'edit'), controller.updatePayable);
router.delete('/payables/:id', authenticate, authorizeAction('accounts', 'delete'), controller.deletePayable);
router.post('/payables/:id/pay', authenticate, authorizeAction('accounts', 'recordPayment'), controller.payPayable);

router.get('/receivables', authenticate, authorizeAction('accounts', 'view'), controller.listReceivables);

router.get('/', authenticate, authorizeAction('accounts', 'view'), controller.list);
router.post('/', authenticate, authorizeAction('accounts', 'create'), controller.create);
router.get('/:id', authenticate, authorizeAction('accounts', 'view'), controller.getOne);
router.put('/:id', authenticate, authorizeAction('accounts', 'edit'), controller.update);
router.delete('/:id', authenticate, authorizeAction('accounts', 'delete'), controller.remove);
router.post('/:id/adjust', authenticate, authorizeAction('accounts', 'edit'), controller.adjust);

module.exports = router;
