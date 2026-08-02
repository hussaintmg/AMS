const {
  Lead, Customer, Vehicle, Part, SalesOrder, Invoice,
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
// Master-data refs are stored either as an embedded snapshot ({ name, code }) or
// as a populated ref, so reports must read `.name` before falling back to the raw
// value — otherwise the cell renders as "[object Object]".
const labelOf = (value) => {
  if (!value) return '';
  if (typeof value === 'string') return value;
  return value.name || value.title || value.displayName || '';
};
const joinLabels = (...values) => [...new Set(values.map(labelOf).filter(Boolean))].join(' · ');
const userName = (user) => user ? (`${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email || '') : '';
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
    const orders = await SalesOrder.find(filter)
      .populate('customer', 'firstName lastName companyName email phone customerCode')
      .populate('vehicle', 'vehicleCode registrationNumber chassisNumber make model variant color')
      .populate('vehicleMake', 'name')
      .populate('vehicleModel', 'name')
      .populate('vehicleVariant', 'name')
      .sort({ orderDate: -1, createdAt: -1 }).limit(2000).lean();
    const data = rows(orders, (order) => ({
      id: order._id, date: order.orderDate || order.createdAt, reference: order.orderNumber,
      customer: customerName(order.customer), customer_code: order.customer?.customerCode || '',
      email: order.customer?.email || '', phone: order.customer?.phone || '',
      status: order.status || 'pending', sale_type: order.saleType || '',
      vehicle: joinLabels(
        order.vehicle?.vehicleCode || order.vehicle?.registrationNumber || order.vehicle?.chassisNumber,
        order.vehicleMake || order.vehicle?.make,
        order.vehicleModel || order.vehicle?.model,
        order.vehicleVariant || order.vehicle?.variant,
      ),
      invoice_number: order.invoiceNo || '', salesperson: order.salePerson || '',
      amount: asNumber(order.totalAmount), revenue: asNumber(order.totalAmount),
      payment: asNumber(order.paidAmount), balance: asNumber(order.balanceAmount),
      subtotal: asNumber(order.subtotal), tax_amount: asNumber(order.taxAmount), discount_amount: asNumber(order.discountAmount),
      delivery_date: order.deliveryDate || null,
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

const getInventoryHealth = async (req, res, next) => {
  try {
    const parts = await Part.find({ isActive: { $ne: false } }).sort({ currentStock: 1 }).limit(5000).lean();
    // Stock value is quantity × purchase price, which hands back the purchase
    // price itself for anything held as a single unit. Only the super admin —
    // the one role allowed to see cost — gets the column.
    const showStockValue = req.user?.isSuperAdmin === true;
    send(res, rows(parts, (part) => ({
      id: part._id, reference: part.partCode || part.sku, name: part.name || part.partCode,
      category: part.category?.name || '', warehouse: part.warehouse?.name || '',
      stock: asNumber(part.currentStock ?? part.quantity), minimum: asNumber(part.minStock ?? part.reorderLevel),
      ...(showStockValue
        ? { stockValue: asNumber(part.currentStock ?? part.quantity) * asNumber(part.costPrice) }
        : {}),
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
    const orders = await SalesOrder.find(filter)
      .populate('customer', 'firstName lastName companyName phone')
      .populate('vehicle', 'vehicleCode registrationNumber chassisNumber make model variant')
      .populate('vehicleMake', 'name')
      .populate('vehicleModel', 'name')
      .sort({ deliveryDate: 1, orderDate: -1 }).limit(2000).lean();
    send(res, rows(orders, (order) => ({
      id: order._id, reference: order.orderNumber, customer: customerName(order.customer),
      phone: order.customer?.phone || '', status: order.status,
      vehicle: joinLabels(
        order.vehicle?.vehicleCode || order.vehicle?.registrationNumber || order.vehicle?.chassisNumber,
        order.vehicleMake || order.vehicle?.make,
        order.vehicleModel || order.vehicle?.model,
      ),
      order_date: order.orderDate || null, date: order.deliveryDate || order.orderDate,
      amount: asNumber(order.totalAmount), balance: asNumber(order.balanceAmount),
    })));
  } catch (error) { next(error); }
};

const getCustomerReceivables = async (req, res, next) => {
  try {
    const filter = { status: { $nin: ['paid', 'cancelled'] }, ...dateRange(req.query, 'invoiceDate') };
    const invoices = await Invoice.find(filter).populate('customer', 'firstName lastName companyName email phone isActive customerCode').sort({ dueDate: 1 }).limit(5000).lean();
    send(res, rows(invoices, (invoice) => ({
      id: invoice._id, customerId: idOf(invoice.customer), customer: customerName(invoice.customer) || 'Walk-in customer',
      customer_code: invoice.customer?.customerCode || '', email: invoice.customer?.email || '', phone: invoice.customer?.phone || '', active: invoice.customer?.isActive !== false,
      reference: invoice.invoiceNumber, invoice_type: invoice.invoiceType || 'sales', status: invoice.status,
      invoice_date: invoice.invoiceDate, due_date: invoice.dueDate, amount: asNumber(invoice.totalAmount), paid: asNumber(invoice.paidAmount),
      outstanding: asNumber(invoice.balanceAmount ?? (invoice.totalAmount - invoice.paidAmount)),
      balance_amount: asNumber(invoice.balanceAmount), subtotal: asNumber(invoice.subtotal), tax_amount: asNumber(invoice.taxAmount), discount_amount: asNumber(invoice.discountAmount),
    })));
  } catch (error) { next(error); }
};
const getReceivablesAging = getCustomerReceivables;

const buildCustomerPurchaseRows = (customers, purchases, invoices, today = new Date()) => {
  const purchasesByCustomer = new Map();
  for (const purchase of purchases) {
    const key = String(purchase.customer);
    if (!purchasesByCustomer.has(key)) purchasesByCustomer.set(key, []);
    purchasesByCustomer.get(key).push(purchase);
  }

  const invoiceTotalsByCustomer = new Map();
  for (const invoice of invoices) {
    const key = String(invoice.customer);
    const totals = invoiceTotalsByCustomer.get(key) || { count: 0, outstanding: 0, overdue: 0 };
    const outstanding = asNumber(invoice.balanceAmount ?? (invoice.totalAmount - invoice.paidAmount));
    totals.count += 1;
    totals.outstanding += outstanding;
    if (invoice.dueDate && invoice.dueDate < today) totals.overdue += outstanding;
    invoiceTotalsByCustomer.set(key, totals);
  }

  return customers.map((customer) => {
    const customerPurchases = purchasesByCustomer.get(String(customer._id)) || [];
    const invoiceTotals = invoiceTotalsByCustomer.get(String(customer._id)) || { count: 0, outstanding: 0, overdue: 0 };
    const vehicleLabels = customerPurchases.map((purchase) => [
      purchase.vehicle?.vehicleCode || purchase.vehicle?.registrationNumber || purchase.vehicle?.chassisNumber,
      purchase.vehicleMake?.name || purchase.vehicle?.make?.name,
      purchase.vehicleModel?.name || purchase.vehicle?.model?.name,
      purchase.vehicleVariant?.name || purchase.vehicle?.variant?.name,
    ].filter(Boolean).join(' · ')).filter(Boolean);
    const purchaseBalance = customerPurchases.reduce((total, purchase) => total + asNumber(purchase.balanceAmount), 0);

    return {
      id: customer._id,
      customerId: customer._id,
      customer: customerName(customer),
      customer_code: customer.customerCode || '',
      company: customer.companyName || '',
      email: customer.email || '',
      phone: customer.phone || '',
      customer_type: customer.customerType || '',
      city: customer.city || '',
      status: customer.isActive === false ? 'inactive' : (customer.status || 'active'),
      registered_at: customer.createdAt,
      purchase_count: customerPurchases.length,
      purchase_orders: customerPurchases.map((purchase) => purchase.orderNumber).filter(Boolean).join(', '),
      purchase_statuses: [...new Set(customerPurchases.map((purchase) => purchase.status).filter(Boolean))].join(', '),
      purchase_types: [...new Set(customerPurchases.map((purchase) => purchase.saleType).filter(Boolean))].join(', '),
      purchased_vehicles: [...new Set(vehicleLabels)].join(', '),
      last_purchase_date: customerPurchases[0]?.orderDate || null,
      total_purchased: customerPurchases.reduce((total, purchase) => total + asNumber(purchase.totalAmount), 0),
      total_paid: customerPurchases.reduce((total, purchase) => total + asNumber(purchase.paidAmount), 0),
      outstanding: invoiceTotals.count ? invoiceTotals.outstanding : purchaseBalance,
      overdue_amount: invoiceTotals.overdue,
      invoice_count: invoiceTotals.count,
    };
  });
};

const getCustomerPurchases = async (req, res, next) => {
  try {
    const purchaseFilter = {
      customer: { $ne: null },
      status: { $ne: 'cancelled' },
      ...dateRange(req.query, 'orderDate'),
    };
    const invoiceFilter = {
      customer: { $ne: null },
      status: { $ne: 'cancelled' },
      ...dateRange(req.query, 'invoiceDate'),
    };
    const [customers, purchases, invoices] = await Promise.all([
      Customer.find({ deletedAt: null })
        .select('customerCode firstName lastName companyName email phone customerType city status isActive createdAt')
        .sort({ createdAt: -1 }).limit(5000).lean(),
      SalesOrder.find(purchaseFilter)
        .select('customer orderNumber orderDate status saleType totalAmount paidAmount balanceAmount vehicle vehicleMake vehicleModel vehicleVariant')
        .populate('vehicle', 'vehicleCode registrationNumber chassisNumber make model variant')
        .populate('vehicleMake', 'name')
        .populate('vehicleModel', 'name')
        .populate('vehicleVariant', 'name')
        .sort({ orderDate: -1, createdAt: -1 }).limit(5000).lean(),
      Invoice.find(invoiceFilter)
        .select('customer invoiceNumber invoiceDate dueDate totalAmount paidAmount balanceAmount')
        .limit(5000).lean(),
    ]);

    send(res, buildCustomerPurchaseRows(customers, purchases, invoices));
  } catch (error) { next(error); }
};

const getLeadStatistics = async (req, res, next) => {
  try {
    const filter = { isActive: { $ne: false }, deletedAt: null, ...dateRange(req.query, 'createdAt') };
    const leads = await Lead.find(filter)
      .populate('source', 'name')
      .populate('type', 'name')
      .populate('priority', 'name')
      .populate('assignedTo', 'firstName lastName email')
      .populate('convertedCustomerId', 'customerCode firstName lastName email')
      .sort({ createdAt: -1 }).limit(5000).lean();
    send(res, rows(leads, (lead) => ({
      id: lead._id, reference: lead.leadNo, date: lead.leadDate || lead.createdAt,
      created_at: lead.createdAt, updated_at: lead.updatedAt,
      customer: lead.customerName, customer_type: lead.customerType, company: lead.companyName || '',
      email: lead.email || '', phone: lead.phone || '', alternate_phone: lead.alternatePhone || '',
      city: lead.city || '', state: lead.state || '', country: lead.country || '',
      status: lead.status || 'new', source: lead.source?.name || '', type: lead.type?.name || '', priority: lead.priority?.name || '',
      assigned_to: lead.assignedTo ? `${lead.assignedTo.firstName || ''} ${lead.assignedTo.lastName || ''}`.trim() || lead.assignedTo.email : '',
      converted: !!lead.convertedToCustomer,
      converted_customer: lead.convertedCustomerId ? `${lead.convertedCustomerId.customerCode || ''} ${lead.convertedCustomerId.firstName || ''} ${lead.convertedCustomerId.lastName || ''}`.trim() : '',
      expected_close_date: lead.expectedCloseDate, next_follow_up: lead.nextFollowUpAt,
      lost_reason: lead.lostReason || '', converted_at: lead.convertedAt,
      amount: asNumber(lead.leadValue), probability: asNumber(lead.probability),
      notes: (lead.notes || []).map((note) => note.content).join('; '),
    })));
  } catch (error) { next(error); }
};

const getServiceAnalytics = async (req, res, next) => {
  try {
    const filter = { ...dateRange(req.query, 'createdAt') };
    const cards = await JobCard.find(filter)
      .populate('customer', 'firstName lastName companyName email phone customerCode')
      .populate('vehicle', 'vehicleCode registrationNumber make model')
      .populate('warrantyType', 'name durationMonths')
      .populate('servicePackage', 'packageName price')
      .populate('serviceAdvisor', 'firstName lastName email')
      .populate('technician', 'firstName lastName email')
      .populate('services.laborRate', 'name rate')
      .populate('services.serviceType', 'name')
      .sort({ createdAt: -1 }).limit(5000).lean();
    send(res, rows(cards, (card) => ({
      id: card._id, reference: card.jobCardNumber, date: card.createdAt, created_at: card.createdAt, updated_at: card.updatedAt,
      customer: customerName(card.customer), customer_code: card.customer?.customerCode || '', customer_email: card.customer?.email || '', customer_phone: card.customer?.phone || '',
      vehicle: joinLabels(
        card.customerVehicle?.number || card.vehicle?.vehicleCode || card.vehicle?.registrationNumber,
        card.customerVehicle?.make || card.vehicle?.make,
        card.customerVehicle?.model || card.vehicle?.model,
      ),
      services: (card.services || []).map((service) => labelOf(service.serviceType) || service.description).filter(Boolean).join(', '),
      status: card.status || 'open', service_package: card.servicePackage?.packageName || '', warranty_type: card.warrantyType?.name || '',
      service_advisor: userName(card.serviceAdvisor),
      technician: userName(card.technician),
      labor_rates: (card.services || []).map((service) => service.laborRate?.name).filter(Boolean).join(', '),
      labor_total: asNumber(card.laborTotal), parts_total: asNumber(card.partsTotal), discount: asNumber(card.discount),
      tax_amount: asNumber(card.taxAmount), amount: asNumber(card.totalAmount || card.grandTotal), revenue: asNumber(card.totalAmount || card.grandTotal),
      grand_total: asNumber(card.grandTotal), invoice_id: card.invoice || null, promised_date: card.promisedDate || null,
      completed_at: card.completedAt || null, delivered_at: card.deliveredAt || null,
    })));
  } catch (error) { next(error); }
};
const getServiceKpiDetail = getServiceAnalytics;

// Job cards only exist once a vehicle is actually in the workshop, so a dealership
// that books work ahead has appointments and no job cards. The service report has
// to read both or it looks empty while the Services module is full.
const getServiceAppointments = async (req, res, next) => {
  try {
    const filter = { ...dateRange(req.query, 'appointmentDate') };
    const appointments = await ServiceAppointment.find(filter)
      .populate('customer', 'firstName lastName companyName email phone customerCode')
      .populate('vehicle', 'vehicleCode registrationNumber make model')
      .populate('serviceTypeRef', 'name')
      .populate('serviceAdvisor', 'firstName lastName email')
      .sort({ appointmentDate: -1, createdAt: -1 }).limit(5000).lean();
    send(res, rows(appointments, (appointment) => ({
      id: appointment._id, reference: appointment.appointmentNumber,
      date: appointment.appointmentDate || appointment.createdAt, time: appointment.appointmentTime || '',
      customer: customerName(appointment.customer), customer_code: appointment.customer?.customerCode || '',
      customer_phone: appointment.customer?.phone || '',
      vehicle: joinLabels(
        appointment.customerVehicle?.number || appointment.vehicle?.vehicleCode || appointment.vehicle?.registrationNumber,
        appointment.customerVehicle?.make || appointment.vehicle?.make,
        appointment.customerVehicle?.model || appointment.vehicle?.model,
      ),
      service_type: labelOf(appointment.serviceTypeRef) || labelOf(appointment.serviceType),
      service_advisor: userName(appointment.serviceAdvisor),
      status: appointment.status || 'scheduled',
      estimated_duration: asNumber(appointment.estimatedDuration),
      amount: asNumber(appointment.serviceType?.basePrice),
      concerns: appointment.customerConcerns || '',
      created_at: appointment.createdAt,
    })));
  } catch (error) { next(error); }
};

// Parts are only half of a dealership's stock — the vehicle yard is the other half,
// and the inventory report is the only place it is reported on.
const getVehicleStock = async (req, res, next) => {
  try {
    const filter = { isActive: { $ne: false }, ...dateRange(req.query, 'createdAt') };
    const vehicles = await Vehicle.find(filter).sort({ createdAt: -1 }).limit(5000).lean();
    send(res, rows(vehicles, (vehicle) => ({
      id: vehicle._id, reference: vehicle.vehicleCode,
      chassis_number: vehicle.chassisNumber || vehicle.vin || '', engine_number: vehicle.engineNumber || '',
      registration: vehicle.registrationNumber || '',
      make: labelOf(vehicle.make), model: labelOf(vehicle.model), variant: labelOf(vehicle.variant),
      color: labelOf(vehicle.color), year: vehicle.year || '',
      warehouse: labelOf(vehicle.warehouse) || vehicle.location || '',
      status: vehicle.status || '', condition: vehicle.conditionType || '',
      stock_out: vehicle.isStockOut === true,
      purchase_price: asNumber(vehicle.purchasePrice), sale_price: asNumber(vehicle.salePrice),
      stockValue: asNumber(vehicle.purchasePrice),
      arrival_date: vehicle.arrivalDate || null,
      dispatch_number: vehicle.dispatch?.dispatchNo || '', dispatch_date: vehicle.dispatch?.dispatchDate || null,
      date: vehicle.createdAt,
    })));
  } catch (error) { next(error); }
};

const getLowStockParts = async (_req, res, next) => {
  try {
    const parts = await Part.find({ isActive: { $ne: false }, $expr: { $lte: [{ $ifNull: ['$currentStock', '$quantity'] }, { $ifNull: ['$reorderLevel', '$minStock'] }] } }).sort({ currentStock: 1 }).limit(2000).lean();
    send(res, rows(parts, (part) => ({ id: part._id, reference: part.partCode || part.sku, name: part.name, stock: asNumber(part.currentStock ?? part.quantity), minimum: asNumber(part.reorderLevel ?? part.minStock), warehouse: part.warehouse?.name || '' })));
  } catch (error) { next(error); }
};

const getExpenseReport = async (req, res, next) => {
  try {
    const expenses = await Expense.find({ isDeleted: { $ne: true }, ...dateRange(req.query, 'expenseDate') })
      .populate('employee', 'firstName lastName employeeCode')
      .sort({ expenseDate: -1, createdAt: -1 }).limit(5000).lean();
    send(res, rows(expenses, (item) => ({
      id: item._id, reference: item.expenseNumber, date: item.expenseDate || item.createdAt,
      category: labelOf(item.category), description: item.description,
      vendor: item.vendor || '', account: item.account || '', employee: userName(item.employee),
      status: item.status, amount: asNumber(item.amount), created_at: item.createdAt,
    })));
  } catch (error) { next(error); }
};

const getPaymentReport = async (req, res, next) => {
  try {
    const payments = await Payment.find({ ...dateRange(req.query, 'paymentDate') })
      .populate('customer', 'firstName lastName companyName phone customerCode')
      .populate('methodRef', 'name')
      .populate('invoice', 'invoiceNumber')
      .sort({ paymentDate: -1, createdAt: -1 }).limit(5000).lean();
    send(res, rows(payments, (item) => ({
      id: item._id, reference: item.paymentNumber, date: item.paymentDate || item.createdAt,
      customer: customerName(item.customer), customer_code: item.customer?.customerCode || '', phone: item.customer?.phone || '',
      invoice: item.invoice?.invoiceNumber || '',
      // Imported payments carry only the ref; UI-entered ones carry the snapshot.
      method: labelOf(item.method) || labelOf(item.methodRef) || item.paymentMode || '',
      reference_number: item.referenceNumber || '', installment: item.installmentNo ?? '',
      status: item.status || 'posted', amount: asNumber(item.amount),
    })));
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
  getCustomerPurchases, getLeadStatistics, getServiceAnalytics, getServiceKpiDetail, getLowStockParts, buildCustomerPurchaseRows,
  getServiceAppointments, getVehicleStock, getExpenseReport, getPaymentReport, getEmployeeReport,
};
