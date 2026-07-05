import React, { useState } from 'react';
import '../styles/userManagement.css';

const InputModal = ({ isOpen, title, message, onConfirm, onCancel, initialValue = '', placeholder = '', confirmText = 'Submit', type = 'text', required = true }) => {
    const [value, setValue] = useState(initialValue);

    if (!isOpen) return null;

    const handleSubmit = (e) => {
        e.preventDefault();
        onConfirm(value);
    };

    return (
        <div className="modal-overlay">
            <div className="modal-content input-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '400px' }}>
                <div className="modal-header">
                    <h3>{title}</h3>
                    <button className="modal-close" onClick={onCancel}>×</button>
                </div>
                <form onSubmit={handleSubmit}>
                    <div className="modal-body">
                        {message && <p style={{ marginBottom: '10px' }}>{message}</p>}
                        <input
                            type={type}
                            className="form-control"
                            value={value}
                            onChange={(e) => setValue(e.target.value)}
                            placeholder={placeholder}
                            required={required}
                            autoFocus
                            style={{ width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #ddd' }}
                        />
                    </div>
                    <div className="modal-actions" style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                        <button type="button" className="btn btn-secondary" onClick={onCancel}>Cancel</button>
                        <button type="submit" className="btn btn-primary">{confirmText}</button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default InputModal;
