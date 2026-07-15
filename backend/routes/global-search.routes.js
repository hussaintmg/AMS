/**
 * Global Search Routes
 * Maintained by Hussain Developer
 * hussaintmerng@gmail.com | +92 319 1634446
 * AMS ERP
 * Date: 2026-01-11
 */

const express = require('express');
const router = express.Router();
const globalSearchController = require('../controllers/global-search.controller');
const { authenticate, authorize } = require('../middleware/auth');
const { rebuildWithLog } = require('../services/searchIndex.service');
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
router.get('/', authenticate, searchRateLimit, globalSearchController.search);
router.get('/suggest', authenticate, searchRateLimit, globalSearchController.suggest);
router.post('/rebuild', authenticate, authorize('super_admin'), async (req,res,next)=>{try{const count=await rebuildWithLog(req.user.id);res.json({success:true,data:{count},message:'Search index rebuilt'})}catch(e){next(e)}});

module.exports = router;
