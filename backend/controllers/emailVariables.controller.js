const { EmailVariable } = require('../models');
const variableRegistry = require('../services/variableRegistry');
const AppError = require('../utils/AppError');

const getUserId = (req) => req.user?.id || req.user?._id;
const makeKey = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
const normalizeReference = (value) => String(value || '')
  .trim()
  .replace(/^\{\{\s*/, '')
  .replace(/\s*\}\}$/, '')
  .trim()
  .replace(/\s+/g, '');
const normalizeString = (value) => String(value || '').trim();

function buildRegistryVariables() {
  const groupedArray = variableRegistry.getAllVariables();
  const grouped = {};
  const flat = [];

  groupedArray.forEach(provider => {
    const group = provider.label || provider.name || 'Registry';
    grouped[group] = (provider.variables || []).map(variable => ({
      ...variable,
      group,
      source: 'registry',
      provider: provider.name,
    }));
    flat.push(...grouped[group]);
  });

  return { grouped, flat };
}

function dedupeVariables(variables) {
  const byKey = new Map();
  variables.forEach(variable => {
    const key = variable.key || variable.reference;
    if (!key) return;
    if (!byKey.has(key) || variable.source === 'admin') {
      byKey.set(key, { ...variable, key });
    }
  });
  return Array.from(byKey.values());
}

exports.list = async (req, res, next) => {
  try {
    const { page = 1, limit = 50, search, category, isActive } = req.query;
    const filter = { isDeleted: false };
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { reference: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
      ];
    }
    if (category) filter.category = category;
    if (isActive !== undefined) filter.isActive = isActive === 'true';

    const variables = await EmailVariable.find(filter)
      .populate('createdBy', 'firstName lastName email')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    const total = await EmailVariable.countDocuments(filter);

    res.json({ success: true, data: { variables, total, page: Number(page), limit: Number(limit) } });
  } catch (error) {
    next(error);
  }
};

exports.getById = async (req, res, next) => {
  try {
    const variable = await EmailVariable.findOne({ _id: req.params.id, isDeleted: false })
      .populate('createdBy', 'firstName lastName email')
      .populate('updatedBy', 'firstName lastName email');
    if (!variable) throw new AppError('Variable not found', 404);
    res.json({ success: true, data: { variable } });
  } catch (error) {
    next(error);
  }
};

exports.create = async (req, res, next) => {
  try {
    const { name, reference, defaultValue, description, category, isActive } = req.body;
    if (!name || !reference) throw new AppError('Name and reference are required', 400);

    const cleanName = normalizeString(name);
    const cleanReference = normalizeReference(reference);
    if (!cleanReference) throw new AppError('Reference is required', 400);
    const key = makeKey(cleanName);

    const existing = await EmailVariable.findOne({
      isDeleted: false,
      $or: [{ key }, { reference: cleanReference }],
    });
    if (existing) throw new AppError('A variable with this name or reference already exists', 400);

    const variable = await EmailVariable.create({
      name: cleanName, key, reference: cleanReference,
      defaultValue: normalizeString(defaultValue),
      description: description || '',
      category: category || 'General', isActive: isActive !== false,
      createdBy: getUserId(req), updatedBy: getUserId(req),
    });

    res.status(201).json({ success: true, message: 'Variable created', data: { variable } });
  } catch (error) {
    next(error);
  }
};

exports.update = async (req, res, next) => {
  try {
    const variable = await EmailVariable.findOne({ _id: req.params.id, isDeleted: false });
    if (!variable) throw new AppError('Variable not found', 404);

    const fields = ['defaultValue', 'description', 'category', 'isActive'];
    fields.forEach(f => {
      if (req.body[f] !== undefined) variable[f] = req.body[f];
    });

    if (req.body.name !== undefined) {
      const cleanName = normalizeString(req.body.name);
      if (!cleanName) throw new AppError('Name is required', 400);
      const nextKey = makeKey(cleanName);
      const existing = await EmailVariable.findOne({ key: nextKey, isDeleted: false, _id: { $ne: req.params.id } });
      if (existing) throw new AppError('A variable with this name already exists', 400);
      variable.name = cleanName;
      variable.key = nextKey;
    }

    if (req.body.reference !== undefined) {
      const cleanReference = normalizeReference(req.body.reference);
      if (!cleanReference) throw new AppError('Reference is required', 400);
      const existing = await EmailVariable.findOne({ reference: cleanReference, isDeleted: false, _id: { $ne: req.params.id } });
      if (existing) throw new AppError('A variable with this reference already exists', 400);
      variable.reference = cleanReference;
    }

    if (req.body.defaultValue !== undefined) variable.defaultValue = normalizeString(req.body.defaultValue);

    variable.updatedBy = getUserId(req);
    await variable.save();

    res.json({ success: true, message: 'Variable updated', data: { variable } });
  } catch (error) {
    next(error);
  }
};

exports.remove = async (req, res, next) => {
  try {
    const variable = await EmailVariable.findOne({ _id: req.params.id, isDeleted: false });
    if (!variable) throw new AppError('Variable not found', 404);
    variable.isDeleted = true;
    variable.isActive = false;
    variable.updatedBy = getUserId(req);
    await variable.save();
    res.json({ success: true, message: 'Variable deleted' });
  } catch (error) {
    next(error);
  }
};

exports.toggle = async (req, res, next) => {
  try {
    const variable = await EmailVariable.findOne({ _id: req.params.id, isDeleted: false });
    if (!variable) throw new AppError('Variable not found', 404);
    variable.isActive = !variable.isActive;
    variable.updatedBy = getUserId(req);
    await variable.save();
    res.json({ success: true, message: `Variable ${variable.isActive ? 'activated' : 'deactivated'}`, data: { variable } });
  } catch (error) {
    next(error);
  }
};

exports.importBulk = async (req, res, next) => {
  try {
    let records = [];
    const contentType = req.headers['content-type'] || '';

    if (contentType.includes('multipart/form-data') && req.file) {
      const raw = req.file.buffer.toString('utf-8');
      const ext = req.file.originalname.toLowerCase().split('.').pop();
      if (ext === 'csv') {
        const lines = raw.split(/\r?\n/).filter(Boolean);
        if (lines.length < 2) throw new AppError('CSV must have header + data rows', 400);
        const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
        records = lines.slice(1).map(line => {
          const values = [];
          let current = '';
          let inQuotes = false;
          for (const ch of line) {
            if (ch === '"') { inQuotes = !inQuotes; continue; }
            if (ch === ',' && !inQuotes) { values.push(current.trim()); current = ''; continue; }
            current += ch;
          }
          values.push(current.trim());
          const row = {};
          headers.forEach((h, i) => { row[h] = values[i] || ''; });
          return row;
        });
      } else if (ext === 'json') {
        records = JSON.parse(raw);
        if (!Array.isArray(records)) records = [records];
      } else {
        throw new AppError('Unsupported file format. Use CSV or JSON.', 400);
      }
    } else if (req.body.records) {
      records = req.body.records;
    } else if (Array.isArray(req.body)) {
      records = req.body;
    } else {
      throw new AppError('No import data provided. Send file, records array, or JSON body.', 400);
    }

    if (records.length === 0) {
      throw new AppError('No records to import', 400);
    }

    const results = { created: 0, skipped: 0, errors: [] };
    const userId = getUserId(req);

    for (let i = 0; i < records.length; i++) {
      const row = records[i];
      const name = normalizeString(row.name || '');
      const reference = normalizeReference(row.reference || row.key || '');

      if (!name || !reference) {
        results.errors.push({ row: i + 1, message: 'Missing name or reference' });
        continue;
      }

      const key = makeKey(name);

      const existing = await EmailVariable.findOne({
        isDeleted: false,
        $or: [{ key }, { reference }],
      });
      if (existing) {
        results.skipped++;
        continue;
      }

      try {
        await EmailVariable.create({
          name,
          key,
          reference,
          defaultValue: normalizeString(row.defaultValue || row.default || ''),
          description: (row.description || '').trim(),
          category: (row.category || 'General').trim(),
          isActive: row.isActive !== 'false' && row.isActive !== false,
          createdBy: userId,
          updatedBy: userId,
        });
        results.created++;
      } catch (err) {
        results.errors.push({ row: i + 1, message: err.message });
      }
    }

    res.json({ success: true, message: `Import complete: ${results.created} created, ${results.skipped} skipped, ${results.errors.length} errors`, data: results });
  } catch (error) {
    next(error);
  }
};

// Keep registry-based search for backward compatibility (used by variable picker)
exports.search = async (req, res, next) => {
  try {
    const { q } = req.query;
    const registryVars = buildRegistryVariables().flat;
    const adminVars = await EmailVariable.find({ isDeleted: false, isActive: true }).lean();

    const allVars = dedupeVariables([
      ...adminVars.map(v => ({ key: v.reference, label: v.name, description: v.description, defaultValue: v.defaultValue, group: v.category, source: 'admin' })),
      ...registryVars,
    ]);

    if (!q) {
      return res.json({ success: true, data: { variables: allVars } });
    }

    const query = q.toLowerCase();
    const filtered = allVars.filter(v =>
      v.key.toLowerCase().includes(query) ||
      v.label.toLowerCase().includes(query) ||
      (v.description || '').toLowerCase().includes(query)
    );
    res.json({ success: true, data: { variables: filtered } });
  } catch (error) {
    next(error);
  }
};

// Get all variables (admin + registry) grouped by category — for variable picker
exports.getAllGrouped = async (req, res, next) => {
  try {
    const registryData = buildRegistryVariables();
    const adminVars = await EmailVariable.find({ isDeleted: false, isActive: true }).lean();

    const adminGrouped = {};
    adminVars.forEach(v => {
      const group = v.category || 'General';
      if (!adminGrouped[group]) adminGrouped[group] = [];
      adminGrouped[group].push({ key: v.reference, label: v.name, description: v.description, defaultValue: v.defaultValue, source: 'admin' });
    });

    const merged = { ...registryData.grouped };
    Object.entries(adminGrouped).forEach(([group, vars]) => {
      if (merged[group]) {
        merged[group] = dedupeVariables([...vars, ...merged[group]]);
      } else {
        merged[group] = vars;
      }
    });

    const flat = dedupeVariables([
      ...adminVars.map(v => ({ key: v.reference, label: v.name, description: v.description, defaultValue: v.defaultValue, group: v.category, source: 'admin' })),
      ...registryData.flat,
    ]);

    res.json({ success: true, data: { grouped: merged, flat, total: flat.length } });
  } catch (error) {
    next(error);
  }
};
