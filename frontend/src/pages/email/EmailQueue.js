import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { emailAPI } from '../../services/api';
import { useEmailQueueContext } from '../../context/EmailQueueContext';
import ConfirmModal from '../../components/ConfirmModal';

export default function EmailQueue() {
  const { queue, queueStats, loadQueue, updateQueueItem, removeQueueItem } = useEmailQueueContext();
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);
  const [actionLoading, setActionLoading] = useState('');

  useEffect(() => {
    loadQueue({ status: filter !== 'all' ? filter : undefined });
  }, [filter]);

  const handleRetry = async (id) => {
    setActionLoading(`retry-${id}`);
    updateQueueItem(id, { status: 'pending' });
    try { await emailAPI.retryQueueItem(id); toast.success('Retry initiated'); loadQueue(); } catch (e) { updateQueueItem(id, { status: 'failed' }); toast.error('Retry failed'); }
    finally { setActionLoading(''); }
  };

  const handleRetryAll = async () => {
    setActionLoading('retryAll');
    try { await emailAPI.retryAllQueue(); toast.success('Retry all initiated'); loadQueue(); } catch (e) { toast.error('Retry all failed'); }
    finally { setActionLoading(''); }
  };

  const handleClearSent = async () => {
    setActionLoading('clearSent');
    try { await emailAPI.clearSentQueue(); toast.success('Sent items cleared'); loadQueue(); } catch (e) { toast.error('Clear failed'); }
    finally { setActionLoading(''); }
  };

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setActionLoading('delete');
    removeQueueItem(deleteTarget);
    try { await emailAPI.deleteQueueItem(deleteTarget); toast.success('Item deleted'); setDeleteTarget(null); } catch (e) { toast.error('Delete failed'); loadQueue(); }
    finally { setActionLoading(''); }
  }, [deleteTarget, removeQueueItem, loadQueue]);

  const getStatusBadge = (status) => {
    const map = { pending: 'email-badge-draft', sending: 'email-badge-active', sent: 'email-badge-published', failed: 'email-badge-inactive' };
    return `email-card-badge ${map[status] || 'email-badge-draft'}`;
  };

  const filtered = Array.isArray(queue) ? queue.filter(q =>
    q.to?.toLowerCase().includes(search.toLowerCase()) ||
    q.subject?.toLowerCase().includes(search.toLowerCase())
  ) : [];

  return (
    <div className="email-module">
      <div className="email-module-header">
        <h2>Email Queue</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-sm btn-secondary" onClick={handleRetryAll} disabled={actionLoading === 'retryAll'}>
            {actionLoading === 'retryAll' ? <><span className="spinner-mini"></span> Retrying...</> : 'Retry All Failed'}
          </button>
          <button className="btn btn-sm btn-secondary" onClick={handleClearSent} disabled={actionLoading === 'clearSent'}>
            {actionLoading === 'clearSent' ? <><span className="spinner-mini"></span> Clearing...</> : 'Clear Sent'}
          </button>
        </div>
      </div>

      {queueStats && (
        <div className="email-stats-grid">
          <div className="email-stat-card"><div className="email-stat-value">{queueStats.pending || 0}</div><div className="email-stat-label">Pending</div></div>
          <div className="email-stat-card"><div className="email-stat-value">{queueStats.sending || 0}</div><div className="email-stat-label">Sending</div></div>
          <div className="email-stat-card"><div className="email-stat-value" style={{ color: '#2e7d32' }}>{queueStats.sent || 0}</div><div className="email-stat-label">Sent</div></div>
          <div className="email-stat-card"><div className="email-stat-value" style={{ color: '#c62828' }}>{queueStats.failed || 0}</div><div className="email-stat-label">Failed</div></div>
          <div className="email-stat-card"><div className="email-stat-value">{queueStats.total || 0}</div><div className="email-stat-label">Total</div></div>
        </div>
      )}

      <div className="email-queue-filters">
        <select className="form-control" value={filter} onChange={e => setFilter(e.target.value)}>
          <option value="all">All Status</option>
          <option value="pending">Pending</option>
          <option value="sending">Sending</option>
          <option value="sent">Sent</option>
          <option value="failed">Failed</option>
        </select>
        <input className="form-control search-input" placeholder="Search by recipient or subject..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <table className="table">
        <thead>
          <tr><th>To</th><th>Subject</th><th>Status</th><th>Retries</th><th>Error</th><th>Created</th><th>Actions</th></tr>
        </thead>
        <tbody>
          {filtered.map(q => (
            <tr key={q._id}>
              <td data-label="To">{q.to}</td>
              <td data-label="Subject" style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>{q.subject || '-'}</td>
              <td data-label="Status"><span className={getStatusBadge(q.status)}>{q.status}</span></td>
              <td data-label="Retries">{q.retryCount || 0}/{q.maxRetries || 3}</td>
              <td data-label="Error" style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', fontSize: '0.8rem' }}>{q.errorMessage || '-'}</td>
              <td data-label="Created" style={{ fontSize: '0.8rem' }}>{new Date(q.createdAt).toLocaleString()}</td>
              <td data-label="Actions">
                {q.status === 'failed' && <button className="btn btn-sm btn-primary" onClick={() => handleRetry(q._id)} disabled={actionLoading === `retry-${q._id}`}>
                  {actionLoading === `retry-${q._id}` ? <><span className="spinner-mini"></span></> : 'Retry'}
                </button>}
                <button className="btn btn-sm btn-danger" onClick={() => setDeleteTarget(q._id)}>Delete</button>
                <button className="btn btn-sm" onClick={() => setSelectedItem(q)}>Detail</button>
              </td>
            </tr>
          ))}
          {filtered.length === 0 && <tr><td colSpan={7} style={{ textAlign: 'center', color: '#999' }}>No queue items found</td></tr>}
        </tbody>
      </table>

      {selectedItem && (
        <div className="modal-overlay" onClick={() => setSelectedItem(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 700 }}>
            <div className="modal-header"><h3>Queue Item Detail</h3><button className="modal-close" onClick={() => setSelectedItem(null)}>&times;</button></div>
            <div className="modal-body">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
                <div><strong>To:</strong> {selectedItem.to}</div>
                <div><strong>Status:</strong> <span className={getStatusBadge(selectedItem.status)}>{selectedItem.status}</span></div>
                <div><strong>Subject:</strong> {selectedItem.subject || '-'}</div>
                <div><strong>Retries:</strong> {selectedItem.retryCount || 0}/{selectedItem.maxRetries || 3}</div>
                <div><strong>Created:</strong> {new Date(selectedItem.createdAt).toLocaleString()}</div>
                {selectedItem.sentAt && <div><strong>Sent:</strong> {new Date(selectedItem.sentAt).toLocaleString()}</div>}
              </div>
              {selectedItem.errorMessage && (
                <div style={{ marginTop: 8, padding: 12, background: '#fbe9e7', borderRadius: 6, color: '#c62828' }}>
                  <strong>Error:</strong> {selectedItem.errorMessage}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <ConfirmModal isOpen={!!deleteTarget} title="Delete Queue Item" message="Delete this queue item?"
        onConfirm={handleDelete} onCancel={() => setDeleteTarget(null)} confirmText="Delete" cancelText="Cancel" type="danger" loading={actionLoading === 'delete'} />
    </div>
  );
}
