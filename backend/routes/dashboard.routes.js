const express = require('express');
const router = express.Router();
const { authenticate, authorizeAction } = require('../middleware/auth');

/**
 * The dashboard is a page like any other, and these figures are the company's:
 * monthly revenue, outstanding receivables, top performers, recent sales. They
 * had no guard at all, so any signed-in account could read them from a page it
 * had never been given. A role without the Dashboard page is already redirected
 * away from it in the browser, so nothing legitimate calls these without it.
 */
const canView = authorizeAction('dashboard', 'view');
const {
  Lead, Customer, Vehicle, Part, SalesOrder, Invoice, ServiceAppointment, JobCard,
  Quotation, Booking, Employee, Leave, Expense, Payment, User, ActivityLog, Payroll,
} = require('../models');

const adminRoles = ['super_admin', 'admin', 'manager'];
const isAdmin = (user) => adminRoles.includes(user?.role_name);
const scoped = (user, filter = {}, field = 'createdBy') => isAdmin(user) ? filter : { ...filter, [field]: user.id };
const num = (value) => Number(value) || 0;
const startOfDay = (date = new Date()) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const endOfDay = (date = new Date()) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
const startOfMonth = (date = new Date()) => new Date(date.getFullYear(), date.getMonth(), 1);
const customerName = (customer) => customer ? ([customer.firstName, customer.lastName].filter(Boolean).join(' ') || customer.companyName || '') : '';

async function hrSummary() {
  const [activeEmployees, pendingLeaveRequests, pendingExpenseLines, draftPayrollPeriods] = await Promise.all([
    Employee.countDocuments({ isActive: { $ne: false }, isDeleted: { $ne: true } }),
    Leave.countDocuments({ status: 'pending', isDeleted: { $ne: true } }),
    Expense.countDocuments({ status: { $in: ['draft', 'submitted'] }, isDeleted: { $ne: true } }),
    Payroll.countDocuments({ status: 'draft' }),
  ]);
  return { activeEmployees, pendingLeaveRequests, draftPayrollPeriods, pendingExpenseLines };
}

async function dashboardStats(user) {
  const [activeLeads, totalCustomers, vehiclesInStock, pendingDeliveries, openJobCards, receivables, monthlySales, todayAppointments, lowStockParts, hr] = await Promise.all([
    Lead.countDocuments(scoped(user, { isActive: { $ne: false }, deletedAt: null, status: { $nin: ['converted', 'lost'] } })),
    Customer.countDocuments({ isActive: { $ne: false }, deletedAt: null }),
    Vehicle.countDocuments({ status: { $in: ['at_yard', 'in_stock', 'available', 'ready'] } }),
    SalesOrder.countDocuments(scoped(user, { status: { $in: ['confirmed', 'invoiced', 'processing', 'ready'] } })),
    JobCard.countDocuments(scoped(user, { status: { $in: ['open', 'in_progress'] } })),
    Invoice.aggregate([{ $match: { status: { $nin: ['paid', 'cancelled'] } } }, { $group: { _id: null, total: { $sum: { $ifNull: ['$balanceAmount', 0] } } } }]),
    SalesOrder.aggregate([{ $match: scoped(user, { status: { $ne: 'cancelled' }, orderDate: { $gte: startOfMonth() } }) }, { $group: { _id: null, count: { $sum: 1 }, revenue: { $sum: { $ifNull: ['$totalAmount', 0] } } } }]),
    ServiceAppointment.countDocuments(scoped(user, { appointmentDate: { $gte: startOfDay(), $lt: endOfDay() } })),
    Part.countDocuments({ isActive: { $ne: false }, $expr: { $lte: [{ $ifNull: ['$currentStock', '$quantity'] }, { $ifNull: ['$reorderLevel', '$minStock'] }] } }),
    hrSummary(),
  ]);
  const [totalQuotations, totalBookings, totalInvoices, totalExpenses, totalPayments, serviceRevenue] = await Promise.all([
    Quotation.countDocuments(scoped(user, {})),
    Booking.countDocuments(scoped(user, { status: { $ne: 'cancelled' } })),
    Invoice.countDocuments(scoped(user, { status: { $ne: 'cancelled' } })),
    Expense.aggregate([{ $match: { isDeleted: { $ne: true }, ...scoped(user, {}) } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
    Payment.aggregate([{ $match: scoped(user, {}) }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
    JobCard.aggregate([{ $match: scoped(user, { status: { $in: ['completed', 'delivered'] } }) }, { $group: { _id: null, total: { $sum: { $ifNull: ['$totalAmount', '$grandTotal'] } } } }]),
  ]);
  return {
    activeLeads, totalCustomers, vehiclesInStock, pendingDeliveries, openJobCards,
    outstandingReceivables: num(receivables[0]?.total), monthlySalesCount: monthlySales[0]?.count || 0,
    monthlyRevenue: num(monthlySales[0]?.revenue), todayAppointments, lowStockParts, isAdmin: isAdmin(user), hr,
    totalQuotations, totalBookings, totalInvoices, totalExpenses: num(totalExpenses[0]?.total),
    totalPayments: num(totalPayments[0]?.total), serviceRevenue: num(serviceRevenue[0]?.total),
  };
}

router.get('/stats', authenticate, canView, async (req, res, next) => { try { res.json({ success: true, data: await dashboardStats(req.user) }); } catch (e) { next(e); } });
router.get('/overview', authenticate, canView, async (req, res, next) => { try { res.json({ success: true, data: await dashboardStats(req.user) }); } catch (e) { next(e); } });
router.get('/monthly-summary', authenticate, canView, async (req, res, next) => { try { const d = await dashboardStats(req.user); res.json({ success: true, data: { monthlySalesCount: d.monthlySalesCount, monthlyRevenue: d.monthlyRevenue } }); } catch (e) { next(e); } });

router.get('/sales-trend', authenticate, canView, async (req, res, next) => {
  try {
    const months = Math.min(24, Math.max(1, Number(req.query.months) || 12));
    const from = new Date(); from.setMonth(from.getMonth() - months + 1); from.setDate(1); from.setHours(0, 0, 0, 0);
    const data = await SalesOrder.aggregate([
      { $match: scoped(req.user, { status: { $ne: 'cancelled' }, orderDate: { $gte: from } }) },
      { $group: { _id: { year: { $year: '$orderDate' }, month: { $month: '$orderDate' } }, revenue: { $sum: { $ifNull: ['$totalAmount', 0] } }, orders: { $sum: 1 }, avg_value: { $avg: { $ifNull: ['$totalAmount', 0] } } } },
      { $sort: { '_id.year': 1, '_id.month': 1 } },
    ]);
    const labels = data.map((item) => new Date(item._id.year, item._id.month - 1, 1).toLocaleString('en-US', { month: 'short' }));
    res.json({ success: true, data: { labels, datasets: { revenue: data.map((d) => num(d.revenue)), orders: data.map((d) => d.orders) }, raw: data } });
  } catch (e) { next(e); }
});

router.get('/inventory-distribution', authenticate, canView, async (_req, res, next) => {
  try {
    const [vehicleStatus, vehicleMakes, partsCategories] = await Promise.all([
      Vehicle.aggregate([{ $group: { _id: { $ifNull: ['$status', 'unknown'] }, value: { $sum: 1 } } }, { $sort: { value: -1 } }]),
      Vehicle.aggregate([{ $group: { _id: { $ifNull: ['$brand.name', 'Unknown'] }, value: { $sum: 1 } } }, { $sort: { value: -1 } }, { $limit: 8 }]),
      Part.aggregate([{ $match: { isActive: { $ne: false } } }, { $group: { _id: { $ifNull: ['$category.name', 'Uncategorized'] }, value: { $sum: 1 } } }, { $sort: { value: -1 } }, { $limit: 8 }]),
    ]);
    const shape = (items) => ({ labels: items.map((i) => i._id), data: items.map((i) => i.value) });
    res.json({ success: true, data: { vehicleStatus: shape(vehicleStatus), vehicleMakes: shape(vehicleMakes), partsCategories: shape(partsCategories) } });
  } catch (e) { next(e); }
});

router.get('/top-performers', authenticate, canView, async (req, res, next) => {
  try {
    const limit = Math.min(20, Math.max(1, Number(req.query.limit) || 5));
    const period = req.query.period || 'month';
    const from = new Date();
    if (period === 'week') from.setDate(from.getDate() - 7); else if (period === 'quarter') from.setMonth(from.getMonth() - 3); else if (period === 'year') from.setFullYear(from.getFullYear() - 1); else from.setMonth(from.getMonth() - 1);
    const [sales, service] = await Promise.all([
      SalesOrder.aggregate([{ $match: scoped(req.user, { status: { $ne: 'cancelled' }, orderDate: { $gte: from } }) }, { $group: { _id: '$createdBy', deals: { $sum: 1 }, revenue: { $sum: '$totalAmount' } } }, { $sort: { revenue: -1 } }, { $limit: limit }]),
      JobCard.aggregate([{ $match: scoped(req.user, { status: 'completed', completedAt: { $gte: from } }) }, { $group: { _id: '$createdBy', jobs: { $sum: 1 }, revenue: { $sum: '$totalAmount' } } }, { $sort: { jobs: -1 } }, { $limit: limit }]),
    ]);
    const ids = [...sales, ...service].map((r) => r._id).filter(Boolean);
    const users = await User.find({ _id: { $in: ids } }).select('firstName lastName').lean();
    const map = new Map(users.map((u) => [String(u._id), u]));
    const enrich = (items) => items.map((item) => { const u = map.get(String(item._id)); const name = [u?.firstName, u?.lastName].filter(Boolean).join(' ') || 'Unassigned'; return { ...item, id: item._id, name, initials: name.slice(0, 2).toUpperCase() }; });
    res.json({ success: true, data: { sales: enrich(sales), service: enrich(service), period } });
  } catch (e) { next(e); }
});

router.get('/activities', authenticate, canView, async (req, res, next) => {
  try {
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 10));
    const logs = await ActivityLog.find(scoped(req.user, {})).populate('user', 'firstName lastName').sort({ createdAt: -1 }).limit(limit).lean();
    const data = logs.map((log) => ({ type: log.module || log.entityType || 'system', record_id: log.entityId, description: log.action || 'Activity recorded', time: log.createdAt, user_name: [log.user?.firstName, log.user?.lastName].filter(Boolean).join(' '), user_initial: log.user?.firstName?.charAt(0) || '?' }));
    res.json({ success: true, data });
  } catch (e) { next(e); }
});

router.get('/kpis', authenticate, canView, async (req, res, next) => {
  try {
    const now = new Date(); const currentStart = startOfMonth(now); const previousStart = new Date(currentStart); previousStart.setMonth(previousStart.getMonth() - 1);
    const [current, previous, currentLeads, previousLeads, converted] = await Promise.all([
      SalesOrder.aggregate([{ $match: scoped(req.user, { status: { $ne: 'cancelled' }, orderDate: { $gte: currentStart } }) }, { $group: { _id: null, value: { $sum: '$totalAmount' } } }]),
      SalesOrder.aggregate([{ $match: scoped(req.user, { status: { $ne: 'cancelled' }, orderDate: { $gte: previousStart, $lt: currentStart } }) }, { $group: { _id: null, value: { $sum: '$totalAmount' } } }]),
      Lead.countDocuments(scoped(req.user, { createdAt: { $gte: currentStart } })), Lead.countDocuments(scoped(req.user, { createdAt: { $gte: previousStart, $lt: currentStart } })),
      Lead.countDocuments(scoped(req.user, { createdAt: { $gte: currentStart }, status: 'converted' })),
    ]);
    const curr = num(current[0]?.value); const prev = num(previous[0]?.value); const currLeads = currentLeads || 0; const prevLeads = previousLeads || 0;
    res.json({ success: true, data: { revenue: { current: curr, previous: prev, change: prev ? Math.round((curr - prev) / prev * 100) : 0, trend: curr >= prev ? 'up' : 'down' }, leads: { current: currLeads, previous: prevLeads, change: prevLeads ? Math.round((currLeads - prevLeads) / prevLeads * 100) : 0, trend: currLeads >= prevLeads ? 'up' : 'down' }, conversionRate: currLeads ? Math.round(converted / currLeads * 10000) / 100 : 0 } });
  } catch (e) { next(e); }
});

router.get('/alerts', authenticate, canView, async (_req, res, next) => {
  try {
    const [parts, invoices, orders] = await Promise.all([
      Part.find({ isActive: { $ne: false }, $expr: { $lte: [{ $ifNull: ['$currentStock', '$quantity'] }, { $ifNull: ['$reorderLevel', '$minStock'] }] } }).select('name currentStock quantity reorderLevel minStock').limit(5).lean(),
      Invoice.find({ dueDate: { $lt: new Date() }, status: { $nin: ['paid', 'cancelled'] } }).select('invoiceNumber balanceAmount').limit(5).lean(),
      SalesOrder.find({ status: { $in: ['confirmed', 'invoiced'] }, orderDate: { $lt: new Date(Date.now() - 7 * 86400000) } }).select('orderNumber').limit(5).lean(),
    ]);
    const alerts = [
      ...parts.map((p) => ({ type: 'warning', category: 'inventory', message: `Low stock: ${p.name || 'Part'} (${p.currentStock ?? p.quantity ?? 0}/${p.reorderLevel ?? p.minStock ?? 0})` })),
      ...invoices.map((i) => ({ type: 'danger', category: 'finance', message: `Overdue invoice #${i.invoiceNumber} - PKR ${num(i.balanceAmount).toLocaleString()}` })),
      ...orders.map((o) => ({ type: 'info', category: 'sales', message: `Pending delivery: Order #${o.orderNumber}` })),
    ];
    res.json({ success: true, data: alerts });
  } catch (e) { next(e); }
});

router.get('/recent-leads', authenticate, canView, async (req, res, next) => { try { const data = await Lead.find(scoped(req.user, { isActive: { $ne: false }, deletedAt: null })).sort({ createdAt: -1 }).limit(10).lean(); res.json({ success: true, data: data.map((l) => ({ id: l._id, lead_number: l.leadNo, name: l.customerName, phone: l.phone, status: l.status, created_at: l.createdAt })) }); } catch (e) { next(e); } });
router.get('/recent-sales', authenticate, canView, async (req, res, next) => { try { const data = await SalesOrder.find(scoped(req.user, {})).populate('customer', 'firstName lastName companyName').sort({ createdAt: -1 }).limit(10).lean(); res.json({ success: true, data: data.map((o) => ({ id: o._id, order_number: o.orderNumber, customer: customerName(o.customer), grand_total: o.totalAmount, status: o.status, order_date: o.orderDate || o.createdAt })) }); } catch (e) { next(e); } });

module.exports = router;
