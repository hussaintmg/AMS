/**
 * Global Error Handler Middleware
 * Created by LOGIXINVENTOR (PVT) Ltd.
 * info@logixinventor.com +92 333 3836851
 * www.logixinventor.com | AMS
 */

const logger = require('../utils/logger');

class AppError extends Error {
    constructor(message, statusCode, resolution = null) {
        super(message);
        this.statusCode = statusCode;
        this.resolution = resolution;
        this.isOperational = true;
        Error.captureStackTrace(this, this.constructor);
    }
}

const SCHEMA_ERROR_CODES = new Set([
    'ER_BAD_FIELD_ERROR',
    'ER_NO_SUCH_TABLE',
    'ER_SP_DOES_NOT_EXIST',
    'ER_PARSE_ERROR',
    'ER_TRUNCATED_WRONG_VALUE',
    'ER_WRONG_FIELD_WITH_GROUP',
    'ER_NO_DEFAULT_FOR_FIELD'
]);

const SCHEMA_ERROR_PATTERNS = [
    /unknown column/i,
    /unknown table/i,
    /doesn't exist/i,
    /does not exist/i,
    /procedure .* does not exist/i,
    /function .* does not exist/i,
    /view .* doesn't exist/i,
    /sql syntax/i,
    /schema/i,
    /database_error/i
];

const isSchemaCompatibilityError = (err) => {
    const message = `${err.message || ''} ${err.code || ''} ${err.resolution || ''}`;
    return SCHEMA_ERROR_CODES.has(err.code) || SCHEMA_ERROR_PATTERNS.some((pattern) => pattern.test(message));
};

const buildSafeFallback = (req, err) => {
    const path = req.path || '';
    const isStats = /stats|kpis|analytics|summary|overview|chart|distribution|alerts/i.test(path);

    return {
        success: true,
        message: 'Schema compatibility fallback returned safe response',
        data: isStats ? {} : [],
        fallback: {
            reason: 'SCHEMA_COMPATIBILITY',
            originalMessage: err.message
        }
    };
};

const errorHandler = (err, req, res, next) => {
    err.statusCode = err.statusCode || 500;
    res.locals.apiError = err;

    if (err.statusCode >= 500 && isSchemaCompatibilityError(err)) {
        logger.warn('Schema compatibility fallback:', {
            message: err.message,
            code: err.code,
            resolution: err.resolution,
            path: req.path,
            method: req.method
        });

        return res.status(200).json(buildSafeFallback(req, err));
    }

    logger.error('Error:', {
        message: err.message,
        statusCode: err.statusCode,
        resolution: err.resolution,
        path: req.path,
        method: req.method,
        stack: err.stack
    });

    const response = {
        success: false,
        message: err.message,
        resolution: err.resolution
    };

    // Development mode - send full error
    if (process.env.NODE_ENV === 'development') {
        response.error = err;
        response.stack = err.stack;
    }

    // Production mode - send minimal error info (but include resolution if operational)
    if (process.env.NODE_ENV !== 'development' && !err.isOperational) {
        response.message = 'Something went wrong';
        delete response.resolution;
    }

    return res.status(err.statusCode).json(response);
};

module.exports = errorHandler;
module.exports.AppError = AppError;
