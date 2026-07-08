import React, { createContext, useContext, useState, useCallback } from 'react';
import { emailAPI } from '../services/api';

const EmailQueueContext = createContext(null);

export function EmailQueueProvider({ children }) {
  const [queue, setQueue] = useState([]);
  const [queueStats, setQueueStats] = useState(null);
  const [loading, setLoading] = useState(false);

  const loadQueue = useCallback(async (params) => {
    setLoading(true);
    try {
      const [listRes, statsRes] = await Promise.all([
        emailAPI.getQueue(params),
        emailAPI.getQueueStats(),
      ]);
      setQueue(listRes.data?.data?.items || []);
      setQueueStats(statsRes.data?.data || null);
    } catch (e) {} finally { setLoading(false); }
  }, []);

  const updateQueueItem = useCallback((id, data) => {
    setQueue(prev => prev.map(item => item._id === id ? { ...item, ...data } : item));
  }, []);

  const removeQueueItem = useCallback((id) => {
    setQueue(prev => prev.filter(item => item._id !== id));
  }, []);

  return (
    <EmailQueueContext.Provider value={{ queue, queueStats, loadQueue, loading, updateQueueItem, removeQueueItem }}>
      {children}
    </EmailQueueContext.Provider>
  );
}

export const useEmailQueueContext = () => useContext(EmailQueueContext);
