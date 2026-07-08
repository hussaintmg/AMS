const express = require('express');
const router = express.Router();
const controller = require('../controllers/customer.controller');
const { authenticate, authorize } = require('../middleware/auth');

const requireAuth = [authenticate];

/**
 * @swagger
 * tags:
 *   - name: Customers
 *     description: MongoDB Customer management (replaces MySQL customers)
 *
 * /api/customers/stats:
 *   get:
 *     summary: Get customer statistics
 *     tags: [Customers]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Customer stats returned }
 *       401: { description: Unauthorized }
 *       500: { description: Server error }
 *
 * /api/customers/cities:
 *   get:
 *     summary: Get unique customer cities for filter
 *     tags: [Customers]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Cities returned }
 *       401: { description: Unauthorized }
 *       500: { description: Server error }
 *
 * /api/customers/all:
 *   get:
 *     summary: Get all active customers for dropdown
 *     tags: [Customers]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Customers returned }
 *       401: { description: Unauthorized }
 *       500: { description: Server error }
 *
 * /api/customers:
 *   get:
 *     summary: Get paginated customers with filters
 *     tags: [Customers]
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
 *         name: customerType
 *         schema: { type: string, enum: [individual, corporate] }
 *       - in: query
 *         name: city
 *         schema: { type: string }
 *       - in: query
 *         name: source
 *         schema: { type: string }
 *       - in: query
 *         name: type
 *         schema: { type: string }
 *       - in: query
 *         name: status
 *         schema: { type: string }
 *       - in: query
 *         name: assignedTo
 *         schema: { type: string }
 *       - in: query
 *         name: department
 *         schema: { type: string }
 *       - in: query
 *         name: isActive
 *         schema: { type: string, enum: [true, false, all], default: all }
 *       - in: query
 *         name: startDate
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: endDate
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: sortBy
 *         schema: { type: string }
 *       - in: query
 *         name: sortOrder
 *         schema: { type: string, enum: [asc, desc] }
 *     responses:
 *       200: { description: Customers returned }
 *       401: { description: Unauthorized }
 *       500: { description: Server error }
 *   post:
 *     summary: Create a new customer
 *     tags: [Customers]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [firstName]
 *             required: [firstName, email]
 *             properties:
 *               firstName: { type: string }
 *               lastName: { type: string }
 *               email: { type: string }
 *               phone: { type: string }
 *               alternatePhone: { type: string }
 *               customerType: { type: string, enum: [individual, corporate] }
 *               companyName: { type: string }
 *               source: { type: string }
 *               type: { type: string }
 *               status: { type: string }
 *               description: { type: string }
 *               assignedTo: { type: string }
 *               department: { type: string }
 *               address: { type: string }
 *               city: { type: string }
 *               state: { type: string }
 *               country: { type: string }
 *               zipCode: { type: string }
 *     responses:
 *       201: { description: Customer created }
 *       400: { description: Validation error }
 *       401: { description: Unauthorized }
 *       500: { description: Server error }
 *
 * /api/customers/{id}:
 *   get:
 *     summary: Get customer by ID
 *     tags: [Customers]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Customer returned }
 *       404: { description: Customer not found }
 *       401: { description: Unauthorized }
 *       500: { description: Server error }
 *   put:
 *     summary: Update customer
 *     tags: [Customers]
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
 *               firstName: { type: string }
 *               lastName: { type: string }
 *               email: { type: string }
 *               phone: { type: string }
 *               alternatePhone: { type: string }
 *               customerType: { type: string }
 *               companyName: { type: string }
 *               source: { type: string }
 *               type: { type: string }
 *               status: { type: string }
 *               description: { type: string }
 *               assignedTo: { type: string }
 *               department: { type: string }
 *               address: { type: string }
 *               city: { type: string }
 *               state: { type: string }
 *               country: { type: string }
 *               zipCode: { type: string }
 *               isActive: { type: boolean }
 *     responses:
 *       200: { description: Customer updated }
 *       404: { description: Customer not found }
 *       401: { description: Unauthorized }
 *       500: { description: Server error }
 *   delete:
 *     summary: Deactivate customer (soft delete)
 *     tags: [Customers]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Customer deactivated }
 *       404: { description: Customer not found }
 *       401: { description: Unauthorized }
 *       500: { description: Server error }
 *
 * /api/customers/{id}/status:
 *   patch:
 *     summary: Toggle customer active status
 *     tags: [Customers]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Status toggled }
 *       404: { description: Customer not found }
 *       401: { description: Unauthorized }
 *       500: { description: Server error }
 *
 * /api/customers/meta:
 *   get:
 *     summary: Get form meta data (statuses, sources, types, users, departments)
 *     tags: [Customers]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Meta data returned }
 *       401: { description: Unauthorized }
 *       500: { description: Server error }
 */

router.get('/stats', requireAuth, controller.getCustomerStats);
router.get('/cities', requireAuth, controller.getCustomerCities);
router.get('/all', requireAuth, controller.getAllForDropdown);
router.get('/meta', requireAuth, controller.getCustomerMeta);
router.get('/', requireAuth, controller.getCustomers);
router.post('/', requireAuth, controller.createCustomer);
router.get('/:id', requireAuth, controller.getCustomerById);
router.put('/:id', requireAuth, controller.updateCustomer);
router.delete('/:id', requireAuth, controller.deleteCustomer);
router.patch('/:id/status', requireAuth, controller.toggleCustomerStatus);

module.exports = router;