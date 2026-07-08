const { EmailUsage } = require('../models');
const AppError = require('../utils/AppError');
const variableRegistry = require('../services/variableRegistry');

const getUserId = (req) => req.user?.id || req.user?._id;

const DEFAULT_USAGES = [
  {
    key: 'forgot_password',
    name: 'Forgot Password',
    description: 'Password reset verification email. Falls back to the built-in default template when no active template is assigned.',
  },
];

async function ensureDefaultUsages(userId) {
  for (const usage of DEFAULT_USAGES) {
    const existing = await EmailUsage.findOne({ key: usage.key });
    if (!existing) {
      await EmailUsage.create({
        ...usage,
        template: null,
        variableMappings: [],
        isActive: true,
        createdBy: userId,
        updatedBy: userId,
      });
    } else if (existing.isDeleted) {
      existing.isDeleted = false;
      existing.isActive = true;
      existing.name = existing.name || usage.name;
      existing.description = existing.description || usage.description;
      existing.updatedBy = userId;
      await existing.save();
    }
  }
}

exports.list = async (req, res, next) => {
  try {
    await ensureDefaultUsages(getUserId(req));

    const { page = 1, limit = 50, search, group } = req.query;
    const filter = { isDeleted: false };
    if (search) filter.name = { $regex: search, $options: 'i' };
    if (group) filter.key = { $regex: `^${group}`, $options: 'i' };

    const usages = await EmailUsage.find(filter)
      .populate('template', 'templateName subject version isActive')
      .populate('createdBy', 'firstName lastName email')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    const total = await EmailUsage.countDocuments(filter);

    res.json({ success: true, data: { usages, total, page: Number(page), limit: Number(limit) } });
  } catch (error) {
    next(error);
  }
};

exports.getById = async (req, res, next) => {
  try {
    const usage = await EmailUsage.findOne({ _id: req.params.id, isDeleted: false })
      .populate('template', 'templateName subject version isActive')
      .populate('createdBy', 'firstName lastName email')
      .populate('updatedBy', 'firstName lastName email');
    if (!usage) throw new AppError('Usage not found', 404);
    res.json({ success: true, data: { usage } });
  } catch (error) {
    next(error);
  }
};

exports.create = async (req, res, next) => {
  try {
    const { key, name, description, template, variableMappings, isActive } = req.body;
    if (!key || !name) throw new AppError('Key and name are required', 400);

    const existing = await EmailUsage.findOne({ key: key.toLowerCase().trim() });
    if (existing) throw new AppError('A usage with this key already exists', 400);

    const usage = await EmailUsage.create({
      key: key.toLowerCase().trim(), name, description, template: template || null,
      variableMappings: variableMappings || [],
      isActive: isActive !== false,
      createdBy: getUserId(req), updatedBy: getUserId(req),
    });
    await usage.populate('template', 'templateName subject version isActive');

    res.status(201).json({ success: true, message: 'Usage created', data: { usage } });
  } catch (error) {
    next(error);
  }
};

exports.update = async (req, res, next) => {
  try {
    const usage = await EmailUsage.findOne({ _id: req.params.id, isDeleted: false });
    if (!usage) throw new AppError('Usage not found', 404);

    const { key, name, description, template, variableMappings, isActive } = req.body;
    if (key !== undefined) {
      const existing = await EmailUsage.findOne({ key: key.toLowerCase().trim(), _id: { $ne: req.params.id } });
      if (existing) throw new AppError('A usage with this key already exists', 400);
      usage.key = key.toLowerCase().trim();
    }
    if (name !== undefined) usage.name = name;
    if (description !== undefined) usage.description = description;
    if (template !== undefined) usage.template = template || null;
    if (isActive !== undefined) usage.isActive = isActive;
    if (variableMappings !== undefined) {
      usage.variableMappings = variableMappings;
    }
    usage.updatedBy = getUserId(req);
    await usage.save();
    await usage.populate('template', 'templateName subject version isActive');

    res.json({ success: true, message: 'Usage updated', data: { usage } });
  } catch (error) {
    next(error);
  }
};

exports.remove = async (req, res, next) => {
  try {
    const usage = await EmailUsage.findOne({ _id: req.params.id, isDeleted: false });
    if (!usage) throw new AppError('Usage not found', 404);
    usage.isDeleted = true;
    usage.updatedBy = getUserId(req);
    await usage.save();
    res.json({ success: true, message: 'Usage deleted' });
  } catch (error) {
    next(error);
  }
};

exports.validate = async (req, res, next) => {
  try {
    const { key, variableMappings, templateId } = req.body;
    const usage = key
      ? await EmailUsage.findOne({ key, isDeleted: false }).lean()
      : await EmailUsage.findById(req.params.id).lean();

    if (!usage) throw new AppError('Usage not found', 404);

    const mappingsToCheck = variableMappings || usage.variableMappings;
    const errors = variableRegistry.validateMappings(mappingsToCheck);

    const renderer = require('../services/emailRenderer.service');
    const result = await renderer.renderByUsageWithValidation(usage.key, {});

    res.json({
      success: true,
      data: {
        valid: result.valid,
        mappingErrors: errors,
        renderErrors: result.errors,
        variableCount: mappingsToCheck.length,
      },
    });
  } catch (error) {
    next(error);
  }
};
