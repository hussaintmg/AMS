import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { ledgerAPI } from '../services/api';
import { showApiSuccess, showApiError, getErrorMessage } from '../utils/toastResponse';
import eventBus from '../utils/eventBus';

const LedgerContext = createContext(null);

export function LedgerProvider({ children }) {
  const [entries, setEntries] = useState([]);
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const reset = () => {
      setEntries([]); setStats({}); setLoading(false); setError(null);
    };
    eventBus.on('auth:logout', reset);
    return () => eventBus.remove('auth:logout', reset);
  }, []);

  const loadEntries = useCallback(async (params = {}) => {
    try { setLoading(true); const res = await ledgerAPI.list(params);
      const d = res.data?.data || res.data;
      const list = d?.rows || (Array.isArray(d) ? d : []);
      const pagination = { total: d?.total || list.length, page: d?.page || 1, limit: d?.limit || 50 };
      const summary = d?.summary || {};
      setEntries(list); return { entries: list, pagination, summary };
    } catch (err) { showApiError(err, 'Failed to load ledger'); throw err;
    } finally { setLoading(false); }
  }, []);

  const loadStats = useCallback(async () => {
    try { const res = await ledgerAPI.getStats(); const d = res.data?.data || {}; setStats(d); return d;
    } catch (err) { showApiError(err, 'Failed to load stats'); throw err; }
  }, []);

  const value = useMemo(() => ({
    entries, stats, loading, error,
    setEntries, loadEntries, loadStats,
  }), [entries, stats, loading, error]);

  return <LedgerContext.Provider value={value}>{children}</LedgerContext.Provider>;
}

export const useLedger = () => useContext(LedgerContext);
export default LedgerContext;
