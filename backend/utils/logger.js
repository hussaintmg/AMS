/**
 * Winston Logger Configuration
 * Created by LOGIXINVENTOR (PVT) Ltd.
 * info@logixinventor.com +92 333 3836851
 * www.logixinventor.com | AMS
 */

const winston = require('winston');
// Custom format
const customFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.printf(({ level, message, timestamp, stack, ...meta }) => {
        let log = `${timestamp} [${level.toUpperCase()}]: ${message}`;
        if (Object.keys(meta).length) log += ` ${JSON.stringify(meta)}`;
        if (stack) log += `\n${stack}`;
        return log;
    })
);

// Keep the legacy logger import-compatible without writing unstructured files.
// Structured API logs are handled by utils/apiLogger.js.
const transports = [
    new winston.transports.Console({
        format: winston.format.combine(
            winston.format.colorize(),
            customFormat
        )
    })
];

const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: customFormat,
    transports: transports,
    // Don't exit on error
    exitOnError: false
});

// Handle uncaught exceptions in logging gracefully
logger.on('error', (err) => {
    console.error('Logger error:', err.message);
});

module.exports = logger;
