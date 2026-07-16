const StatusCollection = require('../models/StatusCollection.model');
const StatusItem = require('../models/StatusItem.model');
const Log = require('../models/mongo/Log.model');
const { logFileOperation } = require('../utils/apiLogger');

const toSlug = (str) =>
  String(str || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

/**
 * @swagger
 * /admin/status-collections:
 *   get:
 *     tags: [Status Management]
 *     summary: List all status collections with item counts
 *     security: [{ cookieAuth: [], bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *       - in: query
 *         name: isActive
 *         schema: { type: string, enum: ['true', 'false', 'all'] }
 *     responses:
 *       200:
 *         description: List of collections
 */
const getAllCollections = async (req, res, next) => {
  try {
    const { search, isActive } = req.query;
    const filter = {};

    if (isActive === 'true') filter.isActive = true;
    else if (isActive === 'false') filter.isActive = false;

    if (search && search.trim()) {
      const s = search.trim();
      filter.$or = [
        { name: { $regex: s, $options: 'i' } },
        { key: { $regex: s, $options: 'i' } },
        { description: { $regex: s, $options: 'i' } },
        { 'usage.module': { $regex: s, $options: 'i' } },
        { 'usage.page': { $regex: s, $options: 'i' } },
        { 'usage.field': { $regex: s, $options: 'i' } },
      ];
    }

    const collections = await StatusCollection.find(filter)
      .populate('createdBy', 'firstName lastName email')
      .populate('updatedBy', 'firstName lastName email')
      .sort({ createdAt: -1 })
      .lean();

    const counts = await StatusItem.aggregate([
      { $group: { _id: '$collection', total: { $sum: 1 }, active: { $sum: { $cond: ['$isActive', 1, 0] } } } },
    ]);
    const countMap = {};
    counts.forEach((c) => { countMap[String(c._id)] = c; });

    const result = collections.map((c) => ({
      ...c,
      statusCount: countMap[String(c._id)]?.total || 0,
      activeStatusCount: countMap[String(c._id)]?.active || 0,
    }));

    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /admin/status-collections/stats:
 *   get:
 *     tags: [Status Management]
 *     summary: Get status collection statistics
 *     security: [{ cookieAuth: [], bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Collection stats
 */
const getCollectionStats = async (req, res, next) => {
  try {
    const total = await StatusCollection.countDocuments();
    const active = await StatusCollection.countDocuments({ isActive: true });
    const inactive = await StatusCollection.countDocuments({ isActive: false });
    const totalItems = await StatusItem.countDocuments();

    res.json({
      success: true,
      data: { total, active, inactive, totalItems },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /admin/status-collections/{id}:
 *   get:
 *     tags: [Status Management]
 *     summary: Get collection by ID with populated fields
 *     security: [{ cookieAuth: [], bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Collection data
 *       404:
 *         description: Not found
 */
const getCollectionById = async (req, res, next) => {
  try {
    const collection = await StatusCollection.findById(req.params.id)
      .populate('createdBy', 'firstName lastName email')
      .populate('updatedBy', 'firstName lastName email')
      .lean();

    if (!collection) return res.status(404).json({ success: false, message: 'Status collection not found' });

    const items = await StatusItem.find({ collection: collection._id })
      .populate('createdBy', 'firstName lastName email')
      .populate('updatedBy', 'firstName lastName email')
      .sort({ order: 1, label: 1 })
      .lean();

    res.json({ success: true, data: { ...collection, items } });
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /admin/status-collections:
 *   post:
 *     tags: [Status Management]
 *     summary: Create status collection
 *     security: [{ cookieAuth: [], bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name: { type: string }
 *               key: { type: string }
 *               description: { type: string }
 *               isActive: { type: boolean }
 *               usage: { type: array, items: { type: object } }
 *     responses:
 *       201:
 *         description: Created
 *       400:
 *         description: Duplicate key/name
 */
const createCollection = async (req, res, next) => {
  try {
    const { name, key, description, isActive, usage } = req.body;

    if (!name || !name.trim()) return res.status(400).json({ success: false, message: 'Collection name is required' });

    const finalKey = (key && key.trim()) ? key.trim() : toSlug(name);
    if (!finalKey) return res.status(400).json({ success: false, message: 'Could not generate key from name' });

    const existing = await StatusCollection.findOne({
      $or: [{ name: name.trim() }, { key: finalKey }],
    });
    if (existing) {
      const msg = existing.name === name.trim()
        ? `Status collection "${name}" already exists`
        : `Key "${finalKey}" is already in use`;
      return res.status(400).json({ success: false, message: msg });
    }

    const collection = await StatusCollection.create({
      name: name.trim(),
      key: finalKey,
      description: description || '',
      isActive: isActive !== undefined ? isActive : true,
      usage: usage || [],
      createdBy: req.user?.id || req.user?._id,
      updatedBy: req.user?.id || req.user?._id,
    });

    await Log.create({
      endpoint: '/admin/status-collections',
      method: 'POST',
      module: 'status-management',
      action: 'createCollection',
      user: { id: req.user?.id, email: req.user?.email },
      ip: req.ip,
      description: `Created status collection "${name}" (${finalKey})`,
    });

    logFileOperation(req, { action: 'createStatusCollection', name, key: finalKey });

    res.status(201).json({ success: true, message: 'Status collection created', data: collection });
  } catch (error) {
    if (error.code === 11000) return res.status(400).json({ success: false, message: 'Duplicate name or key' });
    next(error);
  }
};

/**
 * @swagger
 * /admin/status-collections/{id}:
 *   put:
 *     tags: [Status Management]
 *     summary: Update status collection
 *     security: [{ cookieAuth: [], bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string }
 *               key: { type: string }
 *               description: { type: string }
 *               isActive: { type: boolean }
 *               usage: { type: array, items: { type: object } }
 *     responses:
 *       200:
 *         description: Updated
 *       404:
 *         description: Not found
 */
const updateCollection = async (req, res, next) => {
  try {
    const { name, key, description, isActive, usage } = req.body;
    const collection = await StatusCollection.findById(req.params.id);
    if (!collection) return res.status(404).json({ success: false, message: 'Status collection not found' });

    if (name && name.trim() && name.trim() !== collection.name) {
      const dup = await StatusCollection.findOne({ name: name.trim(), _id: { $ne: collection._id } });
      if (dup) return res.status(400).json({ success: false, message: `Status collection "${name}" already exists` });
      collection.name = name.trim();
    }

    if (key && key.trim() && key.trim() !== collection.key) {
      const dup = await StatusCollection.findOne({ key: key.trim(), _id: { $ne: collection._id } });
      if (dup) return res.status(400).json({ success: false, message: `Key "${key}" is already in use` });
      collection.key = key.trim();
    }

    if (description !== undefined) collection.description = description;
    if (isActive !== undefined) collection.isActive = isActive;
    if (usage !== undefined) collection.usage = usage;
    collection.updatedBy = req.user?.id || req.user?._id;
    await collection.save();

    await Log.create({
      endpoint: `/admin/status-collections/${req.params.id}`,
      method: 'PUT',
      module: 'status-management',
      action: 'updateCollection',
      user: { id: req.user?.id, email: req.user?.email },
      ip: req.ip,
      description: `Updated status collection "${collection.name}"`,
    });

    logFileOperation(req, { action: 'updateStatusCollection', collectionId: req.params.id, name: collection.name });

    res.json({ success: true, message: 'Status collection updated', data: collection });
  } catch (error) {
    if (error.code === 11000) return res.status(400).json({ success: false, message: 'Duplicate name or key' });
    next(error);
  }
};

/**
 * @swagger
 * /admin/status-collections/{id}:
 *   delete:
 *     tags: [Status Management]
 *     summary: Soft delete / deactivate status collection and its items
 *     security: [{ cookieAuth: [], bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Deactivated
 *       404:
 *         description: Not found
 */
const deleteCollection = async (req, res, next) => {
  try {
    const collection = await StatusCollection.findById(req.params.id);
    if (!collection) return res.status(404).json({ success: false, message: 'Status collection not found' });

    collection.isActive = false;
    collection.updatedBy = req.user?.id || req.user?._id;
    await collection.save();

    await StatusItem.updateMany({ collection: collection._id }, { isActive: false });

    await Log.create({
      endpoint: `/admin/status-collections/${req.params.id}`,
      method: 'DELETE',
      module: 'status-management',
      action: 'deactivateCollection',
      user: { id: req.user?.id, email: req.user?.email },
      ip: req.ip,
      description: `Deactivated status collection "${collection.name}" and its items`,
    });

    logFileOperation(req, { action: 'deleteStatusCollection', collectionId: req.params.id, name: collection.name });

    res.json({ success: true, message: 'Status collection deactivated' });
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /admin/status-collections/{id}/items:
 *   get:
 *     tags: [Status Management]
 *     summary: Get status items for a collection
 *     security: [{ cookieAuth: [], bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *       - in: query
 *         name: isActive
 *         schema: { type: string, enum: ['true', 'false', 'all'] }
 *     responses:
 *       200:
 *         description: List of items
 */
const getCollectionItems = async (req, res, next) => {
  try {
    const { search, isActive } = req.query;
    const filter = { collection: req.params.id };

    if (isActive === 'true') filter.isActive = true;
    else if (isActive === 'false') filter.isActive = false;

    if (search && search.trim()) {
      const s = search.trim();
      filter.$or = [
        { label: { $regex: s, $options: 'i' } },
        { value: { $regex: s, $options: 'i' } },
        { description: { $regex: s, $options: 'i' } },
      ];
    }

    const items = await StatusItem.find(filter)
      .populate('createdBy', 'firstName lastName email')
      .populate('updatedBy', 'firstName lastName email')
      .sort({ order: 1, label: 1 })
      .lean();

    res.json({ success: true, data: items });
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /admin/status-collections/{id}/items:
 *   post:
 *     tags: [Status Management]
 *     summary: Create status item in a collection
 *     security: [{ cookieAuth: [], bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [label]
 *             properties:
 *               label: { type: string }
 *               value: { type: string }
 *               color: { type: string }
 *               description: { type: string }
 *               order: { type: number }
 *               isDefault: { type: boolean }
 *               isActive: { type: boolean }
 *     responses:
 *       201:
 *         description: Created
 *       400:
 *         description: Validation error
 */
const createCollectionItem = async (req, res, next) => {
  try {
    const { label, value, color, description, order, isDefault, isActive } = req.body;
    const collectionId = req.params.id;

    const collection = await StatusCollection.findById(collectionId);
    if (!collection) return res.status(404).json({ success: false, message: 'Status collection not found' });

    if (!label || !label.trim()) return res.status(400).json({ success: false, message: 'Status label is required' });

    const finalValue = (value && value.trim()) ? value.trim() : toSlug(label);
    if (!finalValue) return res.status(400).json({ success: false, message: 'Could not generate value from label' });

    const existing = await StatusItem.findOne({ collection: collectionId, value: finalValue });
    if (existing) return res.status(400).json({ success: false, message: `Status "${finalValue}" already exists in this collection` });

    let makeDefault = isDefault === true;
    if (makeDefault) {
      await StatusItem.updateMany({ collection: collectionId }, { isDefault: false });
    }

    const maxOrder = await StatusItem.findOne({ collection: collectionId }).sort({ order: -1 }).select('order').lean();
    const itemOrder = order !== undefined ? order : ((maxOrder?.order ?? -1) + 1);

    const item = await StatusItem.create({
      collection: collectionId,
      label: label.trim(),
      value: finalValue,
      color: color || '',
      description: description || '',
      order: itemOrder,
      isDefault: makeDefault,
      isActive: isActive !== undefined ? isActive : true,
      createdBy: req.user?.id || req.user?._id,
      updatedBy: req.user?.id || req.user?._id,
    });

    await Log.create({
      endpoint: `/admin/status-collections/${collectionId}/items`,
      method: 'POST',
      module: 'status-management',
      action: 'createStatusItem',
      user: { id: req.user?.id, email: req.user?.email },
      ip: req.ip,
      description: `Created status item "${label}" (${finalValue}) in collection "${collection.name}"`,
    });

    logFileOperation(req, { action: 'createStatusItem', collectionId, label, value: finalValue, collectionName: collection.name });

    res.status(201).json({ success: true, message: 'Status item created', data: item });
  } catch (error) {
    if (error.code === 11000) return res.status(400).json({ success: false, message: 'Duplicate value in this collection' });
    next(error);
  }
};

/**
 * @swagger
 * /admin/status-items/{itemId}:
 *   put:
 *     tags: [Status Management]
 *     summary: Update status item
 *     security: [{ cookieAuth: [], bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: itemId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               label: { type: string }
 *               value: { type: string }
 *               color: { type: string }
 *               description: { type: string }
 *               order: { type: number }
 *               isDefault: { type: boolean }
 *               isActive: { type: boolean }
 *     responses:
 *       200:
 *         description: Updated
 *       404:
 *         description: Not found
 */
const updateStatusItem = async (req, res, next) => {
  try {
    const { label, value, color, description, order, isDefault, isActive } = req.body;
    const item = await StatusItem.findById(req.params.itemId).populate('collection', 'name');
    if (!item) return res.status(404).json({ success: false, message: 'Status item not found' });

    if (label && label.trim() && label.trim() !== item.label) {
      item.label = label.trim();
    }

    if (value && value.trim() && value.trim() !== item.value) {
      const dup = await StatusItem.findOne({ collection: item.collection._id || item.collection, value: value.trim(), _id: { $ne: item._id } });
      if (dup) return res.status(400).json({ success: false, message: `Value "${value}" already exists in this collection` });
      item.value = value.trim();
    }

    if (color !== undefined) item.color = color;
    if (description !== undefined) item.description = description;
    if (order !== undefined) item.order = order;
    if (isActive !== undefined) item.isActive = isActive;
    if (isDefault === true && !item.isDefault) {
      const collId = item.collection?._id || item.collection;
      await StatusItem.updateMany({ collection: collId }, { isDefault: false });
      item.isDefault = true;
    } else if (isDefault === false) {
      item.isDefault = false;
    }

    item.updatedBy = req.user?.id || req.user?._id;
    await item.save();

    const collName = item.collection?.name || 'Unknown';

    await Log.create({
      endpoint: `/admin/status-items/${req.params.itemId}`,
      method: 'PUT',
      module: 'status-management',
      action: 'updateStatusItem',
      user: { id: req.user?.id, email: req.user?.email },
      ip: req.ip,
      description: `Updated status item "${item.label}" in collection "${collName}"`,
    });

    logFileOperation(req, { action: 'updateStatusItem', itemId: req.params.itemId, label: item.label });

    res.json({ success: true, message: 'Status item updated', data: item });
  } catch (error) {
    if (error.code === 11000) return res.status(400).json({ success: false, message: 'Duplicate value in this collection' });
    next(error);
  }
};

/**
 * @swagger
 * /admin/status-items/{itemId}:
 *   delete:
 *     tags: [Status Management]
 *     summary: Soft delete / deactivate status item
 *     security: [{ cookieAuth: [], bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: itemId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Deactivated
 *       404:
 *         description: Not found
 */
const deleteStatusItem = async (req, res, next) => {
  try {
    const item = await StatusItem.findById(req.params.itemId).populate('collection', 'name');
    if (!item) return res.status(404).json({ success: false, message: 'Status item not found' });

    item.isActive = false;
    item.updatedBy = req.user?.id || req.user?._id;
    await item.save();

    const collName = item.collection?.name || 'Unknown';

    await Log.create({
      endpoint: `/admin/status-items/${req.params.itemId}`,
      method: 'DELETE',
      module: 'status-management',
      action: 'deactivateStatusItem',
      user: { id: req.user?.id, email: req.user?.email },
      ip: req.ip,
      description: `Deactivated status item "${item.label}" in collection "${collName}"`,
    });

    logFileOperation(req, { action: 'deleteStatusItem', itemId: req.params.itemId, label: item.label });

    res.json({ success: true, message: 'Status item deactivated' });
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /admin/status-items/{itemId}/toggle:
 *   patch:
 *     tags: [Status Management]
 *     summary: Toggle status item active/inactive
 *     security: [{ cookieAuth: [], bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: itemId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Toggled
 *       404:
 *         description: Not found
 */
const toggleStatusItem = async (req, res, next) => {
  try {
    const item = await StatusItem.findById(req.params.itemId).populate('collection', 'name');
    if (!item) return res.status(404).json({ success: false, message: 'Status item not found' });

    item.isActive = !item.isActive;
    item.updatedBy = req.user?.id || req.user?._id;
    await item.save();

    const collName = item.collection?.name || 'Unknown';

    await Log.create({
      endpoint: `/admin/status-items/${req.params.itemId}/toggle`,
      method: 'PATCH',
      module: 'status-management',
      action: 'toggleStatusItem',
      user: { id: req.user?.id, email: req.user?.email },
      ip: req.ip,
      description: `Toggled status item "${item.label}" to ${item.isActive ? 'active' : 'inactive'} in collection "${collName}"`,
    });

    logFileOperation(req, { action: 'toggleStatusItem', itemId: req.params.itemId, label: item.label, nowActive: item.isActive });

    res.json({ success: true, message: item.isActive ? 'Status item activated' : 'Status item deactivated', data: item });
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /admin/status-items/{itemId}/default:
 *   patch:
 *     tags: [Status Management]
 *     summary: Set status item as default (unsets others in same collection)
 *     security: [{ cookieAuth: [], bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: itemId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Default set
 *       404:
 *         description: Not found
 */
const setDefaultStatusItem = async (req, res, next) => {
  try {
    const item = await StatusItem.findById(req.params.itemId).populate('collection', 'name');
    if (!item) return res.status(404).json({ success: false, message: 'Status item not found' });

    const collId = item.collection?._id || item.collection;
    await StatusItem.updateMany({ collection: collId }, { isDefault: false });

    item.isDefault = true;
    item.updatedBy = req.user?.id || req.user?._id;
    await item.save();

    const collName = item.collection?.name || 'Unknown';

    await Log.create({
      endpoint: `/admin/status-items/${req.params.itemId}/default`,
      method: 'PATCH',
      module: 'status-management',
      action: 'setDefaultStatusItem',
      user: { id: req.user?.id, email: req.user?.email },
      ip: req.ip,
      description: `Set "${item.label}" as default status in collection "${collName}"`,
    });

    logFileOperation(req, { action: 'setDefaultStatusItem', itemId: req.params.itemId, label: item.label, collectionName: collName });

    res.json({ success: true, message: `"${item.label}" set as default`, data: item });
  } catch (error) {
    next(error);
  }
};

// ── Backward compatibility stubs (old /admin/statuses/* routes) ──
const getAllStatuses = async (req, res, next) => {
  res.json({ success: true, data: {} });
};

const DEFAULT_STATUSES_BY_TABLE = {
  vehicles: [
    { label: 'Available', value: 'available', color: '#16a34a', isDefault: true },
    { label: 'Sold', value: 'sold', color: '#dc2626' },
    { label: 'Reserved', value: 'reserved', color: '#2563eb' },
    { label: 'Under Maintenance', value: 'under_maintenance', color: '#f59e0b' },
    { label: 'In Transit', value: 'in_transit', color: '#8b5cf6' },
  ],
};

const getStatusesByTable = async (req, res, next) => {
  try {
    const { tableName } = req.params;
    let collection = await StatusCollection.findOne({ key: tableName, isActive: true }).lean();

    if (!collection) {
      const defaults = DEFAULT_STATUSES_BY_TABLE[tableName];
      if (defaults) {
        const displayName = tableName.charAt(0).toUpperCase() + tableName.slice(1);
        const [newCollection] = await Promise.all([
          StatusCollection.create({ name: displayName, key: tableName, isActive: true }),
        ]);
        const items = defaults.map((d, i) => ({
          ...d,
          collection: newCollection._id,
          order: i + 1,
        }));
        await StatusItem.insertMany(items);
        collection = await StatusCollection.findById(newCollection._id).lean();
      } else {
        return res.json({ success: true, data: { statuses: [] } });
      }
    }

    const items = await StatusItem.find({ collection: collection._id, isActive: true })
      .sort({ order: 1, label: 1 })
      .lean();
    const statuses = items.map((item) => ({
      id: item._id,
      status_code: item.value,
      status_name: item.label,
      status_color: item.color || '#475569',
      status_bg_color: item.color ? `${item.color}20` : '#e2e8f0',
      order: item.order,
      is_default: item.isDefault,
    }));
    res.json({ success: true, data: { statuses } });
  } catch (error) {
    next(error);
  }
};

const getStatusById = async (req, res, next) => {
  res.json({ success: false, message: 'Use new /admin/status-collections endpoints' });
};

const createStatus = async (req, res, next) => {
  res.json({ success: false, message: 'Use new /admin/status-collections endpoints' });
};

const updateStatus = async (req, res, next) => {
  res.json({ success: false, message: 'Use new /admin/status-collections endpoints' });
};

const deleteStatus = async (req, res, next) => {
  res.json({ success: false, message: 'Use new /admin/status-collections endpoints' });
};

const reorderStatuses = async (req, res, next) => {
  res.json({ success: false, message: 'Use new /admin/status-collections endpoints' });
};

const getAvailableTables = async (req, res, next) => {
  res.json({ success: true, data: [] });
};

const getStatusAnalytics = async (req, res, next) => {
  res.json({ success: true, data: {} });
};

module.exports = {
  getAllCollections,
  getCollectionStats,
  getCollectionById,
  createCollection,
  updateCollection,
  deleteCollection,
  getCollectionItems,
  createCollectionItem,
  updateStatusItem,
  deleteStatusItem,
  toggleStatusItem,
  setDefaultStatusItem,
  // backward compat
  getAllStatuses,
  getStatusesByTable,
  getStatusById,
  createStatus,
  updateStatus,
  deleteStatus,
  reorderStatuses,
  getAvailableTables,
  getStatusAnalytics,
};
