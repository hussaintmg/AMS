const crypto = require('crypto');
const xlsx = require('xlsx');
const logger = require('../utils/logger');
const { normalizePhone } = require('../utils/phone.util');
const Lead = require('../models/Lead.model');
const Customer = require('../models/Customer.model');
const Vehicle = require('../models/Vehicle.model');
const SalesOrder = require('../models/SalesOrder.model');
const FileUpload = require('../models/FileUpload.model');

const text = (value) => value == null ? '' : String(value).trim();
const money = (value) => Number(String(value ?? '').replace(/[^0-9.-]/g, '')) || 0;
const token = (prefix) => `${prefix}-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

function splitName(fullName) {
  const parts = text(fullName).split(/\s+/).filter(Boolean);
  return { firstName: parts.shift() || 'Unknown', lastName: parts.join(' ') };
}

function parseDate(value) {
  if (!value) return new Date();
  if (typeof value === 'number') {
    const parsed = xlsx.SSF.parse_date_code(value);
    if (parsed) return new Date(parsed.y, parsed.m - 1, parsed.d);
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function normalizeObject(row) {
  const lower = Object.fromEntries(Object.entries(row).map(([key, value]) => [key.trim().toLowerCase(), value]));
  const get = (...keys) => keys.map((key) => lower[key.toLowerCase()]).find((value) => value !== undefined && value !== '');
  return {
    orderNo: text(get('Order No.', 'Order No', 'Order Number')),
    orderDate: get('Order Date', 'Date'), applicant: text(get('Customer Name', 'Applicant', 'Customer')),
    phone: text(get('Mobile', 'Phone', 'Mobile No')), alternatePhone: text(get('Landline No.', 'Alternate Phone')),
    email: text(get('Email')), address: text(get('Address')), city: text(get('City')),
    customerType: text(get('Client Category', 'Customer Type')), variant: text(get('Vehicle', 'Variant', 'Model')),
    year: Number(get('Model Year', 'Year')) || new Date().getFullYear(), color: text(get('Color')),
    vin: text(get('Chassis No.', 'VIN', 'Chassis Number')), engineNo: text(get('Engine No.', 'Engine Number')),
    price: money(get('MSRP', 'Ex-Factory', 'Vehicle Price')), tax: money(get('Advance Tax', 'Tax Amount')),
    freight: money(get('Freight Charges', 'Other Charges')), discount: money(get('Discount')),
    total: money(get('Total Receivable', 'Grand Total', 'Total Amount')), paid: money(get('Total Amount Received', 'Paid Amount')),
    bank: text(get('Financing Bank', 'Finance Company')), refNo: text(get('PBO No.', 'Reference No.')),
    delivery: text(get('Delivery Month', 'Delivery Date')), orderType: text(get('Order Type', 'Type'))
  };
}

function normalizeLegacyRow(row) {
  return {
    orderNo: text(row[1]), orderDate: row[2], refNo: text(row[3]), applicant: text(row[11]),
    customerType: text(row[14]), bank: text(row[15]), phone: text(row[18]), alternatePhone: text(row[19]),
    email: text(row[20]), address: text(row[21]), city: text(row[22]), variant: text(row[24]),
    year: Number(row[25]) || new Date().getFullYear(), color: text(row[26]), delivery: text(row[27]),
    vin: text(row[28]), engineNo: text(row[29]), price: money(row[36] || row[31]), tax: money(row[32]),
    freight: money(row[33]), discount: money(row[35]), total: money(row[38]), paid: money(row[73]), orderType: text(row[79])
  };
}

function parseRecords(file) {
  const workbook = xlsx.read(file.buffer, { type: 'buffer', cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const objects = xlsx.utils.sheet_to_json(sheet, { defval: '' });
  let records = objects.map(normalizeObject).filter((row) => row.orderNo);
  if (!records.length) {
    const rows = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    records = rows.slice(2).map(normalizeLegacyRow).filter((row) => row.orderNo);
  }
  return records;
}

exports.uploadOrderForm = async (req, res, next) => {
  let uploadLog;
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'Please select an XLSX or CSV file.' });
    const records = parseRecords(req.file);
    if (!records.length) return res.status(400).json({ success: false, message: 'No valid rows found. An Order No. column is required.' });
    const userId = req.user?.id || req.user?._id || null;
    const validateOnly = String(req.query.validateOnly || req.body?.validateOnly || '').toLowerCase() === 'true';
    if (validateOnly) return res.json({ success: true, message: `${records.length} valid rows found.`, data: { totalProcessed: records.length, validateOnly: true } });

    uploadLog = await FileUpload.create({ fileName: token('ORDER-UPLOAD'), originalName: req.file.originalname, mimeType: req.file.mimetype, size: req.file.size, module: 'order-form', status: 'processing', uploadedBy: userId });
    const result = { uploadId: uploadLog.id, totalProcessed: records.length, insertedLeads: 0, insertedVehicles: 0, insertedSalesOrders: 0, skippedOrders: 0, failedRows: [] };

    for (const [index, row] of records.entries()) {
      try {
        if (await SalesOrder.exists({ orderNumber: row.orderNo })) { result.skippedOrders += 1; continue; }
        const phone = row.phone ? normalizePhone(row.phone) : '';
        let lead = phone ? await Lead.findOne({ phone, deletedAt: null }) : null;
        if (!lead) {
          lead = await Lead.create({ leadNo: token('LEAD'), customerName: row.applicant || 'Unknown Customer', phone, alternatePhone: row.alternatePhone, email: row.email, address: row.address, city: row.city, customerType: row.customerType.toLowerCase() === 'corporate' ? 'corporate' : 'individual', status: 'new', description: `Imported from order form ${req.file.originalname}`, createdBy: userId });
          result.insertedLeads += 1;
        }
        let customer = phone ? await Customer.findOne({ phone, deletedAt: null }) : null;
        if (!customer) {
          const name = splitName(row.applicant);
          customer = await Customer.create({ customerCode: token('CUS'), ...name, phone, alternatePhone: row.alternatePhone, email: row.email, address: row.address, city: row.city, customerType: row.customerType.toLowerCase() === 'corporate' ? 'corporate' : 'individual', leadRef: lead._id, createdBy: userId });
        }
        const vin = row.vin || token('UPL-VIN');
        let vehicle = await Vehicle.findOne({ $or: [{ vin }, { chassisNumber: vin }] });
        if (!vehicle) {
          vehicle = await Vehicle.create({ vehicleCode: token('VEH'), vin, chassisNumber: vin, engineNumber: row.engineNo || token('ENG'), model: { name: row.variant, yearFrom: row.year, yearTo: row.year }, variant: { name: row.variant, price: row.price }, color: { name: row.color }, year: row.year, purchasePrice: row.price, salePrice: row.price, status: 'at_yard', conditionType: 'new', location: 'Main Yard', notes: `Imported from ${req.file.originalname}`, createdBy: userId });
          result.insertedVehicles += 1;
        }
        const subtotal = row.price || row.total;
        const totalAmount = row.total || (subtotal + row.tax + row.freight - row.discount);
        await SalesOrder.create({ orderNumber: row.orderNo, customer: customer._id, vehicle: vehicle._id, status: 'confirmed', subtotal, taxAmount: row.tax, discountAmount: row.discount, otherCharges: row.freight, totalAmount, paidAmount: row.paid, balanceAmount: Math.max(0, totalAmount - row.paid), paymentMode: row.bank ? 'bank_finance' : 'cash', financeCompany: row.bank, orderDate: parseDate(row.orderDate), notes: `PBO: ${row.refNo || 'N/A'} | Type: ${row.orderType || 'N/A'} | Delivery: ${row.delivery || 'N/A'} | Imported from ${req.file.originalname}`, createdBy: userId });
        result.insertedSalesOrders += 1;
      } catch (error) {
        result.failedRows.push({ row: index + 2, orderNo: row.orderNo, message: error.message });
      }
    }
    uploadLog.status = result.failedRows.length ? 'completed_with_errors' : 'completed';
    uploadLog.notes = JSON.stringify(result);
    await uploadLog.save();
    return res.json({ success: true, message: `Processed ${records.length} rows and created ${result.insertedSalesOrders} sales orders.`, data: result });
  } catch (error) {
    if (uploadLog) await FileUpload.updateOne({ _id: uploadLog._id }, { status: 'failed', notes: error.message }).catch(() => {});
    logger.error('Order form upload failed', error);
    next(error);
  }
};
