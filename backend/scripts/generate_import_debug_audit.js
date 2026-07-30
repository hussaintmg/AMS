const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

require('dotenv').config({ path: path.resolve(__dirname, '../../.env'), override: false });

const { connectMongo, disconnectMongo } = require('../config/mongodb');
const Customer = require('../models/Customer.model');
const Vehicle = require('../models/Vehicle.model');
const Booking = require('../models/Booking.model');
const SalesOrder = require('../models/SalesOrder.model');
const Invoice = require('../models/Invoice.model');
const Payment = require('../models/Payment.model');
const Employee = require('../models/Employee.model');
const User = require('../models/User.model');
const FileUpload = require('../models/FileUpload.model');
const {
  detectFileType,
  parseSpreadsheet,
} = require('../services/imports/spreadsheetMapper');
const { previewBatch } = require('../services/imports/importEngine');
const { ImportDebugAudit } = require('../services/imports/importDebugAudit');

const logicalTypes = ['orderIntake', 'orderSales', 'dispatch'];
const defaultDirectory = path.resolve(__dirname, '../../frontend/public/samples/OneDrive_1_27-07-2026');
const defaults = {
  orderIntake: path.join(defaultDirectory, 'A. order intake report. Order Form Report   DEALER PRO.xlsx'),
  orderSales: path.join(defaultDirectory, 'A. orders sales report. Orders Report   DEALER PRO.xlsx'),
  dispatch: path.join(defaultDirectory, 'A. dispatch report. Dispatch  DEALER PRO.xlsx'),
};

function selectedPaths(argv) {
  const supplied = argv.slice(2);
  if (!supplied.length) return defaults;
  if (supplied.length !== logicalTypes.length) {
    throw new Error('Pass exactly three paths in Order Intake, Order Sales, Dispatch order, or pass no paths for canonical samples.');
  }
  return Object.fromEntries(logicalTypes.map((logicalType, index) => [logicalType, path.resolve(supplied[index])]));
}

function uploadFile(filePath) {
  const buffer = fs.readFileSync(filePath);
  return {
    originalname: path.basename(filePath),
    mimetype: path.extname(filePath).toLowerCase() === '.csv'
      ? 'text/csv'
      : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    size: buffer.length,
    buffer,
  };
}

async function businessCounts() {
  const models = {
    customers: Customer,
    vehicles: Vehicle,
    bookings: Booking,
    salesOrders: SalesOrder,
    invoices: Invoice,
    payments: Payment,
    employees: Employee,
    users: User,
    fileUploads: FileUpload,
  };
  const entries = await Promise.all(Object.entries(models).map(async ([name, Model]) => [name, await Model.countDocuments({})]));
  return Object.fromEntries(entries);
}

async function databaseIntegrity() {
  const [
    customers,
    vehicles,
    bookings,
    salesOrders,
    invoices,
    payments,
    users,
    employees,
  ] = await Promise.all([
    Customer.find({}).select('_id customerCode customerType firstName lastName companyName cnic ntn email phone importIdentityKey').lean(),
    Vehicle.find({}).select('_id vehicleCode chassisNumber vin engineNumber make model variant color year status isStockOut stockOutDate importIdentityKey').lean(),
    Booking.find({}).select('_id customer vehicle seller sellerEmployee status').lean(),
    SalesOrder.find({}).select('_id customer vehicle booking invoice seller sellerEmployee salePerson status').lean(),
    Invoice.find({}).select('_id invoiceNumber externalInvoiceNumber salesOrder customer seller sellerEmployee status totalAmount paidAmount balanceAmount').lean(),
    Payment.find({}).select('_id invoice customer amount paymentDate method referenceNumber importKey status').lean(),
    User.find({}).select('_id').lean(),
    Employee.find({}).select('_id').lean(),
  ]);
  const idSet = (documents) => new Set(documents.map((document) => String(document._id)));
  const customerIds = idSet(customers);
  const vehicleIds = idSet(vehicles);
  const bookingIds = idSet(bookings);
  const salesOrderIds = idSet(salesOrders);
  const invoiceIds = idSet(invoices);
  const userIds = idSet(users);
  const employeeIds = idSet(employees);
  const numericOnly = (value) => /^\d+(?:\.\d+)?$/.test(String(value || ''));
  const distribution = (documents, valueFor) => Object.fromEntries(
    [...documents.reduce((counts, document) => {
      const value = String(valueFor(document) || '(blank)');
      counts.set(value, (counts.get(value) || 0) + 1);
      return counts;
    }, new Map()).entries()].sort((left, right) => right[1] - left[1]),
  );
  const referenceAudit = (documents, field, validIds) => ({
    null: documents.filter((document) => !document[field]).length,
    orphan: documents.filter((document) => document[field] && !validIds.has(String(document[field]))).length,
    valid: documents.filter((document) => document[field] && validIds.has(String(document[field]))).length,
  });
  const invalidVehicles = vehicles.filter((vehicle) => (
    numericOnly(vehicle.chassisNumber || vehicle.vin)
    || !vehicle.make?.name
    || !vehicle.model?.name
    || !vehicle.variant?.name
    || !vehicle.color?.name
  ));
  const salesOrderById = new Map(salesOrders.map((salesOrder) => [String(salesOrder._id), salesOrder]));
  const paymentsByInvoice = payments.reduce((byInvoice, payment) => {
    const key = String(payment.invoice || '');
    const entries = byInvoice.get(key) || [];
    entries.push(payment);
    byInvoice.set(key, entries);
    return byInvoice;
  }, new Map());
  const invoiceFinancialReconciliation = invoices.map((invoice) => {
    const transactions = paymentsByInvoice.get(String(invoice._id)) || [];
    const transactionSum = transactions.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
    const total = Number(invoice.totalAmount || 0);
    const paid = Number(invoice.paidAmount || 0);
    const balance = Number(invoice.balanceAmount || 0);
    const order = invoice.salesOrder ? salesOrderById.get(String(invoice.salesOrder)) || null : null;
    return {
      invoiceId: String(invoice._id),
      internalInvoiceNumber: invoice.invoiceNumber || '',
      sourceInvoiceNumber: invoice.externalInvoiceNumber || '',
      salesOrderId: invoice.salesOrder ? String(invoice.salesOrder) : null,
      salesOrderInvoiceBacklink: order?.invoice ? String(order.invoice) : null,
      salesOrderInvoiceBacklinkMatches: Boolean(order?.invoice && String(order.invoice) === String(invoice._id)),
      customerId: invoice.customer ? String(invoice.customer) : null,
      customerDocumentExists: Boolean(invoice.customer && customerIds.has(String(invoice.customer))),
      total,
      invoicePaidAmount: paid,
      paymentTransactionIds: transactions.map((payment) => String(payment._id)),
      paymentTransactionSum: transactionSum,
      paidAmountMatchesPaymentLedger: paid === transactionSum,
      invoiceBalanceAmount: balance,
      expectedBalanceFromLedger: Math.max(0, total - transactionSum),
      balanceMatchesPaymentLedger: balance === Math.max(0, total - transactionSum),
      status: invoice.status || '',
    };
  });
  const duplicatePaymentImportKeys = Object.entries(distribution(
    payments.filter((payment) => payment.importKey),
    (payment) => payment.importKey,
  )).filter(([, count]) => count > 1).map(([importKey, count]) => ({ importKey, count }));

  return {
    counts: {
      customers: customers.length,
      vehicles: vehicles.length,
      bookings: bookings.length,
      salesOrders: salesOrders.length,
      invoices: invoices.length,
      payments: payments.length,
      users: users.length,
      employees: employees.length,
    },
    customerIdentity: {
      customerTypes: distribution(customers, (customer) => customer.customerType),
      customers: customers.map((customer) => ({
        customerId: String(customer._id),
        customerCode: customer.customerCode || '',
        customerType: customer.customerType || '',
        displayName: customer.companyName || [customer.firstName, customer.lastName].filter(Boolean).join(' '),
        cnic: customer.cnic || '',
        ntn: customer.ntn || '',
        email: customer.email || '',
        phone: customer.phone || '',
        importIdentityKey: customer.importIdentityKey || '',
      })),
    },
    vehicleIdentity: {
      numericChassisOrVin: vehicles.filter((vehicle) => numericOnly(vehicle.chassisNumber || vehicle.vin)).length,
      proper17CharacterChassisOrVin: vehicles.filter(
        (vehicle) => /^[A-Z0-9]{17}$/i.test(String(vehicle.chassisNumber || vehicle.vin || '')),
      ).length,
      numericEngineNumber: vehicles.filter((vehicle) => numericOnly(vehicle.engineNumber)).length,
      missingMakeName: vehicles.filter((vehicle) => !vehicle.make?.name).length,
      missingModelName: vehicles.filter((vehicle) => !vehicle.model?.name).length,
      missingVariantName: vehicles.filter((vehicle) => !vehicle.variant?.name).length,
      missingColorName: vehicles.filter((vehicle) => !vehicle.color?.name).length,
      statuses: distribution(vehicles, (vehicle) => vehicle.status),
      invalidExamples: invalidVehicles.slice(0, 10).map((vehicle) => ({
        vehicleId: String(vehicle._id),
        vehicleCode: vehicle.vehicleCode || '',
        chassisNumber: vehicle.chassisNumber || vehicle.vin || '',
        engineNumber: vehicle.engineNumber || '',
        make: vehicle.make?.name || '',
        model: vehicle.model?.name || '',
        variant: vehicle.variant?.name || '',
        color: vehicle.color?.name || '',
        year: vehicle.year || null,
        status: vehicle.status || '',
      })),
    },
    bookingReferences: {
      customer: referenceAudit(bookings, 'customer', customerIds),
      vehicle: referenceAudit(bookings, 'vehicle', vehicleIds),
      sellerUser: referenceAudit(bookings, 'seller', userIds),
      sellerEmployee: referenceAudit(bookings, 'sellerEmployee', employeeIds),
      statuses: distribution(bookings, (booking) => booking.status),
    },
    salesOrderReferences: {
      customer: referenceAudit(salesOrders, 'customer', customerIds),
      vehicle: referenceAudit(salesOrders, 'vehicle', vehicleIds),
      booking: referenceAudit(salesOrders, 'booking', bookingIds),
      invoice: referenceAudit(salesOrders, 'invoice', invoiceIds),
      sellerUser: referenceAudit(salesOrders, 'seller', userIds),
      sellerEmployee: referenceAudit(salesOrders, 'sellerEmployee', employeeIds),
      statuses: distribution(salesOrders, (salesOrder) => salesOrder.status),
      sellerText: distribution(salesOrders, (salesOrder) => salesOrder.salePerson),
    },
    invoiceReferences: {
      salesOrder: referenceAudit(invoices, 'salesOrder', salesOrderIds),
      customer: referenceAudit(invoices, 'customer', customerIds),
      sellerUser: referenceAudit(invoices, 'seller', userIds),
      sellerEmployee: referenceAudit(invoices, 'sellerEmployee', employeeIds),
      statuses: distribution(invoices, (invoice) => invoice.status),
      salesOrderInvoiceBacklinkMissing: invoiceFinancialReconciliation.filter(
        (invoice) => !invoice.salesOrderInvoiceBacklinkMatches,
      ).length,
      paidAmountLedgerMismatch: invoiceFinancialReconciliation.filter(
        (invoice) => !invoice.paidAmountMatchesPaymentLedger,
      ).length,
      balanceLedgerMismatch: invoiceFinancialReconciliation.filter(
        (invoice) => !invoice.balanceMatchesPaymentLedger,
      ).length,
      financialReconciliation: invoiceFinancialReconciliation,
    },
    paymentReferences: {
      invoice: referenceAudit(payments, 'invoice', invoiceIds),
      customer: referenceAudit(payments, 'customer', customerIds),
      statuses: distribution(payments, (payment) => payment.status),
      totalAmount: payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0),
      duplicateImportKeys: duplicatePaymentImportKeys,
    },
  };
}

async function main() {
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI is required for the read-only relationship audit.');
  const paths = selectedPaths(process.argv);
  Object.entries(paths).forEach(([logicalType, filePath]) => {
    if (!fs.existsSync(filePath)) throw new Error(`${logicalType} workbook not found: ${filePath}`);
  });

  await connectMongo();
  const batchId = crypto.randomUUID();
  const audit = new ImportDebugAudit({
    batchId,
    mode: 'read_only_preview',
    outputDirectory: process.env.IMPORT_DEBUG_AUDIT_DIR || null,
  });

  try {
    const countsBefore = await businessCounts();
    const parsedFiles = await audit.run(async () => Object.entries(paths).map(([logicalType, filePath]) => {
      const file = uploadFile(filePath);
      const detected = detectFileType(file);
      if (!detected) throw new Error(`Could not detect source type for ${file.originalname}.`);
      if (detected.logicalType !== logicalType) {
        throw new Error(`${file.originalname} detected as ${detected.logicalType}, expected ${logicalType}.`);
      }
      const parsed = parseSpreadsheet(file, logicalType);
      audit.file({
        uploadedFilename: parsed.fileName,
        assignedSourceType: logicalType,
        detectedSourceType: detected.logicalType,
        mimeType: parsed.mimeType,
        size: parsed.size,
        fileHash: parsed.checksum,
        sheetNames: parsed.sheetNames,
        sheets: parsed.mappingReport.map((mapping) => ({
          sheetName: mapping.sheetName,
          headerRow: mapping.headerRow,
          detectedHeaders: mapping.columns.map((column) => column.sourceHeader),
          mappedHeaders: mapping.columns,
          numberOfRows: parsed.records.filter((record) => record._meta.sheetName === mapping.sheetName).length,
        })),
        numberOfRows: parsed.records.length,
      });
      return parsed;
    }));

    const preview = await previewBatch(parsedFiles, { audit });
    const countsAfter = await businessCounts();
    const integrity = await databaseIntegrity();
    const changedCollections = Object.keys(countsBefore).filter((name) => countsBefore[name] !== countsAfter[name]);
    if (changedCollections.length) {
      audit.event('read_only_guard.failed', {
        countsBefore,
        countsAfter,
        changedCollections,
        exactReason: 'A collection count changed during the read-only preview audit.',
      }, { level: 'error' });
      throw new Error(`Read-only audit guard failed: collection counts changed for ${changedCollections.join(', ')}.`);
    }
    audit.event('read_only_guard.passed', {
      countsBefore,
      countsAfter,
      changedCollections: [],
      databaseWritesObserved: false,
    });
    audit.event('database.integrity.snapshot', { databaseIntegrity: integrity });
    const auditFile = await audit.finalize('preview_ready', {
      database: process.env.MONGO_DB_NAME || null,
      databaseIntegrity: integrity,
      totals: preview.totals,
      entityTotals: preview.entities,
      countsBefore,
      countsAfter,
      changedCollections: [],
      databaseWritesObserved: false,
    });
    process.stdout.write(`${JSON.stringify({
      success: true,
      mode: 'read_only_preview',
      database: process.env.MONGO_DB_NAME || null,
      auditFile,
      totals: preview.totals,
      databaseIntegrity: integrity,
      countsBefore,
      countsAfter,
    }, null, 2)}\n`);
  } catch (error) {
    audit.event('audit.run.failed', {
      exactReason: error.message,
      errorName: error.name,
      errorCode: error.code || null,
    }, { level: 'error' });
    const auditFile = await audit.finalize('failed', { fatalError: error.message });
    error.auditFile = auditFile;
    throw error;
  } finally {
    await disconnectMongo();
  }
}

main().catch((error) => {
  process.stderr.write(`${JSON.stringify({ success: false, message: error.message, auditFile: error.auditFile || null })}\n`);
  process.exitCode = 1;
});
