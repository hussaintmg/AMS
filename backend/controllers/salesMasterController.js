const PaymentTerm = require('../models/PaymentTerm.model');
const DeliveryTerm = require('../models/DeliveryTerm.model');
const QuotationValidity = require('../models/QuotationValidity.model');
const DiscountType = require('../models/DiscountType.model');
const SalesOrderType = require('../models/SalesOrderType.model');
const InvoiceType = require('../models/InvoiceType.model');
const Log = require('../models/mongo/Log.model');
const { AppError } = require('../middleware/errorHandler');
const logger = require('../utils/logger');
const { logFileOperation } = require('../utils/apiLogger');

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

function paginate(page = 1, limit = 100) {
  const p = Math.max(1, parseInt(page));
  const l = Math.min(500, Math.max(1, parseInt(limit)));
  return { skip: (p - 1) * l, limit: l, page: p, limit: l };
}

function buildSearchFilter(search, extra = {}) {
  const filter = { ...extra };
  if (search) {
    filter.$or = [
      { name: { $regex: search, $options: 'i' } },
      { description: { $regex: search, $options: 'i' } },
    ];
  }
  return filter;
}

// ═══════════════════════════════════════════════════════════════════════════
// STATS
// ═══════════════════════════════════════════════════════════════════════════

const getStats = async (req, res, next) => {
  try {
    const [paymentTerms, deliveryTerms, quotationValidities, discountTypes, salesOrderTypes, invoiceTypes] = await Promise.all([
      PaymentTerm.countDocuments(),
      DeliveryTerm.countDocuments(),
      QuotationValidity.countDocuments(),
      DiscountType.countDocuments(),
      SalesOrderType.countDocuments(),
      InvoiceType.countDocuments(),
    ]);
    res.json({
      success: true,
      data: { paymentTerms, deliveryTerms, quotationValidities, discountTypes, salesOrderTypes, invoiceTypes },
    });
  } catch (error) {
    logger.error('Error fetching sales master stats:', error);
    next(error);
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// GENERIC CRUD FACTORY
// ═══════════════════════════════════════════════════════════════════════════

function createEntityHandlers(Model, entityName, labelField = 'name') {
  const listHandler = async (req, res, next) => {
    try {
      const { search = '', is_active, page = 1, limit = 100 } = req.query;
      const { skip, limit: lim, page: p, limit: l } = paginate(page, limit);
      const filter = buildSearchFilter(search);
      if (is_active !== undefined) filter.isActive = is_active === 'true';

      const [items, total] = await Promise.all([
        Model.find(filter).sort({ name: 1 }).skip(skip).limit(lim).lean(),
        Model.countDocuments(filter),
      ]);

      res.json({
        success: true,
        data: items,
        pagination: { page: p, limit: l, total, totalPages: Math.ceil(total / l) },
      });
    } catch (error) {
      logger.error(`Error fetching ${entityName}:`, error);
      next(error);
    }
  };

  const createHandler = async (req, res, next) => {
    try {
      const allowed = ['name', 'code', 'description', 'type', 'value', 'days', 'isActive'];
      const body = {};
      allowed.forEach(f => { if (req.body[f] !== undefined) body[f] = req.body[f]; });
      if (!body.name) throw new AppError('Name is required', 400);

      body.isActive = body.isActive !== undefined ? body.isActive : true;
      body.createdBy = req.user.id;

      const item = await Model.create(body);
      const label = item[labelField] || item.name;

      await createAuditLog(req.user.id, `Create ${entityName}`, 'Sales Master Data', `${entityName} "${label}" created`, req);
      logFileOperation(req, { action: `create${entityName.replace(/\s+/g, '')}`, name: label.trim() });
      logger.info(`${entityName} created: ${label} by ${req.user.email}`);

      res.status(201).json({ success: true, message: `${entityName} created successfully`, data: item });
    } catch (error) {
      logger.error(`Error creating ${entityName}:`, error);
      next(error);
    }
  };

  const updateHandler = async (req, res, next) => {
    try {
      const { id } = req.params;
      const allowed = ['name', 'code', 'description', 'type', 'value', 'days', 'isActive'];
      const $set = {};
      allowed.forEach(f => { if (req.body[f] !== undefined) $set[f] = req.body[f]; });
      $set.updatedBy = req.user.id;

      const item = await Model.findByIdAndUpdate(id, { $set }, { new: true, runValidators: true });
      if (!item) throw new AppError(`${entityName} not found`, 404);

      await createAuditLog(req.user.id, `Update ${entityName}`, 'Sales Master Data', `${entityName} ID ${id} updated`, req);
      logFileOperation(req, { action: `update${entityName.replace(/\s+/g, '')}`, [`${entityName.toLowerCase().replace(/\s+/g, '')}Id`]: id });
      logger.info(`${entityName} updated: ID ${id} by ${req.user.email}`);

      res.json({ success: true, message: `${entityName} updated successfully`, data: item });
    } catch (error) {
      logger.error(`Error updating ${entityName}:`, error);
      next(error);
    }
  };

  const deleteHandler = async (req, res, next) => {
    try {
      const { id } = req.params;
      const item = await Model.findByIdAndDelete(id);
      if (!item) throw new AppError(`${entityName} not found`, 404);

      const label = item[labelField] || item.name;
      await createAuditLog(req.user.id, `Delete ${entityName}`, 'Sales Master Data', `${entityName} "${label}" deleted`, req);
      logFileOperation(req, { action: `delete${entityName.replace(/\s+/g, '')}`, [`${entityName.toLowerCase().replace(/\s+/g, '')}Id`]: id });
      logger.info(`${entityName} deleted: ID ${id} by ${req.user.email}`);

      res.json({ success: true, message: `${entityName} deleted successfully` });
    } catch (error) {
      logger.error(`Error deleting ${entityName}:`, error);
      next(error);
    }
  };

  return { listHandler, createHandler, updateHandler, deleteHandler };
}

const paymentTerm = createEntityHandlers(PaymentTerm, 'Payment Term');
const deliveryTerm = createEntityHandlers(DeliveryTerm, 'Delivery Term');
const quotationValidity = createEntityHandlers(QuotationValidity, 'Quotation Validity');
const discountType = createEntityHandlers(DiscountType, 'Discount Type');
const salesOrderType = createEntityHandlers(SalesOrderType, 'Sales Order Type');
const invoiceType = createEntityHandlers(InvoiceType, 'Invoice Type');

module.exports = {
  getStats,
  getPaymentTerms: paymentTerm.listHandler,
  createPaymentTerm: paymentTerm.createHandler,
  updatePaymentTerm: paymentTerm.updateHandler,
  deletePaymentTerm: paymentTerm.deleteHandler,
  getDeliveryTerms: deliveryTerm.listHandler,
  createDeliveryTerm: deliveryTerm.createHandler,
  updateDeliveryTerm: deliveryTerm.updateHandler,
  deleteDeliveryTerm: deliveryTerm.deleteHandler,
  getQuotationValidities: quotationValidity.listHandler,
  createQuotationValidity: quotationValidity.createHandler,
  updateQuotationValidity: quotationValidity.updateHandler,
  deleteQuotationValidity: quotationValidity.deleteHandler,
  getDiscountTypes: discountType.listHandler,
  createDiscountType: discountType.createHandler,
  updateDiscountType: discountType.updateHandler,
  deleteDiscountType: discountType.deleteHandler,
  getSalesOrderTypes: salesOrderType.listHandler,
  createSalesOrderType: salesOrderType.createHandler,
  updateSalesOrderType: salesOrderType.updateHandler,
  deleteSalesOrderType: salesOrderType.deleteHandler,
  getInvoiceTypes: invoiceType.listHandler,
  createInvoiceType: invoiceType.createHandler,
  updateInvoiceType: invoiceType.updateHandler,
  deleteInvoiceType: invoiceType.deleteHandler,
};
