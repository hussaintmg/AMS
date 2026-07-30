/**
 * Unified Data Import Page
 * Multi-file upload with auto-detection for Dealer Pro XLSX files.
 * Handles Order Intake, Orders Sales, and Dispatch Report imports.
 *
 * Flow: Select files → Preview (read-only plan) → Commit (real writes)
 * The commit report shows entity-level actual counters plus MongoDB
 * before/after counts so planned work is never confused with real writes.
 *
 * Maintained by Hussain Developer — AMS ERP
 */

import React, { useState, useCallback, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { uploaderAPI } from '../services/api';
import '../styles/uploader.css';

const FILE_SLOTS = [
  { key: 'orderIntake', label: 'Order Intake Report', step: 'Step 1', description: 'Bookings, applicant, variant, color, and booking amounts.', icon: '📋' },
  { key: 'orderSales', label: 'Orders Sales Report', step: 'Step 2', description: 'Customer identity (CNIC/NTN/phone), payments, installments, chassis/engine.', icon: '💰' },
  { key: 'dispatch', label: 'Dispatch Report', step: 'Step 3', description: 'Dispatch number, chassis, engine, invoice, transport and shipping.', icon: '🚚' },
];

const ENTITY_LABELS = {
  customers: 'Customers',
  sellers: 'Sellers',
  makes: 'Vehicle Makes',
  models: 'Vehicle Models',
  variants: 'Vehicle Variants',
  colors: 'Vehicle Colors',
  vehicles: 'Vehicles',
  bookings: 'Bookings',
  salesOrders: 'Sales Orders',
  invoices: 'Invoices',
  payments: 'Payments',
  dispatchRecords: 'Dispatch Records',
};

const COUNT_LABELS = {
  customers: 'Customers',
  makes: 'Makes',
  models: 'Models',
  variants: 'Variants',
  colors: 'Colors',
  vehicles: 'Vehicles',
  bookings: 'Bookings',
  salesOrders: 'Sales Orders',
  invoices: 'Invoices',
  payments: 'Payments',
};

function StatCard({ label, value, tone = 'neutral' }) {
  return (
    <div className={`uploader-stat uploader-stat-${tone}`}>
      <div className="uploader-stat-value">{value}</div>
      <div className="uploader-stat-label">{label}</div>
    </div>
  );
}

/** One selected workbook inside a slot: detection state + individual remove. */
function FileEntryRow({ entry, onRemove, disabled }) {
  return (
    <li className={`uploader-file-entry ${entry.detectError ? 'entry-error' : ''}`}>
      <span className="uploader-file-name" title={entry.file.name}>{entry.file.name}</span>
      <span className="uploader-file-size">{(entry.file.size / 1024 / 1024).toFixed(2)} MB</span>
      {entry.detecting && <span className="spinner-small uploader-detect-spinner" />}
      {!entry.detecting && entry.detectedType && (
        <span className="uploader-badge uploader-badge-ok">✓ Detected</span>
      )}
      {!entry.detecting && entry.movedFrom && (
        <span className="uploader-badge uploader-badge-info" title={`Moved from ${entry.movedFrom}`}>↷ auto-sorted</span>
      )}
      {!entry.detecting && entry.detectError && (
        <span className="uploader-badge uploader-badge-warn" title={entry.detectError}>⚠ {entry.detectError}</span>
      )}
      <button
        type="button"
        className="btn-icon remove-btn uploader-entry-remove"
        onClick={() => onRemove(entry.id)}
        title={`Remove ${entry.file.name}`}
        disabled={disabled}
      >
        <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </li>
  );
}

function FileSlot({ slot, entries, onFilesSelect, onRemove, disabled }) {
  const fileInputRef = useRef(null);
  const [dragActive, setDragActive] = useState(false);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (disabled) return;
    if (e.dataTransfer.files?.length) onFilesSelect(slot.key, [...e.dataTransfer.files]);
  }, [slot.key, onFilesSelect, disabled]);

  return (
    <div
      className={`uploader-slot ${entries.length ? 'has-file' : ''} ${dragActive ? 'drag-active' : ''}`}
      onDrop={handleDrop}
      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDragActive(true); }}
      onDragLeave={() => setDragActive(false)}
    >
      <span className="uploader-slot-icon">{slot.icon}</span>
      <div className="uploader-slot-info">
        <div className="uploader-slot-title">
          <span className="uploader-slot-step">{slot.step}</span>
          <h4>{slot.label}</h4>
          {entries.length > 0 && (
            <span className="uploader-slot-count">{entries.length} file{entries.length !== 1 ? 's' : ''}</span>
          )}
        </div>
        {entries.length === 0 ? (
          <p>{slot.description}</p>
        ) : (
          <ul className="uploader-file-list">
            {entries.map((entry) => (
              <FileEntryRow key={entry.id} entry={entry} onRemove={onRemove} disabled={disabled} />
            ))}
          </ul>
        )}
      </div>
      <div className="uploader-slot-actions">
        <button
          type="button"
          className="btn-secondary uploader-select-btn"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled}
        >
          <svg className="uploader-button-icon" width="17" height="17" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v12m0-12L7 9m5-5 5 5M5 15v3a2 2 0 002 2h10a2 2 0 002-2v-3" />
          </svg>
          {entries.length ? 'Add More' : 'Select Files'}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          className="file-input-hidden"
          accept=".xlsx,.csv"
          multiple
          style={{ display: 'none' }}
          onChange={(e) => {
            if (e.target.files?.length) onFilesSelect(slot.key, [...e.target.files]);
            e.target.value = '';
          }}
        />
      </div>
    </div>
  );
}

/** Entity table for preview (planned*) or commit (actual) counters. */
function EntityBreakdown({ entities, mode }) {
  const rows = Object.entries(entities || {})
    .map(([key, counts]) => {
      const create = Number(mode === 'preview' ? counts.plannedCreate : counts.created) || 0;
      const update = Number(mode === 'preview' ? counts.plannedUpdate : counts.updated) || 0;
      const reuse = Number(mode === 'preview' ? counts.plannedReuse : (counts.reused ?? counts.resolved ?? counts.skipped)) || 0;
      return { key, label: ENTITY_LABELS[key] || key, create, update, reuse };
    })
    .filter((row) => row.create || row.update || row.reuse);
  if (!rows.length) return null;
  return (
    <div className="uploader-table-wrap">
      <table className="uploader-table">
        <thead>
          <tr>
            <th>Entity</th>
            <th>{mode === 'preview' ? 'Planned Create' : 'Created'}</th>
            <th>{mode === 'preview' ? 'Planned Update' : 'Updated'}</th>
            <th>{mode === 'preview' ? 'Planned Reuse' : 'Reused / Skipped'}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              <td>{row.label}</td>
              <td className={row.create ? 'cell-create' : 'cell-zero'}>{row.create}</td>
              <td className={row.update ? 'cell-update' : 'cell-zero'}>{row.update}</td>
              <td className={row.reuse ? 'cell-reuse' : 'cell-zero'}>{row.reuse}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** MongoDB before/after/diff verification table (commit only). */
function DatabaseDiff({ result }) {
  const before = result?.countsBefore || {};
  const after = result?.countsAfter || {};
  const diff = result?.databaseDiff || {};
  const keys = Object.keys(COUNT_LABELS).filter((key) => key in before || key in after);
  if (!keys.length) return null;
  return (
    <div className="uploader-dbverify">
      <div className="uploader-dbverify-head">
        <h4>Database Verification (fresh MongoDB counts)</h4>
        <div className="uploader-dbverify-meta">
          {result.databaseName && <span className="uploader-chip">db: <strong>{result.databaseName}</strong></span>}
          {result.transactionMode && <span className="uploader-chip">{result.transactionMode === 'mongodb_transaction' ? 'transactions' : 'compensating rollback'}</span>}
          <span className={`uploader-chip ${result.databaseWritesObserved ? 'chip-ok' : 'chip-warn'}`}>
            {result.databaseWritesObserved ? '✓ writes observed' : 'no writes observed'}
          </span>
        </div>
      </div>
      <div className="uploader-table-wrap">
        <table className="uploader-table">
          <thead>
            <tr>
              <th>Collection</th>
              <th>Before</th>
              <th>After</th>
              <th>Diff</th>
            </tr>
          </thead>
          <tbody>
            {keys.map((key) => (
              <tr key={key}>
                <td>{COUNT_LABELS[key]}</td>
                <td>{before[key] ?? '—'}</td>
                <td>{after[key] ?? '—'}</td>
                <td className={diff[key] > 0 ? 'cell-create' : 'cell-zero'}>
                  {diff[key] > 0 ? `+${diff[key]}` : (diff[key] ?? 0)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function chainName(customer) {
  if (!customer) return 'Unknown customer';
  return customer.companyName || [customer.firstName, customer.lastName].filter(Boolean).join(' ') || customer.customerCode || 'Customer';
}

function vehicleLabel(vehicle) {
  if (!vehicle) return null;
  return [vehicle.make?.name, vehicle.model?.name, vehicle.variant?.name].filter(Boolean).join(' ')
    || vehicle.chassisNumber || vehicle.vin || vehicle.engineNumber || vehicle.vehicleCode;
}

/** One verified customer→booking→order→vehicle→invoice→payments→dispatch chain. */
function ChainCard({ chain, index }) {
  const links = [
    { label: 'Customer', value: chainName(chain.customer), id: chain.customer?._id, always: true },
    { label: 'Booking', value: chain.booking?.bookingNumber || chain.booking?.pboNo, id: chain.booking?._id },
    { label: 'Sales Order', value: chain.salesOrder?.orderNumber || chain.salesOrder?.externalOrderNumber, id: chain.salesOrder?._id },
    { label: 'Vehicle', value: vehicleLabel(chain.vehicle), id: chain.vehicle?._id },
    { label: 'Invoice', value: chain.invoice?.invoiceNumber || chain.invoice?.externalInvoiceNumber, id: chain.invoice?._id },
    { label: 'Payments', value: chain.payments?.length ? `${chain.payments.length} payment${chain.payments.length > 1 ? 's' : ''}` : null },
    { label: 'Dispatch', value: chain.dispatch?.dispatchNo },
  ].filter((link) => link.always || link.value);
  return (
    <div className="uploader-chain">
      <div className="uploader-chain-head">
        <strong>#{index + 1} · {chain.sourceIdentifier || 'chain'}</strong>
        <span className={`uploader-badge ${chain.verifiedByFreshQuery ? 'uploader-badge-ok' : 'uploader-badge-warn'}`}>
          {chain.verifiedByFreshQuery ? '✓ verified in MongoDB' : 'unverified'}
        </span>
      </div>
      <div className="uploader-chain-links">
        {links.map((link, i) => (
          <React.Fragment key={link.label}>
            {i > 0 && <span className="uploader-chain-arrow">→</span>}
            <span className="uploader-chain-node" title={link.id ? `id: ${link.id}` : undefined}>
              <small>{link.label}</small>
              {link.value || '—'}
            </span>
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

function PerFileResults({ files, mode }) {
  if (!files?.length) return null;
  return (
    <div className="uploader-files-summary">
      {files.map((f) => (
        <div key={f.fileKey || f.fileName} className="uploader-file-row">
          <div className="uploader-cell-stack uploader-file-row-name">
            <strong>{f.label}</strong>
            {f.fileName && <small title={f.fileName}>{f.fileName}</small>}
          </div>
          <span className={`uploader-badge ${f.status === 'completed' || f.status === 'preview_ready' ? 'uploader-badge-ok' : f.status === 'failed' ? 'uploader-badge-bad' : 'uploader-badge-warn'}`}>
            {f.status?.replace(/_/g, ' ')}
          </span>
          <span>{f.totalRows} rows</span>
          <span className="text-ok">{f.successful} valid</span>
          {mode === 'commit' && <span className="text-create">{f.created || 0} created</span>}
          {mode === 'commit' && <span className="text-update">{f.updated || 0} updated</span>}
          {(f.duplicates > 0) && <span className="text-muted">{f.duplicates} duplicates</span>}
          {(f.warnings?.length > 0) && <span className="text-warn">{f.warnings.length} warnings</span>}
          {(f.failed > 0) && <span className="text-bad">{f.failed} failed</span>}
        </div>
      ))}
    </div>
  );
}

function IssuesTable({ issues, tone, title, exportName }) {
  const [expanded, setExpanded] = useState(false);
  if (!issues?.length) return null;
  const shown = expanded ? issues.slice(0, 500) : issues.slice(0, 10);

  const exportCsv = () => {
    const cell = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const header = ['File', 'Sheet', 'Row', 'Source', 'Type', 'Field', 'Value', 'Message'].map(cell).join(',') + '\n';
    const rows = issues
      .map((e) => [e.fileType, e.sheetName, e.row, e.sourceIdentifier, e.errorType, e.field, e.value, e.message].map(cell).join(','))
      .join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${exportName}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="card uploader-issues">
      <div className="card-body">
        <div className="uploader-issues-head">
          <h3 className={tone === 'error' ? 'text-bad' : 'text-warn'}>
            {title} ({issues.length})
          </h3>
          <button className="btn-secondary uploader-small-btn" onClick={exportCsv}>Export CSV</button>
        </div>
        <div className="uploader-table-wrap">
          <table className="uploader-table">
            <thead>
              <tr>
                <th>Row</th>
                <th>File / Source</th>
                <th>Type</th>
                <th>Field</th>
                <th>Message</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((err, i) => (
                <tr key={i}>
                  <td>{err.row || '-'}</td>
                  <td>
                    <div className="uploader-cell-stack">
                      <span>{err.fileType || '-'}</span>
                      {err.sourceIdentifier && <small>{err.sourceIdentifier}</small>}
                    </div>
                  </td>
                  <td><code className="uploader-code">{err.errorType || '-'}</code></td>
                  <td>{err.field || '-'}</td>
                  <td className={tone === 'error' ? 'text-bad' : ''}>{err.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {issues.length > 10 && (
          <button className="btn-link uploader-show-more" onClick={() => setExpanded((v) => !v)}>
            {expanded ? 'Show less' : `Show all ${Math.min(issues.length, 500)}`}
          </button>
        )}
      </div>
    </div>
  );
}

export default function DataImport() {
  const navigate = useNavigate();
  // One entry per selected workbook: { id, file, slot, detecting, detectedType, detectError, movedFrom }
  const [entries, setEntries] = useState([]);
  const entriesRef = useRef([]);
  entriesRef.current = entries;
  const entryCounter = useRef(0);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  const [uploadErrors, setUploadErrors] = useState([]);
  const [uploadWarnings, setUploadWarnings] = useState([]);
  const [previewResult, setPreviewResult] = useState(null);
  const [previewBatchId, setPreviewBatchId] = useState(null);

  const resetResults = () => {
    setPreviewResult(null);
    setPreviewBatchId(null);
    setUploadResult(null);
    setUploadErrors([]);
    setUploadWarnings([]);
  };

  /**
   * Add files to a slot. Every file is detected on its own and, if it turns out
   * to belong to another report type, it is moved to that slot automatically —
   * so a wrongly-dropped file is sorted instead of blocking the batch.
   */
  const handleFilesSelect = useCallback(async (slotKey, incoming) => {
    const accepted = [];
    incoming.forEach((file) => {
      const name = file.name.toLowerCase();
      if (!name.endsWith('.xlsx') && !name.endsWith('.csv')) {
        toast.error(`${file.name}: only .xlsx and .csv files are supported.`, { position: 'top-center' });
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        toast.error(`${file.name}: exceeds the 10MB limit.`, { position: 'top-center' });
        return;
      }
      accepted.push(file);
    });
    if (!accepted.length) return;

    // Build the new entries outside the state updater: the updater must stay pure
    // (React invokes it twice in development, which would double the ids).
    const known = new Set(entriesRef.current.map((entry) => `${entry.file.name}|${entry.file.size}`));
    const fresh = [];
    accepted.forEach((file) => {
      const key = `${file.name}|${file.size}`;
      if (known.has(key)) {
        toast.error(`${file.name} is already selected.`, { position: 'top-center' });
        return;
      }
      known.add(key);
      entryCounter.current += 1;
      fresh.push({
        id: `entry-${entryCounter.current}`,
        file,
        slot: slotKey,
        detecting: true,
        detectedType: null,
        detectError: null,
        movedFrom: null,
      });
    });
    if (!fresh.length) return;
    setEntries((prev) => [...prev, ...fresh]);
    resetResults();

    const patch = (id, changes) => setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, ...changes } : e)));

    await Promise.all(fresh.map(async (entry) => {
      try {
        const formData = new FormData();
        formData.append('file', entry.file);
        const res = await uploaderAPI.detectFileType(formData);
        const detected = res.data?.data?.logicalType;
        if (!res.data?.success || !detected) {
          patch(entry.id, { detecting: false, detectError: res.data?.message || 'Unknown file type' });
          return;
        }
        if (detected !== entry.slot) {
          const from = FILE_SLOTS.find((s) => s.key === entry.slot)?.label || entry.slot;
          const to = FILE_SLOTS.find((s) => s.key === detected)?.label || detected;
          patch(entry.id, { detecting: false, detectedType: detected, slot: detected, movedFrom: from, detectError: null });
          toast.success(`${entry.file.name} is a ${to} — moved there automatically.`, { duration: 4000 });
          return;
        }
        patch(entry.id, { detecting: false, detectedType: detected, detectError: null });
      } catch (err) {
        patch(entry.id, { detecting: false, detectError: err.response?.data?.message || 'Detection failed' });
      }
    }));
  }, []);

  const handleRemove = useCallback((entryId) => {
    setEntries((prev) => prev.filter((entry) => entry.id !== entryId));
    resetResults();
  }, []);

  const buildBatchForm = (readyEntries, preview = false) => {
    const formData = new FormData();
    // Repeat the field name per file: multer collects them into an array.
    readyEntries.forEach((entry) => formData.append(entry.slot, entry.file));
    const batchId = preview
      ? (crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`)
      : (previewBatchId || crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`);
    if (preview) setPreviewBatchId(batchId);
    formData.append('batchId', batchId);
    formData.append('mode', preview ? 'preview' : 'commit');
    return formData;
  };

  const handlePreview = async () => {
    if (!entries.length) {
      toast.error('Select at least one file to validate.');
      return;
    }
    setIsUploading(true);
    resetResults();
    const toastId = toast.loading('Validating files and resolving dependencies...');
    try {
      const res = await uploaderAPI.previewBatch(buildBatchForm(entries, true));
      if (!res.data?.success) {
        setUploadErrors(res.data?.errors || []);
        toast.error(res.data?.message || 'Validation failed.', { id: toastId, duration: 5000 });
        return;
      }
      const preview = res.data?.data || null;
      setPreviewResult(preview);
      setUploadErrors(preview?.errors || res.data?.errors || []);
      setUploadWarnings(preview?.warnings || []);
      toast.success('Preview ready. Review the plan, then confirm the import.', { id: toastId });
    } catch (err) {
      toast.error(err.response?.data?.message || 'Validation failed.', { id: toastId, duration: 5000 });
      setUploadErrors(err.response?.data?.errors || []);
    } finally {
      setIsUploading(false);
    }
  };

  const handleSubmit = async () => {
    if (!entries.length) {
      toast.error('Select at least one file to import.');
      return;
    }

    setIsUploading(true);
    setUploadResult(null);
    setUploadErrors([]);
    setUploadWarnings([]);
    const toastId = toast.loading('Uploading and processing files...');

    try {
      const formData = buildBatchForm(entries);
      const res = await uploaderAPI.uploadBatch(formData, {
        onUploadProgress: (e) => {
          if (e.total) {
            const pct = Math.round((e.loaded / e.total) * 50);
            toast.loading(`Uploading... ${pct}%`, { id: toastId });
          }
        },
      });

      const result = res.data?.data || res.data;
      setUploadResult(result);
      setUploadErrors(result?.errors || res.data?.errors || []);
      setUploadWarnings(result?.warnings || []);
      if (res.data?.success) {
        toast.success(res.data.message || 'Import completed', { id: toastId, duration: 5000 });
        setEntries([]);
        setPreviewResult(null);
        setPreviewBatchId(null);
      } else {
        toast.error(res.data?.message || 'Import completed with errors', { id: toastId, duration: 6000 });
      }
    } catch (err) {
      const msg = err.response?.data?.message || 'Upload failed. Please try again.';
      toast.error(msg, { id: toastId, duration: 5000 });
      setUploadErrors(err.response?.data?.errors || []);
    } finally {
      setIsUploading(false);
    }
  };

  const hasFiles = entries.length > 0;
  const undetectedEntries = entries.filter((entry) => entry.detecting || entry.detectError || !entry.detectedType);
  const hasInvalidDetection = undetectedEntries.length > 0;
  const entriesBySlot = useMemo(() => Object.fromEntries(
    FILE_SLOTS.map((slot) => [slot.key, entries.filter((entry) => entry.slot === slot.key)]),
  ), [entries]);

  const activeStep = uploadResult ? 3 : previewResult ? 2 : 1;
  const steps = useMemo(() => ([
    { n: 1, label: 'Select Files' },
    { n: 2, label: 'Preview Plan' },
    { n: 3, label: 'Commit & Verify' },
  ]), []);

  return (
    <div className="page-container">
      <div className="page-header">
        <h2>Data Import</h2>
        <button className="uploader-back-button" onClick={() => navigate(-1)} aria-label="Go back">
          <span aria-hidden="true">&larr;</span> Back
        </button>
      </div>

      <div className="uploader-hero">
        <div>
          <span className="uploader-kicker">Dealer Pro XLSX Import</span>
          <h3>Import Order Intake, Sales, and Dispatch data in one batch</h3>
          <p>Files run in Intake → Sales → Dispatch order and share one context: Sales reuses Intake customers and bookings; Dispatch resolves existing Sales Orders by PBO. Re-importing the same files never creates duplicates.</p>
        </div>
        <div className="uploader-format-badge">XLSX / CSV<br /><small>Up to 10 MB each</small></div>
      </div>

      <div className="uploader-steps">
        {steps.map((step, i) => (
          <React.Fragment key={step.n}>
            {i > 0 && <span className={`uploader-step-line ${activeStep > i ? 'done' : ''}`} />}
            <div className={`uploader-step ${activeStep === step.n ? 'active' : ''} ${activeStep > step.n ? 'done' : ''}`}>
              <span className="uploader-step-dot">{activeStep > step.n ? '✓' : step.n}</span>
              <span className="uploader-step-label">{step.label}</span>
            </div>
          </React.Fragment>
        ))}
      </div>

      <div className="uploader-slots">
        {FILE_SLOTS.map((slot) => (
          <FileSlot
            key={slot.key}
            slot={slot}
            entries={entriesBySlot[slot.key]}
            onFilesSelect={handleFilesSelect}
            onRemove={handleRemove}
            disabled={isUploading}
          />
        ))}
      </div>

      {undetectedEntries.some((entry) => entry.detectError) && (
        <div className="uploader-alert uploader-alert-error">
          <strong>Some files could not be recognised.</strong> Remove them or replace them with a Dealer Pro export:
          <ul>
            {undetectedEntries.filter((entry) => entry.detectError).map((entry) => (
              <li key={entry.id}><strong>{entry.file.name}</strong> — {entry.detectError}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="uploader-actions">
        <div className="uploader-action-summary">
          <span className="uploader-action-summary-icon" aria-hidden="true">
            <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12.75l2 2 4-4.5m5.25-3.75A11.95 11.95 0 0112 2.25 11.95 11.95 0 013.75 6.5c0 5.25 3.5 10 8.25 11.25C16.75 16.5 20.25 11.75 20.25 6.5z" />
            </svg>
          </span>
          <div>
            <strong>
              {previewResult
                ? 'Preview reviewed — ready to import'
                : hasFiles
                  ? `${entries.length} file${entries.length !== 1 ? 's' : ''} selected`
                  : 'Select your import files'}
            </strong>
            <span>
              {previewResult
                ? 'Commit will write the verified rows to the database.'
                : 'Files are validated before any database changes are made.'}
            </span>
          </div>
        </div>

        <div className="uploader-action-buttons">
          <button
            className="btn-primary uploader-main-btn"
            onClick={previewResult ? handleSubmit : handlePreview}
            disabled={!hasFiles || isUploading || hasInvalidDetection || (Boolean(previewResult) && !(previewResult.totals?.successful > 0))}
          >
            {isUploading ? (
              <><span className="spinner-small uploader-btn-spinner" /> {previewResult ? 'Importing...' : 'Validating...'}</>
            ) : (
              <>
                <svg className="uploader-button-icon" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  {previewResult
                    ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                    : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 16V4m0 0L7 9m5-5 5 5M5 15v3a2 2 0 002 2h10a2 2 0 002-2v-3" />}
                </svg>
                <span>
                  {hasInvalidDetection && hasFiles
                    ? (undetectedEntries.some((entry) => entry.detecting) ? 'Detecting files...' : 'Resolve file detection first')
                    : previewResult
                      ? `Commit Import (${previewResult.totals?.successful || 0} valid rows)`
                      : `Preview ${entries.length} File${entries.length !== 1 ? 's' : ''}`}
                </span>
              </>
            )}
          </button>
          {hasFiles && (
            <button
              className="btn-secondary uploader-clear-btn"
              onClick={() => { setEntries([]); resetResults(); }}
              disabled={isUploading}
            >
              <svg className="uploader-button-icon" width="17" height="17" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 7h12m-9 0V5h6v2m-8 0 1 12h8l1-12M10 11v5m4-5v5" />
              </svg>
              Clear All
            </button>
          )}
        </div>
      </div>

      {previewResult && !uploadResult && (
        <div className="card uploader-result-card">
          <div className="card-body">
            <div className="uploader-result-head">
              <h3>Import Preview — no records written yet</h3>
              <span className="uploader-badge uploader-badge-info">read-only plan</span>
            </div>
            <p className="uploader-result-note">
              These are <strong>planned</strong> operations only. Valid rows will run in Order Intake → Sales → Dispatch order when you commit; failed rows will be left unchanged.
            </p>
            <div className="uploader-stats">
              <StatCard label="Total Rows" value={previewResult.totals?.totalRows || 0} />
              <StatCard label="Valid Rows" value={previewResult.totals?.successful || 0} tone="ok" />
              <StatCard label="Planned Create" value={previewResult.totals?.plannedCreate || 0} tone="create" />
              <StatCard label="Planned Update" value={previewResult.totals?.plannedUpdate || 0} tone="update" />
              <StatCard label="Planned Reuse" value={previewResult.totals?.plannedReuse || 0} tone="reuse" />
              <StatCard label="Errors" value={previewResult.totals?.failed || 0} tone={previewResult.totals?.failed ? 'bad' : 'neutral'} />
            </div>
            <PerFileResults files={previewResult.files} mode="preview" />
            <h4 className="uploader-section-title">Planned changes by entity</h4>
            <EntityBreakdown entities={previewResult.entities} mode="preview" />
          </div>
        </div>
      )}

      {uploadResult && (
        <div className="card uploader-result-card">
          <div className="card-body">
            <div className="uploader-result-head">
              <h3 className={uploadResult.status === 'completed' ? 'text-ok' : 'text-warn'}>
                {uploadResult.status === 'completed' ? 'Import Completed' : 'Import Completed With Errors'}
              </h3>
              <span className="uploader-badge uploader-badge-info">mode: commit</span>
            </div>
            <div className="uploader-stats">
              <StatCard label="Total Rows" value={uploadResult.totals?.totalRows || 0} />
              <StatCard label="Successful" value={uploadResult.totals?.successful || 0} tone="ok" />
              <StatCard label="Created" value={uploadResult.totals?.created || 0} tone="create" />
              <StatCard label="Updated" value={uploadResult.totals?.updated || 0} tone="update" />
              <StatCard label="Duplicates Skipped" value={uploadResult.totals?.skipped || 0} tone="reuse" />
              <StatCard label="Failed" value={uploadResult.totals?.failed || 0} tone={uploadResult.totals?.failed ? 'bad' : 'neutral'} />
            </div>
            <PerFileResults files={uploadResult.files} mode="commit" />
            <h4 className="uploader-section-title">Actual database operations by entity</h4>
            <EntityBreakdown entities={uploadResult.entities} mode="commit" />
            <DatabaseDiff result={uploadResult} />
            {uploadResult.successfulChains?.length > 0 && (
              <>
                <h4 className="uploader-section-title">Verified relationship chains (fresh queries)</h4>
                {uploadResult.successfulChains.map((chain, i) => (
                  <ChainCard key={i} chain={chain} index={i} />
                ))}
              </>
            )}
            <div className="uploader-nav-actions">
              <button className="btn-secondary" onClick={() => navigate('/sales')}>View Sales</button>
              <button className="btn-secondary" onClick={() => navigate('/dispatch')}>View Dispatches</button>
              <button className="btn-secondary" onClick={() => navigate('/customers')}>View Customers</button>
              <button className="btn-secondary" onClick={() => navigate('/vehicles')}>View Vehicles</button>
            </div>
          </div>
        </div>
      )}

      <IssuesTable issues={uploadErrors} tone="error" title="Row-Level Errors" exportName="import-errors" />
      <IssuesTable issues={uploadWarnings} tone="warning" title="Warnings" exportName="import-warnings" />
    </div>
  );
}
