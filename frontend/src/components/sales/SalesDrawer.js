import React, { useEffect, useState } from 'react';

const money = (value) => `PKR ${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const asDate = (value) => (value ? new Date(value).toLocaleDateString('en-GB') : '-');

/**
 * Detail drawer shared by Quotations, Bookings, Sales Orders and Invoices.
 *
 * Every sales document exposes the same three things: a set of read-only
 * fields, its line items, and a status that can be moved along. Invoices add a
 * payment ledger on top, so `totals`/`payments`/`onRecordPayment` are optional
 * and simply omitted by the other document types.
 */
export default function SalesDrawer({
  isOpen,
  onClose,
  title,
  subtitle,
  fields = [],
  items = [],
  statusOptions = [],
  status,
  onStatusChange,
  savingStatus = false,
  canEditStatus = true,
  totals = null,
  payments = null,
  paymentMethods = [],
  onRecordPayment = null,
  loading = false,
}) {
  const [draftStatus, setDraftStatus] = useState(status || '');
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState('');
  const [payReference, setPayReference] = useState('');
  const [recording, setRecording] = useState(false);

  useEffect(() => { setDraftStatus(status || ''); }, [status]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const handleKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  // Clear the payment form whenever a different document is opened.
  useEffect(() => {
    if (!isOpen) {
      setPayAmount('');
      setPayReference('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const balance = Number(totals?.balance || 0);
  const isSettled = totals && balance <= 0;

  const submitPayment = async (e) => {
    e.preventDefault();
    if (!onRecordPayment) return;
    const amount = Number(payAmount);
    if (!(amount > 0)) return;
    setRecording(true);
    try {
      const ok = await onRecordPayment({ amount, paymentMethodId: payMethod, referenceNumber: payReference });
      if (ok !== false) {
        setPayAmount('');
        setPayReference('');
      }
    } finally {
      setRecording(false);
    }
  };

  return (
    <div className="email-drawer-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="email-drawer" onClick={(e) => e.stopPropagation()} style={{ '--drawer-width': '54%' }}>
        <div className="email-drawer-header">
          <div>
            <h3>{title}</h3>
            {subtitle && <p style={{ margin: '2px 0 0', fontSize: 13, color: '#64748b' }}>{subtitle}</p>}
          </div>
          <button className="email-drawer-close" onClick={onClose}>&times;</button>
        </div>

        <div className="email-drawer-body">
          {loading ? (
            <div style={{ textAlign: 'center', padding: 40 }}><div className="spinner" /></div>
          ) : (
            <>
              <div className="email-drawer-section">
                <h4>Details</h4>
                <div className="email-drawer-grid">
                  {fields.map((field) => (
                    <div className={`email-drawer-row${field.full ? ' email-drawer-row-full' : ''}`} key={field.label}>
                      <span className="email-drawer-label">{field.label}</span>
                      <span className="email-drawer-value">{field.value ?? '-'}</span>
                    </div>
                  ))}
                </div>
              </div>

              {statusOptions.length > 0 && (
                <div className="email-drawer-section">
                  <h4>Status</h4>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                    <select
                      className="form-input"
                      style={{ maxWidth: 260 }}
                      value={draftStatus}
                      disabled={!canEditStatus || savingStatus}
                      onChange={(e) => setDraftStatus(e.target.value)}
                    >
                      <option value="">Select status</option>
                      {statusOptions.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={!canEditStatus || savingStatus || !draftStatus || draftStatus === status}
                      onClick={() => onStatusChange(draftStatus)}
                    >
                      {savingStatus ? 'Updating...' : 'Update Status'}
                    </button>
                  </div>
                  {!canEditStatus && (
                    <small style={{ color: '#94a3b8' }}>You do not have permission to change this status.</small>
                  )}
                </div>
              )}

              {items.length > 0 && (
                <div className="email-drawer-section">
                  <h4>Items</h4>
                  <div style={{ overflowX: 'auto' }}>
                    <table className="data-table" style={{ width: '100%' }}>
                      <thead>
                        <tr>
                          <th>Description</th>
                          <th style={{ textAlign: 'right' }}>Qty</th>
                          <th style={{ textAlign: 'right' }}>Unit Price</th>
                          <th style={{ textAlign: 'right' }}>Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((item, index) => (
                          <tr key={item.id || item._id || index}>
                            <td>{item.description || item.name || item.itemName || '-'}</td>
                            <td style={{ textAlign: 'right' }}>{item.quantity ?? 1}</td>
                            <td style={{ textAlign: 'right' }}>{money(item.unitPrice ?? item.unit_price ?? item.price)}</td>
                            <td style={{ textAlign: 'right' }}>{money(item.total ?? item.lineTotal ?? item.amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {totals && (
                <div className="email-drawer-section">
                  <h4>Payment Summary</h4>
                  <div className="email-drawer-grid">
                    <div className="email-drawer-row">
                      <span className="email-drawer-label">Total</span>
                      <span className="email-drawer-value">{money(totals.total)}</span>
                    </div>
                    <div className="email-drawer-row">
                      <span className="email-drawer-label">Paid</span>
                      <span className="email-drawer-value" style={{ color: '#16a34a' }}>{money(totals.paid)}</span>
                    </div>
                    <div className="email-drawer-row">
                      <span className="email-drawer-label">Remaining</span>
                      <span className="email-drawer-value" style={{ color: isSettled ? '#16a34a' : '#dc2626', fontWeight: 700 }}>
                        {isSettled ? 'Fully paid' : money(balance)}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {payments && (
                <div className="email-drawer-section">
                  <h4>Payment History</h4>
                  {payments.length === 0 ? (
                    <p style={{ color: '#94a3b8', margin: 0 }}>No payments received yet.</p>
                  ) : (
                    <div style={{ overflowX: 'auto' }}>
                      <table className="data-table" style={{ width: '100%' }}>
                        <thead>
                          <tr>
                            <th>Date</th>
                            <th>Payment #</th>
                            <th>Method</th>
                            <th>Reference</th>
                            <th style={{ textAlign: 'right' }}>Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {payments.map((payment) => (
                            <tr key={payment._id || payment.id}>
                              <td>{asDate(payment.paymentDate || payment.createdAt)}</td>
                              <td>{payment.paymentNumber || '-'}</td>
                              <td>{payment.method?.name || '-'}</td>
                              <td>{payment.referenceNumber || '-'}</td>
                              <td style={{ textAlign: 'right', color: '#16a34a', fontWeight: 600 }}>{money(payment.amount)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {onRecordPayment && !isSettled && (
                <div className="email-drawer-section">
                  <h4>Record Payment</h4>
                  <form onSubmit={submitPayment} style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                    <div className="form-group" style={{ flex: '1 1 140px', margin: 0 }}>
                      <label>Amount *</label>
                      <input
                        type="number" min="0.01" step="0.01" max={balance || undefined}
                        className="form-input" required
                        value={payAmount} onChange={(e) => setPayAmount(e.target.value)}
                        placeholder="0.00"
                      />
                    </div>
                    <div className="form-group" style={{ flex: '1 1 160px', margin: 0 }}>
                      <label>Method *</label>
                      <select className="form-input" required value={payMethod} onChange={(e) => setPayMethod(e.target.value)}>
                        <option value="">Select method</option>
                        {paymentMethods.map((method) => (
                          <option key={method._id || method.id} value={method._id || method.id}>{method.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="form-group" style={{ flex: '1 1 160px', margin: 0 }}>
                      <label>Reference</label>
                      <input
                        type="text" className="form-input"
                        value={payReference} onChange={(e) => setPayReference(e.target.value)}
                        placeholder="Txn / cheque no."
                      />
                    </div>
                    <button type="submit" className="btn btn-primary" disabled={recording}>
                      {recording ? 'Saving...' : 'Add Payment'}
                    </button>
                  </form>
                  <small style={{ color: '#94a3b8' }}>
                    Part payments are allowed &mdash; the remaining balance updates after each one.
                  </small>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
