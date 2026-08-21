import React, { useEffect, useState } from 'react';
import { Mail } from 'lucide-react';

/**
 * "Where should this go?"
 *
 * Most customers imported from the old system carry an address the import
 * invented for them, and a walk-in buyer has none at all. Sending was simply
 * refused in both cases, which read as "e-mail is broken". The document can now
 * be sent to an address typed here instead; the server treats a typed address
 * as the deliberate instruction it is.
 *
 * Callers open it with the document and a send function:
 *   <EmailRecipientModal prompt={emailPrompt} onClose={…} onSend={(to) => …} />
 */
export default function EmailRecipientModal({ prompt, onClose, onSend }) {
  const [address, setAddress] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => { setAddress(prompt?.suggested || ''); }, [prompt]);

  if (!prompt) return null;

  const submit = async (event) => {
    event.preventDefault();
    const to = address.trim();
    if (!to) return;
    setSending(true);
    try { await onSend(to); } finally { setSending(false); }
  };

  return (
    <div className="modal-overlay" onClick={() => !sending && onClose()}>
      <div className="modal-content" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3><Mail size={17} style={{ verticalAlign: '-3px', marginRight: 6 }} />Send {prompt.label || 'document'}</h3>
          <button className="modal-close" onClick={() => !sending && onClose()}>&times;</button>
        </div>
        <form onSubmit={submit}>
          <div className="modal-body">
            <p className="sm-role-job-note" style={{ marginTop: 0 }}>
              {prompt.reason || 'This customer has no email address on their record.'} Type where it should be sent —
              the PDF goes with it.
            </p>
            <div className="form-group">
              <label>Email address *</label>
              <input
                type="email" required autoFocus value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="name@example.com"
              />
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={sending}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={sending}>{sending ? 'Sending…' : 'Send'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
