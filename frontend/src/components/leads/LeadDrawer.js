import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { X, Pencil, Trash2, User, CalendarDays, DollarSign, Phone, Mail, MapPin, Tag, Flag, MessageSquare, ArrowRightLeft, Plus } from 'lucide-react';
import { useLeads } from '../../context/LeadsContext';
import SearchableSelect from '../SearchableSelect';
import ConfirmModal from '../ConfirmModal';
import LeadQuickCreateModal from './LeadQuickCreateModal';
import LeadStatusItemModal from './LeadStatusItemModal';
import useModalKeyboard from '../../hooks/useModalKeyboard';

function DetailRow({ icon: Icon, label, value }) {
  return (
    <div className="drawer-detail-row">
      {Icon && <Icon className="drawer-detail-icon" />}
      <div className="drawer-detail-content">
        <span className="drawer-detail-label">{label}</span>
        <span className="drawer-detail-value">{value || '-'}</span>
      </div>
    </div>
  );
}

export default function LeadDrawer({ leadId, onClose, onUpdated }) {
  const navigate = useNavigate();
  const { getLeadById, updateLead, deleteLead, changeStatus, assignLead, addNote, convertLead, markLeadLost, meta, refreshLeads, loadMeta } = useLeads();
  const [lead, setLead] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const [showAssignMenu, setShowAssignMenu] = useState(false);
  const [showLostForm, setShowLostForm] = useState(false);
  const [lostReason, setLostReason] = useState('');
  const [noteContent, setNoteContent] = useState('');
  const [addingNote, setAddingNote] = useState(false);
  const [quickCreate, setQuickCreate] = useState({ show: false, type: null, field: null });
  const [showStatusItemModal, setShowStatusItemModal] = useState(false);

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') { if (editMode) setEditMode(false); else onClose(); } };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, editMode]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const leadData = await getLeadById(leadId);
      if (leadData) setLead(leadData);
    } catch (err) {
      toast.error('Failed to load lead details');
    } finally {
      setLoading(false);
    }
  }, [leadId, getLeadById]);

  useEffect(() => { load(); }, [load]);

  const enterEditMode = () => {
    setEditForm({
      customerName: lead.customerName || '',
      email: lead.email || '',
      phone: lead.phone || '',
      source: lead.source?._id || lead.source || '',
      type: lead.type?._id || lead.type || '',
      priority: lead.priority?._id || lead.priority || '',
      status: lead.status || '',
      customerType: lead.customerType || 'individual',
      leadValue: lead.leadValue || '',
      probability: lead.probability || '',
      description: lead.description || '',
      nextFollowUpAt: lead.nextFollowUpAt ? lead.nextFollowUpAt.split('T')[0] : '',
    });
    setEditMode(true);
  };

  const handleSaveEdit = async () => {
    setSaving(true);
    try {
      const res = await updateLead(lead._id, editForm);
      if (res?.success) {
        toast.success(res.message);
        setEditMode(false);
        load();
        if (onUpdated) onUpdated();
      } else {
        toast.error(res?.message || 'Update failed');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Something went wrong');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await deleteLead(lead._id);
      if (res?.success) {
        toast.success(res.message);
        setShowDeleteConfirm(false);
        if (onUpdated) onUpdated();
        onClose();
      } else {
        toast.error(res?.message || 'Delete failed');
      }
    } catch (err) {
      toast.error('Failed to delete lead');
    } finally {
      setDeleting(false);
    }
  };

  const handleStatusChange = async (status) => {
    const res = await changeStatus(lead._id, status);
    if (res?.success) { toast.success(res.message); setShowStatusMenu(false); load(); if (onUpdated) onUpdated(); }
    else toast.error(res?.message || 'Failed to change status');
  };

  const handleAssign = async (userId) => {
    const res = await assignLead(lead._id, userId);
    if (res?.success) { toast.success(res.message); setShowAssignMenu(false); load(); if (onUpdated) onUpdated(); }
    else toast.error(res?.message || 'Failed to assign');
  };

  const handleAddNote = async () => {
    if (!noteContent.trim()) { toast.error('Note content is required'); return; }
    setAddingNote(true);
    const res = await addNote(lead._id, noteContent);
    if (res?.success) { toast.success('Note added'); setNoteContent(''); load(); if (onUpdated) onUpdated(); }
    else toast.error(res?.message || 'Failed to add note');
    setAddingNote(false);
  };

  const handleConvert = async () => {
    const res = await convertLead(lead._id);
    if (res?.success) {
      if (res?.data?.leadDeleted) {
        toast.success(res.message || 'User already exists with this email');
        if (onUpdated) onUpdated();
        onClose();
        return;
      }
      const code = res?.data?.customer?.customerCode || '';
      toast.success(`Lead converted to customer ${code}`.trim());
      load();
      if (onUpdated) onUpdated();
    } else toast.error(res?.message || 'Conversion failed');
  };

  const handleMarkLost = async () => {
    if (!lostReason.trim()) { toast.error('Please provide a reason'); return; }
    const res = await markLeadLost(lead._id, lostReason);
    if (res?.success) { toast.success('Lead marked as lost'); setShowLostForm(false); setLostReason(''); load(); if (onUpdated) onUpdated(); }
    else toast.error(res?.message || 'Failed');
  };

  const handleQuickCreated = (type, field, newItem) => {
    loadMeta();
    if (newItem?._id) {
      setEditForm((prev) => ({ ...prev, [field]: newItem._id }));
    }
  };

  const handleStatusItemCreated = (newItem) => {
    loadMeta();
    if (newItem?._id) {
      setEditForm((prev) => ({ ...prev, status: newItem.value || newItem.label }));
    }
  };

  const renderCreateBtn = (type, field, title) => (
    <button type="button" className="btn-icon inline-create-btn" title={title} onClick={() => setQuickCreate({ show: true, type, field })}>
      <Plus size={16} />
    </button>
  );

  if (loading) {
    return (
      <div className="drawer-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <div className="drawer-panel"><div className="drawer-loading">Loading...</div></div>
      </div>
    );
  }

  if (!lead) {
    return (
      <div className="drawer-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <div className="drawer-panel"><div className="drawer-loading">Lead not found</div></div>
      </div>
    );
  }

  const priorityColor = lead.priority?.color || '#6b7280';

  return (
    <>
      <div className="drawer-overlay" onClick={(e) => { if (e.target === e.currentTarget) { if (editMode) setEditMode(false); else onClose(); } }}>
        <div className="drawer-panel">
          <div className="drawer-header">
            <div>
              <h3>{lead.customerName}</h3>
              <span className="lead-no">{lead.leadNo}</span>
            </div>
            <div className="drawer-header-actions">
              {!editMode && (
                <button className="btn-icon edit" title="Edit" onClick={enterEditMode}><Pencil size={18} /></button>
              )}
              <button className="btn-icon delete" title={lead.convertedToCustomer ? 'Cannot delete converted lead' : 'Delete'} disabled={lead.convertedToCustomer} onClick={() => { if (!lead.convertedToCustomer) setShowDeleteConfirm(true); }}><Trash2 size={18} /></button>
              <button className="modal-close" onClick={onClose}><X size={20} /></button>
            </div>
          </div>

          <div className="drawer-body">
            <div className="lead-badges">
              <span className="status-badge" style={{ background: priorityColor + '22', color: priorityColor }}>
                {lead.priority?.name || 'N/A'}
              </span>
              <span className="status-badge active">{lead.status || 'N/A'}</span>
              {lead.convertedToCustomer && <span className="status-badge clickable" style={{ background: '#dcfce7', color: '#16a34a', cursor: 'pointer' }} onClick={() => navigate('/customers')}>Converted{lead.convertedCustomerId?.customerCode ? ` → ${lead.convertedCustomerId.customerCode}` : ''}</span>}
            </div>

            {editMode ? (
              <div className="drawer-edit-form">
                <div className="form-group">
                  <label>Customer Name</label>
                  <input type="text" className="form-input" value={editForm.customerName} onChange={(e) => setEditForm((p) => ({ ...p, customerName: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label>Email</label>
                  <input type="email" className="form-input" value={editForm.email} onChange={(e) => setEditForm((p) => ({ ...p, email: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label>Phone</label>
                  <input type="tel" className="form-input" value={editForm.phone} onChange={(e) => setEditForm((p) => ({ ...p, phone: e.target.value }))} />
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end' }}>
                  <div style={{ flex: 1 }}>
                    <SearchableSelect
                      options={meta.sources || []}
                      value={editForm.source}
                      onChange={(e) => setEditForm((p) => ({ ...p, source: e.target.value }))}
                      label="Source"
                      placeholder="Select source"
                      valueField="_id"
                      labelField="name"
                    />
                  </div>
                  {renderCreateBtn('sources', 'source', 'Create Source')}
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end' }}>
                  <div style={{ flex: 1 }}>
                    <SearchableSelect
                      options={meta.types || []}
                      value={editForm.type}
                      onChange={(e) => setEditForm((p) => ({ ...p, type: e.target.value }))}
                      label="Type"
                      placeholder="Select type"
                      valueField="_id"
                      labelField="name"
                    />
                  </div>
                  {renderCreateBtn('types', 'type', 'Create Type')}
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end' }}>
                  <div style={{ flex: 1 }}>
                    <SearchableSelect
                      options={meta.priorities || []}
                      value={editForm.priority}
                      onChange={(e) => setEditForm((p) => ({ ...p, priority: e.target.value }))}
                      label="Priority"
                      placeholder="Select priority"
                      valueField="_id"
                      labelField="name"
                    />
                  </div>
                  {renderCreateBtn('priorities', 'priority', 'Create Priority')}
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end' }}>
                  <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                    <label>Status</label>
                    <select className="form-input" value={editForm.status} onChange={(e) => setEditForm((p) => ({ ...p, status: e.target.value }))}>
                      <option value="">Select status</option>
                      {meta.statuses.map((s) => (
                        <option key={s._id} value={s.value || s.label}>{s.label}</option>
                      ))}
                    </select>
                  </div>
                  <button type="button" className="btn-icon inline-create-btn" title="Create Status" onClick={() => {
                    if (!meta.leadStatusCollectionId) {
                      toast.error('Please select or create a Lead Status Collection in Server Management first.');
                      return;
                    }
                    setShowStatusItemModal(true);
                  }}>
                    <Plus size={16} />
                  </button>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Lead Value</label>
                    <input type="number" className="form-input" value={editForm.leadValue} onChange={(e) => setEditForm((p) => ({ ...p, leadValue: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label>Probability (%)</label>
                    <input type="number" className="form-input" value={editForm.probability} onChange={(e) => setEditForm((p) => ({ ...p, probability: e.target.value }))} />
                  </div>
                </div>
                <div className="form-group">
                  <label>Next Follow-Up</label>
                  <input type="date" className="form-input" value={editForm.nextFollowUpAt} onChange={(e) => setEditForm((p) => ({ ...p, nextFollowUpAt: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label>Description</label>
                  <textarea className="form-input" rows="3" value={editForm.description} onChange={(e) => setEditForm((p) => ({ ...p, description: e.target.value }))} />
                </div>
                <div className="drawer-edit-actions">
                  <button className="btn btn-secondary" onClick={() => setEditMode(false)}>Cancel</button>
                  <button className="btn btn-primary" onClick={handleSaveEdit} disabled={saving}>{saving ? 'Saving...' : 'Save Changes'}</button>
                </div>
              </div>
            ) : (
              <>
                <div className="drawer-section-group">
                  <h4 className="drawer-section-title"><User size={16} /> Lead Info</h4>
                  <DetailRow icon={Tag} label="Source" value={lead.source?.name} />
                  <DetailRow icon={Flag} label="Type" value={lead.type?.name} />
                  <DetailRow icon={MessageSquare} label="Status" value={lead.status} />
                  <DetailRow icon={Tag} label="Customer Type" value={lead.customerType === 'corporate' ? 'Corporate' : 'Individual'} />
                  <DetailRow icon={DollarSign} label="Lead Value" value={lead.leadValue ? `${Number(lead.leadValue).toLocaleString()}` : '-'} />
                  <DetailRow label="Probability" value={lead.probability ? `${lead.probability}%` : '-'} />
                  <DetailRow icon={CalendarDays} label="Expected Close" value={lead.expectedCloseDate ? new Date(lead.expectedCloseDate).toLocaleDateString() : '-'} />
                  <DetailRow icon={CalendarDays} label="Next Follow-Up" value={lead.nextFollowUpAt ? new Date(lead.nextFollowUpAt).toLocaleDateString() : '-'} />
                </div>

                <div className="drawer-section-group">
                  <h4 className="drawer-section-title"><Phone size={16} /> Communication</h4>
                  <DetailRow icon={Mail} label="Email" value={lead.email} />
                  <DetailRow icon={Phone} label="Phone" value={lead.phone} />
                  <DetailRow icon={Phone} label="Alternate Phone" value={lead.alternatePhone} />
                </div>

                <div className="drawer-section-group">
                  <h4 className="drawer-section-title"><MapPin size={16} /> Address</h4>
                  <DetailRow icon={MapPin} label="Address" value={lead.address} />
                  <DetailRow label="City" value={lead.city} />
                  <DetailRow label="State" value={lead.state} />
                  <DetailRow label="Country" value={lead.country} />
                  <DetailRow label="Zip Code" value={lead.zipCode} />
                </div>

                <div className="drawer-section-group">
                  <h4 className="drawer-section-title"><User size={16} /> Assignment</h4>
                  <DetailRow icon={User} label="Assigned To" value={lead.assignedTo ? `${lead.assignedTo.firstName} ${lead.assignedTo.lastName}` : 'Unassigned'} />
                  <DetailRow label="Department" value={lead.department?.name} />
                </div>

                {lead.description && (
                  <div className="drawer-section-group">
                    <h4 className="drawer-section-title"><MessageSquare size={16} /> Description</h4>
                    <p className="drawer-description-text">{lead.description}</p>
                  </div>
                )}

                {lead.lostReason && (
                  <div className="drawer-section-group lost">
                    <h4 className="drawer-section-title"><ArrowRightLeft size={16} /> Lost Reason</h4>
                    <p className="drawer-description-text">{lead.lostReason}</p>
                  </div>
                )}

                <div className="drawer-section-group">
                  <h4 className="drawer-section-title"><CalendarDays size={16} /> Audit</h4>
                  <DetailRow icon={User} label="Created By" value={lead.createdBy ? `${lead.createdBy.firstName} ${lead.createdBy.lastName}` : '-'} />
                  <DetailRow icon={CalendarDays} label="Created At" value={new Date(lead.createdAt).toLocaleString()} />
                  <DetailRow icon={User} label="Updated By" value={lead.updatedBy ? `${lead.updatedBy.firstName} ${lead.updatedBy.lastName}` : '-'} />
                  <DetailRow icon={CalendarDays} label="Updated At" value={new Date(lead.updatedAt).toLocaleString()} />
                </div>
              </>
            )}
          </div>

          {!editMode && (
            <div className="drawer-actions">
              <div className="action-buttons">
                <div className="action-dropdown">
                  <button className="btn btn-primary btn-sm" onClick={() => setShowStatusMenu(!showStatusMenu)}>Status</button>
                  {showStatusMenu && (
                    <div className="dropdown-menu">
                      {meta.statuses.map((s) => (
                        <div key={s._id} className="dropdown-item" onClick={() => handleStatusChange(s.value || s.label)}>{s.label}</div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="action-dropdown">
                  <button className="btn btn-secondary btn-sm" onClick={() => setShowAssignMenu(!showAssignMenu)}>Assign</button>
                  {showAssignMenu && (
                    <div className="dropdown-menu">
                      <div className="dropdown-item" onClick={() => handleAssign(null)}>Unassign</div>
                      {meta.users.map((u) => (
                        <div key={u._id} className="dropdown-item" onClick={() => handleAssign(u._id)}>{u.firstName} {u.lastName}</div>
                      ))}
                    </div>
                  )}
                </div>
                {!lead.convertedToCustomer && !lead.lostReason && (
                  <button className="btn btn-success btn-sm" onClick={handleConvert}>Convert</button>
                )}
                {!lead.lostReason && (
                  <button className="btn btn-warning btn-sm" onClick={() => setShowLostForm(true)}>Lost</button>
                )}
              </div>
              <div className="action-buttons">
                <div className="note-input-inline">
                  <input
                    type="text"
                    className="form-input form-input-sm"
                    value={noteContent}
                    onChange={(e) => setNoteContent(e.target.value)}
                    placeholder="Quick note..."
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddNote(); } }}
                  />
                  <button className="btn btn-primary btn-sm" onClick={handleAddNote} disabled={addingNote || !noteContent.trim()}>
                    {addingNote ? '...' : 'Add'}
                  </button>
                </div>
              </div>
              {showLostForm && (
                <div className="lost-reason-input">
                  <textarea className="form-input" rows="2" value={lostReason} onChange={(e) => setLostReason(e.target.value)} placeholder="Why is this lead lost?" />
                  <div className="lost-reason-actions">
                    <button className="btn btn-secondary btn-sm" onClick={() => { setShowLostForm(false); setLostReason(''); }}>Cancel</button>
                    <button className="btn btn-warning btn-sm" onClick={handleMarkLost}>Confirm</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {showDeleteConfirm && (
            <ConfirmModal
              isOpen={true}
              title="Delete Lead"
              message={`Are you sure you want to deactivate lead ${lead.leadNo}?`}
              confirmText={deleting ? 'Deleting...' : 'Delete'}
              cancelText="Cancel"
              type="danger"
              onConfirm={handleDelete}
              onCancel={() => setShowDeleteConfirm(false)}
            />
          )}
        </div>
      </div>

      {quickCreate.show && (
        <LeadQuickCreateModal
          type={quickCreate.type}
          onClose={() => setQuickCreate({ show: false, type: null, field: null })}
          onCreated={(item) => handleQuickCreated(quickCreate.type, quickCreate.field, item)}
        />
      )}

      {showStatusItemModal && meta.leadStatusCollectionId && (
        <LeadStatusItemModal
          collectionId={meta.leadStatusCollectionId}
          collectionName={meta.statuses.length > 0 ? 'Lead Status' : undefined}
          onClose={() => setShowStatusItemModal(false)}
          onCreated={handleStatusItemCreated}
        />
      )}
    </>
  );
}
