const { v4: uuidv4 } = require('uuid');
const { logApiEvent } = require('../utils/apiLogger');

const SKIP_PATH_PATTERNS = [
  /^\/uploads\//,
  /^\/api\/uploads\//,
  /^\/favicon\.ico$/,
  /^\/api-documentation\/(?!swagger\.json$).+/
];

const shouldSkip = (req) => {
  if (SKIP_PATH_PATTERNS.some((p) => p.test(req.originalUrl || req.path || ''))) return true;
  return /\.(css|js|map|png|jpg|jpeg|gif|svg|ico|woff2?|ttf)$/i.test(req.path || '');
};

const apiLogging = (req, res, next) => {
  req.requestId = req.requestId || uuidv4();
  res.setHeader('X-Request-Id', req.requestId);

  if (shouldSkip(req)) return next();

  const startedAt = new Date();
  let responseBody = null;
  const originalJson = res.json.bind(res);

  res.json = (body) => {
    responseBody = body;
    return originalJson(body);
  };

  res.on('finish', () => {
    logApiEvent({
      req,
      res,
      responseBody,
      error: res.locals.apiError || null,
      startedAt,
    }).catch(() => {});
  });

  return next();
};

module.exports = apiLogging;
