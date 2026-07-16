const { publish, MODULES } = require('../services/notification.service');

const routeModule = req => Object.keys(MODULES).find(key =>
  req.originalUrl?.split('?')[0].startsWith(`/api/${key}`)
);

module.exports = (req, res, next) => {
  if (req.method !== 'POST' || /\/bulk(?:\/|$)/.test(req.path)) return next();

  let body = null;
  const json = res.json.bind(res);
  res.json = value => { body = value; return json(value); };

  res.on('finish', () => {
    const module = routeModule(req);
    if (module && res.statusCode < 300 && req.user) {
      const data = body?.data || {};
      const entity = Object.values(data).find(v => v && typeof v === 'object' && !Array.isArray(v)) || data;
      const id = entity?._id || entity?.id;
      const actorName = [req.user.firstName, req.user.lastName].filter(Boolean).join(' ') || req.user.email || 'A user';
      publish({
        module,
        actor: req.user.id || req.user._id,
        entityId: id,
        title: `New ${MODULES[module].label} record`,
        message: `${actorName} created a new ${MODULES[module].label.toLowerCase()} record.`,
        metadata: { requestPath: req.originalUrl },
      }).catch(() => {});
    }
  });

  next();
};
