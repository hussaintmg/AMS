/**
 * Payment Methods Controller
 * ============================
 * Full CRUD operations for payment methods management
 * 
 * Created by LOGIXINVENTOR (PVT) Ltd.
 * info@logixinventor.com +92 333 3836851
 * www.logixinventor.com | AMS
 */

const { query } = require('../config/database');
const { AppError } = require('../middleware/errorHandler');

/**
 * Get all payment methods
 * @route GET /api/payment-methods
 */
const getAll = async (req, res, next) => {
    try {
        const { status, type } = req.query;

        let sql = `
            SELECT 
                id, name, type, is_active, account_id,
                created_at,
                (SELECT COUNT(*) FROM payments WHERE payment_method_id = payment_methods.id) as usage_count
            FROM payment_methods
            WHERE 1=1
        `;
        const params = [];

        if (status === 'active') {
            sql += ` AND is_active = TRUE`;
        } else if (status === 'inactive') {
            sql += ` AND is_active = FALSE`;
        }

        if (type) {
            sql += ` AND type = ?`;
            params.push(type);
        }

        sql += ` ORDER BY name ASC`;

        const methods = await query(sql, params);

        res.json({
            success: true,
            data: methods,
            count: methods.length
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Get single payment method by ID
 * @route GET /api/payment-methods/:id
 */
const getById = async (req, res, next) => {
    try {
        const { id } = req.params;

        const [method] = await query(`
            SELECT 
                id, name, type, is_active, account_id, created_at,
                (SELECT COUNT(*) FROM payments WHERE payment_method_id = payment_methods.id) as usage_count
            FROM payment_methods
            WHERE id = ?
        `, [id]);

        if (!method) {
            throw new AppError('Payment method not found', 404);
        }

        res.json({
            success: true,
            data: method
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Create new payment method
 * @route POST /api/payment-methods
 */
const create = async (req, res, next) => {
    try {
        const { name, type, account_id } = req.body;

        // Validate required fields
        if (!name || !type) {
            throw new AppError('Name and type are required', 400);
        }

        // Validate type
        const validTypes = ['cash', 'bank', 'card', 'cheque', 'online'];
        if (!validTypes.includes(type)) {
            throw new AppError(`Invalid type. Must be one of: ${validTypes.join(', ')}`, 400);
        }

        // Check for duplicate name
        const [existing] = await query(`SELECT id FROM payment_methods WHERE name = ?`, [name]);
        if (existing) {
            throw new AppError('Payment method with this name already exists', 400);
        }

        const result = await query(`
            INSERT INTO payment_methods (name, type, account_id, is_active)
            VALUES (?, ?, ?, TRUE)
        `, [name, type, account_id || null]);

        const [newMethod] = await query(`SELECT * FROM payment_methods WHERE id = ?`, [result.insertId]);

        res.status(201).json({
            success: true,
            message: 'Payment method created successfully',
            data: newMethod
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Update payment method
 * @route PUT /api/payment-methods/:id
 */
const update = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { name, type, account_id } = req.body;

        // Check method exists
        const [method] = await query(`SELECT * FROM payment_methods WHERE id = ?`, [id]);
        if (!method) {
            throw new AppError('Payment method not found', 404);
        }

        // Validate type if provided
        if (type) {
            const validTypes = ['cash', 'bank', 'card', 'cheque', 'online'];
            if (!validTypes.includes(type)) {
                throw new AppError(`Invalid type. Must be one of: ${validTypes.join(', ')}`, 400);
            }
        }

        // Check for duplicate name (excluding current)
        if (name && name !== method.name) {
            const [existing] = await query(`SELECT id FROM payment_methods WHERE name = ? AND id != ?`, [name, id]);
            if (existing) {
                throw new AppError('Payment method with this name already exists', 400);
            }
        }

        await query(`
            UPDATE payment_methods
            SET name = COALESCE(?, name),
                type = COALESCE(?, type),
                account_id = ?
            WHERE id = ?
        `, [name, type, account_id ?? method.account_id, id]);

        const [updated] = await query(`SELECT * FROM payment_methods WHERE id = ?`, [id]);

        res.json({
            success: true,
            message: 'Payment method updated successfully',
            data: updated
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Toggle payment method status
 * @route PATCH /api/payment-methods/:id/toggle
 */
const toggleStatus = async (req, res, next) => {
    try {
        const { id } = req.params;

        const [method] = await query(`SELECT * FROM payment_methods WHERE id = ?`, [id]);
        if (!method) {
            throw new AppError('Payment method not found', 404);
        }

        const newStatus = !method.is_active;

        await query(`UPDATE payment_methods SET is_active = ? WHERE id = ?`, [newStatus, id]);

        const [updated] = await query(`SELECT * FROM payment_methods WHERE id = ?`, [id]);

        res.json({
            success: true,
            message: `Payment method ${newStatus ? 'activated' : 'deactivated'} successfully`,
            data: updated
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Delete payment method
 * @route DELETE /api/payment-methods/:id
 */
const remove = async (req, res, next) => {
    try {
        const { id } = req.params;

        const [method] = await query(`SELECT * FROM payment_methods WHERE id = ?`, [id]);
        if (!method) {
            throw new AppError('Payment method not found', 404);
        }

        // Check if method is being used
        const [usage] = await query(`SELECT COUNT(*) as count FROM payments WHERE payment_method_id = ?`, [id]);
        if (usage.count > 0) {
            throw new AppError(`Cannot delete: This payment method is used in ${usage.count} payment(s). Consider deactivating instead.`, 400);
        }

        await query(`DELETE FROM payment_methods WHERE id = ?`, [id]);

        res.json({
            success: true,
            message: 'Payment method deleted successfully'
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Get payment method types (for dropdowns)
 * @route GET /api/payment-methods/types
 */
const getTypes = async (req, res, next) => {
    try {
        const types = [
            { value: 'cash', label: 'Cash' },
            { value: 'bank', label: 'Bank Transfer' },
            { value: 'card', label: 'Card (Credit/Debit)' },
            { value: 'cheque', label: 'Cheque' },
            { value: 'online', label: 'Online Payment' }
        ];

        res.json({
            success: true,
            data: types
        });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getAll,
    getById,
    create,
    update,
    toggleStatus,
    remove,
    getTypes
};
