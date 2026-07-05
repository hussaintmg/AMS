/**
 * ERP Settings Routes
 * Full CRUD operations with role-based permissions
 * Created by LOGIXINVENTOR (PVT) Ltd.
 * info@logixinventor.com +92 333 3836851
 * www.logixinventor.com | AMS
 * Date: 2026-01-08
 * 
 * @swagger
 * tags:
 *   - name: ERP Settings
 *     description: Company, Branch, Settings, Currency, and Tax Management
 */

const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const erpSettings = require('../controllers/erpSettings.controller');

// ═══════════════════════════════════════════════════════════════════════════
// STATISTICS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * @swagger
 * /api/erp-settings/stats:
 *   get:
 *     tags: [ERP Settings]
 *     summary: Get ERP statistics
 *     security: [{ bearerAuth: [] }]
 */
router.get('/stats', authenticate, erpSettings.getERPStats);

/**
 * @swagger
 * /api/erp-settings/managers:
 *   get:
 *     tags: [ERP Settings]
 *     summary: Get managers for dropdown
 *     security: [{ bearerAuth: [] }]
 */
router.get('/managers', authenticate, erpSettings.getManagers);

// ═══════════════════════════════════════════════════════════════════════════
// COMPANY ROUTES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * @swagger
 * /api/erp-settings/companies:
 *   get:
 *     tags: [ERP Settings]
 *     summary: Get all companies
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: active
 *         in: query
 *         schema: { type: boolean }
 *       - name: search
 *         in: query
 *         schema: { type: string }
 */
router.get('/companies', authenticate, erpSettings.getAllCompanies);

/**
 * @swagger
 * /api/erp-settings/companies/{id}:
 *   get:
 *     tags: [ERP Settings]
 *     summary: Get company by ID with branches
 *     security: [{ bearerAuth: [] }]
 */
router.get('/companies/:id', authenticate, erpSettings.getCompanyById);

/**
 * @swagger
 * /api/erp-settings/companies:
 *   post:
 *     tags: [ERP Settings]
 *     summary: Create new company
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [companyName]
 *             properties:
 *               companyName: { type: string }
 *               legalName: { type: string }
 *               registrationNumber: { type: string }
 *               taxId: { type: string }
 *               email: { type: string }
 *               phone: { type: string }
 *               address: { type: string }
 *               city: { type: string }
 *               country: { type: string }
 *               currencyCode: { type: string, default: PKR }
 */
router.post('/companies', authenticate, authorize('super_admin'), erpSettings.createCompany);

/**
 * @swagger
 * /api/erp-settings/companies/{id}:
 *   put:
 *     tags: [ERP Settings]
 *     summary: Update company
 *     security: [{ bearerAuth: [] }]
 */
router.put('/companies/:id', authenticate, authorize('super_admin'), erpSettings.updateCompany);

/**
 * @swagger
 * /api/erp-settings/companies/{id}:
 *   delete:
 *     tags: [ERP Settings]
 *     summary: Deactivate company
 *     security: [{ bearerAuth: [] }]
 */
router.delete('/companies/:id', authenticate, authorize('super_admin'), erpSettings.deleteCompany);

// ═══════════════════════════════════════════════════════════════════════════
// BRANCH ROUTES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * @swagger
 * /api/erp-settings/branches:
 *   get:
 *     tags: [ERP Settings]
 *     summary: Get all branches
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: companyId
 *         in: query
 *         schema: { type: integer }
 *       - name: branchType
 *         in: query
 *         schema: { type: string, enum: [head_office, regional, sales_center, service_center, warehouse] }
 *       - name: active
 *         in: query
 *         schema: { type: boolean }
 *       - name: search
 *         in: query
 *         schema: { type: string }
 */
router.get('/branches', authenticate, erpSettings.getAllBranches);

/**
 * @swagger
 * /api/erp-settings/branches/{id}:
 *   get:
 *     tags: [ERP Settings]
 *     summary: Get branch by ID
 *     security: [{ bearerAuth: [] }]
 */
router.get('/branches/:id', authenticate, erpSettings.getBranchById);

/**
 * @swagger
 * /api/erp-settings/branches:
 *   post:
 *     tags: [ERP Settings]
 *     summary: Create new branch
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [companyId, branchName]
 *             properties:
 *               companyId: { type: integer }
 *               branchName: { type: string }
 *               branchType: { type: string, enum: [head_office, regional, sales_center, service_center, warehouse] }
 *               managerId: { type: integer }
 *               email: { type: string }
 *               phone: { type: string }
 *               address: { type: string }
 *               city: { type: string }
 */
router.post('/branches', authenticate, authorize('super_admin'), erpSettings.createBranch);

/**
 * @swagger
 * /api/erp-settings/branches/{id}:
 *   put:
 *     tags: [ERP Settings]
 *     summary: Update branch
 *     security: [{ bearerAuth: [] }]
 */
router.put('/branches/:id', authenticate, authorize('super_admin'), erpSettings.updateBranch);

/**
 * @swagger
 * /api/erp-settings/branches/{id}:
 *   delete:
 *     tags: [ERP Settings]
 *     summary: Deactivate branch
 *     security: [{ bearerAuth: [] }]
 */
router.delete('/branches/:id', authenticate, authorize('super_admin'), erpSettings.deleteBranch);

// ═══════════════════════════════════════════════════════════════════════════
// SYSTEM SETTINGS ROUTES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * @swagger
 * /api/erp-settings/settings:
 *   get:
 *     tags: [ERP Settings]
 *     summary: Get all system settings
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: category
 *         in: query
 *         schema: { type: string }
 */
router.get('/settings', authenticate, erpSettings.getAllSettings);

/**
 * @swagger
 * /api/erp-settings/settings/categories:
 *   get:
 *     tags: [ERP Settings]
 *     summary: Get settings categories
 *     security: [{ bearerAuth: [] }]
 */
router.get('/settings/categories', authenticate, erpSettings.getSettingCategories);

/**
 * @swagger
 * /api/erp-settings/settings:
 *   put:
 *     tags: [ERP Settings]
 *     summary: Update multiple settings
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [settings]
 *             properties:
 *               settings:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     key: { type: string }
 *                     value: { type: string }
 */
router.put('/settings', authenticate, authorize('super_admin'), erpSettings.updateSettings);

// ═══════════════════════════════════════════════════════════════════════════
// CURRENCY ROUTES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * @swagger
 * /api/erp-settings/currencies:
 *   get:
 *     tags: [ERP Settings]
 *     summary: Get all currencies
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: active
 *         in: query
 *         schema: { type: boolean }
 */
router.get('/currencies', authenticate, erpSettings.getAllCurrencies);

/**
 * @swagger
 * /api/erp-settings/currencies:
 *   post:
 *     tags: [ERP Settings]
 *     summary: Create new currency
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [code, name, symbol]
 *             properties:
 *               code: { type: string }
 *               name: { type: string }
 *               symbol: { type: string }
 *               exchangeRate: { type: number }
 *               isDefault: { type: boolean }
 */
router.post('/currencies', authenticate, authorize('super_admin'), erpSettings.createCurrency);

/**
 * @swagger
 * /api/erp-settings/currencies/{id}:
 *   put:
 *     tags: [ERP Settings]
 *     summary: Update currency
 *     security: [{ bearerAuth: [] }]
 */
router.put('/currencies/:id', authenticate, authorize('super_admin'), erpSettings.updateCurrency);

/**
 * @swagger
 * /api/erp-settings/currencies/{id}:
 *   delete:
 *     tags: [ERP Settings]
 *     summary: Deactivate currency
 *     security: [{ bearerAuth: [] }]
 */
router.delete('/currencies/:id', authenticate, authorize('super_admin'), erpSettings.deleteCurrency);

// ═══════════════════════════════════════════════════════════════════════════
// TAX CONFIGURATION ROUTES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * @swagger
 * /api/erp-settings/taxes:
 *   get:
 *     tags: [ERP Settings]
 *     summary: Get all tax configurations
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: active
 *         in: query
 *         schema: { type: boolean }
 *       - name: taxType
 *         in: query
 *         schema: { type: string, enum: [sales, service, vat, gst, withholding, custom] }
 */
router.get('/taxes', authenticate, erpSettings.getAllTaxes);

/**
 * @swagger
 * /api/erp-settings/taxes:
 *   post:
 *     tags: [ERP Settings]
 *     summary: Create new tax configuration
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [taxName, taxCode, taxRate]
 *             properties:
 *               taxName: { type: string }
 *               taxCode: { type: string }
 *               taxRate: { type: number }
 *               taxType: { type: string, enum: [sales, service, vat, gst, withholding, custom] }
 *               description: { type: string }
 *               isCompound: { type: boolean }
 */
router.post('/taxes', authenticate, authorize('super_admin'), erpSettings.createTax);

/**
 * @swagger
 * /api/erp-settings/taxes/{id}:
 *   put:
 *     tags: [ERP Settings]
 *     summary: Update tax configuration
 *     security: [{ bearerAuth: [] }]
 */
router.put('/taxes/:id', authenticate, authorize('super_admin'), erpSettings.updateTax);

/**
 * @swagger
 * /api/erp-settings/taxes/{id}:
 *   delete:
 *     tags: [ERP Settings]
 *     summary: Deactivate tax configuration
 *     security: [{ bearerAuth: [] }]
 */
router.delete('/taxes/:id', authenticate, authorize('super_admin'), erpSettings.deleteTax);

// ═══════════════════════════════════════════════════════════════════════════
// DOCUMENT HTML TEMPLATES (sales print / PDF source)
// ═══════════════════════════════════════════════════════════════════════════

router.get('/document-templates', authenticate, authorize('super_admin'), erpSettings.getAllDocumentTemplates);
router.get('/document-templates/default/:documentType', authenticate, erpSettings.getDefaultDocumentTemplate);
router.get('/document-templates/:id', authenticate, authorize('super_admin'), erpSettings.getDocumentTemplateById);
router.post('/document-templates', authenticate, authorize('super_admin'), erpSettings.createDocumentTemplate);
router.put('/document-templates/:id', authenticate, authorize('super_admin'), erpSettings.updateDocumentTemplate);
router.delete('/document-templates/:id', authenticate, authorize('super_admin'), erpSettings.deleteDocumentTemplate);
router.post('/document-templates/seed-defaults', authenticate, authorize('super_admin'), erpSettings.seedDocumentTemplates);

module.exports = router;
