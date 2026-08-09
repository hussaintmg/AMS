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
router.get('/resolved-html/:documentType/:id', authenticate, controller.resolvedHtml);
// What the View modal renders and what Print prints — same layout as the download.
router.get('/print-html/:documentType/:id', authenticate, controller.printHtml);
router.get('/download/:documentType/:id', authenticate, controller.downloadOne);
router.post('/download/:documentType/bulk', authenticate, controller.downloadBulk);
module.exports = router;
