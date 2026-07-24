const mongoose = require('mongoose');
const {
  Lead, Customer, Vehicle, Part, Quotation, Booking, SalesOrder, Invoice,
  ServiceAppointment, JobCard, Expense, Payment, Employee, Leave, Department,
} = require('../models');

const asNumber = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
const dateRange = (query = {}, field = 'createdAt') => {
  const filter = {};
  const start = query.startDate || query.dateFrom;
  const end = query.endDate || query.dateTo;
  if (start || end) {
    filter[field] = {};
    if (start) filter[field].$gte = new Date(`${start}T00:00:00.000Z`);
    if (end) filter[field].$lte = new Date(`${end}T23:59:59.999Z`);
  }
  return filter;
};
const idOf = (value) => value?._id || value;
const customerName = (customer) => customer ? ([customer.firstName, customer.lastName].filter(Boolean).join(' ') || customer.companyName || '') : '';
const withDate = (filter, field = 'createdAt') => ({ ...filter, ...dateRange({}, field) });
const rows = (items, map) => items.map(map);
const send = (res, data) => res.json({ success: true, data });

const getReports = async (_req, res) => send(res, []);
const getReportById = async (_req, res) => send(res, null);
const createReport = async (_req, res) => res.status(501).json({ success: false, message: 'Custom report builder is not enabled; use a predefined report.' });
const updateReport = createReport;
const deleteReport = createReport;
const executeReport = createReport;

const getSalesPerformance = async (req, res, next) => {
  try {
    const filter = { status: { $ne: 'cancelled' }, ...dateRange(req.query, 'orderDate') };
    const orders = await SalesOrder.find(filter).populate('customer', 'firstName lastName companyName').sort({ orderDate: -1, createdAt: -1 }).limit(2000).lean();
    const data = rows(orders, (order) => ({
      id: order._id, date: order.orderDate || order.createdAt, reference: order.orderNumber,
      customer: customerName(order.customer), status: order.status || 'pending',
      amount: asNumber(order.totalAmount), revenue: asNumber(order.totalAmount),
      payment: asNumber(order.paidAmount), balance: asNumber(order.balanceAmount),
    }));
    send(res, data);
  } catch (error) { next(error); }
};

const getSalesByModel = async (req, res, next) => {
  try {
    const filter = { status: { $ne: 'cancelled' }, ...dateRange(req.query, 'orderDate') };
    const data = await SalesOrder.aggregate([
      { $match: filter },
      { $group: { _id: '$saleType', orders: { $sum: 1 }, revenue: { $sum: '$totalAmount' }, paid: { $sum: '$paidAmount' } } },
      { $sort: { revenue: -1 } },
      { $project: { _id: 0, model: { $ifNull: ['$_id', 'vehicle'] }, orders: 1, revenue: 1, paid: 1 } },
    ]);
    send(res, data);
  } catch (error) { next(error); }
};

const getInventoryHealth = async (_req, res, next) => {
  try {
    const parts = await Part.find({ isActive: { $ne: false } }).sort({ currentStock: 1 }).limit(5000).lean();
    send(res, rows(parts, (part) => ({
      id: part._id, reference: part.partCode || part.sku, name: part.name || part.partCode,
      category: part.category?.name || '', warehouse: part.warehouse?.name || '',
      stock: asNumber(part.currentStock ?? part.quantity), minimum: asNumber(part.minStock ?? part.reorderLevel),
      stockValue: asNumber(part.currentStock ?? part.quantity) * asNumber(part.costPrice),
      status: asNumber(part.currentStock ?? part.quantity) <= asNumber(part.minStock ?? part.reorderLevel) ? 'low' : 'healthy',
    })));
  } catch (error) { next(error); }
};

const getInventoryStockSnapshot = getInventoryHealth;
const getInventoryStockMovement = async (_req, res, next) => {
  try {
    const parts = await Part.find({ isActive: { $ne: false } }).select('partCode sku name currentStock quantity updatedAt').sort({ updatedAt: -1 }).limit(5000).lean();
    send(res, rows(parts, (part) => ({ id: part._id, reference: part.partCode || part.sku, name: part.name, stock: asNumber(part.currentStock ?? part.quantity), date: part.updatedAt })));
  } catch (error) { next(error); }
};

const getPendingDeliveries = async (req, res, next) => {
  try {
    const filter = { status: { $in: ['confirmed', 'invoiced', 'processing', 'ready'] }, ...dateRange(req.query, 'orderDate') };
    const orders = await SalesOrder.find(filter).populate('customer', 'firstName lastName companyName').sort({ deliveryDate: 1, orderDate: -1 }).limit(2000).lean();
    send(res, rows(orders, (order) => ({ id: order._id, reference: order.orderNumber, customer: customerName(order.customer), status: order.status, date: order.deliveryDate || order.orderDate, amount: asNumber(order.totalAmount) })));
  } catch (error) { next(error); }
};

const getCustomerReceivables = async (req, res, next) => {
  try {
    const filter = { status: { $nin: ['paid', 'cancelled'] }, ...dateRange(req.query, 'invoiceDate') };
    const invoices = await Invoice.find(filter).populate('customer', 'firstName lastName companyName email phone isActive').sort({ dueDate: 1 }).limit(5000).lean();
    send(res, rows(invoices, (invoice) => ({
      id: invoice._id, customerId: idOf(invoice.customer), customer: customerName(invoice.customer) || 'Walk-in customer',
      email: invoice.customer?.email || '', phone: invoice.customer?.phone || '', active: invoice.customer?.isActive !== false, reference: invoice.invoiceNumber,
      dueDate: invoice.dueDate, amount: asNumber(invoice.totalAmount), paid: asNumber(invoice.paidAmount),
      outstanding: asNumber(invoice.balanceAmount ?? (invoice.totalAmount - invoice.paidAmount)), status: invoice.status,
    })));
  } catch (error) { next(error); }
};
const getReceivablesAging = getCustomerReceivables;

const getLeadStatistics = async (req, res, next) => {
  try {
    const filter = { isActive: { $ne: false }, deletedAt: null, ...dateRange(req.query, 'createdAt') };
    const leads = await Lead.find(filter)
      .populate('source', 'name')
      .populate('assignedTo', 'firstName lastName email')
      .populate('convertedCustomerId', 'customerCode firstName lastName email')
      .sort({ createdAt: -1 }).limit(5000).lean();
    send(res, rows(leads, (lead) => ({
      id: lead._id, reference: lead.leadNo, date: lead.leadDate || lead.createdAt,
      created_at: lead.createdAt, updated_at: lead.updatedAt,
      customer: lead.customerName, email: lead.email || '', phone: lead.phone || '',
      status: lead.status || 'new', source: lead.source?.name || '',
      assigned_to: lead.assignedTo ? `${lead.assignedTo.firstName || ''} ${lead.assignedTo.lastName || ''}`.trim() || lead.assignedTo.email : '',
      converted: !!lead.convertedToCustomer,
      converted_customer: lead.convertedCustomerId ? `${lead.convertedCustomerId.customerCode || ''} ${lead.convertedCustomerId.firstName || ''} ${lead.convertedCustomerId.lastName || ''}`.trim() : '',
      amount: asNumber(lead.leadValue), probability: asNumber(lead.probability),
    })));
  } catch (error) { next(error); }
};

const getServiceAnalytics = async (req, res, next) => {
  try {
    const filter = { ...dateRange(req.query, 'createdAt') };
    const cards = await JobCard.find(filter)
      .populate('customer', 'firstName lastName companyName email phone')
      .populate('warrantyType', 'name durationMonths')
      .populate('servicePackage', 'packageName price')
      .populate('technician', 'firstName lastName email')
      .populate('services.laborRate', 'name rate')
      .sort({ createdAt: -1 }).limit(5000).lean();
    send(res, rows(cards, (card) => ({
      id: card._id, reference: card.jobCardNumber, date: card.createdAt, created_at: card.createdAt, updated_at: card.updatedAt,
      customer: customerName(card.customer), customer_email: card.customer?.email || '', customer_phone: card.customer?.phone || '',
      vehicle: [card.customerVehicle?.number, card.customerVehicle?.make, card.customerVehicle?.model].filter(Boolean).join(' · '),
      status: card.status || 'open', service_package: card.servicePackage?.packageName || '',
      warranty_type: card.warrantyType?.name || '',
      technician: card.technician ? `${card.technician.firstName || ''} ${card.technician.lastName || ''}`.trim() || card.technician.email : '',
      labor_rates: (card.services || []).map((service) => service.laborRate?.name).filter(Boolean).join(', '),
      amount: asNumber(card.totalAmount || card.grandTotal), revenue: asNumber(card.totalAmount || card.grandTotal), invoiceId: card.invoice || null,
    })));
  } catch (error) { next(error); }
};
const getServiceKpiDetail = getServiceAnalytics;

const getLowStockParts = async (_req, res, next) => {
  try {
    const parts = await Part.find({ isActive: { $ne: false }, $expr: { $lte: [{ $ifNull: ['$currentStock', '$quantity'] }, { $ifNull: ['$reorderLevel', '$minStock'] }] } }).sort({ currentStock: 1 }).limit(2000).lean();
    send(res, rows(parts, (part) => ({ id: part._id, reference: part.partCode || part.sku, name: part.name, stock: asNumber(part.currentStock ?? part.quantity), minimum: asNumber(part.reorderLevel ?? part.minStock), warehouse: part.warehouse?.name || '' })));
  } catch (error) { next(error); }
};

const getExpenseReport = async (req, res, next) => {
  try {
    const expenses = await Expense.find({ isDeleted: { $ne: true }, ...dateRange(req.query, 'expenseDate') }).sort({ expenseDate: -1, createdAt: -1 }).limit(5000).lean();
    send(res, rows(expenses, (item) => ({ id: item._id, reference: item.expenseNumber, date: item.expenseDate || item.createdAt, category: item.category, description: item.description, status: item.status, amount: asNumber(item.amount) })));
  } catch (error) { next(error); }
};

const getPaymentReport = async (req, res, next) => {
  try {
    const payments = await Payment.find({ ...dateRange(req.query, 'paymentDate') }).populate('customer', 'firstName lastName companyName').sort({ paymentDate: -1, createdAt: -1 }).limit(5000).lean();
    send(res, rows(payments, (item) => ({ id: item._id, reference: item.paymentNumber, date: item.paymentDate || item.createdAt, customer: customerName(item.customer), method: item.method?.name || '', status: item.status || 'posted', amount: asNumber(item.amount) })));
  } catch (error) { next(error); }
};

const getEmployeeReport = async (req, res, next) => {
  try {
    const [employees, departments, onLeaveIds] = await Promise.all([
      Employee.find({ isDeleted: { $ne: true } }).populate('department', 'name').sort({ firstName: 1 }).limit(5000).lean(),
      Department.countDocuments({ isActive: { $ne: false } }),
      Leave.find({ status: 'approved', startDate: { $lte: new Date() }, endDate: { $gte: new Date() }, isDeleted: { $ne: true } }).distinct('employee'),
    ]);
    const onLeave = new Set(onLeaveIds.map((id) => String(id)));
    send(res, rows(employees, (item) => ({ id: item._id, reference: item.employeeCode, employee: `${item.firstName || ''} ${item.lastName || ''}`.trim(), department: item.department?.name || '', designation: item.designation || '', status: item.isActive === false ? 'inactive' : (item.status || 'active'), date: item.joiningDate, amount: asNumber(item.salary), onLeave: onLeave.has(String(item._id)), departments })));
  } catch (error) { next(error); }
};

module.exports = {
  createReport, updateReport, deleteReport, getReportById, getReports, executeReport,
  getSalesPerformance, getSalesByModel, getInventoryHealth, getInventoryStockMovement,
  getInventoryStockSnapshot, getPendingDeliveries, getCustomerReceivables, getReceivablesAging,
  getLeadStatistics, getServiceAnalytics, getServiceKpiDetail, getLowStockParts,
  getExpenseReport, getPaymentReport, getEmployeeReport,
};
