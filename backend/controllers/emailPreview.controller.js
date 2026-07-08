const renderer = require('../services/emailRenderer.service');
const AppError = require('../utils/AppError');

exports.preview = async (req, res, next) => {
  try {
    const { usageKey, templateId, context, variables } = req.body;
    const ctx = context || variables || {};

    if (!usageKey && !templateId) {
      throw new AppError('usageKey or templateId is required', 400);
    }

    if (templateId && !usageKey) {
      const { EmailTemplate } = require('../models');
      const template = await EmailTemplate.findOne({ _id: templateId, isDeleted: false }).lean();
      if (!template) throw new AppError('Template not found', 404);

      const rendered = await renderer.renderWithTemplate(template, null, ctx);
      return res.json({ success: true, data: { rendered } });
    }

    const rendered = await renderer.renderEmail(usageKey, ctx, { templateId });
    res.json({ success: true, data: { rendered } });
  } catch (error) {
    next(error);
  }
};

exports.validateAndPreview = async (req, res, next) => {
  try {
    const { usageKey } = req.body;
    if (!usageKey) throw new AppError('usageKey is required', 400);

    const result = await renderer.renderByUsageWithValidation(usageKey, req.body.context || req.body.variables || {});
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};
