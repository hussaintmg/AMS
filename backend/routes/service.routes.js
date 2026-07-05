/**
 * Service Routes
 * Complete CRUD operations for Appointments and Job Cards
 * Created by LOGIXINVENTOR (PVT) Ltd.
 * info@logixinventor.com +92 333 3836851
 * www.logixinventor.com | AMS
 * Date: 2026-01-08
 */

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const serviceController = require('../controllers/serviceManagement.controller');

// ═══════════════════════════════════════════════════════════════════════════
// APPOINTMENTS ROUTES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * @swagger
 * /api/services/appointments:
 *   get:
 *     summary: Get all appointments with filters
 *     tags: [Service - Appointments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [scheduled, confirmed, in_progress, completed, cancelled, no_show]
 *       - in: query
 *         name: dateFrom
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: dateTo
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: List of appointments
 */
router.get('/appointments', authenticate, serviceController.getAllAppointments);

/**
 * @swagger
 * /api/services/appointments/stats:
 *   get:
 *     summary: Get appointment statistics
 *     tags: [Service - Appointments]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Appointment statistics
 */
router.get('/appointments/stats', authenticate, serviceController.getAppointmentStats);

/**
 * @swagger
 * /api/services/appointments/{id}:
 *   get:
 *     summary: Get appointment by ID
 *     tags: [Service - Appointments]
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
 *         description: Appointment details
 */
router.get('/appointments/:id', authenticate, serviceController.getAppointmentById);

/**
 * @swagger
 * /api/services/appointments:
 *   post:
 *     summary: Create new appointment
 *     tags: [Service - Appointments]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - customerId
 *               - appointmentDate
 *               - appointmentTime
 *             properties:
 *               customerId:
 *                 type: integer
 *               vehicleNumber:
 *                 type: string
 *               vehicleMake:
 *                 type: string
 *               vehicleModel:
 *                 type: string
 *               serviceTypeId:
 *                 type: integer
 *               appointmentDate:
 *                 type: string
 *                 format: date
 *               appointmentTime:
 *                 type: string
 *               customerConcerns:
 *                 type: string
 *     responses:
 *       201:
 *         description: Appointment created
 */
router.post('/appointments', authenticate, serviceController.createAppointment);

/**
 * @swagger
 * /api/services/appointments/{id}:
 *   put:
 *     summary: Update appointment
 *     tags: [Service - Appointments]
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
 *         description: Appointment updated
 */
router.put('/appointments/:id', authenticate, serviceController.updateAppointment);

/**
 * @swagger
 * /api/services/appointments/{id}/status:
 *   patch:
 *     summary: Update appointment status
 *     tags: [Service - Appointments]
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
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [scheduled, confirmed, in_progress, completed, cancelled, no_show]
 *     responses:
 *       200:
 *         description: Status updated
 */
router.patch('/appointments/:id/status', authenticate, serviceController.updateAppointmentStatus);

/**
 * @swagger
 * /api/services/appointments/{id}:
 *   delete:
 *     summary: Cancel appointment
 *     tags: [Service - Appointments]
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
 *         description: Appointment cancelled
 */
router.delete('/appointments/:id', authenticate, serviceController.deleteAppointment);

// ═══════════════════════════════════════════════════════════════════════════
// JOB CARDS ROUTES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * @swagger
 * /api/services/job-cards:
 *   get:
 *     summary: Get all job cards with filters
 *     tags: [Service - Job Cards]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [open, in_progress, on_hold, completed, delivered, cancelled]
 *       - in: query
 *         name: dateFrom
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: dateTo
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: technicianId
 *         schema:
 *           type: integer
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: List of job cards
 */
router.get('/job-cards', authenticate, serviceController.getAllJobCards);

/**
 * @swagger
 * /api/services/job-cards/stats:
 *   get:
 *     summary: Get job card statistics
 *     tags: [Service - Job Cards]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Job card statistics
 */
router.get('/job-cards/stats', authenticate, serviceController.getJobCardStats);

/**
 * @swagger
 * /api/services/job-cards/{id}:
 *   get:
 *     summary: Get job card by ID with services and parts
 *     tags: [Service - Job Cards]
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
 *         description: Job card details with services and parts
 */
router.get('/job-cards/:id', authenticate, serviceController.getJobCardById);

/**
 * @swagger
 * /api/services/job-cards:
 *   post:
 *     summary: Create new job card
 *     tags: [Service - Job Cards]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - customerId
 *             properties:
 *               appointmentId:
 *                 type: integer
 *               customerId:
 *                 type: integer
 *               vehicleNumber:
 *                 type: string
 *               vehicleMake:
 *                 type: string
 *               vehicleModel:
 *                 type: string
 *               vehicleVin:
 *                 type: string
 *               odometerReading:
 *                 type: integer
 *               fuelLevel:
 *                 type: string
 *                 enum: [empty, quarter, half, three_quarter, full]
 *               promisedDate:
 *                 type: string
 *                 format: date-time
 *               customerRemarks:
 *                 type: string
 *     responses:
 *       201:
 *         description: Job card created
 */
router.post('/job-cards', authenticate, serviceController.createJobCard);

/**
 * @swagger
 * /api/services/job-cards/{id}:
 *   put:
 *     summary: Update job card
 *     tags: [Service - Job Cards]
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
 *         description: Job card updated
 */
router.put('/job-cards/:id', authenticate, serviceController.updateJobCard);

/**
 * @swagger
 * /api/services/job-cards/{id}/status:
 *   patch:
 *     summary: Update job card status
 *     tags: [Service - Job Cards]
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
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [open, in_progress, on_hold, completed, delivered, cancelled]
 *     responses:
 *       200:
 *         description: Status updated
 */
router.patch('/job-cards/:id/status', authenticate, serviceController.updateJobCardStatus);

/**
 * @swagger
 * /api/services/job-cards/{id}/complete:
 *   post:
 *     summary: Complete job card
 *     tags: [Service - Job Cards]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               technicianRemarks:
 *                 type: string
 *     responses:
 *       200:
 *         description: Job card completed
 */
router.post('/job-cards/:id/complete', authenticate, serviceController.completeJobCard);

/**
 * @swagger
 * /api/services/job-cards/{id}:
 *   delete:
 *     summary: Cancel job card
 *     tags: [Service - Job Cards]
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
 *         description: Job card cancelled
 */
router.delete('/job-cards/:id', authenticate, serviceController.deleteJobCard);

// ═══════════════════════════════════════════════════════════════════════════
// JOB CARD SERVICES ROUTES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * @swagger
 * /api/services/job-cards/{id}/services:
 *   post:
 *     summary: Add service to job card
 *     tags: [Service - Job Card Services]
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
 *             required:
 *               - description
 *               - rate
 *             properties:
 *               serviceTypeId:
 *                 type: integer
 *               description:
 *                 type: string
 *               hours:
 *                 type: number
 *               rate:
 *                 type: number
 *               technicianId:
 *                 type: integer
 *     responses:
 *       201:
 *         description: Service added
 */
router.post('/job-cards/:id/services', authenticate, serviceController.addJobCardService);

/**
 * @swagger
 * /api/services/job-cards/{id}/services/{serviceId}:
 *   put:
 *     summary: Update job card service
 *     tags: [Service - Job Card Services]
 *     security:
 *       - bearerAuth: []
 */
router.put('/job-cards/:id/services/:serviceId', authenticate, serviceController.updateJobCardService);

/**
 * @swagger
 * /api/services/job-cards/{id}/services/{serviceId}:
 *   delete:
 *     summary: Delete job card service
 *     tags: [Service - Job Card Services]
 *     security:
 *       - bearerAuth: []
 */
router.delete('/job-cards/:id/services/:serviceId', authenticate, serviceController.deleteJobCardService);

// ═══════════════════════════════════════════════════════════════════════════
// JOB CARD PARTS ROUTES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * @swagger
 * /api/services/job-cards/{id}/parts:
 *   post:
 *     summary: Add part to job card
 *     tags: [Service - Job Card Parts]
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
 *             required:
 *               - partId
 *               - quantity
 *               - unitPrice
 *             properties:
 *               partId:
 *                 type: integer
 *               quantity:
 *                 type: integer
 *               unitPrice:
 *                 type: number
 *               isWarranty:
 *                 type: boolean
 *     responses:
 *       201:
 *         description: Part added
 */
router.post('/job-cards/:id/parts', authenticate, serviceController.addJobCardPart);

/**
 * @swagger
 * /api/services/job-cards/{id}/parts/{partId}:
 *   put:
 *     summary: Update job card part
 *     tags: [Service - Job Card Parts]
 *     security:
 *       - bearerAuth: []
 */
router.put('/job-cards/:id/parts/:partId', authenticate, serviceController.updateJobCardPart);

/**
 * @swagger
 * /api/services/job-cards/{id}/parts/{partId}:
 *   delete:
 *     summary: Delete job card part
 *     tags: [Service - Job Card Parts]
 *     security:
 *       - bearerAuth: []
 */
router.delete('/job-cards/:id/parts/:partId', authenticate, serviceController.deleteJobCardPart);

// ═══════════════════════════════════════════════════════════════════════════
// LOOKUP ROUTES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * @swagger
 * /api/services/types/list:
 *   get:
 *     summary: Get service types
 *     tags: [Service - Lookups]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of service types
 */
router.get('/types/list', authenticate, serviceController.getServiceTypes);

/**
 * @swagger
 * /api/services/technicians/list:
 *   get:
 *     summary: Get technicians
 *     tags: [Service - Lookups]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of technicians
 */
router.get('/technicians/list', authenticate, serviceController.getTechnicians);

/**
 * @swagger
 * /api/services/advisors/list:
 *   get:
 *     summary: Get service advisors
 *     tags: [Service - Lookups]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of service advisors
 */
router.get('/advisors/list', authenticate, serviceController.getAdvisors);

module.exports = router;
