import React, { createContext, useContext, useState, useCallback } from 'react';
import { emailAPI } from '../services/api';

const EmailUsageContext = createContext(null);

export function EmailUsageProvider({ children }) {
  const [usages, setUsages] = useState([]);
  const [loading, setLoading] = useState(false);

  const loadUsages = useCallback(async () => {
    setLoading(true);
    try { const r = await emailAPI.getUsages(); setUsages(r.data?.data?.usages || []); } catch (e) {} finally { setLoading(false); }
  }, []);

  const addUsage = useCallback((usage) => {
    setUsages(prev => [...prev, usage]);
  }, []);

  const updateUsage = useCallback((id, data) => {
    setUsages(prev => prev.map(u => u._id === id ? { ...u, ...data } : u));
  }, []);

  const removeUsage = useCallback((id) => {
    setUsages(prev => prev.filter(u => u._id !== id));
  }, []);

  return (
    <EmailUsageContext.Provider value={{ usages, loadUsages, loading, addUsage, updateUsage, removeUsage }}>
      {children}
    </EmailUsageContext.Provider>
  );
}

export const useEmailUsageContext = () => useContext(EmailUsageContext);
