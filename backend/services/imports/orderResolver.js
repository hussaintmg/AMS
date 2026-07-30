const SalesOrder = require('../../models/SalesOrder.model');
const Vehicle = require('../../models/Vehicle.model');
const Invoice = require('../../models/Invoice.model');
const { normalizeBusinessReference } = require('./valueNormalizer');

const clean = (value) => String(value == null ? '' : value).replace(/\s+/g, ' ').trim().toLowerCase();
const referenceKey = (value) => normalizeBusinessReference(value).toLowerCase();

function add(map, key, id) {
  const normalized = clean(key);
  if (!normalized || !id) return;
  const ids = map.get(normalized) || new Set();
  ids.add(String(id));
  map.set(normalized, ids);
}

class OrderIndex {
  constructor({ orders = [], vehicles = [], invoices = [] } = {}) {
    this.orders = new Map(orders.map((order) => [String(order._id), order]));
    this.vehicles = new Map(vehicles.map((vehicle) => [String(vehicle._id), vehicle]));
    this.invoices = new Map(invoices.map((invoice) => [String(invoice._id), invoice]));
    this.byField = {
      orderNumber: new Map(),
      externalOrderNumber: new Map(),
      pboNo: new Map(),
      invoiceNumber: new Map(),
      sapOrderNumber: new Map(),
      dispatchNumber: new Map(),
      chassisNumber: new Map(),
      engineNumber: new Map(),
    };
    orders.forEach((order) => this.addOrder(order));
    const orderIdsByVehicle = new Map();
    orders.forEach((order) => {
      if (order.vehicle) add(orderIdsByVehicle, order.vehicle, order._id);
    });
    vehicles.forEach((vehicle) => {
      const orderIds = orderIdsByVehicle.get(clean(vehicle._id)) || [];
      orderIds.forEach((orderId) => {
        add(this.byField.chassisNumber, vehicle.chassisNumber || vehicle.vin, orderId);
        add(this.byField.engineNumber, vehicle.engineNumber, orderId);
      });
    });
    invoices.forEach((invoice) => {
      if (!invoice.salesOrder) return;
      add(this.byField.invoiceNumber, invoice.invoiceNumber, invoice.salesOrder);
      add(this.byField.invoiceNumber, invoice.externalInvoiceNumber, invoice.salesOrder);
    });
  }

  static async load({ session = null } = {}) {
    let ordersQuery = SalesOrder.find({}).lean();
    let vehiclesQuery = Vehicle.find({}).select('_id chassisNumber vin engineNumber').lean();
    let invoicesQuery = Invoice.find({ status: { $ne: 'cancelled' } }).select('salesOrder invoiceNumber externalInvoiceNumber').lean();
    if (session) {
      ordersQuery = ordersQuery.session(session);
      vehiclesQuery = vehiclesQuery.session(session);
      invoicesQuery = invoicesQuery.session(session);
    }
    const [orders, vehicles, invoices] = await Promise.all([ordersQuery, vehiclesQuery, invoicesQuery]);
    return new OrderIndex({ orders, vehicles, invoices });
  }

  addOrder(order) {
    if (!order?._id) return;
    const id = String(order._id);
    this.orders.set(id, order);
    add(this.byField.orderNumber, order.orderNumber, id);
    add(this.byField.externalOrderNumber, order.externalOrderNumber, id);
    add(this.byField.pboNo, referenceKey(order.pboNo || order.bookingNo), id);
    add(this.byField.invoiceNumber, order.invoiceNo, id);
    add(this.byField.sapOrderNumber, order.sapOrderNo, id);
    add(this.byField.dispatchNumber, order.dispatchNo, id);
  }

  addVehicle(orderId, vehicle) {
    if (!orderId || !vehicle) return;
    add(this.byField.chassisNumber, vehicle.chassisNumber || vehicle.vin, orderId);
    add(this.byField.engineNumber, vehicle.engineNumber, orderId);
  }

  addInvoice(orderId, invoice) {
    if (!orderId || !invoice) return;
    add(this.byField.invoiceNumber, invoice.invoiceNumber, orderId);
    add(this.byField.invoiceNumber, invoice.externalInvoiceNumber, orderId);
  }

  resolve(data = {}) {
    const candidates = [
      ['orderNumber', data.orderNumber],
      ['externalOrderNumber', data.externalOrderNumber],
      ['pboNo', referenceKey(data.pboNo)],
      ['invoiceNumber', data.externalInvoiceNumber || data.invoiceNumber],
      ['sapOrderNumber', data.sapOrderNumber],
      ['dispatchNumber', data.dispatchNumber],
      ['chassisNumber', data.chassisNumber],
      ['engineNumber', data.engineNumber],
    ];
    let selectedId = null;
    let selectedBy = null;
    for (const [field, rawValue] of candidates) {
      const value = clean(rawValue);
      if (!value) continue;
      const ids = [...(this.byField[field].get(value) || [])];
      if (ids.length > 1) return { order: null, matchBy: field, ambiguous: true, count: ids.length };
      if (ids.length === 1) {
        if (selectedId && selectedId !== ids[0]) {
          return { order: null, matchBy: `${selectedBy}/${field}`, ambiguous: true, conflict: true, count: 2 };
        }
        selectedId = ids[0];
        selectedBy = field;
      }
    }
    return selectedId
      ? { order: this.orders.get(selectedId), matchBy: selectedBy }
      : { order: null, matchBy: null };
  }
}

async function findExistingOrder(data = {}) {
  const index = await OrderIndex.load();
  return index.resolve(data);
}

module.exports = { OrderIndex, findExistingOrder };
