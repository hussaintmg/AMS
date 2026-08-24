const express = require('express');
const router = express.Router();
const leadMasterController = require('../controllers/leadMaster.controller');
const { authenticate, authorizeAction, authorizeAny, authorizePicker, authorizeQuickCreate } = require('../middleware/auth');

/**
 * What the page catalog calls the record this URL raises: `/lead-master/sources`
 * is the "+ Create Source" shortcut on the Leads and Customers forms. The two
 * spellings have to be tied together somewhere, and the guard is the only place
 * that needs them both.
 */
const QUICK_CREATE_KEY = { sources: 'source', types: 'type', priorities: 'priority', cities: 'city' };

/**
 * @swagger
 * tags:
 *   - name: Lead Master Data
 *     description: CRUD for lead sources, types, priorities, and cities
 *
 * /api/lead-master/stats:
 *   get:
 *     summary: Get aggregate stats for all master data types
 *     tags: [Lead Master Data]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Stats returned }
 *       401: { description: Unauthorized }
 *       403: { description: Forbidden }
 *
 * /api/lead-master/{type}:
 *   get:
 *     summary: Get all items of a master data type (sources|types|priorities|cities)
 *     tags: [Lead Master Data]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: type
 *         required: true
 *         schema: { type: string, enum: [sources, types, priorities, cities] }
 *       - in: query
 *         name: active
 *         schema: { type: string, enum: [true, false] }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *     responses:
 *       200: { description: Items returned }
 *       400: { description: Invalid type }
 *   post:
 *     summary: Create a new master data item
 *     tags: [Lead Master Data]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: type
 *         required: true
 *         schema: { type: string, enum: [sources, types, priorities, cities] }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name: { type: string }
 *               description: { type: string }
 *               color: { type: string }
 *               sortOrder: { type: integer }
 *               category: { type: string, enum: [vehicle, service, parts, general, corporate, other], description: Only for types }
 *               level: { type: integer, minimum: 0, maximum: 10, description: Only for priorities }
 *               portalModules: { type: array, items: { type: string, enum: [services, vehicles, parts] }, description: Only for types }
 *     responses:
 *       201: { description: Item created }
 *       400: { description: Validation error }
 *       409: { description: Duplicate name }
 *
 * /api/lead-master/{type}/{id}:
 *   put:
 *     summary: Update a master data item
 *     tags: [Lead Master Data]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: type
 *         required: true
 *         schema: { type: string, enum: [sources, types, priorities, cities] }
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
 *               name: { type: string }
 *               description: { type: string }
 *               color: { type: string }
 *               sortOrder: { type: integer }
 *               isActive: { type: boolean }
 *               category: { type: string, description: Only for types }
 *               level: { type: integer, description: Only for priorities }
 *               portalModules: { type: array, items: { type: string, enum: [services, vehicles, parts] }, description: Only for types }
 *     responses:
 *       200: { description: Item updated }
 *       404: { description: Not found }
 *   delete:
 *     summary: Delete a master data item (only if no active leads reference it)
 *     tags: [Lead Master Data]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: type
 *         required: true
 *         schema: { type: string, enum: [sources, types, priorities, cities] }
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Item deleted }
 *       400: { description: Item in use }
 *       404: { description: Not found }
 */

router.get('/stats', authenticate, authorizeAction('lead_master', 'view'), leadMasterController.getStats);
// The city / source / type / priority pickers on the Leads and Customers
// forms read this, so holding either page is enough to list them.
router.get('/:type', authenticate, authorizePicker('lead_master', ['LeadCity', 'LeadSource', 'LeadType', 'LeadPriority']), leadMasterController.getAll);
// Either grant raises a source, type, priority or city: Lead Master Data's own
// Create right, or the "+ Create Source" shortcut ticked on a form of a page the
// role does hold (Role Jobs -> Leads / Customers -> Forms).
router.post('/:type', authenticate, authorizeAny(
  authorizeAction('lead_master', 'create'),
  authorizeQuickCreate('lead_master', (req) => QUICK_CREATE_KEY[req.params.type]),
), leadMasterController.create);
router.put('/:type/:id', authenticate, authorizeAction('lead_master', 'edit'), leadMasterController.update);
router.delete('/:type/:id', authenticate, authorizeAction('lead_master', 'delete'), leadMasterController.remove);

module.exports = router;
