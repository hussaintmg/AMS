/**
 * Custom quotations / bookings / invoices — /api/custom/:kind
 *
 * `kind` is `quotations`, `bookings` or `invoices`. Every route is guarded
 * three ways: the module must be switched on (Server Management → Custom),
 * the role must hold the matching page (custom_quotations…), and the action
 * must be granted in Role Jobs.
 *
 * The guards are written out per kind rather than resolved from `:kind` at
 * request time, because `scripts/audit_page_operations.js` reads this file to
 * prove the capability table honest — it can only see a guard it can read.
 * `whenKind` passes a request down to the next route until the kind fits, the
 * same dispatch parts.routes.js uses for stock adjustments.
 */
const express = require('express');
const router = express.Router();
const { authenticate, authorizeAction } = require('../middleware/auth');
const { requireModule } = require('../utils/moduleFlags');
const controller = require('../controllers/customDocuments.controller');

const MODULE_OF = { quotations: 'custom_quotations', bookings: 'custom_bookings', invoices: 'custom_invoices' };

/** 404 unless the module for this kind is on. */
const moduleGuard = (req, res, next) => {
  const key = MODULE_OF[req.params.kind];
  if (!key) return res.status(404).json({ success: false, message: 'Unknown custom document type' });
  return requireModule(key)(req, res, next);
};
const whenKind = (kind) => (req, res, next) => (req.params.kind === kind ? next() : next('route'));

router.use('/:kind', authenticate, moduleGuard);

// ── Custom quotations ─────────────────────────────────────────────────────
router.get('/:kind', whenKind('quotations'), authorizeAction('custom_quotations', 'view'), controller.list);
router.get('/:kind/summary', whenKind('quotations'), authorizeAction('custom_quotations', 'view'), controller.summary);
router.get('/:kind/:id', whenKind('quotations'), authorizeAction('custom_quotations', 'view'), controller.getOne);
router.post('/:kind', whenKind('quotations'), authorizeAction('custom_quotations', 'create'), controller.create);
router.put('/:kind/:id', whenKind('quotations'), authorizeAction('custom_quotations', 'edit'), controller.update);
router.put('/:kind/:id/status', whenKind('quotations'), authorizeAction('custom_quotations', 'edit'), controller.updateStatus);
router.delete('/:kind/:id', whenKind('quotations'), authorizeAction('custom_quotations', 'delete'), controller.remove);
router.post('/:kind/:id/approve', whenKind('quotations'), authorizeAction('custom_quotations', 'approve'), controller.approve);
router.post('/:kind/:id/convert', whenKind('quotations'), authorizeAction('custom_quotations', 'convert'), controller.convert);
router.post('/:kind/:id/email', whenKind('quotations'), authorizeAction('custom_quotations', 'sendEmail'), controller.sendEmail);

// ── Custom bookings ───────────────────────────────────────────────────────
router.get('/:kind', whenKind('bookings'), authorizeAction('custom_bookings', 'view'), controller.list);
router.get('/:kind/summary', whenKind('bookings'), authorizeAction('custom_bookings', 'view'), controller.summary);
router.get('/:kind/:id', whenKind('bookings'), authorizeAction('custom_bookings', 'view'), controller.getOne);
router.post('/:kind', whenKind('bookings'), authorizeAction('custom_bookings', 'create'), controller.create);
router.put('/:kind/:id', whenKind('bookings'), authorizeAction('custom_bookings', 'edit'), controller.update);
router.put('/:kind/:id/status', whenKind('bookings'), authorizeAction('custom_bookings', 'edit'), controller.updateStatus);
router.delete('/:kind/:id', whenKind('bookings'), authorizeAction('custom_bookings', 'delete'), controller.remove);
// A custom booking converts into a custom invoice with its own grant (client decision).
router.post('/:kind/:id/convert', whenKind('bookings'), authorizeAction('custom_bookings', 'convert'), controller.convert);
router.post('/:kind/:id/email', whenKind('bookings'), authorizeAction('custom_bookings', 'sendEmail'), controller.sendEmail);

// ── Custom invoices ───────────────────────────────────────────────────────
router.get('/:kind', whenKind('invoices'), authorizeAction('custom_invoices', 'view'), controller.list);
router.get('/:kind/summary', whenKind('invoices'), authorizeAction('custom_invoices', 'view'), controller.summary);
router.get('/:kind/:id', whenKind('invoices'), authorizeAction('custom_invoices', 'view'), controller.getOne);
// Issuing on credit is its own grant on top of create (whenCredit dispatches).
const whenCredit = (req, res, next) => (String(req.body?.paymentTerm || '').toLowerCase() === 'credit' ? next() : next('route'));
router.post('/:kind', whenKind('invoices'), whenCredit, authorizeAction('custom_invoices', 'changePaymentTerm'), authorizeAction('custom_invoices', 'create'), controller.create);
router.post('/:kind', whenKind('invoices'), authorizeAction('custom_invoices', 'create'), controller.create);
router.put('/:kind/:id', whenKind('invoices'), authorizeAction('custom_invoices', 'edit'), controller.update);
router.put('/:kind/:id/status', whenKind('invoices'), authorizeAction('custom_invoices', 'edit'), controller.updateStatus);
router.delete('/:kind/:id', whenKind('invoices'), authorizeAction('custom_invoices', 'delete'), controller.remove);
router.post('/:kind/:id/payments', whenKind('invoices'), authorizeAction('custom_invoices', 'recordPayment'), controller.recordPayment);
router.post('/:kind/:id/email', whenKind('invoices'), authorizeAction('custom_invoices', 'sendEmail'), controller.sendEmail);

module.exports = router;
