const mongoose = require('mongoose');
const crypto = require('crypto');
const { sanitizeText, sanitizeFields, containsMarkup } = require('../utils/sanitize.util');
const Lead = require('../models/Lead.model');
const LeadSource = require('../models/LeadSource.model');
const LeadType = require('../models/LeadType.model');
const LeadPriority = require('../models/LeadPriority.model');
const LeadCity = require('../models/LeadCity.model');

const StatusCollection = require('../models/StatusCollection.model');
const StatusItem = require('../models/StatusItem.model');
const User = require('../models/User.model');
const Role = require('../models/Role.model');
const Department = require('../models/Department.model');
const SystemSetting = require('../models/SystemSetting.model');
const Log = require('../models/mongo/Log.model');
const { normalizePhone, isValidPhone } = require('../utils/phone.util');
const { logFileOperation } = require('../utils/apiLogger');
const { allowedOwnerIds } = require('../utils/roleJobs');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function getSuperAdminRoleId() {
  try {
    const role = await Role.findOne({ name: 'super_admin' }).select('_id').lean();
    return role?._id?.toString();
  } catch { return null; }
}

function validateEmail(email) {
  return email && EMAIL_REGEX.test(email);
}

// The collection selected in Server Management is authoritative.  Falling back
// to the legacy `leads` key keeps existing installations working, but must not
// override an administrator's selected collection.
async function getLeadStatusCollection() {
  const setting = await SystemSetting.findOne({ key: 'lead_status_collection_id' }).lean();
  if (setting?.value) {
    const configured = await StatusCollection.findOne({ _id: setting.value, isActive: true }).lean();
    if (configured) return configured;
  }
  return StatusCollection.findOne({ key: 'leads', isActive: true }).lean();
}

const { generateLeadNo } = require('../utils/leadNumber.util');

function createActivity(type, description, performedBy, oldValue = null, newValue = null) {
  return {
    type,
    description,
    oldValue,
    newValue,
    performedBy,
    performedAt: new Date(),
  };
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

exports.seedDefaults = async (req, res, next) => {
  try {
    const userId = req.user?._id || req.user?.id;
    const typeCount = await LeadType.countDocuments();
    const priorityCount = await LeadPriority.countDocuments();

    const results = {};
    if (typeCount === 0) {
      const defaults = [
        { name: 'Vehicle Purchase', category: 'vehicle', sortOrder: 1 },
        { name: 'Service', category: 'service', sortOrder: 2 },
        { name: 'Parts Purchase', category: 'parts', sortOrder: 3 },
        { name: 'General Enquiry', category: 'general', sortOrder: 4 },
      ];
      const created = [];
      for (const d of defaults) {
        const code = d.name.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]+/g, '');
        const exists = await LeadType.findOne({ code });
        if (!exists) {
          const t = await LeadType.create({ ...d, code, createdBy: userId });
          created.push(t.name);
        }
      }
      results.types = created;
    }

    if (priorityCount === 0) {
      const defaults = [
        { name: 'Low', color: '#6b7280', level: 1, sortOrder: 1 },
        { name: 'Medium', color: '#f59e0b', level: 3, sortOrder: 2 },
        { name: 'High', color: '#ef4444', level: 7, sortOrder: 3 },
        { name: 'Urgent', color: '#dc2626', level: 10, sortOrder: 4 },
      ];
      const created = [];
      for (const d of defaults) {
        const code = d.name.toLowerCase();
        const exists = await LeadPriority.findOne({ code });
        if (!exists) {
          const p = await LeadPriority.create({ ...d, code, createdBy: userId });
          created.push(p.name);
        }
      }
      results.priorities = created;
    }

    res.json({ success: true, message: 'Defaults seeded', data: results });
  } catch (error) {
    console.error('seedDefaults error:', error);
    next(error);
  }
};

exports.getLeads = async (req, res, next) => {
  try {
    const user = req.user;
    const isSuperAdmin = user?.role?.toString() === (await getSuperAdminRoleId());

    const {
      page = 1, limit = 20, search = '', status = '',
      source = '', priority = '', type = '', city = '',
      assignedTo = '', department = '', dateFrom = '', dateTo = '',
      isActive = 'true', sortBy = 'createdAt', sortOrder = 'desc',
      leadNo = '', customerName = '', email = '', phone = '',
      converted = '', customerType = '',
    } = req.query;

    const filter = {};
    if (isActive === 'true') filter.isActive = true;
    else if (isActive === 'false') filter.isActive = false;
    else if (isActive === 'all') { /* no filter */ }

    // PART 5: Ownership — non-super-admin only sees own leads
    const leadOwnerIds = await allowedOwnerIds(user, 'leads');
    if (leadOwnerIds !== null) filter.createdBy = { $in: leadOwnerIds };

    // PART 4: Default hide converted unless explicitly requested
    if (converted === 'true') filter.convertedToCustomer = true;
    else if (converted === 'false' || !converted) filter.convertedToCustomer = { $ne: true };

    if (status) filter.status = status;
    if (source) filter.source = new mongoose.Types.ObjectId(source);
    if (priority) filter.priority = new mongoose.Types.ObjectId(priority);
    if (type) filter.type = new mongoose.Types.ObjectId(type);
    if (city) filter.city = { $regex: city, $options: 'i' };
    if (department) filter.department = new mongoose.Types.ObjectId(department);
    if (assignedTo === 'unassigned') filter.assignedTo = null;
    else if (assignedTo && mongoose.Types.ObjectId.isValid(assignedTo)) filter.assignedTo = new mongoose.Types.ObjectId(assignedTo);

    if (customerType) filter.customerType = customerType;
    if (leadNo) filter.leadNo = { $regex: leadNo, $options: 'i' };
    if (customerName) filter.customerName = { $regex: customerName, $options: 'i' };
    if (email) filter.email = { $regex: email, $options: 'i' };
    if (phone) filter.phone = { $regex: phone, $options: 'i' };

    if (dateFrom || dateTo) {
      filter.createdAt = {};
      if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
      if (dateTo) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        filter.createdAt.$lte = end;
      }
    }

    if (search) {
      const escaped = String(search).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const searchRegex = new RegExp(escaped, 'i');
      filter.$or = [
        { leadNo: searchRegex },
        { customerName: searchRegex },
        { email: searchRegex },
        { phone: searchRegex },
        { status: searchRegex },
      ];
    }

    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const skip = (pageNum - 1) * limitNum;
    const sortObj = {};
    const allowedSortFields = ['createdAt', 'updatedAt', 'leadNo', 'customerName', 'email', 'leadValue', 'nextFollowUpAt', 'status', 'probability'];
    const safeSortBy = allowedSortFields.includes(sortBy) ? sortBy : 'createdAt';
    sortObj[safeSortBy] = sortOrder === 'asc' ? 1 : -1;

    const [leads, total] = await Promise.all([
      Lead.find(filter)
        .sort(sortObj)
        .skip(skip)
        .limit(limitNum)
        .populate('source', 'name code')
        .populate('type', 'name code category')
        .populate('priority', 'name color level')
        .populate('assignedTo', 'firstName lastName email')
        .populate('department', 'name')
        .populate('createdBy', 'firstName lastName')
        .populate('convertedCustomerId', 'customerCode firstName lastName email phone')
        .lean(),
      Lead.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: leads,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error('getLeads error:', error);
    next(error);
  }
};

exports.getLeadById = async (req, res, next) => {
  try {
    const lead = await Lead.findById(req.params.id)
      .populate('source', 'name code')
      .populate('type', 'name code category')
      .populate('priority', 'name color level')
      .populate('assignedTo', 'firstName lastName email')
      .populate('department', 'name')
      .populate('createdBy', 'firstName lastName')
      .populate('updatedBy', 'firstName lastName')
      .populate('convertedCustomerId', 'customerCode firstName lastName email phone')
      .lean();

    if (!lead) {
      return res.status(404).json({ success: false, message: 'Lead not found' });
    }

    res.json({ success: true, data: lead });
  } catch (error) {
    console.error('getLeadById error:', error);
    next(error);
  }
};

exports.createLead = async (req, res, next) => {
  try {
    const userId = req.user?._id || req.user?.id;
    const { email: rawEmail, phone: rawPhone } = req.body;

    if (!req.body.customerName || !String(req.body.customerName).trim()) {
      return res.status(400).json({ success: false, message: 'Customer name is required' });
    }
    if (containsMarkup(req.body.customerName)) {
      return res.status(400).json({ success: false, message: 'Customer name cannot contain HTML or script tags' });
    }
    const customerName = sanitizeText(req.body.customerName, 200);
    if (!customerName) {
      return res.status(400).json({ success: false, message: 'Customer name is required' });
    }

    if (!rawEmail || !rawEmail.trim()) {
      return res.status(400).json({ success: false, message: 'Email is required' });
    }
    const email = rawEmail.trim().toLowerCase();
    if (!validateEmail(email)) {
      return res.status(400).json({ success: false, message: 'Invalid email format' });
    }

    if (!rawPhone || !rawPhone.trim()) {
      return res.status(400).json({ success: false, message: 'Phone is required' });
    }
    const phone = normalizePhone(rawPhone);
    if (!isValidPhone(phone)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid phone number — enter a valid number, e.g. 03001234567',
      });
    }

    const leadNo = await generateLeadNo();

    let alternatePhone = null;
    if (req.body.alternatePhone) {
      alternatePhone = normalizePhone(req.body.alternatePhone);
      if (!isValidPhone(alternatePhone)) {
        return res.status(400).json({ success: false, message: 'Invalid alternate phone number' });
      }
    }

    let statusVal = req.body.status || '';
    if (!statusVal) {
      const statusCollection = await getLeadStatusCollection();
      if (statusCollection) {
        const firstStatus = await StatusItem.findOne({ collection: statusCollection._id, isActive: true }).sort({ order: 1 }).lean();
        if (firstStatus) statusVal = firstStatus.value;
      }
    }

    const leadData = {
      ...req.body,
      // Explicit after the spread: req.body still holds the raw values.
      customerName,
      email,
      phone,
      alternatePhone: alternatePhone || undefined,
      leadNo,
      status: statusVal,
      createdBy: userId,
      activities: [createActivity('created', `Lead ${leadNo} created`, userId)],
    };
    sanitizeFields(leadData, ['address', 'city', 'state', 'country'], 200);
    if (leadData.description !== undefined) {
      leadData.description = sanitizeText(leadData.description, 5000);
    }

    let lead;
    try {
      lead = await Lead.create(leadData);
    } catch (err) {
      if (err.code === 11000 && err.keyPattern?.leadNo) {
        leadData.leadNo = await generateLeadNo();
        lead = await Lead.create(leadData);
      } else {
        throw err;
      }
    }

    await createAuditLog(userId, 'Create Lead', 'Leads', `Lead ${leadNo} created`, req);
    logFileOperation(req, { action: 'createLead', leadNo, customerName, email });

    res.status(201).json({ success: true, message: 'Lead created successfully', data: lead });
  } catch (error) {
    console.error('createLead error:', error);
    next(error);
  }
};

exports.updateLead = async (req, res, next) => {
  try {
    const userId = req.user?._id || req.user?.id;
    const lead = await Lead.findById(req.params.id);
    if (!lead) {
      return res.status(404).json({ success: false, message: 'Lead not found' });
    }

    if (req.body.email !== undefined) {
      const email = req.body.email.trim().toLowerCase();
      if (!email) {
        return res.status(400).json({ success: false, message: 'Email is required' });
      }
      if (!validateEmail(email)) {
        return res.status(400).json({ success: false, message: 'Invalid email format' });
      }
      req.body.email = email;
    }

    if (req.body.phone !== undefined) {
      const phone = req.body.phone.trim();
      if (!phone) {
        return res.status(400).json({ success: false, message: 'Phone is required' });
      }
      const normalized = normalizePhone(phone);
      if (!normalized) {
        return res.status(400).json({ success: false, message: 'Invalid phone number' });
      }
      req.body.phone = normalized;
    }

    if (req.body.alternatePhone) {
      req.body.alternatePhone = normalizePhone(req.body.alternatePhone);
    }

    const changedFields = [];
    const trackedFields = ['customerName', 'email', 'phone', 'leadValue', 'probability', 'expectedCloseDate', 'nextFollowUpAt', 'description', 'source', 'type', 'priority', 'city', 'address'];

    for (const field of trackedFields) {
      if (req.body[field] !== undefined && String(req.body[field]) !== String(lead[field])) {
        changedFields.push({ field, from: lead[field], to: req.body[field] });
      }
    }

    Object.assign(lead, { ...req.body, updatedBy: userId });

    if (changedFields.length > 0) {
      const desc = changedFields.map(cf => `${cf.field}: ${cf.from} → ${cf.to}`).join('; ');
      lead.activities.push(createActivity('updated', `Updated fields: ${desc}`, userId, null, null));
    }

    lead.updatedBy = userId;
    await lead.save();

    await createAuditLog(userId, 'Update Lead', 'Leads', `Lead ${lead.leadNo} updated`, req);
    logFileOperation(req, { action: 'updateLead', leadNo: lead.leadNo, changedFields: changedFields.map(cf => cf.field) });

    res.json({ success: true, message: 'Lead updated successfully', data: lead });
  } catch (error) {
    console.error('updateLead error:', error);
    next(error);
  }
};

exports.deleteLead = async (req, res, next) => {
  try {
    const userId = req.user?._id || req.user?.id;
    const lead = await Lead.findById(req.params.id);
    if (!lead) {
      return res.status(404).json({ success: false, message: 'Lead not found' });
    }

    if (lead.convertedToCustomer) {
      return res.status(400).json({ success: false, message: 'Cannot delete converted lead. This lead has been converted to a customer.' });
    }

    const leadNo = lead.leadNo;

    await Lead.deleteOne({ _id: lead._id });

    await createAuditLog(userId, 'Delete Lead', 'Leads', `Lead ${leadNo} permanently deleted`, req);
    logFileOperation(req, { action: 'deleteLead', leadNo });

    res.json({ success: true, message: 'Lead deleted permanently' });
  } catch (error) {
    console.error('deleteLead error:', error);
    next(error);
  }
};

exports.assignLead = async (req, res, next) => {
  try {
    const userId = req.user?._id || req.user?.id;
    const { assignedTo } = req.body;
    const lead = await Lead.findById(req.params.id);
    if (!lead) {
      return res.status(404).json({ success: false, message: 'Lead not found' });
    }

    const oldAssignee = lead.assignedTo;
    lead.assignedTo = assignedTo || null;
    lead.assignedAt = assignedTo ? new Date() : null;
    lead.updatedBy = userId;

    let assigneeName = 'Unassigned';
    if (assignedTo) {
      const user = await User.findById(assignedTo).select('firstName lastName').lean();
      if (user) assigneeName = `${user.firstName} ${user.lastName}`;
    }

    lead.activities.push(createActivity('assignment_change', `Lead reassigned to ${assigneeName}`, userId, oldAssignee ? oldAssignee.toString() : null, assignedTo?.toString() || null));
    await lead.save();

    await createAuditLog(userId, 'Assign Lead', 'Leads', `Lead ${lead.leadNo} assigned to ${assigneeName}`, req);
    logFileOperation(req, { action: 'assignLead', leadNo: lead.leadNo, assignedTo: assigneeName });

    res.json({ success: true, message: 'Lead assigned successfully', data: lead });
  } catch (error) {
    console.error('assignLead error:', error);
    next(error);
  }
};

exports.changeStatus = async (req, res, next) => {
  try {
    const userId = req.user?._id || req.user?.id;
    const { status } = req.body;
    if (!status) {
      return res.status(400).json({ success: false, message: 'Status is required' });
    }

    const statusCollection = await getLeadStatusCollection();
    if (statusCollection) {
      const configuredStatus = await StatusItem.exists({ collection: statusCollection._id, isActive: true, value: status });
      if (!configuredStatus) {
        return res.status(400).json({ success: false, message: 'Select a status configured for leads.' });
      }
    }

    const lead = await Lead.findById(req.params.id);
    if (!lead) {
      return res.status(404).json({ success: false, message: 'Lead not found' });
    }

    const oldStatus = lead.status;
    lead.status = status;
    lead.updatedBy = userId;
    lead.activities.push(createActivity('status_change', `Status changed from "${oldStatus}" to "${status}"`, userId, oldStatus, status));
    await lead.save();

    await createAuditLog(userId, 'Change Lead Status', 'Leads', `Lead ${lead.leadNo} status: ${oldStatus} → ${status}`, req);
    logFileOperation(req, { action: 'changeLeadStatus', leadNo: lead.leadNo, from: oldStatus, to: status });

    res.json({ success: true, message: 'Lead status updated', data: lead });
  } catch (error) {
    console.error('changeStatus error:', error);
    next(error);
  }
};

exports.addNote = async (req, res, next) => {
  try {
    const userId = req.user?._id || req.user?.id;
    const { content } = req.body;
    if (!content || !content.trim()) {
      return res.status(400).json({ success: false, message: 'Note content is required' });
    }

    const lead = await Lead.findById(req.params.id);
    if (!lead) {
      return res.status(404).json({ success: false, message: 'Lead not found' });
    }

    const note = { content: content.trim(), addedBy: userId, addedAt: new Date() };
    lead.notes.push(note);
    lead.activities.push(createActivity('note_added', `Note added: ${content.trim().substring(0, 100)}${content.trim().length > 100 ? '...' : ''}`, userId));
    lead.updatedBy = userId;
    await lead.save();

    await createAuditLog(userId, 'Add Lead Note', 'Leads', `Note added to Lead ${lead.leadNo}`, req);
    logFileOperation(req, { action: 'addLeadNote', leadNo: lead.leadNo });

    res.status(201).json({ success: true, message: 'Note added successfully', data: lead });
  } catch (error) {
    console.error('addNote error:', error);
    next(error);
  }
};

exports.getActivities = async (req, res, next) => {
  try {
    const lead = await Lead.findById(req.params.id)
      .select('activities')
      .populate('activities.performedBy', 'firstName lastName')
      .lean();

    if (!lead) {
      return res.status(404).json({ success: false, message: 'Lead not found' });
    }

    const activities = (lead.activities || []).sort((a, b) => new Date(b.performedAt) - new Date(a.performedAt));

    res.json({ success: true, data: activities });
  } catch (error) {
    console.error('getActivities error:', error);
    next(error);
  }
};

exports.getLeadStats = async (req, res, next) => {
  try {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
    const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const priorities = await LeadPriority.find({ isActive: true }).sort({ level: -1 }).limit(2).lean();
    const highPriorityIds = priorities.map(p => p._id);

    const [total, newLeads, followUpToday, converted, lost, unassigned] = await Promise.all([
      Lead.countDocuments({ isActive: true }),
      Lead.countDocuments({ isActive: true, createdAt: { $gte: last7Days } }),
      Lead.countDocuments({ isActive: true, nextFollowUpAt: { $gte: todayStart, $lt: todayEnd } }),
      Lead.countDocuments({ isActive: true, convertedToCustomer: true }),
      Lead.countDocuments({ isActive: true, lostReason: { $ne: '' } }),
      Lead.countDocuments({ isActive: true, assignedTo: null }),
    ]);

    let highPriority = 0;
    if (highPriorityIds.length > 0) {
      highPriority = await Lead.countDocuments({ isActive: true, priority: { $in: highPriorityIds } });
    }

    res.json({
      success: true,
      data: { total, newLeads, followUpToday, converted, lost, highPriority, unassigned },
    });
  } catch (error) {
    console.error('getLeadStats error:', error);
    next(error);
  }
};

exports.getLeadMeta = async (req, res, next) => {
  try {
    const statusCollection = await getLeadStatusCollection();
    let statuses = [];
    if (statusCollection) {
      statuses = await StatusItem.find({ collection: statusCollection._id, isActive: true }).sort({ order: 1 }).lean();
    }

    const [sources, types, priorities, cities, departments] = await Promise.all([
      LeadSource.find({ isActive: true }).sort({ sortOrder: 1 }).lean(),
      LeadType.find({ isActive: true }).sort({ name: 1 }).lean(),
      LeadPriority.find({ isActive: true }).sort({ sortOrder: 1 }).lean(),
      LeadCity.find({ isActive: true }).sort({ sortOrder: 1, name: 1 }).lean(),
      Department.find({ isActive: true }).select('name').sort({ name: 1 }).lean(),
    ]);

    const setting = await SystemSetting.findOne({ key: 'lead_assignment_roles' }).lean();
    let allowedRoleIds = [];
    if (setting && Array.isArray(setting.value)) {
      allowedRoleIds = setting.value;
    }

    let users = [];
    if (allowedRoleIds.length > 0) {
      users = await User.find({ role: { $in: allowedRoleIds }, isActive: true })
        .select('firstName lastName email role')
        .sort({ firstName: 1 })
        .lean();
    }

    const inactiveWithLeads = await findInactiveItemsWithLeads();

    res.json({
      success: true,
      data: {
        statuses,
        sources,
        types,
        priorities,
        cities,
        users,
        departments,
        inactiveItems: inactiveWithLeads,
        leadAssignmentRolesConfigured: allowedRoleIds.length > 0,
        leadStatusCollectionId: statusCollection ? String(statusCollection._id) : null,
      },
    });
  } catch (error) {
    console.error('getLeadMeta error:', error);
    next(error);
  }
};

async function findInactiveItemsWithLeads() {
  const [inactiveSources, inactiveTypes, inactivePriorities] = await Promise.all([
    LeadSource.find({ isActive: false }).lean(),
    LeadType.find({ isActive: false }).lean(),
    LeadPriority.find({ isActive: false }).lean(),
  ]);

  const used = { sources: [], types: [], priorities: [] };

  if (inactiveSources.length > 0) {
    const sourceIds = inactiveSources.map(s => s._id);
    const leadsWithInactiveSource = await Lead.distinct('source', { source: { $in: sourceIds }, isActive: true });
    const usedIds = new Set(leadsWithInactiveSource.map(id => id.toString()));
    used.sources = inactiveSources.filter(s => usedIds.has(s._id.toString()));
  }

  if (inactiveTypes.length > 0) {
    const typeIds = inactiveTypes.map(t => t._id);
    const leadsWithInactiveType = await Lead.distinct('type', { type: { $in: typeIds }, isActive: true });
    const usedIds = new Set(leadsWithInactiveType.map(id => id.toString()));
    used.types = inactiveTypes.filter(t => usedIds.has(t._id.toString()));
  }

  if (inactivePriorities.length > 0) {
    const priorityIds = inactivePriorities.map(p => p._id);
    const leadsWithInactivePriority = await Lead.distinct('priority', { priority: { $in: priorityIds }, isActive: true });
    const usedIds = new Set(leadsWithInactivePriority.map(id => id.toString()));
    used.priorities = inactivePriorities.filter(p => usedIds.has(p._id.toString()));
  }

  return used;
}

exports.convertToCustomer = async (req, res, next) => {
  try {
    const userId = req.user?._id || req.user?.id;
    const lead = await Lead.findById(req.params.id);
    if (!lead) {
      return res.status(404).json({ success: false, message: 'Lead not found' });
    }
    if (lead.convertedToCustomer) {
      return res.status(400).json({ success: false, message: 'Lead is already converted to customer' });
    }

    // A conversion creates both a Customer and a User.  Check every currently
    // unique identity before making either record; never delete the lead when
    // a duplicate is found so it can be corrected or linked by an operator.
    const Customer = require('../models/Customer.model');
    const email = lead.email?.toLowerCase().trim();
    const [existingUser, existingCustomer] = await Promise.all([
      email ? User.findOne({ email }).select('_id email customer').lean() : null,
      email ? Customer.findOne({ email, deletedAt: null }).select('_id customerCode email user').lean() : null,
    ]);
    if (existingUser || existingCustomer) {
      return res.status(409).json({
        success: false,
        message: existingUser
          ? 'A user already exists with this lead email. The lead was not converted.'
          : 'A customer already exists with this lead email. The lead was not converted.',
        data: {
          existingUser: existingUser ? { id: String(existingUser._id), email: existingUser.email } : null,
          existingCustomer: existingCustomer ? { id: String(existingCustomer._id), customerCode: existingCustomer.customerCode, email: existingCustomer.email } : null,
        },
      });
    }

    // Get customer role config
    const roleConfigSetting = await SystemSetting.findOne({ key: 'customer_role_config' }).lean();
    if (!roleConfigSetting || !roleConfigSetting.value || !roleConfigSetting.value.activeRoleId) {
      return res.status(400).json({ success: false, message: 'Customer role is not configured in Server Management > Role Usage.' });
    }

    const activeRoleId = roleConfigSetting.value.activeRoleId;
    // Auto-generate customer code
    const lastCustomer = await Customer.findOne({ customerCode: { $regex: /^CUS-/ } }).sort({ createdAt: -1 }).lean();
    let nextNum = 1;
    if (lastCustomer && lastCustomer.customerCode) {
      const match = lastCustomer.customerCode.match(/CUS-(\d+)/);
      if (match) nextNum = parseInt(match[1], 10) + 1;
    }
    const customerCode = `CUS-${String(nextNum).padStart(6, '0')}`;

    const nameParts = lead.customerName?.split(' ') || [];
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';

    let customer, createdUser;

    // --- Transaction: Create Customer → Create User → Link → Mark Lead Converted ---
    try {
      // Step 1: Create Customer
      customer = await Customer.create({
        customerCode,
        firstName,
        lastName,
        email: lead.email,
        phone: lead.phone,
        alternatePhone: lead.alternatePhone || '',
        customerType: lead.customerType || 'individual',
        source: lead.source || null,
        type: lead.type || null,
        priority: lead.priority || null,
        status: lead.status || '',
        department: lead.department || null,
        assignedTo: lead.assignedTo || null,
        address: lead.address,
        city: lead.city || '',
        state: lead.state || '',
        country: lead.country || 'Pakistan',
        zipCode: lead.zipCode || '',
        leadRef: lead._id,
        isActive: true,
        createdBy: userId,
      });

      // Step 2: Create User
      const rawPassword = crypto.randomBytes(4).toString('hex');
      try {
        createdUser = await User.create({
          email: lead.email?.toLowerCase().trim(),
          password: rawPassword,
          firstName,
          lastName,
          phone: lead.phone || '',
          role: activeRoleId,
          customer: customer._id,
          isActive: true,
          createdBy: userId,
        });
      } catch (userErr) {
        if (userErr.code === 11000) {
          createdUser = await User.findOne({ email: lead.email?.toLowerCase().trim() }).lean();
        } else {
          throw userErr;
        }
      }

      // Step 3: Link user to customer
      if (createdUser && createdUser._id) {
        customer.user = createdUser._id;
        await customer.save();
      }

      // Step 4: Mark lead as converted
      lead.convertedToCustomer = true;
      lead.convertedCustomerId = customer._id;
      lead.convertedBy = userId;
      lead.convertedAt = new Date();
      lead.updatedBy = userId;
      lead.activities.push(createActivity('converted', `Lead converted to customer: ${customerCode}`, userId));
      await lead.save();
    } catch (txErr) {
      // Rollback: clean up any partially created data
      if (customer && customer._id) {
        await Customer.findByIdAndDelete(customer._id).catch(() => {});
      }
      if (createdUser && createdUser._id) {
        await User.findByIdAndDelete(createdUser._id).catch(() => {});
      }
      throw txErr;
    }

    await createAuditLog(userId, 'Convert Lead', 'Leads', `Lead ${lead.leadNo} converted to customer ${customerCode}`, req);
    logFileOperation(req, { action: 'convertLead', leadNo: lead.leadNo, customerCode, customerId: customer._id.toString() });

    res.json({
      success: true,
      message: 'Lead converted to customer successfully',
      data: { lead, customer, user: createdUser ? { id: createdUser._id, email: createdUser.email } : null },
    });
  } catch (error) {
    console.error('convertToCustomer error:', error);
    next(error);
  }
};

exports.markLost = async (req, res, next) => {
  try {
    const userId = req.user?._id || req.user?.id;
    const { lostReason } = req.body;
    if (!lostReason || !lostReason.trim()) {
      return res.status(400).json({ success: false, message: 'Lost reason is required' });
    }

    const lead = await Lead.findById(req.params.id);
    if (!lead) {
      return res.status(404).json({ success: false, message: 'Lead not found' });
    }

    lead.lostReason = lostReason.trim();
    lead.lostAt = new Date();
    lead.updatedBy = userId;
    lead.activities.push(createActivity('deactivated', `Lead marked as lost: ${lostReason}`, userId));
    await lead.save();

    await createAuditLog(userId, 'Mark Lead Lost', 'Leads', `Lead ${lead.leadNo} lost: ${lostReason}`, req);
    logFileOperation(req, { action: 'markLeadLost', leadNo: lead.leadNo, lostReason });

    res.json({ success: true, message: 'Lead marked as lost', data: lead });
  } catch (error) {
    console.error('markLost error:', error);
    next(error);
  }
};
