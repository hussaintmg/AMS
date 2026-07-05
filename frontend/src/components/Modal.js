import React from 'react';
import './Modal.css'; // Assuming we might want specific styles, or it uses global styles

const Modal = ({ title, children, onClose, size = 'medium', overlayClassName }) => {
    const overlayClass = ['modal-overlay', overlayClassName].filter(Boolean).join(' ');
    return (
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
        </div>
    );
};

export default Modal;
