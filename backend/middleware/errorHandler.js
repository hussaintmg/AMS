/**
 * Global Error Handler Middleware
 * Maintained by Hussain Developer
 * hussaintmerng@gmail.com | +92 319 1634446
 * AMS ERP
 */

const logger = require('../utils/logger');

class AppError extends Error {
    constructor(message, statusCode, resolution = null, code = null) {
        super(message);
        this.statusCode = statusCode;
        this.resolution = resolution;
        this.code = code;
        this.isOperational = true;
        Error.captureStackTrace(this, this.constructor);
    }
}

/**
 * Translate driver/ODM errors into the HTTP status the client should see.
 * Anything not recognised here keeps its own statusCode, or falls back to 500.
 */
const normalizeError = (err) => {
    // Mongoose schema validation (required, min/max, enum, match, ...)
    if (err.name === 'ValidationError' && err.errors) {
        const fields = Object.values(err.errors).map((e) => e.message);
        return {
            statusCode: 400,
            message: fields.join('; ') || 'Validation failed',
            code: 'VALIDATION_ERROR',
            resolution: 'Correct the highlighted fields and try again.',
            isOperational: true,
        };
    }

    // Bad ObjectId / uncastable value
    if (err.name === 'CastError') {
        return {
            statusCode: 400,
            message: `Invalid value for "${err.path}"`,
            code: 'CAST_ERROR',
            resolution: 'Provide a valid identifier.',
            isOperational: true,
        };
    }

    // Duplicate key on a unique index
    if (err.code === 11000 || err.code === 11001) {
        const field = Object.keys(err.keyPattern || err.keyValue || {})[0];
        return {
            statusCode: 409,
            message: field
                ? `A record with this ${field} already exists`
                : 'This record already exists',
            code: 'DUPLICATE_KEY',
            resolution: 'Use a different value for the duplicated field.',
            isOperational: true,
        };
    }

    // JWT errors
    if (err.name === 'JsonWebTokenError') {
        return { statusCode: 401, message: 'Invalid token', code: 'INVALID_TOKEN', isOperational: true };
    }
    if (err.name === 'TokenExpiredError') {
        return { statusCode: 401, message: 'Token expired', code: 'TOKEN_EXPIRED', isOperational: true };
    }

    // Body parser / malformed JSON
    if (err.type === 'entity.parse.failed') {
        return { statusCode: 400, message: 'Malformed JSON body', code: 'BAD_JSON', isOperational: true };
    }
    if (err.type === 'entity.too.large') {
        return { statusCode: 413, message: 'Payload too large', code: 'PAYLOAD_TOO_LARGE', isOperational: true };
    }

    return {
        statusCode: err.statusCode || 500,
        message: err.message,
        code: err.code,
        resolution: err.resolution,
        isOperational: err.isOperational === true,
    };
};

const errorHandler = (err, req, res, next) => {
    const normalized = normalizeError(err);
    err.statusCode = normalized.statusCode;
    res.locals.apiError = err;

    const logAt = normalized.statusCode >= 500 ? 'error' : 'warn';
    logger[logAt]('Error:', {
        message: normalized.message,
        statusCode: normalized.statusCode,
        resolution: normalized.resolution,
        path: req.path,
        method: req.method,
        stack: err.stack
    });

    const isDev = process.env.NODE_ENV === 'development';

    const response = {
        success: false,
        message: normalized.message,
        resolution: normalized.resolution,
        code: normalized.code
    };

    // Never leak internals for unexpected failures outside development.
    if (!isDev && !normalized.isOperational) {
        response.message = 'Something went wrong';
        delete response.resolution;
    }

    // Stack traces are a development-only affordance.
    if (isDev) {
        response.stack = err.stack;
    }

    return res.status(normalized.statusCode).json(response);
};

module.exports = errorHandler;
module.exports.AppError = AppError;
module.exports.normalizeError = normalizeError;
