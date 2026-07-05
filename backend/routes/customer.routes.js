/**
 * Customer Routes - Full CRUD with Async Operations
 * Created by LOGIXINVENTOR (PVT) Ltd.
 * info@logixinventor.com +92 333 3836851
 * www.logixinventor.com | AMS
 */

const express = require('express');
const router = express.Router();
const { query } = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { AppError } = require('../middleware/errorHandler');
const { normalizePhone } = require('../utils/phone.util');

/**
 * GET /api/customers/stats
 * Get customer statistics
 */
router.get('/stats', authenticate, async (req, res, next) => {
    try {
        const stats = await query(`
            SELECT
                COUNT(*) as total_customers,
                SUM(CASE WHEN customer_type = 'individual' THEN 1 ELSE 0 END) as individual_count,
                SUM(CASE WHEN customer_type = 'corporate' THEN 1 ELSE 0 END) as corporate_count,
                SUM(CASE WHEN is_active = TRUE THEN 1 ELSE 0 END) as active_count,
                SUM(CASE WHEN is_active = FALSE THEN 1 ELSE 0 END) as inactive_count,
                SUM(CASE WHEN DATE(created_at) >= DATE_SUB(CURDATE(), INTERVAL 30 DAY) THEN 1 ELSE 0 END) as new_this_month,
                COALESCE(SUM(outstanding_balance), 0) as total_outstanding,
                COALESCE(SUM(credit_limit), 0) as total_credit_limit
            FROM customers
        `);
        res.json({ success: true, data: stats[0] || {} });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/customers/cities
 * Get unique cities for filter dropdown
 */
router.get('/cities', authenticate, async (req, res, next) => {
    try {
        const cities = await query(`
            SELECT DISTINCT city FROM customers 
            WHERE city IS NOT NULL AND city != '' 
            ORDER BY city
        `);
        res.json({ success: true, data: cities.map(c => c.city) });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/customers/all
 * Get all customers for dropdowns (no pagination)
 */
router.get('/all', authenticate, async (req, res, next) => {
    try {
        // Keep sales/service dropdowns in sync with leads created from CRM screens.
        // If a lead has not yet been converted to a customer, create a lightweight
        // customer record linked by lead_id so it can be used in forms immediately.
        await query(`
            INSERT INTO customers (
                customer_number, first_name, last_name, email, phone, alternate_phone,
                address, city, state, postal_code, country, customer_type, lead_id,
                created_by, created_at, updated_at
            )
            SELECT
                l.lead_code,
                l.name,
                l.name,
                l.email,
                l.phone,
                l.alternate_phone,
                l.address,
                l.city,
                l.state,
                l.postal_code,
                'Pakistan',
                'individual',
                l.id,
                l.created_by,
                l.created_at,
                NOW()
            FROM leads l
            LEFT JOIN customers c_lead ON c_lead.lead_id = l.id
            LEFT JOIN customers c_phone ON c_phone.phone = l.phone
            WHERE c_lead.id IS NULL
              AND c_phone.id IS NULL
              AND l.status != 'lost'
              AND l.phone IS NOT NULL
              AND l.phone != ''
              AND l.lead_code IS NOT NULL
              AND l.lead_code != ''
        `);

        const customers = await query(`
            SELECT c.id, c.customer_number, c.first_name, c.last_name, c.phone, c.company_name, c.is_active, c.created_at
            FROM customers c
            ORDER BY c.created_at DESC
        `);
        res.json({ success: true, data: customers });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/customers
 * Get all customers with pagination, search, and filters
 */
router.get('/', authenticate, async (req, res, next) => {
    try {
        const { type, search, city, isActive, page = 1, limit = 25 } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);

        let sql = `
            SELECT c.*,
                (SELECT COUNT(*) FROM sales_orders WHERE customer_id = c.id) as total_orders,
                (SELECT COALESCE(SUM(total_amount), 0) FROM sales_orders WHERE customer_id = c.id AND status = 'delivered') as total_spent,
                CONCAT(u.first_name, ' ', u.last_name) as created_by_name
            FROM customers c
            LEFT JOIN users u ON c.created_by = u.id
            WHERE 1=1
        `;
        const params = [];

        // Filter by customer type
        if (type && type !== 'all') {
            sql += ' AND c.customer_type = ?';
            params.push(type);
        }

        // Filter by city
        if (city) {
            sql += ' AND c.city = ?';
            params.push(city);
        }

        // Filter by active status
        if (isActive !== undefined && isActive !== '') {
            sql += ' AND c.is_active = ?';
            params.push(isActive === 'true' || isActive === '1');
        }

        // Search across multiple fields
        if (search) {
            sql += ` AND (
                c.first_name LIKE ? OR 
                c.last_name LIKE ? OR 
                c.email LIKE ? OR 
                c.phone LIKE ? OR 
                c.customer_number LIKE ? OR 
                c.company_name LIKE ? OR
                CONCAT(c.first_name, ' ', c.last_name) LIKE ?
            )`;
            const searchTerm = `%${search}%`;
            params.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
        }

        // Get total count for pagination - build a simple count query
        let countSql = 'SELECT COUNT(*) as total FROM customers c WHERE 1=1';
        const countParams = [];

        if (type && type !== 'all') {
            countSql += ' AND c.customer_type = ?';
            countParams.push(type);
        }
        if (city) {
            countSql += ' AND c.city = ?';
            countParams.push(city);
        }
        if (isActive !== undefined && isActive !== '') {
            countSql += ' AND c.is_active = ?';
            countParams.push(isActive === 'true' || isActive === '1');
        }
        if (search) {
            countSql += ` AND (c.first_name LIKE ? OR c.last_name LIKE ? OR c.email LIKE ? OR c.phone LIKE ? OR c.customer_number LIKE ? OR c.company_name LIKE ? OR CONCAT(c.first_name, ' ', c.last_name) LIKE ?)`;
            const searchTerm = `%${search}%`;
            countParams.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
        }

        const countResult = await query(countSql, countParams);

        // Order and paginate
        sql += ' ORDER BY c.created_at DESC LIMIT ? OFFSET ?';
        params.push(parseInt(limit), offset);

        const customers = await query(sql, params);

        res.json({
            success: true,
            data: customers,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: countResult[0]?.total || customers.length,
                totalPages: Math.ceil((countResult[0]?.total || customers.length) / parseInt(limit))
            }
        });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/customers/:id
 * Get single customer by ID
 */
router.get('/:id', authenticate, async (req, res, next) => {
    try {
        const customers = await query(`
            SELECT c.*,
                (SELECT COUNT(*) FROM sales_orders WHERE customer_id = c.id) as total_orders,
                (SELECT COALESCE(SUM(total_amount), 0) FROM sales_orders WHERE customer_id = c.id AND status = 'delivered') as total_spent,
                (SELECT COUNT(*) FROM bookings WHERE customer_id = c.id) as total_bookings,
                (SELECT COUNT(*) FROM quotations WHERE customer_id = c.id) as total_quotations,
                CONCAT(u.first_name, ' ', u.last_name) as created_by_name
            FROM customers c
            LEFT JOIN users u ON c.created_by = u.id
            WHERE c.id = ?
        `, [req.params.id]);

        if (customers.length === 0) {
            throw new AppError('Customer not found', 404);
        }

        res.json({ success: true, data: customers[0] });
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/customers
 * Create new customer
 */
router.post('/', authenticate, async (req, res, next) => {
    try {
        const {
            firstName, lastName, email, phone, alternatePhone,
            dateOfBirth, gender, cnicNumber, address, city, state,
            postalCode, country, customerType, companyName, companyNtn, creditLimit
        } = req.body;

        const normalizedPhone = normalizePhone(phone);
        const normalizedAlternatePhone = alternatePhone ? normalizePhone(alternatePhone) : null;

        // Validate required fields
        if (!firstName || !lastName || !normalizedPhone) {
            throw new AppError('First name, last name, and phone are required', 400);
        }

        // Check for duplicate phone
        const existingPhone = await query('SELECT id FROM customers WHERE phone = ?', [normalizedPhone]);
        if (existingPhone.length > 0) {
            throw new AppError('A customer with this phone number already exists', 400);
        }

        // Check for duplicate email if provided
        if (email) {
            const existingEmail = await query('SELECT id FROM customers WHERE email = ?', [email]);
            if (existingEmail.length > 0) {
                throw new AppError('A customer with this email already exists', 400);
            }
        }

        // Generate customer number
        const maxIdResult = await query('SELECT COALESCE(MAX(id), 0) + 1 as next_id FROM customers');
        const customerNumber = `CUST${String(maxIdResult[0].next_id).padStart(6, '0')}`;

        // Insert customer
        const result = await query(`
            INSERT INTO customers (
                customer_number, first_name, last_name, email, phone, alternate_phone,
                date_of_birth, gender, cnic_number, address, city, state, postal_code,
                country, customer_type, company_name, company_ntn, credit_limit, created_by
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            customerNumber, firstName, lastName, email || null, normalizedPhone, normalizedAlternatePhone,
            dateOfBirth || null, gender || null, cnicNumber || null, address || null,
            city || null, state || null, postalCode || null, country || 'Pakistan',
            customerType || 'individual', companyName || null, companyNtn || null,
            creditLimit || 0, req.user.id
        ]);

        res.status(201).json({
            success: true,
            message: 'Customer created successfully',
            data: {
                id: result.insertId,
                customerNumber: customerNumber
            }
        });
    } catch (error) {
        next(error);
    }
});

/**
 * PUT /api/customers/:id
 * Update customer
 */
router.put('/:id', authenticate, async (req, res, next) => {
    try {
        const { id } = req.params;
        const {
            firstName, lastName, email, phone, alternatePhone,
            dateOfBirth, gender, cnicNumber, address, city, state,
            postalCode, country, customerType, companyName, companyNtn,
            creditLimit, isActive
        } = req.body;

        // Check if customer exists
        const existing = await query('SELECT id FROM customers WHERE id = ?', [id]);
        if (existing.length === 0) {
            throw new AppError('Customer not found', 404);
        }

        const normalizedPhone = phone ? normalizePhone(phone) : undefined;
        const normalizedAlternatePhone = alternatePhone ? normalizePhone(alternatePhone) : undefined;

        // Check for duplicate phone (excluding current customer)
        if (normalizedPhone) {
            const existingPhone = await query('SELECT id FROM customers WHERE phone = ? AND id != ?', [normalizedPhone, id]);
            if (existingPhone.length > 0) {
                throw new AppError('Another customer with this phone number already exists', 400);
            }
        }

        // Check for duplicate email (excluding current customer)
        if (email) {
            const existingEmail = await query('SELECT id FROM customers WHERE email = ? AND id != ?', [email, id]);
            if (existingEmail.length > 0) {
                throw new AppError('Another customer with this email already exists', 400);
            }
        }

        // Update customer
        await query(`
            UPDATE customers SET
                first_name = COALESCE(?, first_name),
                last_name = COALESCE(?, last_name),
                email = COALESCE(?, email),
                phone = COALESCE(?, phone),
                alternate_phone = COALESCE(?, alternate_phone),
                date_of_birth = COALESCE(?, date_of_birth),
                gender = COALESCE(?, gender),
                cnic_number = COALESCE(?, cnic_number),
                address = COALESCE(?, address),
                city = COALESCE(?, city),
                state = COALESCE(?, state),
                postal_code = COALESCE(?, postal_code),
                country = COALESCE(?, country),
                customer_type = COALESCE(?, customer_type),
                company_name = COALESCE(?, company_name),
                company_ntn = COALESCE(?, company_ntn),
                credit_limit = COALESCE(?, credit_limit),
                is_active = COALESCE(?, is_active),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `, [
            firstName, lastName, email, normalizedPhone, normalizedAlternatePhone,
            dateOfBirth, gender, cnicNumber, address, city, state,
            postalCode, country, customerType, companyName, companyNtn,
            creditLimit, isActive, id
        ]);

        res.json({ success: true, message: 'Customer updated successfully' });
    } catch (error) {
        next(error);
    }
});

/**
 * DELETE /api/customers/:id
 * Delete customer (soft delete if has related records)
 */
router.delete('/:id', authenticate, async (req, res, next) => {
    try {
        const { id } = req.params;

        // Check if customer exists
        const existing = await query('SELECT id, customer_number FROM customers WHERE id = ?', [id]);
        if (existing.length === 0) {
            throw new AppError('Customer not found', 404);
        }

        // Check for related records
        const hasOrders = await query('SELECT COUNT(*) as count FROM sales_orders WHERE customer_id = ?', [id]);
        const hasInvoices = await query('SELECT COUNT(*) as count FROM invoices WHERE customer_id = ?', [id]);
        const hasBookings = await query('SELECT COUNT(*) as count FROM bookings WHERE customer_id = ?', [id]);

        if (hasOrders[0].count > 0 || hasInvoices[0].count > 0 || hasBookings[0].count > 0) {
            // Soft delete - deactivate
            await query('UPDATE customers SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [id]);
            res.json({
                success: true,
                message: 'Customer deactivated (has related records)',
                softDelete: true
            });
        } else {
            // Hard delete
            await query('DELETE FROM customers WHERE id = ?', [id]);
            res.json({
                success: true,
                message: 'Customer deleted successfully',
                softDelete: false
            });
        }
    } catch (error) {
        next(error);
    }
});

/**
 * PATCH /api/customers/:id/status
 * Toggle customer active status
 */
router.patch('/:id/status', authenticate, async (req, res, next) => {
    try {
        const { id } = req.params;

        // Toggle status
        await query(`
            UPDATE customers 
            SET is_active = NOT is_active, updated_at = CURRENT_TIMESTAMP 
            WHERE id = ?
        `, [id]);

        const updated = await query('SELECT is_active FROM customers WHERE id = ?', [id]);

        res.json({
            success: true,
            message: `Customer ${updated[0]?.is_active ? 'activated' : 'deactivated'} successfully`,
            isActive: updated[0]?.is_active
        });
    } catch (error) {
        next(error);
    }
});

module.exports = router;
