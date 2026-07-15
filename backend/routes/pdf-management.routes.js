const express = require('express');
const controller = require('../controllers/pdfManagement.controller');
const { authenticate, authorize } = require('../middleware/auth');
const router = express.Router();
const admin = [authenticate, authorize('super_admin')];

router.get('/templates', admin, controller.listTemplates);
router.post('/templates', admin, controller.createTemplate);
router.get('/templates/:id', admin, controller.getTemplate);
router.put('/templates/:id', admin, controller.updateTemplate);
router.delete('/templates/:id', admin, controller.deleteTemplate);
router.get('/usages', admin, controller.listUsages);
router.put('/usages/:documentType', admin, controller.assignUsage);
router.get('/variables', authenticate, controller.variables);
router.post('/variables', admin, controller.createVariable);
router.post('/variables/bulk', admin, controller.bulkVariables);
router.get('/download/:documentType/:id', authenticate, controller.downloadOne);
router.post('/download/:documentType/bulk', authenticate, controller.downloadBulk);
module.exports = router;
