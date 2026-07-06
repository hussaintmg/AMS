import React from 'react';
import useModalKeyboard from '../hooks/useModalKeyboard';
import '../styles/userManagement.css';

const ConfirmModal = ({ isOpen, title, message, onConfirm, onCancel, confirmText = 'Confirm', cancelText = 'Cancel', type = 'danger' }) => {
    useModalKeyboard(isOpen, onCancel, onConfirm);

    if (!isOpen) return null;

    return (
        <div className="modal-overlay" onClick={onCancel}>
            <div className="modal-content confirm-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '400px' }}>
                <div className="modal-header">
                    <h3>{title}</h3>
                    <button className="modal-close" onClick={onCancel}>×</button>
                </div>
                <div className="modal-body">
                    <p>{message}</p>
                </div>
                <div className="modal-footer" style={{ borderTop: 'none', paddingTop: 0 }}>
                    <button className="btn btn-secondary" onClick={onCancel}>{cancelText}</button>
                    <button
                        className={`btn btn-${type === 'danger' ? 'danger' : 'primary'}`}
                        onClick={onConfirm}
                    >
                        {confirmText}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ConfirmModal;
