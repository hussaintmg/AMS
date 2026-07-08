import React, { createContext, useContext, useState, useCallback } from 'react';
import { emailAPI } from '../services/api';

const EmailVariablesContext = createContext(null);

export function EmailVariablesProvider({ children }) {
  const [variables, setVariables] = useState([]);
  const [loading, setLoading] = useState(false);

  const loadVariables = useCallback(async (params) => {
    setLoading(true);
    try { const r = await emailAPI.getVariables(params); setVariables(r.data?.data?.variables || []); } catch (e) {} finally { setLoading(false); }
  }, []);

  const addVariable = useCallback((variable) => {
    setVariables(prev => [...prev, variable]);
  }, []);

  const updateVariable = useCallback((id, data) => {
    setVariables(prev => prev.map(v => v._id === id ? { ...v, ...data } : v));
  }, []);

  const removeVariable = useCallback((id) => {
    setVariables(prev => prev.filter(v => v._id !== id));
  }, []);

  return (
    <EmailVariablesContext.Provider value={{ variables, loadVariables, loading, addVariable, updateVariable, removeVariable }}>
      {children}
    </EmailVariablesContext.Provider>
  );
}

export const useEmailVariablesContext = () => useContext(EmailVariablesContext);
