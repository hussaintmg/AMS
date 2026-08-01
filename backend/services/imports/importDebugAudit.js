const fs = require('fs');
const path = require('path');
const { AsyncLocalStorage } = require('async_hooks');
const logger = require('../../utils/logger');

const storage = new AsyncLocalStorage();
const REPORT_SECTIONS = Object.freeze({
  customers: ['existing', 'newlyCreated', 'failed', 'ambiguous'],
  vehicles: ['existingReused', 'newlyCreated', 'alreadySoldOrDispatched', 'duplicateAttempt', 'conflicts', 'failed'],
  bookings: ['existing', 'newlyCreated', 'failed'],
  salesOrders: ['existing', 'newlyCreated', 'failed'],
  invoices: ['existing', 'newlyCreated', 'failed'],
  payments: ['existing', 'newlyCreated', 'duplicatesPrevented', 'failed'],
  sellers: ['resolved', 'unresolved', 'ambiguous', 'autoCreated'],
});

function jsonSafe(value) {
  if (value == null) return value;
  if (value instanceof Date) return value.toISOString();
  if (Buffer.isBuffer(value)) return `[Buffer ${value.length} bytes]`;
  if (Array.isArray(value)) return value.map(jsonSafe);
  if (typeof value === 'object') {
    if (value._bsontype === 'ObjectId' || value.constructor?.name === 'ObjectId') return String(value);
    if (typeof value.toObject === 'function') return jsonSafe(value.toObject());
    return Object.fromEntries(Object.entries(value)
      .filter(([key]) => !key.startsWith('$') && key !== '__v')
      .map(([key, entry]) => [key, jsonSafe(entry)]));
  }
  if (typeof value === 'bigint') return String(value);
  return value;
}

function sourceMeta(payload = {}) {
  const meta = payload._meta || payload.meta || {};
  return {
    sourceFile: meta.fileName || payload.sourceFile || '',
    sheet: meta.sheetName || payload.sheet || '',
    excelRowNumber: meta.rowNumber || payload.excelRowNumber || null,
  };
}

function sourceIdentifiers(payload = {}) {
  const row = payload.row || payload.normalizedRow || payload.rawRow || payload;
  return {
    customerCode: row.customerCode || '',
    customerName: row.customerName || '',
    bookingNumber: row.bookingNumber || row.pboNo || '',
    orderNumber: row.externalOrderNumber || row.orderNumber || '',
    referenceNumber: row.referenceNumber || row.sapOrderNumber || '',
    invoiceNumber: row.externalInvoiceNumber || row.invoiceNumber || '',
    dispatchNumber: row.dispatchNumber || '',
    chassisNumber: row.chassisNumber || row.vin || '',
    engineNumber: row.engineNumber || '',
  };
}

function emptyReport({ batchId, mode, userId }) {
  const report = {
    runSummary: {
      batchId: batchId || '',
      mode: mode || 'unknown',
      userId: userId ? String(userId) : null,
      startedAt: new Date().toISOString(),
      completedAt: null,
      status: 'running',
      fileCount: 0,
      rowCount: 0,
      eventCount: 0,
      errorCount: 0,
      warningCount: 0,
    },
    files: [],
    rows: [],
  };
  Object.entries(REPORT_SECTIONS).forEach(([section, buckets]) => {
    report[section] = Object.fromEntries(buckets.map((bucket) => [bucket, []]));
  });
  report.relationships = [];
  report.errors = [];
  report.warnings = [];
  return report;
}

class ImportDebugAudit {
  constructor({ batchId = '', mode = 'unknown', userId = null, outputDirectory = null } = {}) {
    this.report = emptyReport({ batchId, mode, userId });
    this.outputDirectory = outputDirectory || path.resolve(__dirname, '../../logs/import-audits');
    this.rowIndex = new Map();
    this.filePath = null;
    this.finalized = false;
  }

  run(callback) {
    return storage.run(this, callback);
  }

  event(stage, payload = {}, { section = null, bucket = null, level = 'info' } = {}) {
    const safe = jsonSafe(payload);
    const meta = sourceMeta(safe);
    const event = {
      timestamp: new Date().toISOString(),
      stage,
      ...meta,
      ...safe,
    };
    this.report.runSummary.eventCount += 1;
    // Every row emits several of these. Echoing them to the console buried real
    // problems under thousands of lines per import, so only failures are printed —
    // the full event stream still goes to the audit file this class writes.
    if (level === 'error') {
      logger.error('Import debug event', { importDebug: true, batchId: this.report.runSummary.batchId, mode: this.report.runSummary.mode, ...event });
    }

    if (meta.excelRowNumber != null) {
      const key = `${meta.sourceFile}\u0000${meta.sheet}\u0000${meta.excelRowNumber}`;
      let rowRecord = this.rowIndex.get(key);
      if (!rowRecord) {
        rowRecord = { ...meta, sourceIdentifiers: sourceIdentifiers(safe), stages: [] };
        this.rowIndex.set(key, rowRecord);
        this.report.rows.push(rowRecord);
      }
      const identifiers = sourceIdentifiers(safe);
      Object.entries(identifiers).forEach(([field, value]) => {
        if (value && !rowRecord.sourceIdentifiers[field]) rowRecord.sourceIdentifiers[field] = value;
      });
      rowRecord.stages.push(event);
    }
    if (section && bucket && this.report[section]?.[bucket]) this.report[section][bucket].push(event);
    if (level === 'error') this.report.errors.push(event);
    if (level === 'warn') this.report.warnings.push(event);
    return event;
  }

  file(payload = {}) {
    const event = this.event('file.parsed', payload);
    this.report.files.push(event);
    this.report.runSummary.fileCount = this.report.files.length;
    return event;
  }

  relationship(payload = {}, level = 'info') {
    const event = this.event('relationship.verification', payload, { level });
    this.report.relationships.push(event);
    return event;
  }

  async finalize(status = 'completed', details = {}) {
    if (this.finalized) return this.filePath;
    this.finalized = true;
    this.report.runSummary.completedAt = new Date().toISOString();
    this.report.runSummary.status = status;
    this.report.runSummary.rowCount = this.report.rows.length;
    this.report.runSummary.errorCount = this.report.errors.length;
    this.report.runSummary.warningCount = this.report.warnings.length;
    Object.assign(this.report.runSummary, jsonSafe(details));
    await fs.promises.mkdir(this.outputDirectory, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:T]/g, '-').replace(/\.\d{3}Z$/, 'Z');
    const batchSuffix = this.report.runSummary.batchId ? `-${this.report.runSummary.batchId}` : '';
    this.filePath = path.join(this.outputDirectory, `import-debug-audit-${stamp}${batchSuffix}.json`);
    const temporaryPath = `${this.filePath}.tmp`;
    await fs.promises.writeFile(temporaryPath, `${JSON.stringify(this.report, null, 2)}\n`, 'utf8');
    await fs.promises.rename(temporaryPath, this.filePath);
    // No console line here: the audit file path is already returned to the client
    // as debugAuditFile and stored on the FileUpload records. During an upload the
    // terminal should only ever show real errors.
    return this.filePath;
  }
}

function currentAudit() {
  return storage.getStore() || null;
}

function debugEvent(stage, payload = {}, options = {}) {
  const audit = currentAudit();
  if (audit) return audit.event(stage, payload, options);
  const safe = jsonSafe(payload);
  const logPayload = { importDebug: true, stage, ...sourceMeta(safe), ...safe };
  // Outside a batch there is no audit file to collect these, but the same rule
  // applies: only failures reach the console.
  if (options.level === 'error') logger.error('Import debug event', logPayload);
  return logPayload;
}

/**
 * Per-row developer tracing ("[CUSTOMER_RESOLVE_START]", "[BOOKING_SAVE_SUCCESS]",
 * …). These fired several times per row and turned every import into thousands of
 * console lines that hid genuine errors. The same ground is covered by the audit
 * file's own stages (row.parsed, customer.lookup, booking.*), so the trace is a
 * no-op: keep the call sites, keep the console for failures only.
 */
function importTrace() {}

module.exports = {
  ImportDebugAudit,
  currentAudit,
  debugEvent,
  importTrace,
  jsonSafe,
};
