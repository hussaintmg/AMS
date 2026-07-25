const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { authenticate } = require('../middleware/auth');
const { authorizePage } = require('../middleware/auth');

const templatesCtrl = require('../controllers/emailTemplates.controller');
const usageCtrl = require('../controllers/emailUsage.controller');
const variablesCtrl = require('../controllers/emailVariables.controller');
const assetsCtrl = require('../controllers/emailAssets.controller');
const previewCtrl = require('../controllers/emailPreview.controller');
const testCtrl = require('../controllers/emailTest.controller');
const componentsCtrl = require('../controllers/emailComponents.controller');
const configCtrl = require('../controllers/emailConfig.controller');
const queueCtrl = require('../controllers/emailQueue.controller');
const logsCtrl = require('../controllers/emailLogs.controller');

const router = express.Router();

const UPLOAD_TEMP = path.join(__dirname, '..', 'uploads', 'email-assets', '_temp');
fs.mkdirSync(UPLOAD_TEMP, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_TEMP),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  }
});

const upload = multer({
  storage,
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) return cb(new Error('Only image uploads are allowed'));
    cb(null, true);
  },
  limits: { fileSize: 10 * 1024 * 1024 }
});

const uploadDataFile = multer({
  storage,
  fileFilter: (_req, file, cb) => {
    const allowed = [
      'text/csv', 'application/csv', 'text/plain',
      'application/json', 'text/json',
      'application/vnd.ms-excel',
      'application/octet-stream'
    ];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(file.mimetype) || ['.csv', '.json', '.txt', '.tsv'].includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV, JSON, or text files are allowed'));
    }
  },
  limits: { fileSize: 5 * 1024 * 1024 }
});

const authAndPage = [authenticate, authorizePage('email_templates')];

/**
 * @swagger
 * tags:
 *   - name: Email Templates
 *     description: Email template CRUD and activation
 *   - name: Email Template Versions
 *     description: Template version history and restore
 *   - name: Email Usage
 *     description: Email usage and variable mapping
 *   - name: Email Variables
 *     description: Safe variable registry
 *   - name: Email Assets
 *     description: Email image asset management
 *   - name: Email Preview
 *     description: Render and preview emails
 *   - name: Email Test
 *     description: Send test emails
 *   - name: Email Components
 *     description: Global reusable email components
 *   - name: Email Config
 *     description: SMTP configuration
 *   - name: Email Queue
 *     description: Email queue management
 *   - name: Email Logs
 *     description: Email sending logs
 *
 * components:
 *   securitySchemes:
 *     bearerAuth:
 *       type: http
 *       scheme: bearer
 *       bearerFormat: JWT
 *
 * /api/email/templates:
 *   get:
 *     summary: List email templates
 *     tags: [Email Templates]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer }
 *       - in: query
 *         name: limit
 *         schema: { type: integer }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [draft, published, archived] }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *     responses:
 *       200: { description: Templates returned }
 *   post:
 *     summary: Create template
 *     tags: [Email Templates]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [templateName]
 *             properties:
 *               templateName: { type: string }
 *               subject: { type: string }
 *               html: { type: string }
 *               css: { type: string }
 *               plainText: { type: string }
 *     responses:
 *       201: { description: Template created }
 *
 * /api/email/templates/stats:
 *   get:
 *     summary: Get template statistics
 *     tags: [Email Templates]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Stats returned }
 *
 * /api/email/templates/{id}:
 *   get:
 *     summary: Get template by ID
 *     tags: [Email Templates]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Template returned }
 *   put:
 *     summary: Update template (auto-increments version)
 *     tags: [Email Templates]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               templateName: { type: string }
 *               subject: { type: string }
 *               html: { type: string }
 *               css: { type: string }
 *               plainText: { type: string }
 *               status: { type: string, enum: [draft, published, archived] }
 *               changeNote: { type: string }
 *     responses:
 *       200: { description: Template updated }
 *   delete:
 *     summary: Soft delete template
 *     tags: [Email Templates]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Template deleted }
 *
 * /api/email/templates/{id}/activate:
 *   patch:
 *     summary: Activate template
 *     tags: [Email Templates]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Template activated }
 *
 * /api/email/templates/{id}/deactivate:
 *   patch:
 *     summary: Deactivate template
 *     tags: [Email Templates]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Template deactivated }
 *
 * /api/email/templates/{id}/versions:
 *   get:
 *     summary: Get version history for template
 *     tags: [Email Template Versions]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Versions returned }
 *
 * /api/email/templates/versions/{versionId}/restore:
 *   post:
 *     summary: Restore a specific version (creates new version)
 *     tags: [Email Template Versions]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: versionId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Version restored }
 *
 * /api/email/usage:
 *   get:
 *     summary: List email usages
 *     tags: [Email Usage]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer }
 *       - in: query
 *         name: limit
 *         schema: { type: integer }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *       - in: query
 *         name: group
 *         schema: { type: string }
 *     responses:
 *       200: { description: Usages returned }
 *   post:
 *     summary: Create email usage
 *     tags: [Email Usage]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [key, name]
 *             properties:
 *               key: { type: string }
 *               name: { type: string }
 *               description: { type: string }
 *               template: { type: string }
 *               variableMappings:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     templateVariable: { type: string }
 *                     sourceVariable: { type: string }
 *     responses:
 *       201: { description: Usage created }
 *
 * /api/email/usage/{id}:
 *   get:
 *     summary: Get usage by ID
 *     tags: [Email Usage]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Usage returned }
 *   put:
 *     summary: Update usage
 *     tags: [Email Usage]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Usage updated }
 *   delete:
 *     summary: Delete usage
 *     tags: [Email Usage]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Usage deleted }
 *
 * /api/email/usage/{id}/validate:
 *   post:
 *     summary: Validate usage variable mappings and render
 *     tags: [Email Usage]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Validation result }
 *
 * /api/email/variables:
 *   get:
 *     summary: Get all safe email variables (grouped)
 *     tags: [Email Variables]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Variables returned }
 *
 * /api/email/variables/search:
 *   get:
 *     summary: Search email variables
 *     tags: [Email Variables]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Search results }
 *
 * /api/email/assets:
 *   get:
 *     summary: List email assets
 *     tags: [Email Assets]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer }
 *       - in: query
 *         name: limit
 *         schema: { type: integer }
 *       - in: query
 *         name: category
 *         schema: { type: string, enum: [general, theme, component, inline-image] }
 *     responses:
 *       200: { description: Assets returned }
 *
 * /api/email/assets/upload:
 *   post:
 *     summary: Upload email assets
 *     tags: [Email Assets]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [files]
 *             properties:
 *               files:
 *                 type: array
 *                 items: { type: string, format: binary }
 *               category:
 *                 type: string
 *                 enum: [general, theme, component, inline-image]
 *     responses:
 *       201: { description: Assets uploaded }
 *
 * /api/email/assets/{id}:
 *   get:
 *     summary: Get asset by ID
 *     tags: [Email Assets]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Asset returned }
 *   put:
 *     summary: Update asset metadata
 *     tags: [Email Assets]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Asset updated }
 *   delete:
 *     summary: Soft delete asset
 *     tags: [Email Assets]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Asset deleted }
 *
 * /api/email/assets/{id}/replace:
 *   put:
 *     summary: Replace asset file
 *     tags: [Email Assets]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [file]
 *             properties:
 *               file: { type: string, format: binary }
 *     responses:
 *       200: { description: Asset replaced }
 *
 * /api/email/preview:
 *   post:
 *     summary: Preview rendered email
 *     tags: [Email Preview]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               usageKey: { type: string }
 *               templateId: { type: string }
 *               context: { type: object }
 *     responses:
 *       200: { description: Rendered email }
 *
 * /api/email/preview/validate:
 *   post:
 *     summary: Preview and validate usage
 *     tags: [Email Preview]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Validation result }
 *
 * /api/email/test-send:
 *   post:
 *     summary: Send test email
 *     tags: [Email Test]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email: { type: string }
 *               usageKey: { type: string }
 *               templateId: { type: string }
 *               context: { type: object }
 *               subject: { type: string }
 *               html: { type: string }
 *               text: { type: string }
 *     responses:
 *       200: { description: Test result }
 * /api/email/components:
 *   get:
 *     summary: List global email components
 *     tags: [Email Components]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer }
 *       - in: query
 *         name: limit
 *         schema: { type: integer }
 *       - in: query
 *         name: category
 *         schema: { type: string, enum: [header, footer, layout, content, media, cta, legal, custom] }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *     responses:
 *       200: { description: Components returned }
 *   post:
 *     summary: Create component
 *     tags: [Email Components]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, key]
 *             properties:
 *               name: { type: string }
 *               key: { type: string }
 *               category: { type: string, enum: [header, footer, layout, content, media, cta, legal, custom] }
 *               description: { type: string }
 *               html: { type: string }
 *               css: { type: string }
 *               variablesUsed: { type: array, items: { type: string } }
 *               isActive: { type: boolean }
 *     responses:
 *       201: { description: Component created }
 *
 * /api/email/components/{id}:
 *   get:
 *     summary: Get component by ID
 *     tags: [Email Components]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Component returned }
 *   put:
 *     summary: Update component
 *     tags: [Email Components]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Component updated }
 *   delete:
 *     summary: Delete component
 *     tags: [Email Components]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Component deleted }
 *
 * /api/email/components/{id}/duplicate:
 *   post:
 *     summary: Duplicate component
 *     tags: [Email Components]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       201: { description: Component duplicated }
 *
 * /api/email/config:
 *   get:
 *     summary: Get SMTP configuration
 *     tags: [Email Config]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Config returned }
 *   put:
 *     summary: Save SMTP configuration
 *     tags: [Email Config]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               host: { type: string }
 *               port: { type: integer }
 *               encryption: { type: string, enum: [none, ssl, tls] }
 *               username: { type: string }
 *               password: { type: string }
 *               senderName: { type: string }
 *               senderEmail: { type: string }
 *               replyTo: { type: string }
 *     responses:
 *       200: { description: Config saved }
 *
 * /api/email/config/test:
 *   post:
 *     summary: Test SMTP connection
 *     tags: [Email Config]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Connection test result }
 *
 * /api/email/queue:
 *   get:
 *     summary: List email queue
 *     tags: [Email Queue]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer }
 *       - in: query
 *         name: limit
 *         schema: { type: integer }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [pending, sending, sent, failed] }
 *     responses:
 *       200: { description: Queue returned }
 *
 * /api/email/queue/stats:
 *   get:
 *     summary: Get queue statistics
 *     tags: [Email Queue]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Queue stats }
 *
 * /api/email/queue/retry-all:
 *   post:
 *     summary: Retry all failed queue items
 *     tags: [Email Queue]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Retry initiated }
 *
 * /api/email/queue/clear-sent:
 *   delete:
 *     summary: Clear sent queue items
 *     tags: [Email Queue]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Cleared }
 *
 * /api/email/queue/{id}:
 *   delete:
 *     summary: Remove queue item
 *     tags: [Email Queue]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Item removed }
 *
 * /api/email/queue/{id}/retry:
 *   post:
 *     summary: Retry single queue item
 *     tags: [Email Queue]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Retry queued }
 *
 * /api/email/logs:
 *   get:
 *     summary: List email logs
 *     tags: [Email Logs]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer }
 *       - in: query
 *         name: limit
 *         schema: { type: integer }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [sent, failed, bounced] }
 *       - in: query
 *         name: recipient
 *         schema: { type: string }
 *       - in: query
 *         name: usageId
 *         schema: { type: string }
 *     responses:
 *       200: { description: Logs returned }
 *
 * /api/email/logs/stats:
 *   get:
 *     summary: Get email log statistics
 *     tags: [Email Logs]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Stats returned }
 *
 * /api/email/logs/{id}:
 *   get:
 *     summary: Get email log by ID
 *     tags: [Email Logs]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Log returned }
 */

// ── Templates ──
router.get('/templates', authAndPage, templatesCtrl.list);
router.get('/templates/stats', authAndPage, templatesCtrl.stats);
router.get('/templates/:id', authAndPage, templatesCtrl.getById);
router.post('/templates', authAndPage, templatesCtrl.create);
router.put('/templates/:id', authAndPage, templatesCtrl.update);
router.delete('/templates/:id', authAndPage, templatesCtrl.remove);
router.patch('/templates/:id/activate', authAndPage, templatesCtrl.activate);
router.patch('/templates/:id/deactivate', authAndPage, templatesCtrl.deactivate);

// ── Template Versions ──
router.get('/templates/:id/versions', authAndPage, templatesCtrl.getVersions);
router.post('/templates/versions/:versionId/restore', authAndPage, templatesCtrl.restoreVersion);

// ── Usage ──
router.get('/usage', authAndPage, usageCtrl.list);
router.post('/usage', authAndPage, usageCtrl.create);
router.get('/usage/:id', authAndPage, usageCtrl.getById);
router.put('/usage/:id', authAndPage, usageCtrl.update);
router.delete('/usage/:id', authAndPage, usageCtrl.remove);
router.post('/usage/:id/validate', authAndPage, usageCtrl.validate);

// ── Variables ──
router.get('/variables', authAndPage, variablesCtrl.list);
router.get('/variables/all-grouped', authAndPage, variablesCtrl.getAllGrouped);
router.get('/variables/search', authAndPage, variablesCtrl.search);
router.get('/variables/:id', authAndPage, variablesCtrl.getById);
router.post('/variables', authAndPage, variablesCtrl.create);
router.put('/variables/:id', authAndPage, variablesCtrl.update);
router.delete('/variables/:id', authAndPage, variablesCtrl.remove);
router.patch('/variables/:id/toggle', authAndPage, variablesCtrl.toggle);
router.post('/variables/import', authAndPage, uploadDataFile.single('file'), variablesCtrl.importBulk);

// ── Assets ──
router.get('/assets', authAndPage, assetsCtrl.list);
router.post('/assets/upload', authAndPage, upload.array('files', 10), assetsCtrl.upload);
router.get('/assets/:id', authAndPage, assetsCtrl.getById);
router.put('/assets/:id', authAndPage, assetsCtrl.update);
router.put('/assets/:id/replace', authAndPage, upload.single('file'), assetsCtrl.replace);
router.delete('/assets/:id', authAndPage, assetsCtrl.remove);

// ── Preview ──
router.post('/preview', authAndPage, previewCtrl.preview);
router.post('/preview/validate', authAndPage, previewCtrl.validateAndPreview);

// ── Test Send ──
router.post('/test-send', authAndPage, testCtrl.sendTest);

// ── Components ──
router.get('/components', authAndPage, componentsCtrl.list);
router.post('/components', authAndPage, componentsCtrl.create);
router.get('/components/:id', authAndPage, componentsCtrl.getById);
router.put('/components/:id', authAndPage, componentsCtrl.update);
router.delete('/components/:id', authAndPage, componentsCtrl.remove);
router.post('/components/:id/duplicate', authAndPage, componentsCtrl.duplicate);
router.post('/components/:id/preview', authAndPage, componentsCtrl.preview);

// ── SMTP Config ──
router.get('/config', authAndPage, configCtrl.getConfig);
router.put('/config', authAndPage, configCtrl.saveConfig);
router.post('/config/test', authAndPage, configCtrl.testConnection);

// ── Queue ──
router.get('/queue', authAndPage, queueCtrl.list);
router.get('/queue/stats', authAndPage, queueCtrl.stats);
router.post('/queue/retry-all', authAndPage, queueCtrl.retryAll);
router.delete('/queue/clear-sent', authAndPage, queueCtrl.clearSent);
router.delete('/queue/:id', authAndPage, queueCtrl.remove);
router.post('/queue/:id/retry', authAndPage, queueCtrl.retryOne);

// ── Logs ──
router.get('/logs', authAndPage, logsCtrl.list);
router.get('/logs/stats', authAndPage, logsCtrl.stats);
router.get('/logs/:id', authAndPage, logsCtrl.getById);

module.exports = router;
