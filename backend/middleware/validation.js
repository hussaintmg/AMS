/**
 * Validation Middleware
 * Uses express-validator to validate request inputs
 * Created by LOGIXINVENTOR (PVT) Ltd.
 * www.logixinventor.com | AMS
 * Date: 2026-05-08
 */

const { validationResult, checkSchema } = require('express-validator');
const { AppError } = require('./errorHandler');

const validateRequest = (schema) => {
    const checks = checkSchema(schema || {});

    return async (req, res, next) => {
        await Promise.all(checks.map((check) => check.run(req)));

        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const message = errors.array().map((err) => err.msg).join(', ');
            return next(new AppError(message, 400));
        }

        next();
    };
};

module.exports = {
    validateRequest
};
