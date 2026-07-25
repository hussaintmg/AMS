import React from 'react';
import useModalKeyboard from '../hooks/useModalKeyboard';
import '../styles/userManagement.css';

const ConfirmModal = ({ isOpen, title, message, onConfirm, onCancel, confirmText = 'Confirm', cancelText = 'Cancel', type = 'danger', loading = false }) => {
    // Track the in-flight state of an async onConfirm so the confirm button
    // disables itself until it resolves — prevents double-submits (e.g. sending
    // an email or deleting twice) from a fast double-click or repeated Enter.
    const [busy, setBusy] = React.useState(false);

    React.useEffect(() => { if (!isOpen) setBusy(false); }, [isOpen]);

    const isBusy = busy || loading;

    const handleConfirm = React.useCallback(async () => {
        if (isBusy || !onConfirm) return;
        try {
            setBusy(true);
            await onConfirm();
        } finally {
            setBusy(false);
        }
    }, [isBusy, onConfirm]);

    const handleCancel = () => { if (!isBusy) onCancel?.(); };

    useModalKeyboard(isOpen, handleCancel, handleConfirm);

    if (!isOpen) return null;

    return (
        <div className="modal-overlay" onClick={handleCancel}>
            <div className="modal-content confirm-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '400px' }}>
                <div className="modal-header">
                    <h3>{title}</h3>
                    <button className="modal-close" onClick={handleCancel} disabled={isBusy}>×</button>
                </div>
                <div className="modal-body">
                    <p>{message}</p>
                </div>
                <div className="modal-footer" style={{ borderTop: 'none', paddingTop: 0 }}>
                    <button className="btn btn-secondary" onClick={handleCancel} disabled={isBusy}>{cancelText}</button>
                    <button
                        className={`btn btn-${type === 'danger' ? 'danger' : 'primary'}`}
                        onClick={handleConfirm}
                        disabled={isBusy}
                    >
                        {isBusy ? <><span className="spinner-mini"></span> Processing...</> : confirmText}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ConfirmModal;
