/**
 * Payment Methods Routes
 * =======================
 * API endpoints for payment methods management
 * 
 * Created by LOGIXINVENTOR (PVT) Ltd.
 * info@logixinventor.com +92 333 3836851
 * www.logixinventor.com | AMS
 */

const express = require('express');
const router = express.Router();
const paymentMethodsController = require('../controllers/paymentMethods.controller');
const { authenticate, authorize } = require('../middleware/auth');

/**
 * @swagger
 * components:
 *   schemas:
 *     PaymentMethod:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *         name:
 *           type: string
 *         type:
 *           type: string
 *           enum: [cash, bank, card, cheque, online]
 *         is_active:
 *           type: boolean
 *         account_id:
 *           type: integer
 *         created_at:
 *           type: string
 *           format: date-time
 *         usage_count:
 *           type: integer
 */

/**
 * @swagger
 * /api/payment-methods:
 *   get:
 *     summary: Get all payment methods
 *     tags: [Payment Methods]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, inactive]
 *         description: Filter by status
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *         description: Filter by type
 *     responses:
 *       200:
 *         description: List of payment methods
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/PaymentMethod'
 */
router.get('/', authenticate, paymentMethodsController.getAll);

/**
 * @swagger
 * /api/payment-methods/types:
 *   get:
 *     summary: Get payment method types for dropdown
 *     tags: [Payment Methods]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of types
 */
router.get('/types', authenticate, paymentMethodsController.getTypes);

/**
 * @swagger
 * /api/payment-methods/{id}:
 *   get:
 *     summary: Get payment method by ID
 *     tags: [Payment Methods]
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
 *         description: Payment method details
 *       404:
 *         description: Payment method not found
 */
router.get('/:id', authenticate, paymentMethodsController.getById);

/**
 * @swagger
 * /api/payment-methods:
 *   post:
 *     summary: Create new payment method
 *     tags: [Payment Methods]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - type
 *             properties:
 *               name:
 *                 type: string
 *               type:
 *                 type: string
 *                 enum: [cash, bank, card, cheque, online]
 *               account_id:
 *                 type: integer
 *     responses:
 *       201:
 *         description: Payment method created
 *       400:
 *         description: Invalid input or duplicate name
 */
router.post('/', authenticate, authorize('super_admin', 'accountant'), paymentMethodsController.create);

/**
 * @swagger
 * /api/payment-methods/{id}:
 *   put:
 *     summary: Update payment method
 *     tags: [Payment Methods]
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
 *               name:
 *                 type: string
 *               type:
 *                 type: string
 *               account_id:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Payment method updated
 *       404:
 *         description: Payment method not found
 */
router.put('/:id', authenticate, authorize('super_admin', 'accountant'), paymentMethodsController.update);

/**
 * @swagger
 * /api/payment-methods/{id}/toggle:
 *   patch:
 *     summary: Toggle payment method status
 *     tags: [Payment Methods]
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
 *         description: Status toggled
 *       404:
 *         description: Payment method not found
 */
router.patch('/:id/toggle', authenticate, authorize('super_admin', 'accountant'), paymentMethodsController.toggleStatus);

/**
 * @swagger
 * /api/payment-methods/{id}:
 *   delete:
 *     summary: Delete payment method
 *     tags: [Payment Methods]
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
 *         description: Payment method deleted
 *       400:
 *         description: Cannot delete - method in use
 *       404:
 *         description: Payment method not found
 */
router.delete('/:id', authenticate, authorize('super_admin', 'accountant'), paymentMethodsController.remove);

module.exports = router;
