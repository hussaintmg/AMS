const fs = require('fs');
const path = require('path');
const Log = require('../models/mongo/Log.model');
const { emitLogEvent } = require('../services/socketService');

const LOG_ROOT = path.join(__dirname, '..', 'logs');
const MAX_STRING_LENGTH = Number(process.env.API_LOG_MAX_STRING_LENGTH || 4000);
const MAX_JSON_LENGTH = Number(process.env.API_LOG_MAX_JSON_LENGTH || 50000);

const SENSITIVE_KEY_PATTERNS = [
  /password/i,
  /confirmPassword/i,
  /token/i,
  /refreshToken/i,
  /authorization/i,
  /cookie/i,
  /secret/i,
  /apiKey/i,
  /code/i,
  /otp/i,
];

const isSensitiveKey = (key = '') => SENSITIVE_KEY_PATTERNS.some((p) => p.test(String(key)));

const truncateString = (value, max = MAX_STRING_LENGTH) => {
  if (typeof value !== 'string') return value;
  if (value.length <= max) return value;
  return `${value.slice(0, max)}...[truncated ${value.length - max} chars]`;
};

const sanitizeName = (value, fallback = 'unknown') => {
  const s = String(value || fallback).trim()
    .replace(/\s+/g, '-')
    .replace(/[\\/]+/g, '-')
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
  return s || fallback;
};

const sanitizePathForFile = (value) =>
  sanitizeName(String(value || 'root').replace(/^\/+/, '').replace(/[/?#&=:]+/g, '-'), 'root');

const getDateParts = (date = new Date()) => {
  const pad = (n, s = 2) => String(n).padStart(s, '0');
  return {
    date: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    time: `${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}-${pad(date.getMilliseconds(), 3)}`,
  };
};

const maskSensitive = (input, seen = new WeakSet()) => {
  if (input === null || input === undefined) return input;
  if (typeof input === 'string') return truncateString(input);
  if (typeof input !== 'object') return input;
  if (Buffer.isBuffer(input)) return `[buffer ${input.length} bytes]`;
  if (seen.has(input)) return '[circular]';
  seen.add(input);
  if (Array.isArray(input)) return input.slice(0, 100).map((item) => maskSensitive(item, seen));
  return Object.entries(input).reduce((acc, [key, value]) => {
    acc[key] = isSensitiveKey(key) ? '[masked]' : maskSensitive(value, seen);
    return acc;
  }, {});
};

const limitPayload = (payload) => {
  const json = JSON.stringify(payload);
  if (json.length <= MAX_JSON_LENGTH) return payload;
  return { truncated: true, originalLength: json.length, preview: truncateString(json, MAX_JSON_LENGTH) };
};

const getUserForLog = (req = {}) => {
  const user = req.user || {};
  return {
    id: user.id || user._id?.toString?.() || user.uuid || null,
    email: user.email || null,
    firstName: user.firstName || null,
    lastName: user.lastName || null,
    role: user.role_name || user.role?.name || user.role?.displayName || user.role || null,
  };
};

const getUserDirectoryName = (user) => {
  const displayName = [user.firstName, user.lastName].filter(Boolean).join('-');
  return sanitizeName(displayName || user.email || user.id, 'anonymous');
};

const buildLogPath = (req = {}, date = new Date()) => {
  const user = getUserForLog(req);
  const { date: day, time } = getDateParts(date);
  const method = sanitizeName(req.method || 'SYSTEM');
  const routePath = sanitizePathForFile(req.originalUrl || req.path || 'system');
  const fileName = `${method}-${routePath}-${time}.log`;
  const baseDir = user.id || user.email
    ? path.join(LOG_ROOT, getUserDirectoryName(user), day)
    : path.join(LOG_ROOT, 'Server', day);
  return path.join(baseDir, fileName);
};

const inferModule = (req) => {
  const p = req.originalUrl || req.path || '';
  const parts = p.split('/').filter(Boolean);
  if (parts.length >= 2 && parts[0] === 'api') return parts[1] || 'unknown';
  return parts[0] || 'unknown';
};

const computeSeverity = (statusCode, error) => {
  if (error || statusCode >= 500) return 'error';
  if (statusCode >= 400) return 'warning';
  return 'info';
};

const logApiEvent = async (payload) => {
  try {
    const { req, res, responseBody, error, startedAt } = payload;
    const now = new Date();
    const durationMs = startedAt ? now.getTime() - startedAt.getTime() : 0;
    const statusCode = res?.statusCode || error?.statusCode || 500;
    const endpoint = req.originalUrl || req.path || '';
    const method = req.method || 'GET';
    const userObj = getUserForLog(req);
    const severity = computeSeverity(statusCode, error);
    const logPath = buildLogPath(req, now);
    const serverError = Boolean(error || statusCode >= 500 || !userObj.id);

    await fs.promises.mkdir(path.dirname(logPath), { recursive: true });

    const logEntry = {
      requestId: req.requestId || '',
      timestamp: now.toISOString(),
      user: userObj,
      request: { method, path: req.path, query: maskSensitive(req.query || {}), params: maskSensitive(req.params || {}), body: limitPayload(maskSensitive(req.body || {})), headers: maskSensitive(req.headers || {}), ip: req.ip || req.socket?.remoteAddress || null, userAgent: req.get?.('User-Agent') || req.headers?.['user-agent'] || null },
      response: { statusCode, success: statusCode < 400, body: limitPayload(maskSensitive(responseBody)), durationMs },
      error: error ? { name: error.name || 'Error', message: error.message || String(error), stack: truncateString(error.stack || ''), code: error.code || null } : null,
    };

    await fs.promises.writeFile(logPath, JSON.stringify(logEntry, null, 2) + '\n', 'utf8');

    const newLog = await Log.create({
      requestId: req.requestId || '',
      endpoint,
      method,
      module: inferModule(req),
      user: userObj,
      ip: req.ip || req.socket?.remoteAddress || '',
      ipAddress: req.ip || req.socket?.remoteAddress || '',
      userAgent: req.get?.('User-Agent') || req.headers?.['user-agent'] || '',
      query: req.query || {},
      params: req.params || {},
      requestBody: req.body || null,
      responseBody: responseBody || null,
      files: req.files ? req.files.map((f) => ({ fieldname: f.fieldname, originalname: f.originalname, size: f.size, mimetype: f.mimetype })) : [],
      statusCode,
      success: statusCode < 400,
      executionTime: durationMs,
      durationMs,
      severity,
      error: error ? { name: error.name || 'Error', message: error.message || String(error), stack: error.stack || '', code: error.code || null } : null,
      logFilePath: logPath,
      physicalLogPath: logPath,
      serverError,
    });

    try {
      emitLogEvent('logs:new', {
        log: newLog.toObject(),
        type: serverError ? 'server-error' : 'api',
      });
      console.log('[apiLogger] logs:new emitted for', newLog._id);
    } catch (err) {
      console.warn('[apiLogger] emitLogEvent failed:', err.message);
    }
  } catch (err) {
    console.error('Log write failed (non-fatal):', err.message);
  }
};

const logApiError = (req, error, responseBody = null) => {
  logApiEvent({ req, res: { statusCode: error.statusCode || 500 }, error, responseBody });
};

const logFileOperation = (req, details) => {
  logApiEvent({ req, res: { statusCode: 200 }, fileOperation: details });
};

module.exports = {
  logApiEvent,
  logApiError,
  logFileOperation,
  maskSensitive,
  sanitizeName,
};
