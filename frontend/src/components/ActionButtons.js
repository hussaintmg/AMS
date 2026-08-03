import React from 'react';
import { SquarePen, Trash2, Eye, Ban, CheckCircle } from 'lucide-react';
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
    disableToggle = false,
    disableDelete = false,
    toggleDisabledTitle,
    deleteDisabledTitle,
    title = 'Item',
    customActions = []
}) => {
    const actionCount =
        (showView && onView ? 1 : 0) +
        (showEdit && onEdit ? 1 : 0) +
        (showToggle && onToggle ? 1 : 0) +
        customActions.length +
        (showDelete && onDelete ? 1 : 0);

    return (
        <div className={`action-buttons actions-count-${actionCount}`}>
            {showView && onView && (
                <button
                    className="btn-action btn-view"
                    onClick={(e) => { e.stopPropagation(); onView(e); }}
                    title={`View ${title}`}
                >
                    <Eye size={18} className="action-icon" />
                </button>
            )}

            {showEdit && onEdit && (
                <button
                    className="btn-action btn-edit"
                    onClick={(e) => { e.stopPropagation(); onEdit(e); }}
                    title={`Edit ${title}`}
                >
                    <SquarePen size={18} className="action-icon" />
                </button>
            )}

            {showToggle && onToggle && (
                <button
                    className={`btn-action ${status ? 'btn-deactivate' : 'btn-activate'}`}
                    onClick={(e) => { e.stopPropagation(); if (!disableToggle) onToggle(e); }}
                    title={disableToggle ? (toggleDisabledTitle || 'Status change disabled') : (status ? 'Deactivate' : 'Activate')}
                    disabled={disableToggle}
                >
                    {status ? (
                        <Ban size={18} className="action-icon" />
                    ) : (
                        <CheckCircle size={18} className="action-icon" />
                    )}
                </button>
            )}

            {customActions.map((action, index) => (
                <button
                    key={index}
                    className={`btn-action ${action.className || ''}`}
                    onClick={(e) => { e.stopPropagation(); if (!action.disabled) action.onClick(e); }}
                    title={action.title}
                    disabled={action.disabled || false}
                >
                    {action.loading ? <span className="spinner-mini"></span> : action.icon}
                </button>
            ))}

            {showDelete && onDelete && (
                <button
                    className="btn-action btn-delete"
                    onClick={(e) => { e.stopPropagation(); if (!disableDelete) onDelete(e); }}
                    title={disableDelete ? (deleteDisabledTitle || 'Delete disabled') : `Delete ${title}`}
                    disabled={disableDelete}
                >
                    <Trash2 size={18} className="action-icon" />
                </button>
            )}
        </div>
    );
};

export default ActionButtons;
