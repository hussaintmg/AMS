import React, { createContext, useContext, useState, useCallback } from 'react';
import { emailAPI } from '../services/api';

const EmailAssetsContext = createContext(null);

export function EmailAssetsProvider({ children }) {
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(false);

  const loadAssets = useCallback(async (params) => {
    setLoading(true);
    try { const r = await emailAPI.getAssets(params); setAssets(r.data?.data?.assets || []); } catch (e) {} finally { setLoading(false); }
  }, []);

  return (
    <EmailAssetsContext.Provider value={{ assets, loadAssets, loading }}>
      {children}
    </EmailAssetsContext.Provider>
  );
}

export const useEmailAssetsContext = () => useContext(EmailAssetsContext);
