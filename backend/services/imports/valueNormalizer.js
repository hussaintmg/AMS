const { parseFlexibleDate } = require('../../utils/dateParser');
const { normalizePhone, isValidPhone } = require('../../utils/phone.util');
const { debugEvent } = require('./importDebugAudit');
const { normalizeText } = require('./spreadsheetMapper');

const NUMBER_FIELDS = new Set([
  'exFactoryPrice', 'freightCharges', 'msrp', 'onBooking', 'balancePayments', 'remainingBalance',
  'modelYear', 'advanceTax', 'minPartialPayment', 'totalAmountReceived', 'balanceAmount',
  'adminChargesPercent', 'adminCharges', 'totalReceivable', 'premium', 'discount',
]);
const DATE_FIELDS = new Set([
  'orderDate', 'bookingDate', 'invoiceDate', 'dob', 'deliveryMonth', 'purchaseOrderDate',
  'dispatchDate', 'sapOrderDate',
]);
const IDENTIFIER_FIELDS = new Set([
  'externalOrderNumber', 'pboNo', 'dispatchNumber', 'externalInvoiceNumber', 'customerCode', 'cnic', 'ntn',
  'chassisNumber', 'engineNumber', 'purchaseOrderNumber', 'sapOrderNumber', 'builtyNumber',
]);

function rawPresent(value) {
  return value !== undefined && value !== null && normalizeText(value) !== '';
}

function normalizeBusinessReference(value) {
  if (value === undefined || value === null) return '';
  let normalized = normalizeText(value).trim().toUpperCase();
  if (!normalized) return '';
  normalized = normalized.replace(/\.0+$/, '');
  return normalized.replace(/\s+/g, '');
}

function parseNumber(value) {
  if (!rawPresent(value)) return { value: null, present: false };
  let source = normalizeText(value);
  let negative = false;
  if (/^\(.*\)$/.test(source)) {
    negative = true;
    source = source.slice(1, -1);
  }
  source = source.replace(/(?:pkr|rs\.?)/gi, '').replace(/,/g, '').replace(/%/g, '').replace(/\s+/g, '');
  if (!/^[-+]?\d+(?:\.\d+)?$/.test(source)) return { value: null, present: true, error: 'must be a valid number' };
  const parsed = Number(source);
  if (!Number.isFinite(parsed)) return { value: null, present: true, error: 'must be a finite number' };
  return { value: negative ? -Math.abs(parsed) : parsed, present: true };
}

function parseDate(value) {
  if (!rawPresent(value)) return { value: null, present: false };
  const parsed = parseFlexibleDate(value);
  return parsed
    ? { value: parsed, present: true }
    : { value: null, present: true, error: 'must be a valid date' };
}

function issue(record, overrides) {
  const meta = record._meta || {};
  return {
    fileType: meta.logicalType || '',
    fileName: meta.fileName || '',
    sheetName: meta.sheetName || '',
    row: meta.rowNumber || null,
    sourceIdentifier: '',
    errorType: 'VALIDATION',
    field: '',
    value: '',
    missingField: '',
    relatedEntity: '',
    message: '',
    ...overrides,
  };
}

function normalizeCustomerType(value) {
  const normalized = normalizeText(value).toLowerCase();
  if (!normalized) return '';
  if (['individual', 'person', 'personal', 'retail'].includes(normalized)) return 'individual';
  // Dealer Pro's "Client Category" also emits organisational buyer categories
  // (Government bodies, other dealers, fleets) — all of them are corporate here.
  if ([
    'corporate', 'company', 'business', 'organization', 'organisation',
    'government', 'govt', 'public sector', 'semi government', 'semi govt',
    'dealer', 'distributor', 'fleet', 'institution', 'institutional', 'ngo',
  ].includes(normalized)) return 'corporate';
  return null;
}

const CORPORATE_NAME_MARKERS = [
  'm/s', 'pvt ltd', 'private limited', 'ltd', 'limited', 'company',
  'corporation', 'bank', 'group', 'industries', 'enterprises',
  'organization', 'institution',
  // Trading names common on Pakistani dealer paperwork; without these a name
  // like "Haji Naeem & Sons" reads as a person.
  'and sons', 'sons', 'brothers', 'traders', 'trading', 'motors', 'autos',
  'automobiles', 'agencies', 'associates', 'and co', 'mills', 'textiles',
  'builders', 'developers', 'foundation', 'trust', 'society', 'hospital',
  'college', 'university', 'school', 'academy', 'engineering', 'services',
];

function hasCorporateNameMarker(value) {
  const name = normalizeText(value).toLowerCase().replace(/\./g, '');
  // An ampersand or a digit inside a name token never appears in a person's
  // name on this paperwork — "Beads & Stones", "East West Insurance C0.Ltd"
  // (OCR zero), "P&D Board" are all businesses.
  if (name.includes('&') || /[a-z]\d|\d[a-z]/i.test(name)) return true;
  return CORPORATE_NAME_MARKERS.some((marker) => {
    const escaped = marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
    const pattern = marker === 'm/s'
      ? /(^|\s)m\/s(?=\s|$)/i
      : new RegExp(`(^|\\s)${escaped}(?=\\s|$)`, 'i');
    return pattern.test(name);
  });
}

// Mononyms ("Atiqullah", "Salman") are ordinary personal names on this paperwork,
// so a single word still reads as a person once the corporate markers above have
// had their say — requiring two words dropped 29 intake bookings outright.
function isNormalPersonName(value) {
  const name = normalizeText(value).replace(/^(?:mr|mrs|ms|miss|dr|haji|hafiz|syed|malik|ch|sheikh)\.?\s+/i, '').trim();
  const parts = name.split(/\s+/).filter(Boolean);
  return parts.length >= 1 && parts.every((part) => /^[A-Za-z][A-Za-z.'-]*$/.test(part));
}

function inferCustomerType(value, { cnic = '', explicitPersonal = false } = {}) {
  const explicit = normalizeCustomerType(value);
  if (explicit) return explicit;
  if (hasCorporateNameMarker(value)) return 'corporate';
  if (explicitPersonal || isNormalPersonName(value) || rawPresent(cnic)) return 'individual';
  return 'unknown';
}

function normalizePaymentCells(record, errors) {
  const payments = [];
  let droppedDuplicates = 0;
  Object.entries(record.paymentCells || {}).forEach(([installment, source]) => {
    const hasAny = Object.values(source).some(rawPresent);
    if (!hasAny) return;
    const amount = parseNumber(source.amountReceived);
    if (amount.error) {
      errors.push(issue(record, {
        field: `payments.${installment}.amountReceived`,
        value: normalizeText(source.amountReceived),
        relatedEntity: 'Payment',
        message: `Installment ${installment} amount ${amount.error}.`,
      }));
      return;
    }
    if (!amount.present || amount.value <= 0) {
      // Dealer Pro leaves half-filled installment blocks behind (a bank name, a
      // status, a zeroed amount). Skipping just that installment keeps the order
      // importable and invents nothing — that is normal shape for this paperwork,
      // so it is recorded in the debug audit rather than raised as a warning.
      debugEvent('payment.installment.skipped', {
        _meta: record._meta,
        installment: Number(installment),
        amountCell: normalizeText(source.amountReceived),
        reason: !amount.present ? 'no amount in a partially filled block' : 'amount not greater than zero',
      });
      return;
    }

    const normalized = { installmentNo: Number(installment), amountReceived: amount.value };
    ['transactionDate', 'instrumentDate', 'paymentStatusDate'].forEach((field) => {
      const parsed = parseDate(source[field]);
      if (parsed.error) {
        errors.push(issue(record, {
          field: `payments.${installment}.${field}`,
          value: normalizeText(source[field]),
          relatedEntity: 'Payment',
          message: `Installment ${installment} ${field} ${parsed.error}.`,
        }));
      } else normalized[field] = parsed.value;
    });
    ['instrumentNumber', 'instrumentBank', 'instrumentBranchCity', 'depositBank', 'depositBankBranchName', 'depositBankBranchCode', 'paymentStatus'].forEach((field) => {
      normalized[field] = normalizeText(source[field]);
    });
    payments.push(normalized);
  });

  // Some Dealer Pro exports repeat an installment across two blocks (same date,
  // same amount, same instrument). Summing both would double the paid amount and
  // push the order past its own total, so identical repeats are dropped.
  const ordered = payments.sort((left, right) => left.installmentNo - right.installmentNo);
  const fingerprints = new Set();
  const deduped = [];
  ordered.forEach((payment) => {
    const fingerprint = [
      payment.amountReceived,
      payment.transactionDate ? new Date(payment.transactionDate).toISOString().slice(0, 10) : '',
      payment.instrumentNumber || '',
      payment.instrumentBank || '',
    ].join('|');
    if (fingerprints.has(fingerprint)) {
      // A byte-identical repeat is the export duplicating its own block (verified
      // against source: same amount, date AND instrument number). Dropping it is
      // the only correct reading, so it is audit detail, not a warning.
      droppedDuplicates += 1;
      debugEvent('payment.installment.duplicate_dropped', {
        _meta: record._meta,
        installment: payment.installmentNo,
        amountReceived: payment.amountReceived,
        instrumentNumber: payment.instrumentNumber || '',
        fingerprint,
      });
      return;
    }
    fingerprints.add(fingerprint);
    deduped.push(payment);
  });
  return { payments: deduped, droppedDuplicates };
}

function normalizeRecord(record, logicalType) {
  const errors = [];
  const warnings = [];
  const normalized = { _meta: { ...(record._meta || {}) }, _unmapped: { ...(record._unmapped || {}) } };

  Object.entries(record).forEach(([field, value]) => {
    if (field.startsWith('_') || field === 'paymentCells') return;
    if (NUMBER_FIELDS.has(field)) {
      const parsed = parseNumber(value);
      if (parsed.error) {
        errors.push(issue(record, { field, value: normalizeText(value), message: `${field} ${parsed.error}.` }));
      } else normalized[field] = parsed.value;
      return;
    }
    if (DATE_FIELDS.has(field)) {
      const parsed = parseDate(value);
      if (parsed.error) {
        errors.push(issue(record, { field, value: normalizeText(value), message: `${field} ${parsed.error}.` }));
      } else normalized[field] = parsed.value;
      return;
    }
    normalized[field] = normalizeText(value);
  });

  IDENTIFIER_FIELDS.forEach((field) => {
    if (normalized[field] == null) return;
    normalized[field] = field === 'pboNo'
      ? normalizeBusinessReference(normalized[field])
      : normalizeText(normalized[field]);
  });

  if (rawPresent(normalized.email)) {
    normalized.email = normalized.email.toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized.email)) {
      errors.push(issue(record, { field: 'email', value: normalized.email, relatedEntity: 'Customer', message: 'Customer email has an invalid format.' }));
    }
  }
  if (rawPresent(normalized.phone)) {
    normalized.phone = normalizePhone(normalized.phone);
    if (!isValidPhone(normalized.phone)) {
      errors.push(issue(record, { field: 'phone', value: normalized.phone, relatedEntity: 'Customer', message: 'Customer phone number is invalid.' }));
    }
  }
  if (rawPresent(normalized.alternatePhone)) normalized.alternatePhone = normalizePhone(normalized.alternatePhone);
  if (rawPresent(normalized.customerType)) {
    const customerType = normalizeCustomerType(normalized.customerType);
    if (!customerType) {
      errors.push(issue(record, { field: 'customerType', value: normalized.customerType, relatedEntity: 'Customer', message: 'Customer type must resolve to individual or corporate.' }));
    } else normalized.customerType = customerType;
  }
  if (!rawPresent(normalized.customerType) && rawPresent(normalized.customerName)) {
    const inferredType = inferCustomerType(normalized.customerName, { cnic: normalized.cnic });
    if (inferredType === 'unknown' && logicalType !== 'orderIntake') {
      errors.push(issue(record, {
        field: 'customerType',
        value: normalized.customerName,
        missingField: 'customerType (explicit or safely inferable)',
        relatedEntity: 'Customer',
        message: 'Customer type is missing and cannot be safely inferred from the customer name or identity.',
      }));
    } else if (inferredType !== 'unknown') normalized.customerType = inferredType;
  }

  Object.entries(normalized._unmapped).forEach(([header, value]) => {
    warnings.push(issue(record, {
      errorType: 'UNMAPPED_COLUMN',
      field: header,
      value: normalizeText(value).slice(0, 200),
      message: `Source column "${header}" has data but no safe target mapping.`,
    }));
  });

  let droppedDuplicateInstallments = 0;
  if (logicalType === 'orderSales') {
    const paymentCells = normalizePaymentCells(record, errors);
    normalized.payments = paymentCells.payments;
    droppedDuplicateInstallments = paymentCells.droppedDuplicates;
  }

  const sourceIdentifier = logicalType === 'dispatch'
    ? normalizeText(normalized.dispatchNumber || normalized.pboNo || normalized.chassisNumber)
    : normalizeText(normalized.externalOrderNumber || normalized.pboNo);
  normalized._meta.sourceIdentifier = sourceIdentifier;
  errors.forEach((entry) => { entry.sourceIdentifier = sourceIdentifier; });
  warnings.forEach((entry) => { entry.sourceIdentifier = sourceIdentifier; });

  const requireValue = (field, entity, message) => {
    if (!rawPresent(normalized[field])) {
      errors.push(issue(record, {
        sourceIdentifier,
        field,
        missingField: field,
        relatedEntity: entity,
        message,
      }));
    }
  };

  if (logicalType === 'orderIntake') {
    requireValue('externalOrderNumber', 'SalesOrder', "Order Intake cannot be imported because required field 'externalOrderNumber' is missing.");
    requireValue('pboNo', 'Booking', "Order Intake cannot be imported because required field 'pboNo' is missing.");
    requireValue('customerName', 'Customer', "Order Intake cannot be imported because required field 'customerName' is missing.");
    // A salesperson is useful context, not a precondition: Dealer Pro exports it
    // as a "Salesmen : X" section row that some exports omit entirely, and the
    // Orders Sales file carries "Sale Person" for the same order anyway.
    if (!rawPresent(normalized.sellerName)) {
      warnings.push(issue(record, {
        sourceIdentifier,
        errorType: 'MISSING_OPTIONAL_VALUE',
        field: 'sellerName',
        missingField: 'sellerName',
        relatedEntity: 'User/Employee',
        message: 'Order Intake has no salesperson (no "Salesmen" section row and no Sales record to borrow it from); the Booking is imported without a sale person.',
      }));
    }
    if (!rawPresent(normalized.vehicleDescription) && !(rawPresent(normalized.brandName) && rawPresent(normalized.modelName))) {
      errors.push(issue(record, {
        sourceIdentifier,
        field: 'vehicleDescription',
        missingField: 'vehicleDescription',
        relatedEntity: 'VehicleVariant',
        message: 'Order Intake requires vehicle Brand/Model/Variant information.',
      }));
    }
    // Dealer Pro intake money columns:
    //   MSRP             → the customer-facing total (Ex-Factory + tax + freight)
    //   On Booking       → what the customer paid at booking time
    //   Balance Payments → further instalments received after booking
    //   Remaining Balance→ what is still owed (falls back to total − paid)
    const bookingAmount = Number(normalized.onBooking || 0);
    const subsequentPayments = Number(normalized.balancePayments || 0);
    const paidAmount = bookingAmount + subsequentPayments;
    const totalAmount = normalized.msrp != null
      ? normalized.msrp
      : Number(normalized.exFactoryPrice || 0) + Number(normalized.freightCharges || 0);
    normalized.financials = {
      subtotal: Number(normalized.exFactoryPrice || 0),
      otherCharges: Number(normalized.freightCharges || 0),
      totalAmount,
      bookingAmount,
      subsequentPayments,
      paidAmount,
      balanceAmount: normalized.remainingBalance != null
        ? Number(normalized.remainingBalance)
        : Math.max(0, totalAmount - paidAmount),
    };
    // Only worth reporting when our reading disagrees with the dealer's own
    // "Remaining Balance". Where that column carries the same negative figure we
    // derive, the overpayment is what the source itself states — the columns were
    // read correctly and there is nothing for anyone to check.
    if (paidAmount > totalAmount + 0.01) {
      const sourceBalance = normalized.remainingBalance != null ? Number(normalized.remainingBalance) : null;
      const sourceAgrees = sourceBalance != null && Math.abs(sourceBalance - (totalAmount - paidAmount)) <= 0.01;
      if (!sourceAgrees) {
        warnings.push(issue(record, {
          sourceIdentifier,
          errorType: 'FINANCIAL_MISMATCH',
          field: 'onBooking',
          value: String(paidAmount),
          relatedEntity: 'Booking',
          message: `Booking payments ${paidAmount} exceed the MSRP total ${totalAmount}; source values are preserved for review.`,
        }));
      }
    }
    if (!(totalAmount > 0)) {
      errors.push(issue(record, {
        sourceIdentifier,
        field: 'totalAmount',
        missingField: 'totalAmount',
        relatedEntity: 'Booking',
        message: 'Order Intake requires a positive vehicle total amount.',
      }));
    }
  }

  if (logicalType === 'orderSales') {
    requireValue('externalOrderNumber', 'SalesOrder', "Order Sales cannot be imported because required field 'externalOrderNumber' is missing.");
    requireValue('customerName', 'Customer', "Order Sales cannot be imported because required field 'customerName' is missing.");
    requireValue('pboNo', 'Booking', "Order Sales cannot be imported because required field 'pboNo' is missing.");
    requireValue('sellerName', 'User/Employee', "Order Sales cannot be imported because required field 'sellerName' is missing.");
    requireValue('phone', 'Customer', "Order Sales cannot be imported because required field 'phone' is missing.");
    requireValue('customerType', 'Customer', "Order Sales cannot be imported because required field 'customerType' is missing.");
    if (!rawPresent(normalized.vehicleDescription) && !(rawPresent(normalized.brandName) && rawPresent(normalized.modelName))) {
      errors.push(issue(record, {
        sourceIdentifier,
        field: 'vehicleDescription',
        missingField: 'vehicleDescription',
        relatedEntity: 'VehicleVariant',
        message: "Order Sales cannot be imported because vehicle Brand/Model/Variant information is missing.",
      }));
    }

    const componentTotal = Number(normalized.exFactoryPrice || 0)
      + Number(normalized.advanceTax || 0)
      + Number(normalized.freightCharges || 0)
      + Number(normalized.adminCharges || 0)
      + Number(normalized.premium || 0)
      - Number(normalized.discount || 0);
    const totalAmount = normalized.totalReceivable != null
      ? normalized.totalReceivable
      : normalized.msrp != null ? normalized.msrp : componentTotal;
    const installmentTotal = (normalized.payments || []).reduce((sum, payment) => sum + payment.amountReceived, 0);
    const hasInstallments = normalized.payments.length > 0;
    const reportedPaidAmount = normalized.totalAmountReceived != null ? normalized.totalAmountReceived : null;
    const paidAmount = hasInstallments ? installmentTotal : (reportedPaidAmount != null && reportedPaidAmount > 0 ? reportedPaidAmount : 0);
    const balanceAmount = Math.max(0, totalAmount - paidAmount);

    if (!(totalAmount > 0)) {
      errors.push(issue(record, { sourceIdentifier, field: 'totalAmount', missingField: 'totalAmount', relatedEntity: 'SalesOrder', message: 'Order Sales requires a positive total amount.' }));
    }
    if (paidAmount < 0) {
      errors.push(issue(record, { sourceIdentifier, field: 'paidAmount', value: String(paidAmount), relatedEntity: 'SalesOrder', message: `Paid amount ${paidAmount} cannot be negative.` }));
    } else if (paidAmount > totalAmount) {
      // Rejecting the row would also throw away its customer, vehicle, booking and
      // invoice over a dealer-side overpayment (rounding, an extra receipt), so the
      // reported figures are kept and the balance floors at zero. It is only worth
      // reporting when the source's own balance column disagrees — where that column
      // already carries the same negative figure, the file is simply stating an
      // overpayment and the columns were read correctly.
      const sourceBalance = normalized.balanceAmount != null ? Number(normalized.balanceAmount) : null;
      const sourceAgrees = sourceBalance != null && Math.abs(sourceBalance - (totalAmount - paidAmount)) <= 0.01;
      if (!sourceAgrees) {
        warnings.push(issue(record, {
          sourceIdentifier,
          errorType: 'FINANCIAL_MISMATCH',
          field: 'paidAmount',
          value: String(paidAmount),
          relatedEntity: 'SalesOrder',
          message: `Paid amount ${paidAmount} exceeds order total ${totalAmount} by ${paidAmount - totalAmount}; source figures were kept and the balance floored at zero.`,
        }));
      }
    }
    // A repeated installment that was already dropped (and recorded in the audit)
    // explains this difference on its own; a warning would add no information.
    if (!droppedDuplicateInstallments
      && reportedPaidAmount != null
      && normalized.payments.length
      && Math.abs(installmentTotal - reportedPaidAmount) > 0.01) {
      warnings.push(issue(record, {
        sourceIdentifier,
        errorType: 'FINANCIAL_MISMATCH',
        field: 'payments',
        value: String(installmentTotal),
        relatedEntity: 'Payment',
        message: `Installment sum ${installmentTotal} differs from Total Amount Received ${reportedPaidAmount}; source totals are preserved without inventing a balancing installment.`,
      }));
    }
    // The stored balance floors at zero, so an overpaid order always "differs" from
    // its negative source balance; that is the floor doing its job, not a mismatch.
    const sourceBalanceIsNegativeOverpayment = normalized.balanceAmount != null
      && Number(normalized.balanceAmount) < 0
      && Math.abs(Number(normalized.balanceAmount) - (totalAmount - paidAmount)) <= 0.01;
    if (!sourceBalanceIsNegativeOverpayment
      // A dropped duplicate installment already explains why the stored balance no
      // longer matches the source's — no need to say it twice for the same row.
      && !droppedDuplicateInstallments
      && normalized.balanceAmount != null
      && Math.abs(Number(normalized.balanceAmount) - balanceAmount) > 0.01) {
      warnings.push(issue(record, {
        sourceIdentifier,
        errorType: 'FINANCIAL_MISMATCH',
        field: 'balanceAmount',
        value: String(balanceAmount),
        relatedEntity: 'SalesOrder',
        message: `Source balance ${normalized.balanceAmount} differs from ledger-derived total minus paid (${balanceAmount}); the source value is retained only as audit input.`,
      }));
    }
    normalized.financials = {
      subtotal: Number(normalized.exFactoryPrice || 0),
      taxAmount: Number(normalized.advanceTax || 0),
      otherCharges: Number(normalized.freightCharges || 0),
      discountAmount: Number(normalized.discount || 0),
      totalAmount,
      paidAmount,
      balanceAmount,
    };
  }

  if (logicalType === 'dispatch') {
    requireValue('dispatchNumber', 'SalesOrder', "Dispatch Report cannot be imported because required field 'dispatchNumber' is missing.");
    requireValue('dispatchDate', 'SalesOrder', "Dispatch Report cannot be imported because required field 'dispatchDate' is missing.");
    if (![normalized.externalOrderNumber, normalized.pboNo, normalized.chassisNumber, normalized.externalInvoiceNumber, normalized.sapOrderNumber].some(rawPresent)) {
      errors.push(issue(record, {
        sourceIdentifier,
        field: 'orderReference',
        missingField: 'orderReference',
        relatedEntity: 'SalesOrder',
        message: 'Dispatch Report requires Order Number, PBO, chassis, invoice, or SAP order reference.',
      }));
    }
  }

  debugEvent('row.normalized', {
    _meta: normalized._meta,
    logicalType,
    normalizedRow: normalized,
    identifiedCustomer: {
      name: normalized.customerName || '',
      type: normalized.customerType || '',
      customerCode: normalized.customerCode || '',
      cnic: normalized.cnic || '',
      ntn: normalized.ntn || '',
      email: normalized.email || '',
      phone: normalized.phone || '',
    },
    seller: normalized.sellerName || '',
    bookingNumber: normalized.pboNo || '',
    orderNumber: normalized.externalOrderNumber || '',
    referenceNumber: normalized.referenceNumber || normalized.sapOrderNumber || '',
    invoiceNumber: normalized.externalInvoiceNumber || normalized.invoiceNumber || '',
    chassisNumber: normalized.chassisNumber || '',
    engineNumber: normalized.engineNumber || '',
    vehicle: {
      make: normalized.brandName || '',
      model: normalized.modelName || '',
      variant: normalized.variantName || '',
      colour: normalized.colorName || '',
      year: normalized.modelYear || null,
    },
    financials: normalized.financials || {},
    payments: normalized.payments || [],
    errors,
    warnings,
  }, { level: errors.length ? 'error' : (warnings.length ? 'warn' : 'info') });
  return { value: normalized, errors, warnings };
}

module.exports = {
  hasCorporateNameMarker,
  inferCustomerType,
  isNormalPersonName,
  normalizeCustomerType,
  normalizeBusinessReference,
  normalizeRecord,
  parseDate,
  parseNumber,
  rawPresent,
};
