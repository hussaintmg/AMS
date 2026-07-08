import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { emailAPI } from '../../services/api';
import { useEmailSMTPContext } from '../../context/EmailSMTPContext';

export default function EmailSMTP() {
  const { config, loadConfig } = useEmailSMTPContext();
  const [form, setForm] = useState({ host: '', port: 587, encryption: 'tls', username: '', password: '', senderName: '', senderEmail: '', replyTo: '' });
  const [errors, setErrors] = useState({});
  const [testResult, setTestResult] = useState(null);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (config) {
      setForm({
        host: config.host || '',
        port: config.port || 587,
        encryption: config.encryption || 'tls',
        username: config.username || '',
        password: '',
        senderName: config.senderName || '',
        senderEmail: config.senderEmail || '',
        replyTo: config.replyTo || '',
      });
    }
  }, [config]);

  useEffect(() => { loadConfig(); }, []);

  const validate = () => {
    const errs = {};
    if (!form.host.trim()) errs.host = 'SMTP host is required';
    if (!form.senderEmail.trim()) errs.senderEmail = 'Sender email is required';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSave = useCallback(async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const data = { ...form };
      if (!data.password) delete data.password;
      await emailAPI.saveEmailConfig(data);
      toast.success('SMTP configuration saved');
      loadConfig();
    } catch (e) {
      toast.error(e.response?.data?.message || 'Failed to save configuration');
    } finally { setSaving(false); }
  }, [form, loadConfig]);

  const handleTest = useCallback(async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const r = await emailAPI.testEmailConnection();
      setTestResult({ success: true, message: r.data?.message || r.data?.data?.message || 'Connection successful' });
      toast.success('Connection test passed');
    } catch (e) {
      const msg = e.response?.data?.message || e.message || 'Connection failed';
      setTestResult({ success: false, message: msg });
      toast.error(msg);
    } finally { setTesting(false); }
  }, []);

  return (
    <div className="email-module">
      <div className="email-module-header">
        <h2>SMTP Configuration</h2>
      </div>

      {config && (
        <div className="email-stats-grid" style={{ marginBottom: 20 }}>
          <div className="email-stat-card">
            <div className="email-stat-value" style={{ fontSize: '1rem' }}>{config.host || '-'}</div>
            <div className="email-stat-label">Host</div>
          </div>
          <div className="email-stat-card">
            <div className="email-stat-value" style={{ fontSize: '1rem' }}>{config.senderEmail || '-'}</div>
            <div className="email-stat-label">Sender Email</div>
          </div>
          <div className="email-stat-card">
            <div className="email-stat-value" style={{ fontSize: '1rem' }}>{config.username || '-'}</div>
            <div className="email-stat-label">Username</div>
          </div>
          <div className="email-stat-card">
            <div className="email-stat-value" style={{ fontSize: '1rem' }}>{config.port || '-'}</div>
            <div className="email-stat-label">Port</div>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-header">
          <h3>Connection Settings</h3>
        </div>
        <div style={{ padding: '20px' }}>
          <div className="form-group">
            <label>SMTP Host *</label>
            <input className={`form-control ${errors.host ? 'error' : ''}`} value={form.host}
              onChange={e => setForm(p => ({ ...p, host: e.target.value }))} placeholder="smtp.example.com" />
            {errors.host && <small style={{ color: '#dc2626' }}>{errors.host}</small>}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div className="form-group">
              <label>Port</label>
              <input className="form-control" type="number" value={form.port} onChange={e => setForm(p => ({ ...p, port: parseInt(e.target.value) || 587 }))} />
            </div>
            <div className="form-group">
              <label>Encryption</label>
              <select className="form-control" value={form.encryption} onChange={e => setForm(p => ({ ...p, encryption: e.target.value }))}>
                <option value="tls">TLS (port 587)</option>
                <option value="ssl">SSL (port 465)</option>
                <option value="none">None</option>
              </select>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div className="form-group">
              <label>Username</label>
              <input className="form-control" value={form.username} onChange={e => setForm(p => ({ ...p, username: e.target.value }))} placeholder="noreply@example.com" />
            </div>
            <div className="form-group">
              <label>Password {config ? '(leave blank to keep current)' : ''}</label>
              <input className="form-control" type="password" value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))} placeholder={config ? '••••••••' : 'Enter password'} />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div className="form-group">
              <label>Sender Name</label>
              <input className="form-control" value={form.senderName} onChange={e => setForm(p => ({ ...p, senderName: e.target.value }))} placeholder="Company Name" />
            </div>
            <div className="form-group">
              <label>Sender Email *</label>
              <input className={`form-control ${errors.senderEmail ? 'error' : ''}`} type="email" value={form.senderEmail}
                onChange={e => setForm(p => ({ ...p, senderEmail: e.target.value }))} placeholder="noreply@example.com" />
              {errors.senderEmail && <small style={{ color: '#dc2626' }}>{errors.senderEmail}</small>}
            </div>
          </div>
          <div className="form-group">
            <label>Reply-To</label>
            <input className="form-control" type="email" value={form.replyTo} onChange={e => setForm(p => ({ ...p, replyTo: e.target.value }))} placeholder="support@example.com" />
          </div>

          <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? <><span className="spinner-mini"></span> Saving...</> : 'Save Configuration'}
            </button>
            <button className="btn btn-secondary" onClick={handleTest} disabled={testing}>
              {testing ? 'Testing...' : 'Test Connection'}
            </button>
          </div>

          {testResult && (
            <div className={`email-smtp-test-result ${testResult.success ? 'success' : 'error'}`} style={{ marginTop: 12 }}>
              {testResult.message}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
