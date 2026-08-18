/**
 * Gate Verify — the guard's screen (page `gatepass_verify`).
 *
 * Type or scan a gate pass number / barcode, see who it is, what they bought
 * (the invoice lines) or what the truck is carrying, and press Verify. The
 * role needs only `verify` on this page: it can confirm passes and nothing
 * else. Nothing here moves stock.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import toast from 'react-hot-toast';
import { ShieldCheck, ScanLine, Printer, RotateCcw } from 'lucide-react';
import { gatePassAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { pageActions } from '../../utils/roleJobs';
import { GatePassDetails, printGatePass, statusBadge, asDay } from './GatePassShared';
import '../../styles/userManagement.css';
import '../../styles/sales-print.css';

export default function GateVerify() {
  const { user } = useAuth();
  const canVerify = pageActions(user, 'gatepass_verify')('verify');
  const [needle, setNeedle] = useState('');
  const [pass, setPass] = useState(null);
  const [loading, setLoading] = useState(false);
  const [notes, setNotes] = useState('');
  const [recent, setRecent] = useState([]);
  const inputRef = useRef(null);
  const token = localStorage.getItem('token');

  const loadRecent = useCallback(async () => {
    try { const res = await gatePassAPI.getAll({ direction: 'out', status: 'issued', limit: 10 }); setRecent(res.data?.data || []); } catch { setRecent([]); }
  }, []);
  useEffect(() => { loadRecent(); inputRef.current?.focus(); }, [loadRecent]);

  const lookup = async (value) => {
    const q = String(value || needle).trim();
    if (!q) return;
    setLoading(true);
    try { const res = await gatePassAPI.lookup(q); setPass(res.data?.data || null); setNotes(''); }
    catch (error) { toast.error(error.response?.data?.message || 'No gate pass with that number'); setPass(null); }
    finally { setLoading(false); }
  };
  const verify = async () => {
    if (!pass) return;
    try { const res = await gatePassAPI.verify(pass.id, { notes }); toast.success(res.data?.message); setPass(res.data?.data || null); loadRecent(); }
    catch (error) { toast.error(error.response?.data?.message || 'Could not verify'); }
  };
  const reset = () => { setPass(null); setNeedle(''); setNotes(''); inputRef.current?.focus(); };

  return (
    <div className="card sales-page">
      <div className="card-header d-flex justify-content-between align-items-center"><div><h3><ShieldCheck size={20} style={{ verticalAlign: 'middle' }} /> Gate Verify</h3></div></div>
      <div className="gp-verify">
        <form className="gp-verify-search" onSubmit={(e) => { e.preventDefault(); lookup(); }}>
          <ScanLine size={22} />
          <input ref={inputRef} type="text" value={needle} onChange={(e) => setNeedle(e.target.value)} placeholder="Scan the barcode or type the gate pass number (GP-OUT-…)" autoFocus />
          <button type="submit" className="btn btn-primary" disabled={loading}>{loading ? 'Looking…' : 'Look up'}</button>
          {pass && <button type="button" className="btn btn-secondary" onClick={reset}><RotateCcw size={14} /> Clear</button>}
        </form>

        {pass && (
          <div className={`gp-verify-card gp-verify-${pass.status}`}>
            <div className="gp-verify-head">
              <div><strong>{pass.gate_pass_number}</strong> {statusBadge(pass.status)}<div className="text-muted small">{pass.entry_type === 'customer' ? 'Customer' : 'Logistic'} — {pass.direction === 'in' ? 'IN' : 'OUT'} · {asDay(pass.date)}</div></div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-secondary btn-sm" onClick={() => printGatePass(pass, { token })}><Printer size={14} /> Print</button>
                {canVerify && pass.status === 'issued' && <button className="btn btn-success" onClick={verify}><ShieldCheck size={16} /> Verify — open the gate</button>}
              </div>
            </div>
            {pass.status === 'draft' && <p className="gp-verify-warn">This pass has not been issued yet — send it back to the office.</p>}
            {pass.status === 'cancelled' && <p className="gp-verify-warn">This pass was cancelled. Do not open the gate.</p>}
            {['verified', 'closed'].includes(pass.status) && <p className="gp-verify-ok">Already verified{pass.verified_by?.name ? ` by ${pass.verified_by.name}` : ''}.</p>}
            {canVerify && pass.status === 'issued' && <div className="form-group"><label>Guard notes (optional)</label><input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. 2 boxes checked, seals intact" /></div>}
            <GatePassDetails pass={pass} />
          </div>
        )}

        {!pass && (
          <div className="gp-verify-recent">
            <h4>Awaiting verification</h4>
            {recent.length === 0 ? <p className="text-muted">Nothing is waiting at the gate.</p> : (
              <table className="data-table">
                <thead><tr><th>Gate Pass #</th><th>Type</th><th>Party</th><th>Vehicle</th><th>Against</th><th></th></tr></thead>
                <tbody>{recent.map((row) => <tr key={row.id}><td><strong>{row.gate_pass_number}</strong></td><td>{row.entry_type}</td><td>{row.party}</td><td>{row.vehicle_number || '—'}</td><td>{row.linked_invoice_number || row.linked_gate_pass_number || '—'}</td><td><button className="btn btn-secondary btn-sm" onClick={() => { setNeedle(row.gate_pass_number); lookup(row.gate_pass_number); }}>Open</button></td></tr>)}</tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
