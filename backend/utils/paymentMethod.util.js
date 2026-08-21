/**
 * One place to turn a payment-method id from a screen into the snapshot a
 * document stores.
 *
 * Sales documents keep both halves: `paymentMethod` (the reference, so reports
 * can group by method even after it is renamed) and `paymentMode` (the name as
 * it stood when the sale happened, which is what gets printed on the receipt).
 */
const mongoose = require('mongoose');
const { AppError } = require('../middleware/errorHandler');
const PaymentMethod = require('../models/PaymentMethod.model');

/**
 * @param {string|null|undefined} id  payment method id sent by the client
 * @param {{ required?: boolean }} options
 * `accountId` comes along so services/receipts.service.js can put the money in
 * the account this method settles into — "Card" into the card machine, "Cash"
 * into petty cash — without every caller having to look it up.
 *
 * @returns {Promise<{ id: mongoose.Types.ObjectId|null, name: string, code: string, type: string, accountId: mongoose.Types.ObjectId|null }>}
 */
async function resolvePaymentMethod(id, { required = false } = {}) {
    const empty = { id: null, name: '', code: '', type: '', accountId: null };
    if (id === undefined || id === null || id === '') {
        if (required) throw new AppError('Select the payment method used for this sale', 400);
        return empty;
    }
    if (!mongoose.Types.ObjectId.isValid(id)) throw new AppError('Invalid payment method', 400);

    const method = await PaymentMethod.findById(id).lean();
    if (!method) throw new AppError('Payment method not found', 404);
    if (method.isActive === false) throw new AppError(`Payment method "${method.name}" is no longer active`, 400);

    return { id: method._id, name: method.name || '', code: method.code || '', type: method.type || '', accountId: method.accountId || null };
}

module.exports = { resolvePaymentMethod };
