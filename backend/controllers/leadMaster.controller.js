const mongoose = require('mongoose');
const LeadSource = require('../models/LeadSource.model');
const LeadType = require('../models/LeadType.model');
const LeadPriority = require('../models/LeadPriority.model');
const LeadCity = require('../models/LeadCity.model');
const Log = require('../models/mongo/Log.model');
const { logFileOperation } = require('../utils/apiLogger');

function slugify(text) {
  return text.toString().toLowerCase().trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w-]+/g, '')
    .replace(/--+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function getModel(type) {
  switch (type) {
    case 'sources': return LeadSource;
    case 'types': return LeadType;
    case 'priorities': return LeadPriority;
    case 'cities': return LeadCity;
    default: return null;
  }
}

function getLabel(type) {
  return { sources: 'Source', types: 'Type', priorities: 'Priority', cities: 'City' }[type] || 'Item';
}

async function createAuditLog(userId, action, module, details, req) {
  try {
    await Log.create({
      userId,
      action,
      module,
      details: typeof details === 'string' ? details : JSON.stringify(details),
      ip: req?.ip || '',
      userAgent: req?.headers?.['user-agent'] || '',
      timestamp: new Date(),
    });
  } catch (err) {
    console.error('Audit log error:', err.message);
  }
}

exports.getStats = async (req, res) => {
  try {
    const modelNames = ['sources', 'types', 'priorities', 'cities'];
    const results = await Promise.all(modelNames.map(async (name) => {
      const Model = getModel(name);
      const [total, active] = await Promise.all([
        Model.countDocuments(),
        Model.countDocuments({ isActive: true }),
      ]);
      const stats = { total, active };
      if (name === 'types') {
        const categoryCounts = await Model.aggregate([
          { $group: { _id: '$category', count: { $sum: 1 } } },
        ]);
        stats.categories = Object.fromEntries(categoryCounts.map(c => [c._id || 'unknown', c.count]));
      }
      return [name, stats];
    }));
    const stats = Object.fromEntries(results);
    res.json({ success: true, data: stats });
  } catch (error) {
    console.error('getStats error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getAll = async (req, res) => {
  try {
    const type = req.params.type;
    const Model = getModel(type);
    if (!Model) return res.status(400).json({ success: false, message: 'Invalid master data type' });

    const { active, search } = req.query;
    const filter = {};
    if (active === 'true') filter.isActive = true;
    if (active === 'false') filter.isActive = false;
    if (search) filter.name = { $regex: search, $options: 'i' };

    const items = await Model.find(filter).sort({ sortOrder: 1, name: 1 }).lean();

    if (type === 'sources') {
      const Lead = require('../models/Lead.model');
      const itemsWithCount = await Promise.all(items.map(async (item) => {
        const leadCount = await Lead.countDocuments({ source: item._id, isActive: true });
        return { ...item, lead_count: leadCount };
      }));
      return res.json({ success: true, data: itemsWithCount });
    }

    res.json({ success: true, data: items });
  } catch (error) {
    console.error('getAll error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.create = async (req, res) => {
  try {
    const userId = req.user?._id || req.user?.id;
    const type = req.params.type;
    const Model = getModel(type);
    if (!Model) return res.status(400).json({ success: false, message: 'Invalid master data type' });

    const { name, description, color, sortOrder, category, level } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Name is required' });
    }

    const code = slugify(name);
    const existing = await Model.findOne({ code });
    if (existing) {
      return res.status(409).json({ success: false, message: `${getLabel(type)} with name "${name}" already exists` });
    }

    const data = {
      name: name.trim(),
      code,
      description: description || '',
      createdBy: userId,
      sortOrder: sortOrder || 0,
    };

    if (color) data.color = color;
    if (type === 'types' && category) data.category = category;
    if (type === 'priorities' && level !== undefined) data.level = level;

    const item = await Model.create(data);
    await createAuditLog(userId, `Create ${getLabel(type)}`, 'Lead Master Data', `${getLabel(type)} "${name}" created`, req);
    logFileOperation(req, { action: 'createLeadMaster', entityType: type, name: name.trim() });

    res.status(201).json({ success: true, message: `${getLabel(type)} created successfully`, data: item });
  } catch (error) {
    console.error('create error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.update = async (req, res) => {
  try {
    const userId = req.user?._id || req.user?.id;
    const type = req.params.type;
    const Model = getModel(type);
    if (!Model) return res.status(400).json({ success: false, message: 'Invalid master data type' });

    const item = await Model.findById(req.params.id);
    if (!item) return res.status(404).json({ success: false, message: `${getLabel(type)} not found` });

    const { name, description, color, sortOrder, isActive, category, level } = req.body;

    if (name && name.trim() !== item.name) {
      const code = slugify(name);
      const existing = await Model.findOne({ code, _id: { $ne: item._id } });
      if (existing) {
        return res.status(409).json({ success: false, message: `${getLabel(type)} with name "${name}" already exists` });
      }
      item.name = name.trim();
      item.code = code;
    }

    if (description !== undefined) item.description = description;
    if (color !== undefined) item.color = color;
    if (sortOrder !== undefined) item.sortOrder = sortOrder;
    if (isActive !== undefined) item.isActive = isActive;
    if (type === 'types' && category !== undefined) item.category = category;
    if (type === 'priorities' && level !== undefined) item.level = level;
    item.updatedBy = userId;
    await item.save();

    await createAuditLog(userId, `Update ${getLabel(type)}`, 'Lead Master Data', `${getLabel(type)} "${item.name}" updated`, req);
    logFileOperation(req, { action: 'updateLeadMaster', entityType: type, id: item._id.toString(), name: item.name });

    res.json({ success: true, message: `${getLabel(type)} updated successfully`, data: item });
  } catch (error) {
    console.error('update error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.remove = async (req, res) => {
  try {
    const userId = req.user?._id || req.user?.id;
    const type = req.params.type;
    const Model = getModel(type);
    if (!Model) return res.status(400).json({ success: false, message: 'Invalid master data type' });

    const item = await Model.findById(req.params.id);
    if (!item) return res.status(404).json({ success: false, message: `${getLabel(type)} not found` });

    const Lead = require('../models/Lead.model');
    const leadField = { sources: 'source', types: 'type', priorities: 'priority', cities: 'city' }[type];
    const leadCount = await Lead.countDocuments({ [leadField]: item._id, isActive: true });

    if (leadCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete: ${leadCount} active lead(s) use this ${getLabel(type).toLowerCase()}`,
      });
    }

    await Model.findByIdAndDelete(item._id);
    await createAuditLog(userId, `Delete ${getLabel(type)}`, 'Lead Master Data', `${getLabel(type)} "${item.name}" deleted`, req);
    logFileOperation(req, { action: 'deleteLeadMaster', entityType: type, name: item.name });

    res.json({ success: true, message: `${getLabel(type)} deleted successfully` });
  } catch (error) {
    console.error('remove error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};
