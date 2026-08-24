/**
 * User Management Routes (Admin)
 * Comprehensive routes for user, role, department, and status management
 * Maintained by Hussain Developer
 * hussaintmerng@gmail.com | +92 319 1634446
 * AMS ERP
 * Date: 2026-01-06
 * 
 * @swagger
 * tags:
 *   - name: User Management
 *     description: User CRUD operations (Super Admin only)
 *   - name: Role Management
 *     description: Role and permission management
 *   - name: Department Management
 *     description: Organizational department management
 *   - name: Status Management
 *     description: Centralized status management for all ERP tables
 */

const express = require('express');
const router = express.Router();
const { authenticate, authorizeAction, authorizeAny, authorizePicker, authorizeQuickCreate } = require('../middleware/auth');

// Import Controllers
const userController = require('../controllers/userManagement.controller');
const roleController = require('../controllers/roleManagement.controller');
const departmentController = require('../controllers/departmentManagement.controller');
const statusController = require('../controllers/statusManagement.controller');

// ── User Management ──
router.get('/users/stats', authenticate, authorizeAction('user_management', 'view'), userController.getUserStats);
router.get('/users', authenticate, authorizeAction('user_management', 'view'), userController.getAllUsers);
router.post('/users/fix-fullname', authenticate, authorizeAction('user_management', 'edit'), userController.fixAllUsersFullName);
router.post('/users', authenticate, authorizeAction('user_management', 'create'), userController.createUser);
router.get('/users/:id', authenticate, authorizeAction('user_management', 'view'), userController.getUserById);
router.put('/users/:id', authenticate, authorizeAction('user_management', 'edit'), userController.updateUser);
router.delete('/users/:id', authenticate, authorizeAction('user_management', 'delete'), userController.deleteUser);
router.patch('/users/:id/status', authenticate, authorizeAction('user_management', 'edit'), userController.toggleUserStatus);
router.patch('/users/:id/role', authenticate, authorizeAction('user_management', 'edit'), userController.assignRole);
router.patch('/users/:id/department', authenticate, authorizeAction('user_management', 'edit'), userController.assignDepartment);
router.delete('/users/:id/department/:deptId', authenticate, authorizeAction('user_management', 'edit'), userController.removeDepartment);
router.post('/users/:id/reset-password', authenticate, authorizeAction('user_management', 'edit'), userController.resetPassword);

// ── Role Management ──
router.get('/roles', authenticate, authorizeAction('role_management', 'view'), roleController.getAllRoles);
router.get('/roles/:id', authenticate, authorizeAction('role_management', 'view'), roleController.getRoleById);
router.post('/roles', authenticate, authorizeAction('role_management', 'create'), roleController.createRole);
router.put('/roles/:id', authenticate, authorizeAction('role_management', 'edit'), roleController.updateRole);
router.delete('/roles/:id', authenticate, authorizeAction('role_management', 'delete'), roleController.deleteRole);
router.put('/roles/:id/permissions', authenticate, authorizeAction('role_management', 'edit'), roleController.assignPermissions);

// ── Permissions ──
router.get('/permissions', authenticate, authorizeAction('role_management', 'view'), roleController.getAllPermissions);
router.get('/permissions/matrix', authenticate, authorizeAction('role_management', 'view'), roleController.getPermissionMatrix);
router.get('/permissions/modules', authenticate, authorizeAction('role_management', 'view'), roleController.getPermissionModules);

// ── Department Management ──
router.get('/departments/stats', authenticate, authorizeAction('department_management', 'view'), departmentController.getDepartmentStats);
router.get('/departments', authenticate, authorizePicker('department_management', 'Department'), departmentController.getAllDepartments);
router.get('/departments/:id', authenticate, authorizeAction('department_management', 'view'), departmentController.getDepartmentById);
router.post('/departments', authenticate, authorizeAction('department_management', 'create'), departmentController.createDepartment);
router.put('/departments/:id', authenticate, authorizeAction('department_management', 'edit'), departmentController.updateDepartment);
router.delete('/departments/:id', authenticate, authorizeAction('department_management', 'delete'), departmentController.deleteDepartment);
router.patch('/departments/:id/status', authenticate, authorizeAction('department_management', 'edit'), departmentController.toggleDepartmentStatus);
router.patch('/departments/:id/manager', authenticate, authorizeAction('department_management', 'edit'), departmentController.assignManager);

// ── Status Management ──
// New collection-based endpoints
router.get('/status-collections/stats', authenticate, authorizeAction('status_management', 'view'), statusController.getCollectionStats);
router.get('/status-collections', authenticate, authorizePicker('status_management', 'StatusItem'), statusController.getAllCollections);
router.get('/status-collections/:id', authenticate, authorizeAction('status_management', 'view'), statusController.getCollectionById);
router.post('/status-collections', authenticate, authorizeAction('status_management', 'create'), statusController.createCollection);
router.put('/status-collections/:id', authenticate, authorizeAction('status_management', 'edit'), statusController.updateCollection);
router.delete('/status-collections/:id', authenticate, authorizeAction('status_management', 'delete'), statusController.deleteCollection);
router.get('/status-collections/:id/items', authenticate, authorizeAction('status_management', 'view'), statusController.getCollectionItems);
// A status is also raised from the "+ Create Status" shortcut inside the Leads
// and Customers forms, so that shortcut's own grant opens this too.
router.post('/status-collections/:id/items', authenticate, authorizeAny(
  authorizeAction('status_management', 'create'),
  authorizeQuickCreate('status_management', 'status'),
), statusController.createCollectionItem);
router.put('/status-items/:itemId', authenticate, authorizeAction('status_management', 'edit'), statusController.updateStatusItem);
router.delete('/status-items/:itemId', authenticate, authorizeAction('status_management', 'delete'), statusController.deleteStatusItem);
router.patch('/status-items/:itemId/toggle', authenticate, authorizeAction('status_management', 'edit'), statusController.toggleStatusItem);
router.patch('/status-items/:itemId/default', authenticate, authorizeAction('status_management', 'edit'), statusController.setDefaultStatusItem);

// Old backward-compatible status table routes (kept for existing integrations)
router.get('/statuses/tables', authenticate, authorizeAction('status_management', 'view'), statusController.getAvailableTables);
router.get('/statuses/analytics', authenticate, authorizeAction('status_management', 'view'), statusController.getStatusAnalytics);
router.get('/statuses', authenticate, authorizeAction('status_management', 'view'), statusController.getAllStatuses);
router.get('/statuses/table/:tableName', authenticate, authorizeAction('status_management', 'view'), statusController.getStatusesByTable);
router.get('/statuses/detail/:id', authenticate, authorizeAction('status_management', 'view'), statusController.getStatusById);
router.post('/statuses', authenticate, authorizeAction('status_management', 'create'), statusController.createStatus);
router.put('/statuses/:id', authenticate, authorizeAction('status_management', 'edit'), statusController.updateStatus);
router.delete('/statuses/:id', authenticate, authorizeAction('status_management', 'delete'), statusController.deleteStatus);
router.put('/statuses/:tableName/reorder', authenticate, authorizeAction('status_management', 'edit'), statusController.reorderStatuses);

module.exports = router;
