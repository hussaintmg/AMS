import React, { createContext, useContext, useState, useCallback } from 'react';
import { emailAPI } from '../services/api';

const EmailComponentsContext = createContext(null);

export function EmailComponentsProvider({ children }) {
  const [components, setComponents] = useState([]);
  const [loading, setLoading] = useState(false);

  const loadComponents = useCallback(async () => {
    setLoading(true);
    try { const r = await emailAPI.getComponents(); setComponents(r.data?.data?.components || []); } catch (e) {} finally { setLoading(false); }
  }, []);

  const addComponent = useCallback((comp) => {
    setComponents(prev => [...prev, comp]);
  }, []);

  const updateComponent = useCallback((id, data) => {
    setComponents(prev => prev.map(c => c._id === id ? { ...c, ...data } : c));
  }, []);

  const removeComponent = useCallback((id) => {
    setComponents(prev => prev.filter(c => c._id !== id));
  }, []);

  return (
    <EmailComponentsContext.Provider value={{ components, loadComponents, loading, addComponent, updateComponent, removeComponent }}>
      {children}
    </EmailComponentsContext.Provider>
  );
}

export const useEmailComponentsContext = () => useContext(EmailComponentsContext);
