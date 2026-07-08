import React, { createContext, useContext, useState, useCallback } from 'react';
import { emailAPI } from '../services/api';

const EmailSMTPContext = createContext(null);

export function EmailSMTPProvider({ children }) {
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(false);

  const loadConfig = useCallback(async () => {
    setLoading(true);
    try { const r = await emailAPI.getEmailConfig(); setConfig(r.data?.data?.config || null); } catch (e) {} finally { setLoading(false); }
  }, []);

  return (
    <EmailSMTPContext.Provider value={{ config, loadConfig, loading }}>
      {children}
    </EmailSMTPContext.Provider>
  );
}

export const useEmailSMTPContext = () => useContext(EmailSMTPContext);
