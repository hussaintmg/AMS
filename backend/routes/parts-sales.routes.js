/**
 * Parts Sales Routes
 *
 * Quotations, bookings, sales orders and invoices for spare parts. These sit
 * under /api/parts-sales and are entirely separate from the vehicle document
 * routes (/api/quotations, /api/bookings, /api/sales, /api/invoices).
 *
 * Permissions reuse the existing sales page keys — a role that may create a
 * quotation may create a parts quotation — so no new permission has to be
 * granted before the parts screens work.
 *
 * Maintained by Hussain Developer
 * AMS ERP
 */

const express = require('express');
const router = express.Router();
const { authenticate, authorizeAction } = require('../middleware/auth');
const controller = require('../controllers/partsSales.controller');

router.use(authenticate);

const can = (page, action) => authorizeAction(page, action);

// ── Stats ──────────────────────────────────────────────────────────────────
router.get('/stats', can('parts', 'view'), controller.getStats);

// ── Bulk email / cancel, one route per document type ───────────────────────
const BULK_PERMISSION = { quotation: 'quotations', booking: 'bookings', order: 'sales_orders', invoice: 'invoices' };
Object.entries(BULK_PERMISSION).forEach(([type, page]) => {
    // The controller re-checks email vs delete against the same page, so `view`
    // here only gates reaching the endpoint at all.
    router.post(`/bulk/${type}`, can(page, 'view'), (req, res, next) => {
        req.params.type = type;
        return controller.bulkDocuments(req, res, next);
    });
});

// ── Quotations ─────────────────────────────────────────────────────────────
router.get('/quotations', can('quotations', 'view'), controller.getAllQuotations);
router.get('/quotations/:id', can('quotations', 'view'), controller.getQuotationById);
router.post('/quotations', can('quotations', 'create'), controller.createQuotation);
router.put('/quotations/:id', can('quotations', 'edit'), controller.updateQuotation);
router.delete('/quotations/:id', can('quotations', 'delete'), controller.deleteQuotation);
router.patch('/quotations/:id/status', can('quotations', 'edit'), controller.updateQuotationStatus);
router.post('/quotations/:id/approve', can('quotations', 'approve'), controller.approveQuotation);
// The parts flow is quotation → invoice directly; the invoice moves the stock,
// so converting needs create on invoices.
router.post('/quotations/:id/convert', can('invoices', 'create'), controller.convertQuotationToInvoice);
// Email and PDF reuse the vehicle documents' templates — see the controller.
router.post('/quotations/:id/send-email', can('quotations', 'sendEmail'), controller.sendQuotationEmail);
router.get('/quotations/:id/estimate/pdf', can('quotations', 'downloadPdf'), controller.downloadQuotationEstimate);
router.post('/quotations/:id/estimate/email', can('quotations', 'sendEmail'), controller.sendQuotationEstimateEmail);

// ── Bookings ───────────────────────────────────────────────────────────────
router.get('/bookings', can('bookings', 'view'), controller.getAllBookings);
router.get('/bookings/:id', can('bookings', 'view'), controller.getBookingById);
router.post('/bookings', can('bookings', 'create'), controller.createBooking);
router.put('/bookings/:id', can('bookings', 'edit'), controller.updateBooking);
router.delete('/bookings/:id', can('bookings', 'delete'), controller.deleteBooking);
// Converting a booking raises an order and its invoice, so it needs create on orders.
router.post('/bookings/:id/convert', can('sales_orders', 'create'), controller.convertBookingToOrder);
router.post('/bookings/:id/send-email', can('bookings', 'sendEmail'), controller.sendBookingEmail);

// ── Sales orders ───────────────────────────────────────────────────────────
router.get('/orders', can('sales_orders', 'view'), controller.getAllOrders);
router.get('/orders/:id', can('sales_orders', 'view'), controller.getOrderById);
router.post('/orders', can('sales_orders', 'create'), controller.createOrder);
router.put('/orders/:id/status', can('sales_orders', 'edit'), controller.updateOrderStatus);
router.delete('/orders/:id', can('sales_orders', 'delete'), controller.deleteOrder);
router.post('/orders/:id/send-email', can('sales_orders', 'sendEmail'), controller.sendOrderEmail);

// ── Invoices ───────────────────────────────────────────────────────────────
router.get('/invoices', can('invoices', 'view'), controller.getAllInvoices);
router.get('/invoices/:id', can('invoices', 'view'), controller.getInvoiceById);
router.post('/invoices', can('invoices', 'create'), controller.createInvoice);
router.put('/invoices/:id/status', can('invoices', 'edit'), controller.updateInvoiceStatus);
router.post('/invoices/:id/payments', can('invoices', 'edit'), controller.recordPayment);
router.post('/invoices/:id/send-email', can('invoices', 'sendEmail'), controller.sendInvoiceEmail);
// Cancelling is what returns the stock, so it is the only way to void an invoice.
router.delete('/invoices/:id', can('invoices', 'delete'), controller.deleteInvoice);

module.exports = router;
