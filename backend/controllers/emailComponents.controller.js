const { EmailComponent, EmailVariable } = require('../models');
const AppError = require('../utils/AppError');

const getUserId = (req) => req.user?.id || req.user?._id;
const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const makeKey = (value) => String(value || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
const normalizeParameters = (parameters = []) => {
  if (!Array.isArray(parameters)) return [];
  return parameters.map((param, index) => {
    const key = makeKey(param.key || param.name || `param_${index + 1}`) || `param_${index + 1}`;
    const name = String(param.name || param.label || key || `Parameter ${index + 1}`).trim();
    return {
      ...param,
      key,
      name,
      label: param.label || name,
      options: Array.isArray(param.options) ? param.options : [],
      required: param.required === true,
      order: param.order ?? index,
    };
  });
};

exports.list = async (req, res, next) => {
  try {
    const { page = 1, limit = 50, category, search } = req.query;
    const filter = { isDeleted: false };
    if (category) filter.category = category;
    if (search) filter.name = { $regex: search, $options: 'i' };

    const components = await EmailComponent.find(filter)
      .populate('createdBy', 'firstName lastName email')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    const total = await EmailComponent.countDocuments(filter);

    res.json({ success: true, data: { components, total, page: Number(page), limit: Number(limit) } });
  } catch (error) {
    next(error);
  }
};

exports.getById = async (req, res, next) => {
  try {
    const component = await EmailComponent.findOne({ _id: req.params.id, isDeleted: false })
      .populate('createdBy', 'firstName lastName email')
      .populate('updatedBy', 'firstName lastName email');
    if (!component) throw new AppError('Component not found', 404);
    res.json({ success: true, data: { component } });
  } catch (error) {
    next(error);
  }
};

exports.create = async (req, res, next) => {
  try {
    const { name, key, category, description, html, css, parameters, variablesUsed, isActive } = req.body;
    const cleanName = String(name || '').trim();
    const cleanKey = makeKey(key || cleanName);
    if (!cleanName || !cleanKey) throw new AppError('Name and key are required', 400);

    const existing = await EmailComponent.findOne({ key: cleanKey, isDeleted: false });
    if (existing) throw new AppError('A component with this key already exists', 400);

    const component = await EmailComponent.create({
      name: cleanName, key: cleanKey, category: category || 'custom',
      description: description || '', html: html || '', css: css || '',
      parameters: normalizeParameters(parameters), variablesUsed: variablesUsed || [],
      isActive: isActive !== false,
      createdBy: getUserId(req), updatedBy: getUserId(req),
    });

    res.status(201).json({ success: true, message: 'Component created', data: { component } });
  } catch (error) {
    next(error);
  }
};

exports.update = async (req, res, next) => {
  try {
    const component = await EmailComponent.findOne({ _id: req.params.id, isDeleted: false });
    if (!component) throw new AppError('Component not found', 404);

    const fields = ['category', 'description', 'html', 'css', 'variablesUsed', 'isActive'];
    fields.forEach(f => {
      if (req.body[f] !== undefined) component[f] = req.body[f];
    });

    if (req.body.name !== undefined) {
      const cleanName = String(req.body.name || '').trim();
      if (!cleanName) throw new AppError('Name is required', 400);
      component.name = cleanName;
    }

    if (req.body.parameters !== undefined) {
      component.parameters = normalizeParameters(req.body.parameters);
    }

    if (req.body.key !== undefined) {
      const cleanKey = makeKey(req.body.key);
      if (!cleanKey) throw new AppError('Key is required', 400);
      const existing = await EmailComponent.findOne({ key: cleanKey, isDeleted: false, _id: { $ne: req.params.id } });
      if (existing) throw new AppError('A component with this key already exists', 400);
      component.key = cleanKey;
    }

    component.updatedBy = getUserId(req);
    await component.save();

    res.json({ success: true, message: 'Component updated', data: { component } });
  } catch (error) {
    next(error);
  }
};

exports.remove = async (req, res, next) => {
  try {
    const component = await EmailComponent.findOne({ _id: req.params.id, isDeleted: false });
    if (!component) throw new AppError('Component not found', 404);
    component.isDeleted = true;
    component.isActive = false;
    component.updatedBy = getUserId(req);
    await component.save();
    res.json({ success: true, message: 'Component deleted' });
  } catch (error) {
    next(error);
  }
};

exports.duplicate = async (req, res, next) => {
  try {
    const source = await EmailComponent.findOne({ _id: req.params.id, isDeleted: false });
    if (!source) throw new AppError('Component not found', 404);

    const newKey = `${source.key}-copy-${Date.now()}`;
    const newName = `${source.name} (Copy)`;

    const component = await EmailComponent.create({
      name: newName, key: newKey, category: source.category,
      description: source.description, html: source.html, css: source.css,
      parameters: normalizeParameters(source.parameters || []),
      variablesUsed: source.variablesUsed || [], isActive: true,
      createdBy: getUserId(req), updatedBy: getUserId(req),
    });

    res.status(201).json({ success: true, message: 'Component duplicated', data: { component } });
  } catch (error) {
    next(error);
  }
};

exports.preview = async (req, res, next) => {
  try {
    const component = await EmailComponent.findOne({ _id: req.params.id, isDeleted: false }).lean();
    if (!component) throw new AppError('Component not found', 404);

    const { parameterValues = {}, variableValues = {}, parameters: draftParameters, html: draftHtml, css: draftCss } = req.body;
    let html = draftHtml !== undefined ? draftHtml : (component.html || '');
    const css = draftCss !== undefined ? draftCss : (component.css || '');
    const parameters = normalizeParameters(Array.isArray(draftParameters) ? draftParameters : component.parameters);

    if (parameters) {
      parameters.forEach(p => {
        const val = parameterValues[p.key] !== undefined ? parameterValues[p.key] : p.defaultValue || '';
        html = html
          .replace(new RegExp(`\\{\\{param\\.${escapeRegex(p.key)}\\}\\}`, 'g'), val)
          .replace(new RegExp(`\\{\\{param:${escapeRegex(p.key)}\\}\\}`, 'g'), val);
      });
    }

    Object.entries(variableValues).forEach(([key, val]) => {
      html = html.replace(new RegExp(`\\{\\{${escapeRegex(key)}\\}\\}`, 'g'), val || '');
    });

    const adminVars = await EmailVariable.find({ isDeleted: false, isActive: true }).lean();
    const defaults = adminVars.reduce((acc, variable) => {
      acc[variable.reference] = variable.defaultValue || variable.reference;
      return acc;
    }, {});
    html = html.replace(/\{\{([^}]+)\}\}/g, (match, key) => {
      const trimmed = key.trim();
      if (trimmed.startsWith('component:') || trimmed.startsWith('param.') || trimmed.startsWith('param:')) return match;
      return defaults[trimmed] || trimmed;
    });

    const renderer = require('../services/emailRenderer.service');
    html = await renderer.resolveGlobalComponents(html);

    const fullHtml = `<!DOCTYPE html>\n<html>\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1.0">\n<style type="text/css">\n${css}\n</style>\n</head>\n<body>\n${html}\n</body>\n</html>`;

    res.json({ success: true, data: { html: fullHtml } });
  } catch (error) {
    next(error);
  }
};
