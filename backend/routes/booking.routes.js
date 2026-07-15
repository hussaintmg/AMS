/**
 * Booking Routes
 * Full CRUD operations with role-based permissions
 * Maintained by Hussain Developer
 * hussaintmerng@gmail.com | +92 319 1634446
 * AMS ERP
 * Date: 2026-01-06
 * 
 * @swagger
 * tags:
 *   - name: Bookings
 *     description: Booking management CRUD operations
 */

const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const salesController = require('../controllers/salesManagement.controller');
const bulkPermission = require('../middleware/bulkSalesPermission');

/**
 * @swagger
 * /api/bookings/stats:
 *   get:
 *     tags: [Bookings]
 *     summary: Get booking statistics
 *     security: [{ bearerAuth: [] }]
 */
router.get('/stats', authenticate, salesController.getBookingStats);
router.post('/bulk', authenticate, bulkPermission('bookings'), salesController.bulkSalesDocuments);

/**
 * @swagger
 * /api/bookings:
 *   get:
 *     tags: [Bookings]
 *     summary: Get all bookings with filters
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: status
 *         in: query
 *         schema: { type: string, enum: [pending, confirmed, processing, ready, cancelled, converted] }
 *       - name: priority
 *         in: query
 *         schema: { type: string, enum: [normal, high, vip] }
 *       - name: customerId
 *         in: query
 *         schema: { type: integer }
 *       - name: search
 *         in: query
 *         schema: { type: string }
 */
router.get('/', authenticate, salesController.getAllBookings);

/**
 * @swagger
 * /api/bookings/{id}:
 *   get:
 *     tags: [Bookings]
 *     summary: Get booking by ID
 *     security: [{ bearerAuth: [] }]
 */
router.get('/:id', authenticate, salesController.getBookingById);

/**
 * @swagger
 * /api/bookings:
 *   post:
 *     tags: [Bookings]
 *     summary: Create new booking
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [customerId, vehicleVariantId, bookingAmount]
 *             properties:
 *               quotationId: { type: integer }
 *               customerId: { type: integer }
 *               vehicleVariantId: { type: integer }
 *               vehicleColorId: { type: integer }
 *               bookingAmount: { type: number }
 *               totalAmount: { type: number }
 *               expectedDeliveryDate: { type: string, format: date }
 *               priority: { type: string, enum: [normal, high, vip] }
 */
router.post('/', authenticate, authorize('super_admin', 'sales_manager', 'sales_executive'), salesController.createBooking);

router.post('/:id/send-email', authenticate, authorize('super_admin', 'admin', 'sales_manager', 'sales_executive'), salesController.sendBookingEmail);

/**
 * @swagger
 * /api/bookings/{id}:
 *   put:
 *     tags: [Bookings]
 *     summary: Update booking
 *     security: [{ bearerAuth: [] }]
 */
router.put('/:id', authenticate, authorize('super_admin', 'sales_manager'), salesController.updateBooking);

/**
 * @swagger
 * /api/bookings/{id}:
 *   delete:
 *     tags: [Bookings]
 *     summary: Cancel booking
 *     security: [{ bearerAuth: [] }]
 */
router.delete('/:id', authenticate, authorize('super_admin', 'sales_manager'), salesController.deleteBooking);

/**
 * @swagger
 * /api/bookings/{id}/allocate:
 *   post:
 *     tags: [Bookings]
 *     summary: Allocate vehicle to booking
 *     security: [{ bearerAuth: [] }]
 */
router.post('/:id/allocate', authenticate, authorize('super_admin', 'sales_manager'), salesController.allocateVehicle);

/**
 * @swagger
 * /api/bookings/{id}/convert:
 *   post:
 *     tags: [Bookings]
 *     summary: Convert booking to sales order
 *     security: [{ bearerAuth: [] }]
 */
router.post('/:id/convert', authenticate, authorize('super_admin', 'sales_manager'), salesController.convertBookingToOrder);

module.exports = router;
