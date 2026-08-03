import React from 'react';
import { createPortal } from 'react-dom';
import './Modal.css'; // Assuming we might want specific styles, or it uses global styles

/**
 * Rendered through a portal onto <body>: this modal is opened from inside
 * table rows, and a row with its own opacity (e.g. a dispatched vehicle's
 * faded row) both dims every descendant and traps the fixed overlay in the
 * row's stacking context — the popup came out see-through with later rows
 * painting on top of it. On <body> it sits in the root stacking context where
 * the shared z-index scale in index.css actually applies.
 */
const Modal = ({ title, children, onClose, size = 'medium', overlayClassName }) => {
    const overlayClass = ['modal-overlay', overlayClassName].filter(Boolean).join(' ');
    return createPortal(
        <div className={overlayClass}>
            <div className={`modal-content ${size === 'large' ? 'modal-lg' : ''}`} style={size === 'large' ? { maxWidth: '1200px', width: '95%' } : {}}>
                <div className="modal-header">
                    <h3>{title}</h3>
                    <button className="close-btn" onClick={onClose}>&times;</button>
                </div>
                <div className="modal-body">
                    {children}
                </div>
            </div>
        </div>,
        document.body
    );
};

export default Modal;
