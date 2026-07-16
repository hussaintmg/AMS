/**
 * Global Search Routes
 * AMS ERP Global Search System
 */

const express = require('express');
const router = express.Router();
const controller = require('../controllers/global-search.controller');
const { authenticate, authorize } = require('../middleware/auth');
const searchRateLimit = require('../middleware/searchRateLimit');

/**
 * @swagger
 * tags:
 *   name: Global Search
 *   description: Comprehensive search across all ERP modules
 */

/**
 * @swagger
 * /api/search:
 *   get:
 *     summary: Search across all ERP modules
 *     tags: [Global Search]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *         description: Search query
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *         description: Filter by entity type (optional)
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Results per module
 *     responses:
 *       200:
 *         description: Search results
 */
router.get('/', authenticate, searchRateLimit, controller.search);

/**
 * @swagger
 * /api/search/suggest:
 *   get:
 *     summary: Get autocomplete suggestions
 *     tags: [Global Search]
 *     security:
 *       - bearerAuth: []
 */
router.get('/suggest', authenticate, searchRateLimit, controller.suggest);

/**
 * @swagger
 * /api/search/click:
 *   post:
 *     summary: Record a search click for analytics
 *     tags: [Global Search]
 *     security:
 *       - bearerAuth: []
 */
router.post('/click', authenticate, controller.click);

/**
 * @swagger
 * /api/search/history:
 *   get:
 *     summary: Get current user's search history
 *     tags: [Global Search]
 *     security:
 *       - bearerAuth: []
 */
router.get('/history', authenticate, controller.history);

/**
 * @swagger
 * /api/search/history:
 *   delete:
 *     summary: Clear current user's search history
 *     tags: [Global Search]
 *     security:
 *       - bearerAuth: []
 */
router.delete('/history', authenticate, controller.clearHistory);

/**
 * @swagger
 * /api/search/popular:
 *   get:
 *     summary: Get popular searches across all users
 *     tags: [Global Search]
 *     security:
 *       - bearerAuth: []
 */
router.get('/popular', authenticate, controller.popular);

/**
 * @swagger
 * /api/search/analytics:
 *   get:
 *     summary: Get search analytics (admin only)
 *     tags: [Global Search]
 *     security:
 *       - bearerAuth: []
 */
router.get('/analytics', authenticate, authorize('super_admin'), controller.analytics);

/**
 * @swagger
 * /api/search/config:
 *   get:
 *     summary: Get global search configuration
 *     tags: [Global Search]
 *     security:
 *       - bearerAuth: []
 */
router.get('/config', authenticate, controller.config);

/**
 * @swagger
 * /api/search/config:
 *   put:
 *     summary: Update global search configuration (admin only)
 *     tags: [Global Search]
 *     security:
 *       - bearerAuth: []
 */
router.put('/config', authenticate, authorize('super_admin'), controller.saveConfig);

/**
 * @swagger
 * /api/search/modules:
 *   get:
 *     summary: Get search module configurations
 *     tags: [Global Search]
 *     security:
 *       - bearerAuth: []
 */
router.get('/modules', authenticate, controller.modulesConfig);

/**
 * @swagger
 * /api/search/rebuild:
 *   post:
 *     summary: Rebuild the entire search index (super admin only)
 *     tags: [Global Search]
 *     security:
 *       - bearerAuth: []
 */
router.post('/rebuild', authenticate, authorize('super_admin'), controller.rebuild);

module.exports = router;
