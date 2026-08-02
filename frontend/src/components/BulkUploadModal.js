/**
 * Reusable bulk upload modal — CSV / XLSX, drag-drop, templates, row-level errors.
 */

import React, { useRef, useState, useCallback } from 'react';
import { Upload, Download } from 'lucide-react';
import toast from 'react-hot-toast';
import { BULK_IMPORT_DOWNLOAD_NAMES } from '../constants/bulkImportSamples';
import api from '../services/api';
import { runClientBulkImport } from '../utils/bulkImportClient';
import useModalKeyboard from '../hooks/useModalKeyboard';
import './BulkUploadModal.css';

function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

export default function BulkUploadModal({
    isOpen,
    onClose,
    title,
    description,
    templateType,
    onCompleted
}) {
    const inputRef = useRef(null);
    const [dragOver, setDragOver] = useState(false);
    const [file, setFile] = useState(null);
    const [submitting, setSubmitting] = useState(false);
    const [downloading, setDownloading] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');
    const [result, setResult] = useState(null);

    const reset = () => {
        setFile(null);
        setErrorMessage('');
        setResult(null);
        setDragOver(false);
        if (inputRef.current) inputRef.current.value = '';
    };

    const handleClose = () => {
        reset();
        onClose();
    };

    const validateFile = useCallback((f) => {
        if (!f) return 'No file selected.';
        const name = f.name.toLowerCase();
        if (!name.endsWith('.csv') && !name.endsWith('.xlsx')) {
            return 'Only .csv or .xlsx files are supported.';
        }
        const max = 10 * 1024 * 1024;
        if (f.size > max) {
            return 'File is too large. Maximum size is 10 MB.';
        }
        return '';
    }, []);

    const pickFile = (f) => {
        const err = validateFile(f);
        if (err) {
            setErrorMessage(err);
            setFile(null);
            return;
        }
        setErrorMessage('');
        setResult(null);
        setFile(f);
    };

    const onDrop = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setDragOver(false);
        const f = e.dataTransfer.files?.[0];
        pickFile(f);
    };

    const downloadTemplate = async (format) => {
        try {
            setDownloading(true);
            setErrorMessage('');
            const res = await api.get(`/bulk-import/template/${templateType}?format=${format}`, {
                responseType: 'blob'
            });
            const blob = res.data;
            const name =
                BULK_IMPORT_DOWNLOAD_NAMES[templateType]?.[format] ||
                `ams_import_template.${format}`;
            downloadBlob(blob, name);
            toast.success(`Sample ${format.toUpperCase()} downloaded`);
        } catch (e) {
            const msg =
                e.response?.data?.message ||
                (typeof e.response?.data === 'string' ? e.response.data : null) ||
                e.message ||
                'Download failed';
            setErrorMessage(msg);
            toast.error(msg);
        } finally {
            setDownloading(false);
        }
    };

    const handleSubmit = async () => {
        const err = validateFile(file);
        if (err) {
            setErrorMessage(err);
            return;
        }
        setSubmitting(true);
        setErrorMessage('');
        setResult(null);
        try {
            const data = await runClientBulkImport(templateType, file);
            if (!data.success) {
                setErrorMessage('Import failed');
                toast.error('Import failed');
                return;
            }
            setResult(data);
            const { created, updated = 0, failed, total } = data.summary || {};
            const parts = [];
            if (created) parts.push(`${created} created`);
            if (updated) parts.push(`${updated} updated`);
            const summary = parts.length ? parts.join(', ') : '0 created';
            if (failed === 0) {
                toast.success(`${summary} (${total} total).`);
            } else {
                toast(`${summary}, ${failed} failed.`, {
                    icon: '⚠️'
                });
            }
            if (onCompleted) onCompleted(data);
        } catch (e) {
            const msg =
                e.response?.data?.message ||
                (typeof e.response?.data === 'string' ? e.response.data : null) ||
                e.message ||
                'Import failed';
            setErrorMessage(msg);
            toast.error(msg);
        } finally {
            setSubmitting(false);
        }
    };

    useModalKeyboard(isOpen, handleClose, handleSubmit, submitting);

    if (!isOpen) return null;

    return (
        <div className="bulk-upload-overlay" role="presentation" onClick={handleClose}>
            <div
                className="bulk-upload-dialog"
                role="dialog"
                aria-modal="true"
                aria-labelledby="bulk-upload-title"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="bulk-upload-dialog-header">
                    <div>
                        <h2 id="bulk-upload-title">{title}</h2>
                        {description ? <p>{description}</p> : null}
                    </div>
                    <button type="button" className="bulk-upload-close" onClick={handleClose} aria-label="Close">
                        ×
                    </button>
                </div>
                <div className="bulk-upload-body">
                    <p className="bulk-upload-hint">
                        Columns marked with <strong>*</strong> in the sample file are required. Optional columns
                        may be left blank. You may keep the first <strong>#</strong> instruction line in CSV files;
                        XLSX templates use row 1 for the same instructions.
                    </p>

                    <input
                        ref={inputRef}
                        type="file"
                        accept=".csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                        style={{ display: 'none' }}
                        onChange={(e) => pickFile(e.target.files?.[0])}
                    />

                    <div
                        className={`bulk-upload-dropzone ${dragOver ? 'bulk-upload-dropzone-active' : ''}`}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                inputRef.current?.click();
                            }
                        }}
                        onClick={() => inputRef.current?.click()}
                        onDragEnter={(e) => {
                            e.preventDefault();
                            setDragOver(true);
                        }}
                        onDragOver={(e) => {
                            e.preventDefault();
                            setDragOver(true);
                        }}
                        onDragLeave={() => setDragOver(false)}
                        onDrop={onDrop}
                    >
                        <Upload size={40} style={{ color: '#2563eb', margin: '0 auto' }} />
                        <p>
                            <strong>Drag and drop</strong> your file here, or click to browse
                        </p>
                        <p>Accepted: CSV, XLSX · Max 10 MB</p>
                    </div>

                    {file ? (
                        <div className="bulk-upload-file-meta">
                            Selected: <strong>{file.name}</strong> ({(file.size / 1024).toFixed(1)} KB)
                        </div>
                    ) : null}

                    <div className="bulk-upload-actions">
                        <button
                            type="button"
                            className="btn btn-secondary"
                            disabled={downloading}
                            onClick={() => downloadTemplate('csv')}
                        >
                            <Download size={20} style={{ marginRight: 6 }} />
                            Sample CSV
                        </button>
                        <button
                            type="button"
                            className="btn btn-secondary"
                            disabled={downloading}
                            onClick={() => downloadTemplate('xlsx')}
                        >
                            <Download size={20} style={{ marginRight: 6 }} />
                            Sample XLSX
                        </button>
                    </div>

                    {errorMessage ? <div className="bulk-upload-error-banner">{errorMessage}</div> : null}

                    {result?.summary ? (
                        <div
                            className={`bulk-upload-result ${
                                result.summary.failed > 0 ? 'partial' : ''
                            }`}
                        >
                            Processed {result.summary.total} row(s): {result.summary.created} imported
                            {result.summary.updated > 0 ? `, ${result.summary.updated} updated` : ''}
                            {result.summary.failed > 0 ? `, ${result.summary.failed} failed` : ''}.
                            {/* Decisions the import made on the user's behalf — a column
                                their role may not write, rows folded together. Not
                                failures, so they are kept clear of the row-error list. */}
                            {result.notes?.length > 0 ? (
                                <ul className="bulk-upload-row-notes">
                                    {result.notes.map((note, idx) => (
                                        <li key={idx}>{note}</li>
                                    ))}
                                </ul>
                            ) : null}
                            {result.errors?.length > 0 ? (
                                <ul className="bulk-upload-row-errors">
                                    {result.errors.slice(0, 50).map((rowErr, idx) => (
                                        <li key={idx}>
                                            Data row {rowErr.row}: {rowErr.message}
                                        </li>
                                    ))}
                                </ul>
                            ) : null}
                            {result.errors?.length > 50 ? (
                                <p style={{ marginTop: 8 }}>Additional errors omitted (showing first 50).</p>
                            ) : null}
                        </div>
                    ) : null}

                    <div className="bulk-upload-primary-row">
                        <button
                            type="button"
                            className="btn btn-primary"
                            disabled={!file || submitting}
                            onClick={handleSubmit}
                        >
                            {submitting ? (
                                <>
                                    <span className="bulk-upload-spinner" />
                                    Importing…
                                </>
                            ) : (
                                'Run import'
                            )}
                        </button>
                        <button type="button" className="btn btn-secondary" disabled={submitting} onClick={handleClose}>
                            Close
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
