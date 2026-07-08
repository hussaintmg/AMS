import React, { createContext, useContext, useState, useCallback } from 'react';
import { emailAPI } from '../services/api';

const EmailTemplatesContext = createContext(null);

export function EmailTemplatesProvider({ children }) {
  const [templates, setTemplates] = useState([]);
  const [templateStats, setTemplateStats] = useState(null);
  const [loading, setLoading] = useState(false);

  const loadTemplates = useCallback(async (params) => {
    setLoading(true);
    try {
      const [r, statsResponse] = await Promise.all([
        emailAPI.getTemplates(params),
        emailAPI.getTemplateStats().catch(() => null),
      ]);
      const d = r.data?.data;
      setTemplates(d?.templates || []);
      setTemplateStats(statsResponse?.data?.data || (d && 'total' in d ? d : null));
    } catch (e) {} finally { setLoading(false); }
  }, []);

  const addTemplate = useCallback((tpl) => {
    setTemplates(prev => [...prev, tpl]);
  }, []);

  const updateTemplate = useCallback((id, data) => {
    setTemplates(prev => prev.map(t => t._id === id ? { ...t, ...data } : t));
  }, []);

  const removeTemplate = useCallback((id) => {
    setTemplates(prev => prev.filter(t => t._id !== id));
  }, []);

  return (
    <EmailTemplatesContext.Provider value={{ templates, templateStats, loadTemplates, loading, addTemplate, updateTemplate, removeTemplate }}>
      {children}
    </EmailTemplatesContext.Provider>
  );
}

export const useEmailTemplatesContext = () => useContext(EmailTemplatesContext);
