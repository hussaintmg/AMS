const { EmailTemplate, EmailTemplateVersion } = require('../models');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');
const { renderAndSaveVersion } = require('../services/emailRenderer.service');

const getUserId = (req) => req.user?.id || req.user?._id;

exports.list = async (req, res, next) => {
  try {
    const { page = 1, limit = 50, status, search } = req.query;
    const filter = { isDeleted: false };
    if (status) filter.status = status;
    if (search) filter.templateName = { $regex: search, $options: 'i' };

    const templates = await EmailTemplate.find(filter)
      .populate('createdBy', 'firstName lastName email')
      .populate('updatedBy', 'firstName lastName email')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    const total = await EmailTemplate.countDocuments(filter);

    res.json({ success: true, data: { templates, total, page: Number(page), limit: Number(limit) } });
  } catch (error) {
    next(error);
  }
};

exports.stats = async (req, res, next) => {
  try {
    const [total, active, draft, published, archived, recentlyUpdated] = await Promise.all([
      EmailTemplate.countDocuments({ isDeleted: false }),
      EmailTemplate.countDocuments({ isDeleted: false, isActive: true }),
      EmailTemplate.countDocuments({ isDeleted: false, status: 'draft' }),
      EmailTemplate.countDocuments({ isDeleted: false, status: 'published' }),
      EmailTemplate.countDocuments({ isDeleted: false, status: 'archived' }),
      EmailTemplate.countDocuments({
        isDeleted: false,
        updatedAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      }),
    ]);

    res.json({ success: true, data: { total, active, draft, published, archived, recentlyUpdated } });
  } catch (error) {
    next(error);
  }
};

exports.getById = async (req, res, next) => {
  try {
    const template = await EmailTemplate.findOne({ _id: req.params.id, isDeleted: false })
      .populate('createdBy', 'firstName lastName email')
      .populate('updatedBy', 'firstName lastName email');
    if (!template) throw new AppError('Template not found', 404);
    res.json({ success: true, data: { template } });
  } catch (error) {
    next(error);
  }
};

exports.create = async (req, res, next) => {
  try {
    const { templateName, subject, description, tags, html, css, plainText, status } = req.body;
    if (!templateName) throw new AppError('Template name is required', 400);

    const template = await EmailTemplate.create({
      templateName, subject: subject || '', description: description || '',
      tags: Array.isArray(tags) ? tags : [],
      html: html || '', css: css || '',
      plainText: plainText || '', version: 1, status: status || 'draft',
      isActive: status === 'published',
      createdBy: getUserId(req), updatedBy: getUserId(req),
    });

    await renderAndSaveVersion(template);

    res.status(201).json({ success: true, message: 'Template created', data: { template } });
  } catch (error) {
    next(error);
  }
};

exports.update = async (req, res, next) => {
  try {
    const template = await EmailTemplate.findOne({ _id: req.params.id, isDeleted: false });
    if (!template) throw new AppError('Template not found', 404);

    const { templateName, subject, description, tags, html, css, plainText, status, changeNote } = req.body;
    if (templateName !== undefined) template.templateName = templateName;
    if (subject !== undefined) template.subject = subject;
    if (description !== undefined) template.description = description;
    if (tags !== undefined) template.tags = Array.isArray(tags) ? tags : [];
    if (html !== undefined) template.html = html;
    if (css !== undefined) template.css = css;
    if (plainText !== undefined) template.plainText = plainText;

    if (status === 'published' && template.status === 'draft') {
      template.status = 'published';
      template.isActive = true;
    } else if (status !== undefined) {
      template.status = status;
      if (status === 'published') template.isActive = true;
      if (status === 'archived') template.isActive = false;
    }

    const hasContentChanged =
      templateName !== undefined || subject !== undefined || description !== undefined || tags !== undefined || html !== undefined ||
      css !== undefined || plainText !== undefined;

    if (hasContentChanged) {
      template.version += 1;
    }

    template.changeNote = changeNote || '';
    template.updatedBy = getUserId(req);
    await template.save();

    if (hasContentChanged) {
      await renderAndSaveVersion(template);
    }

    res.json({ success: true, message: 'Template updated', data: { template } });
  } catch (error) {
    next(error);
  }
};

exports.activate = async (req, res, next) => {
  try {
    const template = await EmailTemplate.findOne({ _id: req.params.id, isDeleted: false });
    if (!template) throw new AppError('Template not found', 404);

    if (template.status === 'draft') {
      template.status = 'published';
    }

    template.isActive = true;
    template.updatedBy = getUserId(req);
    await template.save();

    await renderAndSaveVersion(template);

    res.json({ success: true, message: 'Template activated', data: { template } });
  } catch (error) {
    next(error);
  }
};

exports.deactivate = async (req, res, next) => {
  try {
    const template = await EmailTemplate.findOne({ _id: req.params.id, isDeleted: false });
    if (!template) throw new AppError('Template not found', 404);
    template.isActive = false;
    template.updatedBy = getUserId(req);
    await template.save();
    res.json({ success: true, message: 'Template deactivated', data: { template } });
  } catch (error) {
    next(error);
  }
};

exports.remove = async (req, res, next) => {
  try {
    const template = await EmailTemplate.findOne({ _id: req.params.id, isDeleted: false });
    if (!template) throw new AppError('Template not found', 404);
    template.isDeleted = true;
    template.isActive = false;
    template.updatedBy = getUserId(req);
    await template.save();
    res.json({ success: true, message: 'Template deleted' });
  } catch (error) {
    next(error);
  }
};

exports.getVersions = async (req, res, next) => {
  try {
    const versions = await EmailTemplateVersion.find({ template: req.params.id })
      .populate('createdBy', 'firstName lastName email')
      .sort({ version: -1 });
    res.json({ success: true, data: { versions } });
  } catch (error) {
    next(error);
  }
};

exports.restoreVersion = async (req, res, next) => {
  try {
    const versionDoc = await EmailTemplateVersion.findById(req.params.versionId);
    if (!versionDoc) throw new AppError('Version not found', 404);

    const template = await EmailTemplate.findOne({ _id: versionDoc.template, isDeleted: false });
    if (!template) throw new AppError('Template not found', 404);

    const newVersion = template.version + 1;
    template.templateName = versionDoc.templateName || template.templateName;
    template.subject = versionDoc.subject;
    template.description = versionDoc.description || '';
    template.tags = versionDoc.tags || [];
    template.html = versionDoc.html;
    template.css = versionDoc.css;
    template.plainText = versionDoc.plainText;
    template.status = versionDoc.status || template.status;
    template.isActive = versionDoc.isActive || false;
    template.version = newVersion;
    template.changeNote = `Restored from version ${versionDoc.version}`;
    template.updatedBy = getUserId(req);
    await template.save();

    await renderAndSaveVersion(template);

    res.json({ success: true, message: `Version ${versionDoc.version} restored as v${newVersion}`, data: { template } });
  } catch (error) {
    next(error);
  }
};
