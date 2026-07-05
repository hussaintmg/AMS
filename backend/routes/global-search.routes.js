/**
 * Global Search Routes
 * Created by LOGIXINVENTOR (PVT) Ltd.
 * info@logixinventor.com +92 333 3836851
 * www.logixinventor.com | AMS
 * Date: 2026-01-11
 */

const express = require('express');
const router = express.Router();
const globalSearchController = require('../controllers/global-search.controller');
const { authenticate } = require('../middleware/auth');

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
 *     summary: Perform a global search across leads, customers, vehicles, etc.
 *     tags: [Global Search]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: query
 *         required: true
 *         schema:
 *           type: string
 *           minLength: 3
 *         description: Search term (at least 3 characters)
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *         description: Maximum number of results to return
 *     responses:
 *       200:
 *         description: Search results retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 count:
 *                   type: integer
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       type:
 *                         type: string
 *                       title:
 *                         type: string
 *                       subtitle:
 *                         type: string
 *                       id:
 *                         type: integer
 *                       link:
 *                         type: string
 *       400:
 *         description: Search query too short
 *       500:
 *         description: Server error
 */
router.get('/', authenticate, globalSearchController.search);

module.exports = router;
