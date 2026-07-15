/**
 * Payment Methods Controller (MongoDB)
 * ============================
 * Full CRUD operations for payment methods management
 *
 * Maintained by Hussain Developer
 * hussaintmerng@gmail.com | +92 319 1634446
 * AMS ERP
 */

const mongoose = require('mongoose');
const { AppError } = require('../middleware/errorHandler');
const PaymentMethod = require('../models/PaymentMethod.model');
const Payment = require('../models/Payment.model');

const VALID_TYPES = ['cash', 'bank', 'card', 'cheque', 'online'];

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const mapMethod = (m, usageCount = 0) => ({
    id: m._id,
    name: m.name,
    code: m.code || '',
    type: m.type || '',
    description: m.description || '',
    sort_order: m.sortOrder || 0,
    is_active: !!m.isActive,
    account_id: m.accountId || null,
    usage_count: usageCount,
    created_at: m.createdAt,
});

async function findMethodOr404(id) {
    if (!mongoose.Types.ObjectId.isValid(id)) throw new AppError('Payment method not found', 404);
    const method = await PaymentMethod.findById(id);
    if (!method) throw new AppError('Payment method not found', 404);
    return method;
}

/** Seed sensible defaults on a fresh database so payment dropdowns work out of the box. */
async function ensureDefaultMethods() {
    const count = await PaymentMethod.estimatedDocumentCount();
    if (count > 0) return;
    await PaymentMethod.insertMany([
        { name: 'Cash', code: 'CASH', type: 'cash', sortOrder: 1, isActive: true },
        { name: 'Bank Transfer', code: 'BANK', type: 'bank', sortOrder: 2, isActive: true },
        { name: 'Card', code: 'CARD', type: 'card', sortOrder: 3, isActive: true },
        { name: 'Cheque', code: 'CHEQUE', type: 'cheque', sortOrder: 4, isActive: true },
        { name: 'Online Payment', code: 'ONLINE', type: 'online', sortOrder: 5, isActive: true },
    ]);
}

/**
 * Get all payment methods
 * @route GET /api/payment-methods
 */
const getAll = async (req, res, next) => {
    try {
        await ensureDefaultMethods();
        const { status, type, search } = req.query;

        const filter = {};
        if (status === 'active') filter.isActive = true;
        else if (status === 'inactive') filter.isActive = false;
        if (type) filter.type = type;
        if (search) {
            const regex = new RegExp(escapeRegex(search), 'i');
            filter.$or = [{ name: regex }, { code: regex }, { description: regex }];
        }

        const methods = await PaymentMethod.find(filter).sort({ sortOrder: 1, name: 1 }).lean();

        const usage = await Payment.aggregate([
            { $match: { methodRef: { $ne: null } } },
            { $group: { _id: '$methodRef', count: { $sum: 1 } } },
        ]);
        const usageMap = Object.fromEntries(usage.map((u) => [String(u._id), u.count]));

        res.json({
            success: true,
            data: methods.map((m) => mapMethod(m, usageMap[String(m._id)] || 0)),
            count: methods.length,
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Get payment method by ID
 * @route GET /api/payment-methods/:id
 */
const getById = async (req, res, next) => {
    try {
        const method = await findMethodOr404(req.params.id);
        const usageCount = await Payment.countDocuments({ methodRef: method._id });
        res.json({ success: true, data: mapMethod(method, usageCount) });
    } catch (error) {
        next(error);
    }
};

/**
 * Create payment method
 * @route POST /api/payment-methods
 */
const create = async (req, res, next) => {
    try {
        const { name, code, type, description, sortOrder, account_id } = req.body;

        if (!name || !type) throw new AppError('Name and type are required', 400);
        if (!VALID_TYPES.includes(type)) {
            throw new AppError(`Invalid type. Must be one of: ${VALID_TYPES.join(', ')}`, 400);
        }

        const existing = await PaymentMethod.findOne({ name: new RegExp(`^${escapeRegex(name)}$`, 'i') });
        if (existing) throw new AppError('Payment method with this name already exists', 400);

        const method = await PaymentMethod.create({
            name,
            code: code || '',
            type,
            description: description || '',
            sortOrder: Number(sortOrder) || 0,
            accountId: mongoose.Types.ObjectId.isValid(account_id) ? account_id : null,
            isActive: true,
            createdBy: req.user?.id || null,
        });

        res.status(201).json({
            success: true,
            message: 'Payment method created successfully',
            data: mapMethod(method),
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
        const { name, code, type, description, sortOrder, account_id } = req.body;
        const method = await findMethodOr404(req.params.id);

        if (type && !VALID_TYPES.includes(type)) {
            throw new AppError(`Invalid type. Must be one of: ${VALID_TYPES.join(', ')}`, 400);
        }
        if (name && name !== method.name) {
            const existing = await PaymentMethod.findOne({
                name: new RegExp(`^${escapeRegex(name)}$`, 'i'),
                _id: { $ne: method._id },
            });
            if (existing) throw new AppError('Payment method with this name already exists', 400);
        }

        if (name !== undefined && name !== null) method.name = name;
        if (code !== undefined && code !== null) method.code = code;
        if (type) method.type = type;
        if (description !== undefined && description !== null) method.description = description;
        if (sortOrder !== undefined && sortOrder !== null) method.sortOrder = Number(sortOrder) || 0;
        if (account_id !== undefined) {
            method.accountId = mongoose.Types.ObjectId.isValid(account_id) ? account_id : null;
        }
        method.updatedBy = req.user?.id || null;
        await method.save();

        res.json({
            success: true,
            message: 'Payment method updated successfully',
            data: mapMethod(method),
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
        const method = await findMethodOr404(req.params.id);
        method.isActive = !method.isActive;
        method.updatedBy = req.user?.id || null;
        await method.save();

        res.json({
            success: true,
            message: `Payment method ${method.isActive ? 'activated' : 'deactivated'} successfully`,
            data: mapMethod(method),
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
        const method = await findMethodOr404(req.params.id);

        const usageCount = await Payment.countDocuments({ methodRef: method._id });
        if (usageCount > 0) {
            throw new AppError(`Cannot delete: This payment method is used in ${usageCount} payment(s). Consider deactivating instead.`, 400);
        }

        await method.deleteOne();

        res.json({ success: true, message: 'Payment method deleted successfully' });
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
            { value: 'online', label: 'Online Payment' },
        ];

        res.json({ success: true, data: types });
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
    getTypes,
};
