/**
 * Order Form Upload Page
 * Upload Excel/CSV files to create Customers, Products, and Orders
 * Created by LOGIXINVENTOR (PVT) Ltd.
 * www.logixinventor.com | AMS
 * Date: 2026-03-13
 */

import React, { useState, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import axios from 'axios';
import '../styles/uploader.css';

const OrderFormUpload = () => {
    const navigate = useNavigate();
    const [isDragActive, setIsDragActive] = useState(false);
    const [file, setFile] = useState(null);
    const [isUploading, setIsUploading] = useState(false);
    const [uploadResult, setUploadResult] = useState(null);

    const onDragEnter = useCallback((e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragActive(true);
    }, []);

    const onDragLeave = useCallback((e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragActive(false);
    }, []);

    const onDragOver = useCallback((e) => {
        e.preventDefault();
        e.stopPropagation();
    }, []);

    const processFile = (selectedFile) => {
        if (!selectedFile) return;

        const validTypes = [
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'text/csv',
            'application/csv'
        ];

        const isValidExtension = selectedFile.name.endsWith('.xlsx') || selectedFile.name.endsWith('.csv');

        if (!validTypes.includes(selectedFile.type) && !isValidExtension) {
            toast.error('Invalid file type! Please upload an .xlsx or .csv file.', { duration: 4000, position: 'top-center' });
            return;
        }

        if (selectedFile.size > 10 * 1024 * 1024) {
            toast.error('File size exceeds the 10MB limit.', { duration: 4000, position: 'top-center' });
            return;
        }

        setFile(selectedFile);
        setUploadResult(null);
    };

    const onDrop = useCallback((e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragActive(false);
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            processFile(e.dataTransfer.files[0]);
            e.dataTransfer.clearData();
        }
    }, []);

    const handleFileInput = (e) => {
        if (e.target.files && e.target.files.length > 0) {
            processFile(e.target.files[0]);
        }
    };

    const handleUpload = async () => {
        if (!file) { toast.error('Please select a file first.'); return; }

        setIsUploading(true);
        setUploadResult(null);
        const toastId = toast.loading('Uploading and processing order forms...');

        const formData = new FormData();
        formData.append('file', file);

        try {
            const response = await axios.post(
                `${process.env.REACT_APP_API_URL || '/api'}/uploader/order-form`,
                formData,
                { withCredentials: true, headers: { 'Content-Type': 'multipart/form-data' } }
            );

            if (response.data.success) {
                toast.success(response.data.message, { id: toastId, duration: 5000 });
                setUploadResult(response.data.data);
                setFile(null);
            } else {
                toast.error(response.data.message || 'Upload failed', { id: toastId });
            }
        } catch (error) {
            console.error('Upload Error:', error);
            toast.error(error.response?.data?.message || 'Failed to upload the file. Please try again.', { id: toastId, duration: 5000 });
        } finally {
            setIsUploading(false);
        }
    };

    const removeFile = () => { setFile(null); };

    return (
        <div className="page-container">
            <div className="page-header">
                <h2>Order Form Upload</h2>
                <button className="btn-secondary" onClick={() => navigate(-1)}>Back</button>
            </div>

            <div className="card uploader-card">
                <div className="card-body">
                    <p className="upload-instruction">
                        Upload standard dealership <strong>Order Form</strong> exports. Only <code>.xlsx</code> and <code>.csv</code> formats are supported.
                        The system will automatically extract and map records into <strong>Leads</strong>, <strong>Vehicles</strong>, and <strong>Sales Orders</strong> while ignoring duplicates.
                    </p>

                    <div
                        className={`dropzone-container ${isDragActive ? 'drag-active' : ''} ${file ? 'has-file' : ''}`}
                        onDragEnter={onDragEnter}
                        onDragLeave={onDragLeave}
                        onDragOver={onDragOver}
                        onDrop={onDrop}
                    >
                        {!file ? (
                            <div className="dropzone-content">
                                <svg className="upload-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                                </svg>
                                <h3>Drag & Drop your file here</h3>
                                <p className="text-muted">or</p>
                                <label className="btn-primary browse-btn">
                                    Browse Files
                                    <input type="file" className="file-input-hidden" accept=".xlsx,.csv" onChange={handleFileInput} />
                                </label>
                                <p className="upload-limits">Maximum file size: 10MB</p>
                            </div>
                        ) : (
                            <div className="file-preview">
                                <div className="file-info">
                                    <svg className="file-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                    </svg>
                                    <div className="file-details">
                                        <h4>{file.name}</h4>
                                        <p>{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                                    </div>
                                    <button className="btn-icon remove-btn" onClick={removeFile} disabled={isUploading} title="Remove file">
                                        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    </button>
                                </div>
                                <div className="upload-actions">
                                    <button className={`btn-primary upload-btn ${isUploading ? 'loading' : ''}`} onClick={handleUpload} disabled={isUploading}>
                                        {isUploading ? (<><span className="spinner-small"></span> Processing...</>) : 'Upload File'}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Upload Results Summary */}
            {uploadResult && (
                <div className="card" style={{ marginTop: '1.5rem' }}>
                    <div className="card-body">
                        <h3 style={{ marginBottom: '1rem', color: '#16a34a' }}>✅ Upload Completed Successfully</h3>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
                            <div style={{ background: '#f0fdf4', padding: '1rem', borderRadius: '10px', textAlign: 'center' }}>
                                <div style={{ fontSize: '1.8rem', fontWeight: '700', color: '#16a34a' }}>{uploadResult.totalProcessed}</div>
                                <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>Records Processed</div>
                            </div>
                            <div style={{ background: '#dbeafe', padding: '1rem', borderRadius: '10px', textAlign: 'center' }}>
                                <div style={{ fontSize: '1.8rem', fontWeight: '700', color: '#2563eb' }}>{uploadResult.insertedLeads}</div>
                                <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>Leads Created</div>
                            </div>
                            <div style={{ background: '#ede9fe', padding: '1rem', borderRadius: '10px', textAlign: 'center' }}>
                                <div style={{ fontSize: '1.8rem', fontWeight: '700', color: '#7c3aed' }}>{uploadResult.insertedVehicles}</div>
                                <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>Vehicles Created</div>
                            </div>
                            <div style={{ background: '#ffedd5', padding: '1rem', borderRadius: '10px', textAlign: 'center' }}>
                                <div style={{ fontSize: '1.8rem', fontWeight: '700', color: '#ea580c' }}>{uploadResult.insertedSalesOrders}</div>
                                <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>Orders Created</div>
                            </div>
                        </div>
                        {uploadResult.skippedOrders > 0 && (
                            <p style={{ color: '#9ca3af', fontSize: '0.85rem', marginBottom: '1rem' }}>
                                ⚠️ {uploadResult.skippedOrders} orders were skipped (duplicate order numbers).
                            </p>
                        )}
                        <div style={{ display: 'flex', gap: '0.75rem' }}>
                            <Link to="/leads" className="btn-secondary" style={{ textDecoration: 'none' }}>View Leads</Link>
                            <Link to="/vehicles" className="btn-secondary" style={{ textDecoration: 'none' }}>View Vehicles</Link>
                            <Link to="/sales/orders" className="btn-primary" style={{ textDecoration: 'none' }}>View Sales Orders</Link>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default OrderFormUpload;
