import React from 'react';
import { PencilSquareIcon, TrashIcon, EyeIcon, NoSymbolIcon, CheckCircleIcon } from '@heroicons/react/24/outline';
import '../styles/userManagement.css';

const ActionButtons = ({
    onEdit,
    onDelete,
    onView,
    onToggle,
    status, // true/false for active/inactive
    showEdit = true,
    showDelete = true,
    showView = false,
    showToggle = false,
    title = 'Item',
    customActions = []
}) => {
    return (
        <div className="action-buttons">
            {showView && onView && (
                <button
                    className="btn-action btn-view"
                    onClick={(e) => { e.stopPropagation(); onView(); }}
                    title={`View ${title}`}
                >
                    <EyeIcon className="action-icon" />
                </button>
            )}

            {showEdit && onEdit && (
                <button
                    className="btn-action btn-edit"
                    onClick={(e) => { e.stopPropagation(); onEdit(); }}
                    title={`Edit ${title}`}
                >
                    <PencilSquareIcon className="action-icon" />
                </button>
            )}

            {showToggle && onToggle && (
                <button
                    className={`btn-action ${status ? 'btn-deactivate' : 'btn-activate'}`}
                    onClick={(e) => { e.stopPropagation(); onToggle(); }}
                    title={status ? 'Deactivate' : 'Activate'}
                >
                    {status ? (
                        <NoSymbolIcon className="action-icon" />
                    ) : (
                        <CheckCircleIcon className="action-icon" />
                    )}
                </button>
            )}

            {customActions.map((action, index) => (
                <button
                    key={index}
                    className={`btn-action ${action.className || ''}`}
                    onClick={(e) => { e.stopPropagation(); action.onClick(); }}
                    title={action.title}
                >
                    {action.icon}
                </button>
            ))}

            {showDelete && onDelete && (
                <button
                    className="btn-action btn-delete"
                    onClick={(e) => { e.stopPropagation(); onDelete(); }}
                    title={`Delete ${title}`}
                >
                    <TrashIcon className="action-icon" />
                </button>
            )}
        </div>
    );
};

export default ActionButtons;
