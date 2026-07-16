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
const { authenticate, authorize, authorizePage } = require('../middleware/auth');

// Import Controllers
const userController = require('../controllers/userManagement.controller');
const roleController = require('../controllers/roleManagement.controller');
const departmentController = require('../controllers/departmentManagement.controller');
const statusController = require('../controllers/statusManagement.controller');

// ── User Management (read: users page permission, write: super_admin) ──
router.get('/users/stats', authenticate, authorizePage('users'), userController.getUserStats);
router.get('/users', authenticate, authorizePage('users'), userController.getAllUsers);
router.post('/users/fix-fullname', authenticate, authorize('super_admin'), userController.fixAllUsersFullName);
router.post('/users', authenticate, authorize('super_admin'), userController.createUser);
router.get('/users/:id', authenticate, authorizePage('users'), userController.getUserById);
router.put('/users/:id', authenticate, authorize('super_admin'), userController.updateUser);
router.delete('/users/:id', authenticate, authorize('super_admin'), userController.deleteUser);
router.patch('/users/:id/status', authenticate, authorize('super_admin'), userController.toggleUserStatus);
router.patch('/users/:id/role', authenticate, authorize('super_admin'), userController.assignRole);
router.patch('/users/:id/department', authenticate, authorize('super_admin'), userController.assignDepartment);
router.delete('/users/:id/department/:deptId', authenticate, authorize('super_admin'), userController.removeDepartment);
router.post('/users/:id/reset-password', authenticate, authorize('super_admin'), userController.resetPassword);

// ── Role Management (read: roles page permission, write: super_admin) ──
router.get('/roles', authenticate, authorizePage('roles'), roleController.getAllRoles);
router.get('/roles/:id', authenticate, authorizePage('roles'), roleController.getRoleById);
router.post('/roles', authenticate, authorize('super_admin'), roleController.createRole);
router.put('/roles/:id', authenticate, authorize('super_admin'), roleController.updateRole);
router.delete('/roles/:id', authenticate, authorize('super_admin'), roleController.deleteRole);
router.put('/roles/:id/permissions', authenticate, authorize('super_admin'), roleController.assignPermissions);

// ── Permissions (super_admin only) ──
router.get('/permissions', authenticate, authorize('super_admin'), roleController.getAllPermissions);
router.get('/permissions/matrix', authenticate, authorize('super_admin'), roleController.getPermissionMatrix);
router.get('/permissions/modules', authenticate, authorize('super_admin'), roleController.getPermissionModules);

// ── Department Management (read: departments page permission, write: super_admin) ──
router.get('/departments/stats', authenticate, authorizePage('departments'), departmentController.getDepartmentStats);
router.get('/departments', authenticate, authorizePage('departments'), departmentController.getAllDepartments);
router.get('/departments/:id', authenticate, authorizePage('departments'), departmentController.getDepartmentById);
router.post('/departments', authenticate, authorize('super_admin'), departmentController.createDepartment);
router.put('/departments/:id', authenticate, authorize('super_admin'), departmentController.updateDepartment);
router.delete('/departments/:id', authenticate, authorize('super_admin'), departmentController.deleteDepartment);
router.patch('/departments/:id/manager', authenticate, authorize('super_admin'), departmentController.assignManager);

// ── Status Management (read: statuses page permission, write: super_admin) ──
// New collection-based endpoints
router.get('/status-collections/stats', authenticate, authorizePage('statuses'), statusController.getCollectionStats);
router.get('/status-collections', authenticate, authorizePage('statuses'), statusController.getAllCollections);
router.get('/status-collections/:id', authenticate, authorizePage('statuses'), statusController.getCollectionById);
router.post('/status-collections', authenticate, authorize('super_admin'), statusController.createCollection);
router.put('/status-collections/:id', authenticate, authorize('super_admin'), statusController.updateCollection);
router.delete('/status-collections/:id', authenticate, authorize('super_admin'), statusController.deleteCollection);
router.get('/status-collections/:id/items', authenticate, authorizePage('statuses'), statusController.getCollectionItems);
router.post('/status-collections/:id/items', authenticate, authorize('super_admin'), statusController.createCollectionItem);
router.put('/status-items/:itemId', authenticate, authorize('super_admin'), statusController.updateStatusItem);
router.delete('/status-items/:itemId', authenticate, authorize('super_admin'), statusController.deleteStatusItem);
router.patch('/status-items/:itemId/toggle', authenticate, authorize('super_admin'), statusController.toggleStatusItem);
router.patch('/status-items/:itemId/default', authenticate, authorize('super_admin'), statusController.setDefaultStatusItem);

// Old backward-compatible status table routes (kept for existing integrations)
router.get('/statuses/tables', authenticate, authorizePage('statuses'), statusController.getAvailableTables);
router.get('/statuses/analytics', authenticate, authorizePage('statuses'), statusController.getStatusAnalytics);
router.get('/statuses', authenticate, authorizePage('statuses'), statusController.getAllStatuses);
router.get('/statuses/table/:tableName', authenticate, authorizePage('statuses'), statusController.getStatusesByTable);
router.get('/statuses/detail/:id', authenticate, authorizePage('statuses'), statusController.getStatusById);
router.post('/statuses', authenticate, authorize('super_admin'), statusController.createStatus);
router.put('/statuses/:id', authenticate, authorize('super_admin'), statusController.updateStatus);
router.delete('/statuses/:id', authenticate, authorize('super_admin'), statusController.deleteStatus);
router.put('/statuses/:tableName/reorder', authenticate, authorize('super_admin'), statusController.reorderStatuses);

module.exports = router;
