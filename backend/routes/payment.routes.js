/**
 * Payment Routes
 * Maintained by Hussain Developer
 * AMS ERP
 */

const express = require('express');
const router = express.Router();
const { query } = require('../config/database');
const { authenticate, authorizeAction } = require('../middleware/auth');
const { AppError } = require('../middleware/errorHandler');

/**
 * Payments belong to invoices, so that is the page they are judged on.
 *
 * These handlers still talk to the MySQL stub left over from the MongoDB
 * migration and so return nothing at all — but they were also the only reads on
 * this side with no page guard, and an empty response today is not a reason to
 * leave the endpoint open when the stub is finally replaced.
 */
const canView = authorizeAction('invoices', 'view');
// Taking money against an invoice is the same grant the drawer's Record Payment
// button asks for. This POST inserts a payment row and moves the invoice's paid
// and balance figures, and it was reachable by anyone who was merely signed in.
const canRecordPayment = authorizeAction('invoices', 'recordPayment');

router.get('/', authenticate, canView, async (req, res, next) => {
    try {
        const { type, page = 1, limit = 20 } = req.query;
        let sql = `SELECT p.*, CONCAT(c.first_name, ' ', c.last_name) as customer_name, pm.name as payment_method
            FROM payments p
            LEFT JOIN customers c ON p.customer_id = c.id
            JOIN payment_methods pm ON p.payment_method_id = pm.id WHERE 1=1`;
        const params = [];
        if (type) { sql += ' AND p.payment_type = ?'; params.push(type); }
        sql += ' ORDER BY p.created_at DESC LIMIT ? OFFSET ?';
        params.push(parseInt(limit), (parseInt(page) - 1) * parseInt(limit));
        const payments = await query(sql, params);
        res.json({ success: true, data: payments });
    } catch (error) { next(error); }
});

router.post('/', authenticate, canRecordPayment, async (req, res, next) => {
    try {
        const { invoiceId, bookingId, customerId, paymentMethodId, amount, referenceNumber } = req.body;
        if (!paymentMethodId || !amount) throw new AppError('Required fields missing', 400);

        const result = await query(
            `INSERT INTO payments (payment_number, payment_type, invoice_id, booking_id, customer_id,
             payment_method_id, amount, payment_date, reference_number, status, received_by)
             VALUES (CONCAT('PAY', LPAD((SELECT COALESCE(MAX(id), 0) + 1 FROM payments p2), 6, '0')), 'receipt', ?, ?, ?, ?, ?, CURDATE(), ?, 'cleared', ?)`,
            [invoiceId, bookingId, customerId, paymentMethodId, amount, referenceNumber, req.user.id]
        );

        if (invoiceId) {
            await query(
                `UPDATE invoices SET paid_amount = paid_amount + ?, balance_amount = balance_amount - ?,
                 status = CASE WHEN balance_amount - ? <= 0 THEN 'paid' ELSE 'partial' END WHERE id = ?`,
                [amount, amount, amount, invoiceId]
            );
        }

        if (customerId) {
            await query('UPDATE customers SET outstanding_balance = outstanding_balance - ? WHERE id = ?', [amount, customerId]);
        }

        res.status(201).json({ success: true, data: { id: result.insertId } });
    } catch (error) { next(error); }
});

router.get('/methods/list', authenticate, canView, async (req, res, next) => {
    try {
        const methods = await query('SELECT * FROM payment_methods WHERE is_active = TRUE');
        res.json({ success: true, data: methods });
    } catch (error) { next(error); }
});

module.exports = router;
