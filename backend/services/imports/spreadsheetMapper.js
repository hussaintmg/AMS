const crypto = require('crypto');
const path = require('path');
const xlsx = require('xlsx');
const { debugEvent } = require('./importDebugAudit');

// A single Dealer Pro Orders Report already reaches ~6 MB for half a year of
// sales (174 columns per row), so the ceiling has room for a full-year export.
const MAX_FILE_SIZE = 25 * 1024 * 1024;
const FILE_TYPE_ORDER = ['orderIntake', 'orderSales', 'dispatch'];

const column = (key, aliases, entity, target, options = {}) => ({
  key,
  aliases,
  entity,
  target,
  ...options,
});

const VEHICLE_COLUMNS = [
  column('brandName', ['Brand', 'Brand Name', 'Vehicle Brand', 'Make', 'Make Name'], 'VehicleMake', '_id'),
  column('modelName', ['Model', 'Model Name', 'Vehicle Model'], 'VehicleModel', '_id'),
  column('variantName', ['Variant Name', 'Model Variant', 'Vehicle Variant'], 'VehicleVariant', '_id'),
];

const FILE_DEFINITIONS = {
  orderIntake: {
    fieldName: 'orderIntake',
    label: 'Order Intake',
    module: 'order-intake',
    permission: 'order_intake_upload',
    requiredHeaderGroups: [
      ['externalOrderNumber'],
      ['pboNo'],
      ['customerName'],
      ['vehicleDescription', 'variantName'],
      ['exFactoryPrice', 'msrp'],
    ],
    columns: [
      column('sequence', ['S #', 'S No', 'Sr No', 'Serial No', 'Serial Number'], null, null, { ignored: true }),
      column('externalOrderNumber', ['Order #', 'Order No', 'Order Number', 'OrderNo', 'Sales Order No'], 'SalesOrder', 'externalOrderNumber'),
      column('pboNo', ['Ref #', 'Ref No', 'Reference #', 'Reference No', 'PBO No', 'Booking No'], 'SalesOrder', 'pboNo'),
      column('orderDate', ['Date', 'Order Date', 'Intake Date'], 'SalesOrder', 'orderDate'),
      column('customerName', ['Applicant', 'Applicant Name', 'Customer', 'Customer Name', 'CustomerName', 'Customer_Name', 'Client Name'], 'Customer', '_id'),
      column('customerCode', ['Customer ID', 'Customer Code', 'Client ID', 'Client Code'], 'Customer', 'customerCode'),
      column('customerType', ['Client Category', 'Customer Type', 'Client Type'], 'Customer', 'customerType'),
      column('cnic', ['CNIC', 'National ID', 'National Identity Number'], 'Customer', 'cnic'),
      column('ntn', ['NTN', 'Tax Number', 'Tax ID'], 'Customer', 'ntn'),
      column('phone', ['Cell', 'Mobile', 'Mobile No', 'Phone', 'Phone Number', 'Contact No'], 'Customer', 'phone'),
      column('email', ['Email', 'Email Address', 'Customer Email'], 'Customer', 'email'),
      column('address', ['Address', 'Customer Address', 'Postal Address'], 'Customer', 'address'),
      column('city', ['City', 'Customer City'], 'Customer', 'city'),
      column('vehicleDescription', ['Variant', 'Vehicle', 'Brand Model Variant', 'Brand/Model/Variant', 'Vehicle Description'], 'VehicleVariant', '_id'),
      column('sellerName', ['Salesman', 'Sale Person', 'Sales Person', 'Salesperson', 'Seller'], 'User/Employee', '_id'),
      ...VEHICLE_COLUMNS,
      column('colorName', ['Color', 'Colour', 'Vehicle Color', 'Vehicle Colour'], 'VehicleColor', '_id'),
      column('intakeInstrumentNumber', ['Inst #', 'Instrument #', 'Instrument No'], null, null, { recognizedUnmapped: true, reason: 'The source label does not establish whether this is an invoice or payment instrument.' }),
      column('exFactoryPrice', ['Ex Factory Price', 'Ex-Factory Price', 'Ex Factory', 'Ex-Factory'], 'SalesOrder', 'subtotal'),
      column('freightCharges', ['Freight Charges', 'Freight', 'Delivery Charges'], 'SalesOrder', 'otherCharges'),
      column('msrp', ['MSRP', 'MRSP', 'Retail Price'], 'SalesOrder', 'totalAmount'),
      column('onBooking', ['On Booking', 'Booking Amount', 'Amount On Booking'], 'SalesOrder', 'paidAmount'),
      column('balancePayments', ['Balance Payments', 'Balance Payment', 'Subsequent Payments'], 'SalesOrder', 'paidAmount'),
      column('remainingBalance', ['Remaining Balance', 'Balance Amount', 'Outstanding Balance'], 'SalesOrder', 'balanceAmount'),
      column('orderCategory', ['Type', 'Order Type', 'Order Category'], 'SalesOrder', 'orderCategory'),
      column('financeCompany', ['Bank', 'Financing Bank', 'Finance Company'], 'SalesOrder', 'financeCompany'),
      column('deliveryMonth', ['Delivery Month', 'Expected Delivery', 'Delivery Date'], 'SalesOrder', 'deliveryDate'),
    ],
  },
  orderSales: {
    fieldName: 'orderSales',
    label: 'Order Sales',
    module: 'orders-sales',
    permission: 'orders_sales_upload',
    requiredHeaderGroups: [
      ['externalOrderNumber'],
      ['pboNo'],
      ['sellerName'],
      ['phone'],
      ['customerType'],
      ['customerName'],
      ['vehicleDescription', 'variantName'],
      ['chassisNumber', 'engineNumber'],
      ['totalReceivable', 'msrp', 'exFactoryPrice'],
    ],
    columns: [
      column('sequence', ['S #', 'S No', 'Sr No', 'Serial No', 'Serial Number'], null, null, { ignored: true }),
      column('externalOrderNumber', ['Order #', 'Order No', 'Order Number', 'OrderNo', 'Sales Order No'], 'SalesOrder', 'externalOrderNumber'),
      column('bookingDate', ['Booking Date', 'Order Date', 'Sales Date'], 'SalesOrder', 'bookingDate'),
      column('pboNo', ['Booking No', 'PBO No', 'Reference No', 'Ref No'], 'SalesOrder', 'pboNo'),
      column('externalInvoiceNumber', ['Invoice No', 'Invoice Number', 'Invoice #'], 'Invoice', 'externalInvoiceNumber'),
      column('invoiceDate', ['Invoice Date', 'Billing Date'], 'Invoice', 'invoiceDate'),
      column('dealerName', ['Dealer Name', 'Dealership', 'Dealer'], 'SalesOrder', 'dealerName'),
      column('dealerCity', ['Dealer City', 'Dealership City'], 'SalesOrder', 'dealerCity'),
      column('sellerName', ['Sale Person', 'Sales Person', 'Salesperson', 'Seller', 'Seller Name', 'Sales Executive', 'Employee Name', 'User Name'], 'User/Employee', '_id'),
      column('sellerRole', ['Seller Role', 'Sales Role', 'Role', 'Role Name'], 'Role', '_id'),
      column('customerCode', ['Customer ID', 'Customer Code', 'Client ID', 'Client Code'], 'Customer', 'customerCode'),
      column('customerName', ['Customer Name', 'CustomerName', 'Customer_Name', 'Customer', 'Client Name', 'Applicant'], 'Customer', '_id'),
      column('relation', ['Relation', 'Relationship'], 'Customer', 'relation'),
      column('dob', ['DOB', 'Date Of Birth', 'Birth Date'], 'Customer', 'dob'),
      column('customerType', ['Client Category', 'Customer Type', 'Client Type'], 'Customer', 'customerType'),
      column('cnic', ['CNIC', 'National ID', 'National Identity Number'], 'Customer', 'cnic'),
      column('ntn', ['NTN', 'Tax Number', 'Tax ID'], 'Customer', 'ntn'),
      column('phone', ['Cell', 'Mobile', 'Mobile No', 'Phone', 'Phone Number', 'Contact No'], 'Customer', 'phone'),
      column('alternatePhone', ['Landline', 'Landline No', 'Alternate Phone', 'Secondary Phone'], 'Customer', 'alternatePhone'),
      column('email', ['Email', 'Email Address', 'Customer Email'], 'Customer', 'email'),
      column('address', ['Address', 'Customer Address', 'Postal Address'], 'Customer', 'address'),
      column('city', ['City', 'Customer City'], 'Customer', 'city'),
      column('atlStatus', ['ATL Status', 'Taxpayer Status', 'Filer Status'], 'Customer', 'atlStatus'),
      column('vehicleDescription', ['Vehicle', 'Brand Model Variant', 'Brand/Model/Variant', 'Vehicle Description', 'Variant'], 'VehicleVariant', '_id'),
      ...VEHICLE_COLUMNS,
      column('modelYear', ['Model Year', 'Vehicle Year', 'Year'], 'Vehicle', 'year'),
      column('colorName', ['Color', 'Colour', 'Vehicle Color', 'Vehicle Colour'], 'VehicleColor', '_id'),
      column('deliveryMonth', ['Delivery Month', 'Expected Delivery', 'Delivery Date'], 'SalesOrder', 'deliveryDate'),
      column('chassisNumber', ['Chassis No', 'Chassis Number', 'VIN', 'Vehicle Identification Number'], 'Vehicle', '_id'),
      column('engineNumber', ['Engine No', 'Engine Number'], 'Vehicle', 'engineNumber'),
      column('unitType', ['Unit Type', 'Vehicle Unit Type'], 'SalesOrder', 'unitType'),
      column('exFactoryPrice', ['Ex Factory', 'Ex-Factory', 'Ex Factory Price', 'Ex-Factory Price'], 'SalesOrder', 'subtotal'),
      column('advanceTax', ['Advance Tax', 'Tax', 'Tax Amount'], 'SalesOrder', 'taxAmount'),
      column('freightCharges', ['Freight Charges', 'Freight', 'Delivery Charges'], 'SalesOrder', 'otherCharges'),
      column('msrp', ['MSRP', 'MRSP', 'Retail Price'], 'SalesOrder', 'totalAmount'),
      column('minPartialPayment', ['Min Partial Payment', 'Minimum Partial Payment'], 'SalesOrder', 'minPartialPayment'),
      column('totalAmountReceived', ['Total Amount Received', 'Paid Amount', 'Amount Received'], 'SalesOrder', 'paidAmount'),
      column('balanceAmount', ['Balance Amount', 'Remaining Balance', 'Outstanding Balance'], 'SalesOrder', 'balanceAmount'),
      column('buyerType', ['Buyer Type', 'Purchaser Type'], 'SalesOrder', 'buyerType'),
      column('orderCategory', ['Order Type', 'Type', 'Order Category'], 'SalesOrder', 'orderCategory'),
      column('deferredPayment', ['Deferred Payment', 'Deferred Amount'], 'SalesOrder', 'deferredPayment'),
      column('adminChargesPercent', ['Admin Charges %', 'Admin Charge %', 'Administration Charges %'], 'SalesOrder', 'adminChargesPercent'),
      column('adminCharges', ['Admin Charges', 'Admin Charge', 'Administration Charges', 'Administrative Charges'], 'SalesOrder', 'adminCharges'),
      column('sapOrderNumber', ['SAP Sales Order No', 'SAP Sales Order Number', 'SAP Order No', 'SAP Order Number'], 'SalesOrder', 'sapOrderNo'),
      column('dispatchNumber', ['Dispatch No', 'Dispatch Number'], 'SalesOrder', 'dispatchNo'),
      column('dispatchDate', ['Dispatch Date', 'PGI Date'], 'SalesOrder', 'dispatchDate'),
      // Columns the Orders Report carries that this ERP deliberately does not store
      // (OEM-side document checklist counters, tax breakdowns already covered by
      // Advance Tax, and OEM logistics references). Listing them here keeps them out
      // of the "no safe target mapping" warnings — they are ignored on purpose.
      column('oemReferenceColumns', [
        'SAP Customer No', 'Balance Due Date', 'Tax U/S 153(1)(a) WHT', '1/5 of GST', 'STRN',
        'Document Approval Status', 'Document Upload Status', 'Signed & Stamped PBO',
        'Partial Amount Pay Order', 'Partial Amount Deposit Slip', 'Purchase Order',
        'Sales Tax Undertaking', 'Price Ack. Undertaking', 'Balance Amount Pay Order',
        'Balance Amount Deposit Slip', 'Others', 'Document Remarks', 'OEM Remarks', 'FPM',
        'Arrival No', 'Arrival Date', 'PDI Request No', 'PDI Request Date', 'D.O. No', 'D.O. Date',
      ], null, null, { ignored: true }),
      column('totalReceivable', ['Total Receivable', 'Grand Total', 'Total Amount'], 'SalesOrder', 'totalAmount'),
      column('premium', ['Premium', 'Premium Amount'], 'SalesOrder', 'premium'),
      column('discount', ['Discount', 'Discount Amount'], 'SalesOrder', 'discountAmount'),
      column('purchaseOrderNumber', ['P.O. No', 'PO No', 'Purchase Order No', 'Purchase Order Number'], 'SalesOrder', 'poNo'),
      column('purchaseOrderDate', ['P.O. Date', 'PO Date', 'Purchase Order Date'], 'SalesOrder', 'poDate'),
    ],
  },
  dispatch: {
    fieldName: 'dispatch',
    label: 'Dispatch Report',
    module: 'dispatch',
    permission: 'dispatch_report_upload',
    requiredHeaderGroups: [
      ['dispatchNumber'],
      ['dispatchDate'],
      ['pboNo', 'chassisNumber', 'externalInvoiceNumber', 'sapOrderNumber'],
    ],
    columns: [
      column('sequence', ['S #', 'S No', 'Sr No', 'Serial No', 'Serial Number'], null, null, { ignored: true }),
      // The OEM's production batch reference; kept out of the warning list rather
      // than stored, since nothing in the ERP keys off it.
      column('batchNumber', ['Batch No', 'Batch Number'], null, null, { ignored: true }),
      column('dispatchNumber', ['Dispatch No', 'Dispatch Number', 'Dispatch #'], 'SalesOrder', 'dispatchNo'),
      column('dispatchDate', ['Dispatch Date', 'Shipping Date'], 'SalesOrder', 'dispatchDate'),
      column('externalOrderNumber', ['Order No', 'Order Number', 'Order #'], 'SalesOrder', 'externalOrderNumber'),
      column('pboNo', ['PBO No', 'Booking No', 'Reference No', 'Ref No'], 'SalesOrder', 'pboNo'),
      column('chassisNumber', ['Chassis No', 'Chassis Number', 'VIN'], 'Vehicle', '_id'),
      column('engineNumber', ['Engine No', 'Engine Number'], 'Vehicle', 'engineNumber'),
      column('vehicleDescription', ['Variant', 'Vehicle', 'Brand Model Variant', 'Brand/Model/Variant'], 'VehicleVariant', '_id'),
      ...VEHICLE_COLUMNS,
      column('colorName', ['Color', 'Colour', 'Vehicle Color', 'Vehicle Colour'], 'VehicleColor', '_id'),
      column('externalInvoiceNumber', ['Invoice No', 'Invoice Number', 'Invoice #'], 'Invoice', 'externalInvoiceNumber'),
      column('invoiceDate', ['Invoice Date', 'Billing Date'], 'Invoice', 'invoiceDate'),
      column('sapOrderNumber', ['SAP Order No', 'SAP Order Number'], 'SalesOrder', 'sapOrderNo'),
      column('sapOrderDate', ['SAP Order Date'], 'SalesOrder', 'sapOrderDate'),
      column('transportCompany', ['Transport Company', 'Transporter', 'Carrier'], 'SalesOrder', 'transportCompany'),
      column('customerName', ['Customer Name', 'CustomerName', 'Customer', 'Applicant', 'Client Name'], 'Customer', '_id'),
      column('customerType', ['Customer Type', 'Client Type', 'Client Category'], 'Customer', 'customerType'),
      column('phone', ['Cell', 'Mobile', 'Mobile No', 'Phone', 'Phone Number', 'Contact No'], 'Customer', 'phone'),
      column('sellerName', ['Sale Person', 'Sales Person', 'Salesman', 'Salesperson', 'Seller'], 'User/Employee', '_id'),
      column('modelYear', ['Model Year', 'Vehicle Year', 'Year'], 'Vehicle', 'year'),
      column('totalAmount', ['Total Amount', 'Total Receivable', 'Grand Total', 'Invoice Total'], 'SalesOrder', 'totalAmount'),
      column('exFactoryPrice', ['Ex Factory', 'Ex Factory Price'], 'SalesOrder', 'subtotal'),
      column('builtyNumber', ['Builty No', 'Bilty No', 'Consignment No'], 'SalesOrder', 'builtyNo'),
      column('shipFrom', ['Ship From', 'Dispatch From', 'Origin'], 'SalesOrder', 'shipFrom'),
      column('shipTo', ['Ship To', 'Dispatch To', 'Destination'], 'SalesOrder', 'shipTo'),
    ],
  },
};

const PAYMENT_FIELDS = {
  transactiondate: 'transactionDate',
  amountreceived: 'amountReceived',
  instrumentnumber: 'instrumentNumber',
  instrumentdate: 'instrumentDate',
  instrumentbank: 'instrumentBank',
  instrumentbranchcity: 'instrumentBranchCity',
  depositbank: 'depositBank',
  depositbankbranchname: 'depositBankBranchName',
  depositbankbranchcode: 'depositBankBranchCode',
  paymentstatusdate: 'paymentStatusDate',
  paymentstatus: 'paymentStatus',
};

function normalizeHeader(value) {
  return String(value == null ? '' : value)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/&/g, ' and ')
    .replace(/%/g, ' percent ')
    .replace(/#/g, ' number ')
    .replace(/\bno\.?\b/gi, ' number ')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function normalizeText(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

function buildAliasLookup(definition) {
  const lookup = new Map();
  definition.columns.forEach((definitionColumn) => {
    definitionColumn.aliases.forEach((alias) => {
      const normalized = normalizeHeader(alias);
      if (!lookup.has(normalized)) lookup.set(normalized, definitionColumn);
    });
  });
  return lookup;
}

function paymentColumn(normalizedHeader) {
  const match = normalizedHeader.match(/^(\d+)(?:st|nd|rd|th)?(.+)$/);
  if (!match) return null;
  const field = PAYMENT_FIELDS[match[2]];
  if (!field) return null;
  return {
    key: `payment.${Number(match[1])}.${field}`,
    installment: Number(match[1]),
    paymentField: field,
    entity: 'Payment',
    target: `SalesOrder.payments[].${field}`,
    aliases: [],
  };
}

function mapHeaderRow(headerRow, definition) {
  const lookup = buildAliasLookup(definition);
  const seen = new Map();
  const duplicateFields = [];
  const columns = headerRow.map((sourceHeader, index) => {
    const source = normalizeText(sourceHeader);
    const normalized = normalizeHeader(source);
    if (!normalized) return { index, sourceHeader: source, normalizedHeader: '', status: 'blank' };
    const mapped = lookup.get(normalized) || (definition === FILE_DEFINITIONS.orderSales ? paymentColumn(normalized) : null);
    if (!mapped) return { index, sourceHeader: source, normalizedHeader: normalized, status: 'unmapped' };

    let status = mapped.ignored ? 'ignored' : mapped.recognizedUnmapped ? 'recognized_unmapped' : 'mapped';
    let reason = mapped.reason || '';
    if (status === 'mapped') {
      // Dealer Pro repeats header names in its document-checklist block ("CNIC",
      // "NTN", "ATL Status" there hold attachment counts, not customer data).
      // The real column always comes first, so later repeats are dropped rather
      // than failing the whole file.
      if (seen.has(mapped.key)) {
        duplicateFields.push({
          key: mapped.key,
          first: seen.get(mapped.key).sourceHeader,
          firstColumn: seen.get(mapped.key).index + 1,
          second: source,
          secondColumn: index + 1,
        });
        status = 'duplicate_ignored';
        reason = `Duplicate of the "${seen.get(mapped.key).sourceHeader}" column already mapped to ${mapped.key}; this later column is ignored.`;
      } else {
        seen.set(mapped.key, { sourceHeader: source, index });
      }
    }
    return {
      index,
      sourceHeader: source,
      normalizedHeader: normalized,
      canonicalField: mapped.key,
      entity: mapped.entity || null,
      targetField: mapped.target || null,
      status,
      reason,
      installment: mapped.installment,
      paymentField: mapped.paymentField,
    };
  });

  const mappedKeys = new Set(columns.filter((entry) => entry.status === 'mapped').map((entry) => entry.canonicalField));
  const missingHeaderGroups = definition.requiredHeaderGroups.filter((group) => !group.some((key) => mappedKeys.has(key)));
  return { columns, mappedKeys, missingHeaderGroups, duplicateFields };
}

function isSummaryRow(row) {
  const sample = row.slice(0, 6).map(normalizeText).filter(Boolean).join(' ').toLowerCase();
  return /(?:^|\s)(?:sub\s*total|grand\s*total|report\s+total|salesm(?:a|e)n\s*:)/i.test(sample);
}
function sellerFromSummaryRow(row) {
  const sample = row.slice(0, 6).map(normalizeText).filter(Boolean).join(' ');
  const match = sample.match(/^\s*salesm(?:a|e)n\s*:\s*(.+?)\s*$/i);
  return match ? normalizeText(match[1]) : '';
}


function setMappedValue(record, mapping, value) {
  if (mapping.installment) {
    if (!record.paymentCells) record.paymentCells = {};
    if (!record.paymentCells[mapping.installment]) record.paymentCells[mapping.installment] = {};
    record.paymentCells[mapping.installment][mapping.paymentField] = value;
    return;
  }
  record[mapping.canonicalField] = value;
}

function sheetCandidate(matrix, definition) {
  let best = null;
  const scanLimit = Math.min(matrix.length, 30);
  for (let index = 0; index < scanLimit; index += 1) {
    const mapped = mapHeaderRow(matrix[index] || [], definition);
    const score = mapped.mappedKeys.size - mapped.missingHeaderGroups.length * 10;
    if (!best || score > best.score) best = { index, score, ...mapped };
  }
  return best;
}

function validateFileEnvelope(file) {
  if (!file || !Buffer.isBuffer(file.buffer)) throw new ImportFileError('EMPTY_FILE', 'No file was uploaded.');
  const size = Number(file.size != null ? file.size : file.buffer.length);
  if (size <= 0 || file.buffer.length <= 0) throw new ImportFileError('EMPTY_FILE', 'The uploaded file is empty.');
  if (size > MAX_FILE_SIZE || file.buffer.length > MAX_FILE_SIZE) {
    throw new ImportFileError('FILE_TOO_LARGE', `File exceeds the ${MAX_FILE_SIZE / 1024 / 1024} MB limit.`);
  }

  const extension = path.extname(file.originalname || '').toLowerCase();
  if (!['.xlsx', '.csv'].includes(extension)) throw new ImportFileError('INVALID_EXTENSION', 'Only .xlsx and .csv files are supported.');

  const mime = String(file.mimetype || '').toLowerCase();
  const allowedMimes = extension === '.xlsx'
    ? ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel', 'application/octet-stream']
    : ['text/csv', 'application/csv', 'application/vnd.ms-excel', 'text/plain', 'application/octet-stream'];
  if (mime && !allowedMimes.includes(mime)) {
    throw new ImportFileError('INVALID_MIME_TYPE', `MIME type "${mime}" does not match ${extension}.`);
  }

  if (extension === '.xlsx' && !(file.buffer[0] === 0x50 && file.buffer[1] === 0x4b)) {
    throw new ImportFileError('INVALID_FILE_SIGNATURE', 'The file is not a valid XLSX archive.');
  }
  if (extension === '.csv' && file.buffer.includes(0)) {
    throw new ImportFileError('INVALID_FILE_SIGNATURE', 'The CSV contains binary data.');
  }
  return { extension, size, mime };
}

class ImportFileError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'ImportFileError';
    this.code = code;
    this.statusCode = 422;
    this.details = details;
  }
}

function parseSpreadsheet(file, logicalType) {
  const definition = FILE_DEFINITIONS[logicalType];
  if (!definition) throw new ImportFileError('INVALID_LOGICAL_TYPE', `Unsupported import type "${logicalType}".`);
  const envelope = validateFileEnvelope(file);
  let workbook;
  try {
    workbook = xlsx.read(file.buffer, { type: 'buffer', cellDates: true, dense: false });
  } catch (error) {
    throw new ImportFileError('UNREADABLE_FILE', `The spreadsheet could not be read: ${error.message}`);
  }
  if (!workbook.SheetNames.length) throw new ImportFileError('EMPTY_WORKBOOK', 'The workbook contains no sheets.');
  debugEvent('file.parsing.started', {
    uploadedFilename: file.originalname || '',
    assignedSourceType: logicalType,
    mimeType: file.mimetype || '',
    size: envelope.size,
    sheetNames: workbook.SheetNames,
    fileHash: crypto.createHash('sha256').update(file.buffer).digest('hex'),
  });

  const records = [];
  const mappingReport = [];
  const matchedSheets = [];
  const sheetFailures = [];

  workbook.SheetNames.forEach((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    const matrix = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false, blankrows: false });
    if (!matrix.length) return;
    const candidate = sheetCandidate(matrix, definition);
    if (!candidate || candidate.missingHeaderGroups.length) {
      sheetFailures.push({
        sheetName,
        missingHeaderGroups: candidate ? candidate.missingHeaderGroups : definition.requiredHeaderGroups,
      });
      return;
    }
    matchedSheets.push(sheetName);
    mappingReport.push({
      sheetName,
      headerRow: candidate.index + 1,
      columns: candidate.columns.filter((entry) => entry.status !== 'blank'),
      unknownColumns: candidate.columns.filter((entry) => entry.status === 'unmapped').map((entry) => entry.sourceHeader),
      recognizedUnmappedColumns: candidate.columns
        .filter((entry) => entry.status === 'recognized_unmapped')
        .map((entry) => ({ column: entry.sourceHeader, reason: entry.reason })),
      duplicateColumns: candidate.duplicateFields,
    });
    if (candidate.duplicateFields.length) {
      debugEvent('file.sheet.duplicate_headers_ignored', {
        uploadedFilename: file.originalname || '',
        sheetName,
        duplicateFields: candidate.duplicateFields,
      });
    }
    debugEvent('file.sheet.parsed', {
      uploadedFilename: file.originalname || '',
      detectedSourceType: logicalType,
      sheetName,
      headerRow: candidate.index + 1,
      detectedHeaders: candidate.columns
        .filter((entry) => entry.sourceHeader)
        .map((entry) => entry.sourceHeader),
      mappedHeaders: candidate.columns
        .filter((entry) => entry.status === 'mapped')
        .map((entry) => ({ source: entry.sourceHeader, target: entry.key })),
      numberOfRows: Math.max(0, matrix.length - candidate.index - 1),
    });

    let activeSellerName = '';
    for (let index = candidate.index + 1; index < matrix.length; index += 1) {
      const row = matrix[index] || [];
      const sectionSellerName = sellerFromSummaryRow(row);
      if (sectionSellerName) {
        activeSellerName = sectionSellerName;
        continue;
      }
      if (!row.some((value) => normalizeText(value))) continue;
      if (isSummaryRow(row)) continue;

      const record = {
        _meta: {
          logicalType,
          fileName: file.originalname,
          sheetName,
          rowNumber: index + 1,
        },
        _unmapped: {},
      };
      candidate.columns.forEach((mapping) => {
        if (!mapping.sourceHeader) return;
        const value = row[mapping.index];
        if (mapping.status === 'mapped') setMappedValue(record, mapping, value);
        else if ((mapping.status === 'unmapped' || mapping.status === 'recognized_unmapped') && normalizeText(value)) {
          record._unmapped[mapping.sourceHeader] = value;
        }
      });
      if (logicalType === 'orderIntake' && activeSellerName && !normalizeText(record.sellerName)) {
        record.sellerName = activeSellerName;
      }

      const hasMappedData = candidate.columns.some((mapping) => mapping.status === 'mapped' && normalizeText(row[mapping.index]));
      if (hasMappedData) records.push(record);
      if (hasMappedData) {
        const rawSourceRow = Object.fromEntries(candidate.columns
          .filter((mapping) => mapping.sourceHeader)
          .map((mapping) => [mapping.sourceHeader, row[mapping.index]]));
        debugEvent('row.parsed', {
          _meta: record._meta,
          rawSourceRow,
          mappedRow: record,
        });
      }
    }
  });

  if (!matchedSheets.length) {
    throw new ImportFileError('MISSING_REQUIRED_HEADERS', `No sheet in "${file.originalname}" contains the required ${definition.label} headers.`, {
      logicalType,
      requiredHeaderGroups: definition.requiredHeaderGroups,
      sheets: sheetFailures,
    });
  }
  if (!records.length) {
    throw new ImportFileError('NO_DATA_ROWS', `No data rows were found in the ${definition.label} file.`, { matchedSheets });
  }

  return {
    logicalType,
    definition,
    fileName: file.originalname,
    mimeType: file.mimetype || '',
    size: envelope.size,
    checksum: crypto.createHash('sha256').update(file.buffer).digest('hex'),
    sheetNames: matchedSheets,
    records,
    mappingReport,
  };
}

/**
 * Auto-detect the logical file type of an uploaded spreadsheet by scoring
 * each FILE_DEFINITION against the headers found in the workbook.
 * Returns { logicalType, confidence } or null if no definition matches.
 */
function detectFileType(file) {
  const envelope = validateFileEnvelope(file);
  let workbook;
  try {
    workbook = xlsx.read(file.buffer, { type: 'buffer', cellDates: true, dense: false });
  } catch (error) {
    debugEvent('file.detection.failed', {
      uploadedFilename: file.originalname || '',
      mimeType: file.mimetype || '',
      size: envelope.size,
      reason: error.message,
    }, { level: 'error' });
    return null;
  }
  if (!workbook.SheetNames.length) {
    debugEvent('file.detection.failed', {
      uploadedFilename: file.originalname || '',
      mimeType: file.mimetype || '',
      size: envelope.size,
      reason: 'Workbook contains no sheets.',
    }, { level: 'error' });
    return null;
  }

  let bestType = null;
  let bestScore = 0;
  let bestSheets = [];

  for (const logicalType of FILE_TYPE_ORDER) {
    const definition = FILE_DEFINITIONS[logicalType];
    let typeScore = 0;
    const detectedSheets = [];
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const matrix = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false, blankrows: false });
      if (!matrix.length) continue;
      const candidate = sheetCandidate(matrix, definition);
      if (candidate && !candidate.missingHeaderGroups.length) {
        typeScore += candidate.mappedKeys.size - candidate.missingHeaderGroups.length * 10;
        detectedSheets.push({
          sheetName,
          headerRow: candidate.index + 1,
          detectedHeaders: candidate.columns
            .filter((entry) => entry.sourceHeader)
            .map((entry) => entry.sourceHeader),
          numberOfRows: Math.max(0, matrix.length - candidate.index - 1),
        });
      }
    }
    if (typeScore > bestScore) {
      bestScore = typeScore;
      bestType = logicalType;
      bestSheets = detectedSheets;
    }
  }

  const result = bestType ? {
    logicalType: bestType,
    confidence: bestScore,
    sheets: bestSheets,
    sheetNames: workbook.SheetNames,
    fileHash: crypto.createHash('sha256').update(file.buffer).digest('hex'),
  } : null;
  debugEvent(result ? 'file.detected' : 'file.detection.failed', {
    uploadedFilename: file.originalname || '',
    mimeType: file.mimetype || '',
    size: envelope.size,
    extension: envelope.extension,
    detectedSourceType: result?.logicalType || null,
    confidence: result?.confidence || 0,
    sheetNames: workbook.SheetNames,
    sheets: result?.sheets || [],
    fileHash: result?.fileHash || crypto.createHash('sha256').update(file.buffer).digest('hex'),
    reason: result ? '' : 'No supported source header definition matched.',
  }, result ? {} : { level: 'warn' });
  return result;
}

module.exports = {
  FILE_DEFINITIONS,
  FILE_TYPE_ORDER,
  MAX_FILE_SIZE,
  ImportFileError,
  normalizeHeader,
  normalizeText,
  parseSpreadsheet,
  validateFileEnvelope,
  detectFileType,
};
