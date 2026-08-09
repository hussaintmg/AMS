const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const controller = require('../controllers/serverManagement.controller');
const { authenticate, authorizeAction } = require('../middleware/auth');

const router = express.Router();
const uploadDir = path.join(__dirname, '..', 'uploads', 'branding');
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
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
  limits: { fileSize: 5 * 1024 * 1024 }
});

const requireSuperAdmin = [authenticate, authorizeAction('server_management', 'edit')];

/**
 * @swagger
 * tags:
 *   - name: Server Management
 *     description: Super admin server, pages, branding, roles, and user management
 *
 * /api/server-management/branding:
 *   get:
 *     summary: Get public branding settings and assets
 *     tags: [Server Management]
 *     responses:
 *       200: { description: Branding returned }
 *       400: { description: Bad request }
 *       401: { description: Unauthorized }
 *       403: { description: Forbidden }
 *       404: { description: Not found }
 *       500: { description: Server error }
 *   put:
 *     summary: Update branding settings
 *     tags: [Server Management]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               applicationName: { type: string, example: AMS ERP }
 *               browserTitle: { type: string, example: AMS ERP }
 *               activeTheme: { type: string, example: default }
 *               favicon: { type: string, nullable: true, example: 65f1c2d3e4f5678901234567 }
 *               sidebarLogo: { type: string, nullable: true, example: 65f1c2d3e4f5678901234567 }
 *               loginLogo: { type: string, nullable: true, example: 65f1c2d3e4f5678901234567 }
 *               loadingLogo: { type: string, nullable: true, example: 65f1c2d3e4f5678901234567 }
 *           example:
 *             applicationName: AMS ERP
 *             browserTitle: AMS ERP
 *             activeTheme: default
 *     responses:
 *       200: { description: Branding settings saved }
 *       400: { description: Validation error }
 *       401: { description: Unauthorized }
 *       403: { description: Forbidden }
 *       404: { description: Not found }
 *       500: { description: Server error }
 *
 * /api/server-management/sidebar:
 *   get:
 *     summary: Get sidebar pages visible to the current user
 *     tags: [Server Management]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Sidebar returned }
 *       400: { description: Bad request }
 *       401: { description: Unauthorized }
 *       403: { description: Forbidden }
 *       404: { description: Not found }
 *       500: { description: Server error }
 *   post:
 *     summary: Save sidebar configuration
 *     tags: [Server Management]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               pages:
 *                 type: array
 *                 items: { type: object }
 *           example:
 *             pages:
 *               - label: Dashboard
 *                 path: /dashboard
 *                 sortOrder: 1
 *                 isActive: true
 *     responses:
 *       200: { description: Sidebar configuration saved }
 *       400: { description: pages array is required }
 *       401: { description: Unauthorized }
 *       403: { description: Forbidden }
 *       404: { description: Not found }
 *       500: { description: Server error }
 *   put:
 *     summary: Save sidebar configuration
 *     tags: [Server Management]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           example:
 *             pages:
 *               - label: Dashboard
 *                 path: /dashboard
 *                 sortOrder: 1
 *     responses:
 *       200: { description: Sidebar configuration saved }
 *       400: { description: pages array is required }
 *       401: { description: Unauthorized }
 *       403: { description: Forbidden }
 *       404: { description: Not found }
 *       500: { description: Server error }
 *
 * /api/server-management/overview:
 *   get:
 *     summary: Get server management overview counts
 *     tags: [Server Management]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Overview returned }
 *       400: { description: Bad request }
 *       401: { description: Unauthorized }
 *       403: { description: Forbidden }
 *       404: { description: Not found }
 *       500: { description: Server error }
 *
 * /api/server-management/pages:
 *   get:
 *     summary: Get managed pages
 *     tags: [Server Management]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Pages returned }
 *       400: { description: Bad request }
 *       401: { description: Unauthorized }
 *       403: { description: Forbidden }
 *       404: { description: Not found }
 *       500: { description: Server error }
 *   post:
 *     summary: Create managed page
 *     tags: [Server Management]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           example: { label: Reports, path: /reports, module: Reports, icon: FileText, isActive: true }
 *     responses:
 *       201: { description: Page created }
 *       400: { description: Validation error }
 *       401: { description: Unauthorized }
 *       403: { description: Forbidden }
 *       404: { description: Not found }
 *       500: { description: Server error }
 *   put:
 *     summary: Bulk update managed pages
 *     tags: [Server Management]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           example:
 *             pages:
 *               - _id: 65f1c2d3e4f5678901234567
 *                 label: Reports
 *                 path: /reports
 *                 sortOrder: 2
 *     responses:
 *       200: { description: Pages updated }
 *       400: { description: pages array is required }
 *       401: { description: Unauthorized }
 *       403: { description: Forbidden }
 *       404: { description: Not found }
 *       500: { description: Server error }
 *
 * /api/server-management/pages/sync:
 *   post:
 *     summary: Sync managed pages
 *     tags: [Server Management]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           example:
 *             pages:
 *               - label: Dashboard
 *                 path: /dashboard
 *     responses:
 *       200: { description: Pages synced }
 *       400: { description: pages array is required }
 *       401: { description: Unauthorized }
 *       403: { description: Forbidden }
 *       404: { description: Not found }
 *       500: { description: Server error }
 *
 * /api/server-management/branding/assets:
 *   get:
 *     summary: Get branding assets
 *     tags: [Server Management]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Assets returned }
 *       400: { description: Bad request }
 *       401: { description: Unauthorized }
 *       403: { description: Forbidden }
 *       404: { description: Not found }
 *       500: { description: Server error }
 *
 * /api/server-management/branding/assets/upload:
 *   post:
 *     summary: Upload branding assets
 *     tags: [Server Management]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [assets]
 *             properties:
 *               assets:
 *                 type: array
 *                 items: { type: string, format: binary }
 *     responses:
 *       201: { description: Assets uploaded }
 *       400: { description: At least one image is required }
 *       401: { description: Unauthorized }
 *       403: { description: Forbidden }
 *       404: { description: Not found }
 *       500: { description: Server error }
 *
 * /api/server-management/assets:
 *   get:
 *     summary: Get branding assets alias
 *     tags: [Server Management]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Assets returned }
 *       400: { description: Bad request }
 *       401: { description: Unauthorized }
 *       403: { description: Forbidden }
 *       404: { description: Not found }
 *       500: { description: Server error }
 *
 * /api/server-management/assets/upload:
 *   post:
 *     summary: Upload branding assets alias
 *     tags: [Server Management]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [assets]
 *             properties:
 *               assets:
 *                 type: array
 *                 items: { type: string, format: binary }
 *     responses:
 *       201: { description: Assets uploaded }
 *       400: { description: At least one image is required }
 *       401: { description: Unauthorized }
 *       403: { description: Forbidden }
 *       404: { description: Not found }
 *       500: { description: Server error }
 *
 * /api/server-management/assets/assignments:
 *   post:
 *     summary: Save branding asset assignments
 *     tags: [Server Management]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           example:
 *             assignments:
 *               favicon: 65f1c2d3e4f5678901234567
 *               sidebarLogo: 65f1c2d3e4f5678901234567
 *     responses:
 *       200: { description: Branding settings saved }
 *       400: { description: Validation error }
 *       401: { description: Unauthorized }
 *       403: { description: Forbidden }
 *       404: { description: Not found }
 *       500: { description: Server error }
 *
 * /api/server-management/branding/assets/{id}:
 *   delete:
 *     summary: Delete a branding asset (soft-delete + remove physical file)
 *     tags: [Server Management]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Asset deleted }
 *       401: { description: Unauthorized }
 *       403: { description: Forbidden }
 *       404: { description: Asset not found }
 *       500: { description: Server error }
 *
 * /api/server-management/branding/assets/{id}/replace:
 *   put:
 *     summary: Replace a branding asset (keeps id, new file, deletes old physical file)
 *     tags: [Server Management]
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
 *             required: [asset]
 *             properties:
 *               asset:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200: { description: Asset replaced }
 *       400: { description: Replacement image is required }
 *       401: { description: Unauthorized }
 *       403: { description: Forbidden }
 *       404: { description: Asset not found }
 *       500: { description: Server error }
 *
 * /api/server-management/roles:
 *   get:
 *     summary: Get roles
 *     tags: [Server Management]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Roles returned }
 *       400: { description: Bad request }
 *       401: { description: Unauthorized }
 *       403: { description: Forbidden }
 *       404: { description: Not found }
 *       500: { description: Server error }
 *   post:
 *     summary: Create role
 *     tags: [Server Management]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           example: { name: manager, displayName: Manager, permissions: [] }
 *     responses:
 *       201: { description: Role created }
 *       400: { description: Validation error }
 *       401: { description: Unauthorized }
 *       403: { description: Forbidden }
 *       404: { description: Not found }
 *       500: { description: Server error }
 *   put:
 *     summary: Bulk update roles
 *     tags: [Server Management]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           example:
 *             roles:
 *               - _id: 65f1c2d3e4f5678901234567
 *                 displayName: Manager
 *                 permissions: []
 *     responses:
 *       200: { description: Roles updated }
 *       400: { description: Validation error }
 *       401: { description: Unauthorized }
 *       403: { description: Forbidden }
 *       404: { description: Not found }
 *       500: { description: Server error }
 *
 * /api/server-management/roles/{id}:
 *   put:
 *     summary: Update role by ID
 *     tags: [Server Management]
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
 *           example: { displayName: Manager, description: Operations manager, permissions: [] }
 *     responses:
 *       200: { description: Role updated }
 *       400: { description: Validation error }
 *       401: { description: Unauthorized }
 *       403: { description: Forbidden }
 *       404: { description: Role not found }
 *       500: { description: Server error }
 *   delete:
 *     summary: Delete role by ID
 *     tags: [Server Management]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Role deleted }
 *       400: { description: Cannot delete protected role }
 *       401: { description: Unauthorized }
 *       403: { description: Forbidden }
 *       404: { description: Role not found }
 *       500: { description: Server error }
 *
 * /api/server-management/users:
 *   get:
 *     summary: Get server-management users
 *     tags: [Server Management]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Users returned }
 *       400: { description: Bad request }
 *       401: { description: Unauthorized }
 *       403: { description: Forbidden }
 *       404: { description: Not found }
 *       500: { description: Server error }
 *   post:
 *     summary: Create server-management user
 *     tags: [Server Management]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           example:
 *             email: staff@example.com
 *             password: Password123!
 *             firstName: Staff
 *             lastName: Member
 *             roleId: 65f1c2d3e4f5678901234567
 *     responses:
 *       201: { description: User created successfully }
 *       400: { description: Validation error }
 *       401: { description: Unauthorized }
 *       403: { description: Forbidden }
 *       404: { description: Role not found }
 *       500: { description: Server error }
 *
 * /api/server-management/users/{id}:
 *   put:
 *     summary: Update server-management user
 *     tags: [Server Management]
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
 *           example:
 *             firstName: Staff
 *             lastName: Member
 *             phone: "+923001234567"
 *             roleId: 65f1c2d3e4f5678901234567
 *     responses:
 *       200: { description: User updated successfully }
 *       400: { description: Validation error }
 *       401: { description: Unauthorized }
 *       403: { description: Forbidden }
 *       404: { description: User not found }
 *       500: { description: Server error }
 *
 * /api/server-management/user-permissions:
 *   get:
 *     summary: Get user permissions
 *     tags: [Server Management]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: userId
 *         schema: { type: string }
 *     responses:
 *       200: { description: User permissions returned }
 *       400: { description: User id is required }
 *       401: { description: Unauthorized }
 *       403: { description: Forbidden }
 *       404: { description: User not found }
 *       500: { description: Server error }
 *   put:
 *     summary: Update user permissions
 *     tags: [Server Management]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           example: { userId: 65f1c2d3e4f5678901234567, permissions: [] }
 *     responses:
 *       200: { description: User permissions saved }
 *       400: { description: User id is required }
 *       401: { description: Unauthorized }
 *       403: { description: Forbidden }
 *       404: { description: User not found }
 *       500: { description: Server error }
 *
 * /api/server-management/users/{id}/permissions:
 *   get:
 *     summary: Get user permissions by user ID
 *     tags: [Server Management]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: User permissions returned }
 *       400: { description: Bad request }
 *       401: { description: Unauthorized }
 *       403: { description: Forbidden }
 *       404: { description: User not found }
 *       500: { description: Server error }
 *   put:
 *     summary: Update user permissions by user ID
 *     tags: [Server Management]
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
 *           example: { permissions: [] }
 *     responses:
 *       200: { description: User permissions saved }
 *       400: { description: Validation error }
 *       401: { description: Unauthorized }
 *       403: { description: Forbidden }
 *       404: { description: User not found }
 *       500: { description: Server error }
 */

router.get('/branding', controller.getBranding);
router.get('/sidebar', authenticate, controller.getSidebar);

/**
 * @swagger
 * /api/server-management/permission-settings:
 *   get:
 *     summary: Get permission source settings
 *     tags: [Server Management]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Permission settings returned }
 *   put:
 *     summary: Update permission source settings
 *     tags: [Server Management]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           example: { permissionMode: role, logPermissionMode: user }
 *     responses:
 *       200: { description: Permission settings saved }
 *       400: { description: Invalid setting value }
 *       403: { description: Permission denied }
 */
router.get('/permission-settings', requireSuperAdmin, controller.getPermissionSettings);
router.put('/permission-settings', requireSuperAdmin, controller.updatePermissionSettings);

router.get('/overview', requireSuperAdmin, controller.getOverview);
router.get('/pages', requireSuperAdmin, controller.getPages);
router.post('/pages', requireSuperAdmin, controller.createPage);
router.post('/pages/sync', requireSuperAdmin, controller.syncPages);
router.put('/pages', requireSuperAdmin, controller.updatePages);

router.put('/sidebar', requireSuperAdmin, controller.saveSidebar);
router.post('/sidebar', requireSuperAdmin, controller.saveSidebar);

router.put('/branding', requireSuperAdmin, controller.updateBranding);
router.get('/branding/assets', requireSuperAdmin, controller.getAssets);
router.post('/branding/assets/upload', requireSuperAdmin, upload.array('assets', 10), controller.uploadAssets);
router.get('/assets', requireSuperAdmin, controller.getAssets);
router.post('/assets/upload', requireSuperAdmin, upload.array('assets', 10), controller.uploadAssets);
router.post('/assets/assignments', requireSuperAdmin, controller.saveAssetAssignments);

/**
 * @swagger
 * /api/server-management/branding/assets/{id}:
 *   delete:
 *     summary: Delete a branding asset and clear active assignments
 *     tags: [Server Management]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Asset deleted and branding returned }
 *       404: { description: Asset not found }
 * /api/server-management/branding/assets/{id}/replace:
 *   put:
 *     summary: Replace a branding asset file while keeping the same asset document
 *     tags: [Server Management]
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
 *             required: [asset]
 *             properties:
 *               asset:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200: { description: Asset replaced and branding returned }
 *       404: { description: Asset not found }
 */
router.delete('/branding/assets/:id', requireSuperAdmin, controller.deleteAsset);
router.put('/branding/assets/:id/replace', requireSuperAdmin, upload.single('asset'), controller.replaceAsset);

router.get('/roles', requireSuperAdmin, controller.getRoles);
router.post('/roles', requireSuperAdmin, controller.createRole);
router.put('/roles', requireSuperAdmin, controller.updateRoles);
router.put('/roles/:id', requireSuperAdmin, controller.updateRole);
router.delete('/roles/:id', requireSuperAdmin, controller.deleteRole);

router.get('/users', requireSuperAdmin, controller.getUsers);
router.post('/users', requireSuperAdmin, controller.createUser);
router.put('/users/:id', requireSuperAdmin, controller.updateUser);
router.get('/user-permissions', requireSuperAdmin, controller.getUserPermissions);
router.put('/user-permissions', requireSuperAdmin, controller.updateUserPermissions);
router.get('/users/:id/permissions', requireSuperAdmin, controller.getUserPermissions);
router.put('/users/:id/permissions', requireSuperAdmin, controller.updateUserPermissions);
router.put('/roles/:id/permissions', requireSuperAdmin, controller.updateRolePermissions);
router.put('/users/:id/logs-permissions', requireSuperAdmin, controller.updateUserLogsPermissions);
router.put('/roles/:id/logs-permissions', requireSuperAdmin, controller.saveRoleLogsPermissions);
router.get('/field-catalog', requireSuperAdmin, controller.getFieldCatalog);
router.get('/roles/:id/jobs', requireSuperAdmin, controller.getRoleJobs);
router.put('/roles/:id/jobs', requireSuperAdmin, controller.saveRoleJobs);

/**
 * @swagger
 * /api/server-management/lead-assignment-roles:
 *   get:
 *     summary: Get lead assignment role IDs
 *     tags: [Server Management]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Role IDs returned }
 *       401: { description: Unauthorized }
 *       403: { description: Forbidden }
 *   put:
 *     summary: Save lead assignment role IDs
 *     tags: [Server Management]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [roles]
 *             properties:
 *               roles:
 *                 type: array
 *                 items: { type: string }
 *     responses:
 *       200: { description: Roles saved }
 *       400: { description: roles array is required }
 *       401: { description: Unauthorized }
 *       403: { description: Forbidden }
 */
router.get('/lead-assignment-roles', requireSuperAdmin, controller.getLeadAssignmentRoles);
router.put('/lead-assignment-roles', requireSuperAdmin, controller.updateLeadAssignmentRoles);

/**
 * @swagger
 * /api/server-management/customer-role-config:
 *   get:
 *     summary: Get customer role config
 *     tags: [Server Management]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Customer role config returned }
 *       401: { description: Unauthorized }
 *       403: { description: Forbidden }
 *   put:
 *     summary: Save customer role config
 *     tags: [Server Management]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [activeRoleId, availableRoleIds]
 *             properties:
 *               activeRoleId:
 *                 type: string
 *                 description: Role ID assigned to newly converted customers
 *               availableRoleIds:
 *                 type: array
 *                 items: { type: string }
 *                 description: All role IDs that are considered customer roles
 *     responses:
 *       200: { description: Config saved }
 *       400: { description: Validation error }
 *       401: { description: Unauthorized }
 *       403: { description: Forbidden }
 */
// ── Customer Role Config ──
router.get('/customer-role-config', requireSuperAdmin, controller.getCustomerRoleConfig);
router.put('/customer-role-config', requireSuperAdmin, controller.saveCustomerRoleConfig);

// Employee role assigned automatically when a new employee is created.
router.get('/employee-role-config', requireSuperAdmin, controller.getEmployeeRoleConfig);
router.put('/employee-role-config', requireSuperAdmin, controller.saveEmployeeRoleConfig);

// Role-usage configs. Reading the resolved user lists only needs a signed-in
// user, since the warehouse and service forms depend on them.
router.get('/warehouse-manager-roles', requireSuperAdmin, controller.getWarehouseManagerRoles);
router.put('/warehouse-manager-roles', requireSuperAdmin, controller.updateWarehouseManagerRoles);
router.get('/warehouse-manager-users', authenticate, controller.getWarehouseManagerUsers);

router.get('/service-advisor-roles', requireSuperAdmin, controller.getServiceAdvisorRoles);
router.put('/service-advisor-roles', requireSuperAdmin, controller.updateServiceAdvisorRoles);
router.get('/service-advisor-users', authenticate, controller.getServiceAdvisorUsers);

// ── System Settings (permissionMode, logPermissionMode) ──
router.get('/settings/:key', requireSuperAdmin, controller.getSetting);
router.get('/settings', requireSuperAdmin, controller.getSetting);
router.put('/settings', requireSuperAdmin, controller.saveSetting);

module.exports = router;
