/**
 * Lead Routes - Advanced Filtering, Search & CRUD Operations
 * Created by LOGIXINVENTOR (PVT) Ltd.
 * info@logixinventor.com +92 333 3836851
 * www.logixinventor.com | AMS
 */

const express = require('express');
const router = express.Router();
const LeadRepository = require('../repositories/LeadRepository');
const { authenticate } = require('../middleware/auth');
const { AppError } = require('../middleware/errorHandler');
const { normalizePhone } = require('../utils/phone.util');

const leadRepo = new LeadRepository();

/**
 * @swagger
 * /api/leads:
 *   get:
 *     summary: Get all leads with advanced filtering, search and pagination
 *     tags: [Leads]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search across name, email, phone, lead number
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [new, contacted, qualified, unqualified, converted, lost]
 *         description: Filter by status
 *       - in: query
 *         name: source_id
 *         schema:
 *           type: integer
 *         description: Filter by lead source ID
 *       - in: query
 *         name: priority
 *         schema:
 *           type: string
 *           enum: [low, medium, high, urgent]
 *         description: Filter by priority
 *       - in: query
 *         name: city
 *         schema:
 *           type: string
 *         description: Filter by city
 *       - in: query
 *         name: assigned_to
 *         schema:
 *           type: integer
 *         description: Filter by assigned user ID
 *       - in: query
 *         name: date_from
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter by created date from (YYYY-MM-DD)
 *       - in: query
 *         name: date_to
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter by created date to (YYYY-MM-DD)
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *         description: Items per page (max 100)
 *       - in: query
 *         name: sort_by
 *         schema:
 *           type: string
 *           default: created_at
 *         description: Sort column
 *       - in: query
 *         name: sort_order
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: desc
 *         description: Sort direction
 *     responses:
 *       200:
 *         description: Leads retrieved successfully
 */
router.get('/', authenticate, async (req, res, next) => {
    try {
        const result = await leadRepo.findAllWithFilters(req.query);
        res.json({ success: true, ...result });
    } catch (error) {
        next(error);
    }
});

/**
 * @swagger
 * /api/leads/sources/list:
 *   get:
 *     summary: Get active lead sources for dropdowns
 *     tags: [Leads]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lead sources retrieved successfully
 */
router.get('/sources/list', authenticate, async (req, res, next) => {
    try {
        const sources = await leadRepo.getLeadSources();
        res.json({ success: true, data: sources });
    } catch (error) {
        next(error);
    }
});

/**
 * @swagger
 * /api/leads/filter-options:
 *   get:
 *     summary: Get all filter dropdown options (statuses, priorities, sources, cities, users)
 *     tags: [Leads]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Filter options retrieved successfully
 */
router.get('/filter-options', authenticate, async (req, res, next) => {
    try {
        const options = await leadRepo.getFilterOptions();
        res.json({ success: true, data: options });
    } catch (error) {
        next(error);
    }
});

/**
 * @swagger
 * /api/leads/analytics:
 *   get:
 *     summary: Get lead analytics and statistics
 *     tags: [Leads]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Analytics data retrieved successfully
 */
router.get('/analytics', authenticate, async (req, res, next) => {
    try {
        const analytics = await leadRepo.getAnalytics();
        res.json({ success: true, data: analytics });
    } catch (error) {
        next(error);
    }
});

/**
 * @swagger
 * /api/leads/stats:
 *   get:
 *     summary: Get pipeline statistics
 *     tags: [Leads]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Statistics retrieved successfully
 */
router.get('/stats', authenticate, async (req, res, next) => {
    try {
        const stats = await leadRepo.getPipelineStats();
        const sources = await leadRepo.getSourceDistribution();
        res.json({ success: true, data: { pipeline: stats, sources } });
    } catch (error) {
        next(error);
    }
});

/**
 * @swagger
 * /api/leads/export:
 *   get:
 *     summary: Export filtered leads as CSV
 *     tags: [Leads]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *       - in: query
 *         name: source_id
 *         schema:
 *           type: integer
 *       - in: query
 *         name: priority
 *         schema:
 *           type: string
 *       - in: query
 *         name: date_from
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: date_to
 *         schema:
 *           type: string
 *           format: date
 *     responses:
 *       200:
 *         description: CSV file
 *         content:
 *           text/csv:
 *             schema:
 *               type: string
 */
router.get('/export', authenticate, async (req, res, next) => {
    try {
        const leads = await leadRepo.exportLeads(req.query);

        // Generate CSV content
        const headers = [
            'Lead Number', 'First Name', 'Last Name', 'Email', 'Phone',
            'City', 'Source', 'Status', 'Priority', 'Interested In',
            'Assigned To', 'Created At'
        ];

        const rows = leads.map(lead => [
            lead.lead_code || lead.lead_number || '',
            lead.name || lead.customer_name || '',
            '',
            lead.email || '',
            lead.phone || '',
            lead.city || '',
            lead.source_name || '',
            lead.status || '',
            lead.priority || '',
            lead.interested_in || '',
            lead.assigned_to_name || '',
            lead.created_at ? new Date(lead.created_at).toISOString().split('T')[0] : ''
        ].map(val => `"${String(val).replace(/"/g, '""')}"`).join(','));

        const csv = [headers.join(','), ...rows].join('\n');

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=leads_export_${new Date().toISOString().split('T')[0]}.csv`);
        res.send(csv);
    } catch (error) {
        next(error);
    }
});

/**
 * @swagger
 * /api/leads/{id}:
 *   get:
 *     summary: Get single lead by ID
 *     tags: [Leads]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Lead retrieved successfully
 */
router.get('/:id', authenticate, async (req, res, next) => {
    try {
        const lead = await leadRepo.findById(req.params.id);
        if (!lead) {
            throw new AppError('Lead not found', 404);
        }
        res.json({ success: true, data: lead });
    } catch (error) {
        next(error);
    }
});

/**
 * @swagger
 * /api/leads:
 *   post:
 *     summary: Create new lead
 *     tags: [Leads]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - first_name
 *               - last_name
 *               - phone
 *             properties:
 *               first_name:
 *                 type: string
 *               last_name:
 *                 type: string
 *               email:
 *                 type: string
 *               phone:
 *                 type: string
 *               source_id:
 *                 type: integer
 *               status:
 *                 type: string
 *               priority:
 *                 type: string
 *               interested_in:
 *                 type: string
 *               city:
 *                 type: string
 *               notes:
 *                 type: string
 *     responses:
 *       201:
 *         description: Lead created successfully
 */
router.post('/', authenticate, async (req, res, next) => {
    try {
        const { first_name, last_name, phone } = req.body;
        if (!first_name || !last_name || !phone) {
            throw new AppError('Required fields missing: first_name, last_name, phone', 400);
        }

        const normalizedPhone = normalizePhone(phone);
        const normalizedAlternatePhone = req.body.alternate_phone ? normalizePhone(req.body.alternate_phone) : null;

        const leadData = {
            ...req.body,
            phone: normalizedPhone,
            alternate_phone: normalizedAlternatePhone,
            lead_code: req.body.lead_number, // Trigger will handle if empty
            assigned_to: req.body.assigned_to || req.user.id,
            status: req.body.status || 'new',
            priority: req.body.priority || 'medium',
            created_by: req.user.id
        };

        const result = await leadRepo.create(leadData);
        res.status(201).json({
            success: true,
            message: 'Lead created successfully',
            data: { id: result.id, ...leadData }
        });
    } catch (error) {
        next(error);
    }
});

/**
 * @swagger
 * /api/leads/{id}:
 *   put:
 *     summary: Update lead
 *     tags: [Leads]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Lead updated successfully
 */
router.put('/:id', authenticate, async (req, res, next) => {
    try {
        const lead = await leadRepo.findById(req.params.id);
        if (!lead) {
            throw new AppError('Lead not found', 404);
        }

        if (req.body.phone) {
            req.body.phone = normalizePhone(req.body.phone);
        }
        if (req.body.alternate_phone) {
            req.body.alternate_phone = normalizePhone(req.body.alternate_phone);
        }

        await leadRepo.update(req.params.id, req.body);
        res.json({ success: true, message: 'Lead updated successfully' });
    } catch (error) {
        next(error);
    }
});

/**
 * @swagger
 * /api/leads/{id}:
 *   delete:
 *     summary: Delete lead
 *     tags: [Leads]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Lead deleted successfully
 */
router.delete('/:id', authenticate, async (req, res, next) => {
    try {
        const lead = await leadRepo.findById(req.params.id);
        if (!lead) {
            throw new AppError('Lead not found', 404);
        }

        await leadRepo.delete(req.params.id);
        res.json({ success: true, message: 'Lead deleted successfully' });
    } catch (error) {
        next(error);
    }
});

/**
 * @swagger
 * /api/leads/{id}/convert:
 *   post:
 *     summary: Convert lead to customer
 *     tags: [Leads]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Lead converted to customer successfully
 */
router.post('/:id/convert', authenticate, async (req, res, next) => {
    try {
        const lead = await leadRepo.findById(req.params.id);
        if (!lead) {
            throw new AppError('Lead not found', 404);
        }

        const result = await leadRepo.convertToCustomer(req.params.id, req.user.id);
        res.json({ success: true, message: 'Lead converted to customer successfully', data: result });
    } catch (error) {
        next(error);
    }
});

module.exports = router;
