const express = require('express');
const controller = require('../controllers/pdfManagement.controller');
const { authenticate, authorizeRouter } = require('../middleware/auth');
const router = express.Router();
// The template designer: listing needs the page, changing a template needs the
// matching Role Jobs action. Rendering and downloading a document (further
// down) stays on plain `authenticate`, because it is gated by the permission
// on the document itself, not on this page.
const admin = [authenticate, authorizeRouter('pdf_management', [
  { pattern: /^\/variables\/bulk$/, action: 'create' },
])];

router.get('/templates', admin, controller.listTemplates);
router.post('/templates', admin, controller.createTemplate);
router.get('/templates/:id', admin, controller.getTemplate);
router.put('/templates/:id', admin, controller.updateTemplate);
router.delete('/templates/:id', admin, controller.deleteTemplate);
router.get('/usages', admin, controller.listUsages);
router.put('/usages/:documentType', admin, controller.assignUsage);
router.get('/variables', authenticate, controller.variables);
router.get('/variables/preview/:documentType', authenticate, controller.variablePreview);
router.post('/variables', admin, controller.createVariable);
router.post('/variables/bulk', admin, controller.bulkVariables);
router.delete('/variables/:id', admin, controller.deleteVariable);
/**
 * Rendering a document is judged on the document's own page, not on this one.
 *
 * That was always the intention and was never actually implemented: these four
 * routes took `authenticate` alone, so any signed-in account could render or
 * download any quotation, booking, order or invoice by id — and a rendered
 * document carries every column the API would otherwise have withheld. The
 * loader tries the vehicle model and its parts twin, so both sides' pages are
 * accepted here the same way.
 */
// Custom (free-text) documents print under the same document types.
const DOCUMENT_PAGES = {
  quotation: ['quotations', 'part_quotations', 'custom_quotations'],
  booking: ['bookings', 'part_bookings', 'custom_bookings'],
  order: ['sales_orders', 'part_invoices'],
  invoice: ['invoices', 'part_invoices', 'custom_invoices'],
};

const canReachDocument = (action) => (req, res, next) => {
  const pages = DOCUMENT_PAGES[req.params.documentType];
  // An unknown type resolves to no document at all; let the controller answer.
  if (!pages) return next();
  return authorizeRouter(pages, [{ pattern: /.*/, action }])(req, res, next);
};

router.get('/resolved-html/:documentType/:id', authenticate, canReachDocument('view'), controller.resolvedHtml);
// What the View modal renders and what Print prints — same layout as the download.
router.get('/print-html/:documentType/:id', authenticate, canReachDocument('view'), controller.printHtml);
router.get('/download/:documentType/:id', authenticate, canReachDocument('downloadPdf'), controller.downloadOne);
router.post('/download/:documentType/bulk', authenticate, canReachDocument('downloadPdf'), controller.downloadBulk);
module.exports = router;
