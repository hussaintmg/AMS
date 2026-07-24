import React, { useEffect, useState } from 'react';
import { Bell, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import { notificationsAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import '../styles/notifications.css';

export default function NotificationSettings() {
  const { canView, isSuperAdmin } = useAuth();
  const [modules, setModules] = useState([]);
  const [master, setMaster] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    notificationsAPI.getPreferences().then(r => {
      const allModules = r.data?.data?.modules || [];
      const filtered = isSuperAdmin
        ? allModules
        : allModules.filter(m => canView(m.key));
      setModules(filtered);
      setMaster(r.data?.data?.masterEnabled !== false);
    }).catch(() => toast.error('Failed to load notification settings'));
  }, [canView, isSuperAdmin]);

  const save = async () => {
    setSaving(true);
    try {
      await notificationsAPI.savePreferences({
        masterEnabled: master,
        modules: modules.map(m => ({ module: m.key, enabled: m.enabled })),
      });
      toast.success('Notification settings saved');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="notification-settings-page">
      <header>
        <div>
          <h1>Notification Settings</h1>
          <p>Choose notifications for the modules you are permitted to view.</p>
        </div>
        <button className="btn btn-primary" onClick={save} disabled={saving}>
          <Save size={17} />{saving ? 'Saving...' : 'Save changes'}
        </button>
      </header>
      <section className="notification-settings-panel">
        <div className="notification-master">
          <span className="notification-module-icon"><Bell size={20} /></span>
          <div>
            <strong>In-app notifications</strong>
            <p>Show business activity in the topbar notification center.</p>
          </div>
          <label className="notification-switch">
            <input type="checkbox" checked={master} onChange={e => setMaster(e.target.checked)} />
            <span />
          </label>
        </div>
        <div className={!master ? 'notification-module-list disabled' : 'notification-module-list'}>
          {modules.map(m => (
            <div className="notification-module-row" key={m.key}>
              <div>
                <strong>{m.label}</strong>
                <span>Notify me when a new {m.label.toLowerCase()} record is created.</span>
              </div>
              <label className="notification-switch">
                <input type="checkbox" disabled={!master} checked={m.enabled} onChange={e => setModules(list => list.map(x => x.key === m.key ? { ...x, enabled: e.target.checked } : x))} />
                <span />
              </label>
            </div>
          ))}
          {!modules.length && <div className="notification-empty">No notification-enabled modules are assigned to your role.</div>}
        </div>
      </section>
    </div>
  );
}
