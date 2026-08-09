const express = require('express');
const router = express.Router();
const { fieldMask } = require('../utils/fieldPermissions');

// Withhold the columns this role may not read, whatever the endpoint returns.
router.use(fieldMask('leads'));
const leadController = require('../controllers/leadManagement.controller');
const { authenticate, authorizeAction } = require('../middleware/auth');

/**
 * @swagger
 * tags:
 *   - name: Lead Management
 *     description: Lead CRUD, assignment, status changes, notes, conversion
 *
 * /api/leads:
 *   get:
 *     summary: Get paginated leads with search and column filters
 *     tags: [Lead Management]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *       - in: query
 *         name: status
 *         schema: { type: string }
 *       - in: query
 *         name: source
 *         schema: { type: string }
 *       - in: query
 *         name: priority
 *         schema: { type: string }
 *       - in: query
 *         name: type
 *         schema: { type: string }
 *       - in: query
 *         name: city
 *         schema: { type: string }
 *       - in: query
 *         name: assignedTo
 *         schema: { type: string }
 *       - in: query
 *         name: department
 *         schema: { type: string }
 *       - in: query
 *         name: dateFrom
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: dateTo
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: leadNo
 *         schema: { type: string }
 *       - in: query
 *         name: customerName
 *         schema: { type: string }
 *       - in: query
 *         name: email
 *         schema: { type: string }
 *       - in: query
 *         name: phone
 *         schema: { type: string }
 *       - in: query
 *         name: customerType
 *         schema: { type: string, enum: [individual, corporate] }
 *       - in: query
 *         name: isActive
 *         schema: { type: string, enum: [true, false, all], default: true }
 *       - in: query
 *         name: sortBy
 *         schema: { type: string, default: createdAt }
 *       - in: query
 *         name: sortOrder
 *         schema: { type: string, enum: [asc, desc], default: desc }
 *     responses:
 *       200: { description: Paginated leads }
 *       401: { description: Unauthorized }
 *       403: { description: Forbidden }
 *
 *   post:
 *     summary: Create a new lead
 *     tags: [Lead Management]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [customerName, email, phone]
 *             properties:
 *               customerName: { type: string }
 *               email: { type: string, format: email }
 *               phone: { type: string }
 *               source: { type: string }
 *               type: { type: string }
 *               priority: { type: string }
 *               city: { type: string }
 *               customerType: { type: string, enum: [individual, corporate], default: individual }
 *               department: { type: string }
 *               assignedTo: { type: string }
 *               leadValue: { type: number }
 *               description: { type: string }
 *     responses:
 *       201: { description: Lead created }
 *       400: { description: Validation error }
 *
 * /api/leads/meta:
 *   get:
 *     summary: Get lead form meta data (statuses, sources, types, priorities, cities, users, departments)
 *     tags: [Lead Management]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Meta data returned }
 *
 * /api/leads/stats:
 *   get:
 *     summary: Get lead dashboard statistics
 *     tags: [Lead Management]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Stats returned }
 *
 * /api/leads/seed:
 *   post:
 *     summary: Seed default lead types and priorities if collections are empty
 *     tags: [Lead Management]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Defaults seeded }
 *
 * /api/leads/{id}:
 *   get:
 *     summary: Get lead by ID
 *     tags: [Lead Management]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Lead returned }
 *       404: { description: Lead not found }
 *   put:
 *     summary: Update lead by ID
 *     tags: [Lead Management]
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
 *     responses:
 *       200: { description: Lead updated }
 *       404: { description: Lead not found }
 *   delete:
 *     summary: Soft-delete (deactivate) lead by ID
 *     tags: [Lead Management]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Lead deactivated }
 *       404: { description: Lead not found }
 *
 * /api/leads/{id}/assign:
 *   put:
 *     summary: Assign or unassign a lead
 *     tags: [Lead Management]
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
 *               assignedTo: { type: string, nullable: true }
 *     responses:
 *       200: { description: Lead assigned }
 *
 * /api/leads/{id}/status:
 *   put:
 *     summary: Change lead status
 *     tags: [Lead Management]
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
 *             required: [status]
 *             properties:
 *               status: { type: string }
 *     responses:
 *       200: { description: Status updated }
 *
 * /api/leads/{id}/notes:
 *   post:
 *     summary: Add a note to a lead
 *     tags: [Lead Management]
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
 *             required: [content]
 *             properties:
 *               content: { type: string }
 *     responses:
 *       201: { description: Note added }
 *
 * /api/leads/{id}/activities:
 *   get:
 *     summary: Get lead activity timeline
 *     tags: [Lead Management]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Activities returned }
 *
 * /api/leads/{id}/convert:
 *   post:
 *     summary: Convert lead to customer
 *     tags: [Lead Management]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Lead converted }
 *
 * /api/leads/{id}/lost:
 *   post:
 *     summary: Mark lead as lost
 *     tags: [Lead Management]
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
 *             required: [lostReason]
 *             properties:
 *               lostReason: { type: string }
 *     responses:
 *       200: { description: Lead marked lost }
 */

router.get('/meta', authenticate, authorizeAction('leads', 'view'), leadController.getLeadMeta);
router.get('/stats', authenticate, authorizeAction('leads', 'view'), leadController.getLeadStats);
router.post('/seed', authenticate, authorizeAction('leads', 'create'), leadController.seedDefaults);

router.get('/', authenticate, authorizeAction('leads', 'view'), leadController.getLeads);
router.post('/', authenticate, authorizeAction('leads', 'create'), leadController.createLead);

router.get('/:id', authenticate, authorizeAction('leads', 'view'), leadController.getLeadById);
router.put('/:id', authenticate, authorizeAction('leads', 'edit'), leadController.updateLead);
router.delete('/:id', authenticate, authorizeAction('leads', 'delete'), leadController.deleteLead);

router.put('/:id/assign', authenticate, authorizeAction('leads', 'edit'), leadController.assignLead);
router.put('/:id/status', authenticate, authorizeAction('leads', 'edit'), leadController.changeStatus);
router.post('/:id/notes', authenticate, authorizeAction('leads', 'edit'), leadController.addNote);
router.get('/:id/activities', authenticate, authorizeAction('leads', 'view'), leadController.getActivities);
router.post('/:id/convert', authenticate, authorizeAction('leads', 'edit'), leadController.convertToCustomer);
router.post('/:id/lost', authenticate, authorizeAction('leads', 'edit'), leadController.markLost);

module.exports = router;
