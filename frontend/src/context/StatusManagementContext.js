import React, { createContext, useContext, useState, useCallback, useMemo, useEffect } from 'react';
import { adminAPI } from '../services/api';
import { showApiSuccess, showApiError, getErrorMessage } from '../utils/toastResponse';

const StatusManagementContext = createContext(null);

export function StatusManagementProvider({ children }) {
  const [collections, setCollections] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Drawer state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedCollection, setSelectedCollection] = useState(null);
  const [statusItems, setStatusItems] = useState([]);
  const [drawerLoading, setDrawerLoading] = useState(false);

  const loadCollections = useCallback(async (params = {}) => {
    setLoading(true);
    try {
      const res = await adminAPI.getStatusCollections(params);
      if (res?.data?.success) {
        setCollections(res.data.data || []);
      }
    } catch (err) {
      showApiError(err, 'Failed to load option collections');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadStats = useCallback(async () => {
    try {
      const res = await adminAPI.getStatusCollectionStats();
      if (res?.data?.success) {
        setStats(res.data.data);
      }
    } catch (err) {
      // silent
    }
  }, []);

  const createCollection = useCallback(async (data) => {
    setSaving(true);
    try {
      const res = await adminAPI.createStatusCollection(data);
      ensureSuccess(res, 'Option collection created');
      showApiSuccess(res, 'Option collection created');
      await loadCollections();
      await loadStats();
      return { success: true, data: res.data.data };
    } catch (err) {
      showApiError(err, 'Failed to create option collection');
      return { success: false, error: err };
    } finally {
      setSaving(false);
    }
  }, [loadCollections, loadStats]);

  const updateCollection = useCallback(async (id, data) => {
    setSaving(true);
    try {
      const res = await adminAPI.updateStatusCollection(id, data);
      ensureSuccess(res, 'Option collection updated');
      showApiSuccess(res, 'Option collection updated');
      if (selectedCollection && (selectedCollection._id === id || selectedCollection.id === id)) {
        await openDrawer(id);
      }
      await loadCollections();
      return { success: true, data: res.data.data };
    } catch (err) {
      showApiError(err, 'Failed to update option collection');
      return { success: false, error: err };
    } finally {
      setSaving(false);
    }
  }, [loadCollections, selectedCollection]);

  const deleteCollection = useCallback(async (id) => {
    setSaving(true);
    try {
      const res = await adminAPI.deleteStatusCollection(id);
      ensureSuccess(res, 'Option collection deactivated');
      showApiSuccess(res, 'Option collection deactivated');
      if (drawerOpen && selectedCollection && (selectedCollection._id === id || selectedCollection.id === id)) {
        closeDrawer();
      }
      await loadCollections();
      await loadStats();
      return { success: true };
    } catch (err) {
      showApiError(err, 'Failed to delete option collection');
      return { success: false, error: err };
    } finally {
      setSaving(false);
    }
  }, [loadCollections, loadStats, drawerOpen, selectedCollection]);

  const openDrawer = useCallback(async (id) => {
    setDrawerOpen(true);
    setDrawerLoading(true);
    try {
      const res = await adminAPI.getStatusCollection(id);
      if (res?.data?.success && res.data.data) {
        setSelectedCollection(res.data.data);
        setStatusItems(res.data.data.items || []);
      } else {
        setSelectedCollection(null);
        setStatusItems([]);
      }
    } catch (err) {
      showApiError(err, 'Failed to load option collection');
      closeDrawer();
    } finally {
      setDrawerLoading(false);
    }
  }, []);

  const closeDrawer = useCallback(() => {
    setDrawerOpen(false);
    setSelectedCollection(null);
    setStatusItems([]);
  }, []);

  const loadStatusItems = useCallback(async (collectionId, params = {}) => {
    try {
      const res = await adminAPI.getStatusCollectionItems(collectionId, params);
      if (res?.data?.success) {
        setStatusItems(res.data.data || []);
      }
    } catch (err) {
      showApiError(err, 'Failed to load option items');
    }
  }, []);

  const createStatusItem = useCallback(async (collectionId, data) => {
    setSaving(true);
    try {
      const res = await adminAPI.createStatusCollectionItem(collectionId, data);
      ensureSuccess(res, 'Option item created');
      showApiSuccess(res, 'Option item created');
      await loadStatusItems(collectionId);
      if (selectedCollection && (selectedCollection._id === collectionId || selectedCollection.id === collectionId)) {
        setSelectedCollection((prev) => ({
          ...prev,
          statusCount: (prev.statusCount || 0) + 1,
          activeStatusCount: (prev.activeStatusCount || 0) + (data.isActive !== false ? 1 : 0),
        }));
      }
      return { success: true, data: res.data.data };
    } catch (err) {
      showApiError(err, 'Failed to create option item');
      return { success: false, error: err };
    } finally {
      setSaving(false);
    }
  }, [loadStatusItems, selectedCollection]);

  const updateStatusItem = useCallback(async (itemId, data) => {
    setSaving(true);
    try {
      const res = await adminAPI.updateStatusItem(itemId, data);
      ensureSuccess(res, 'Option item updated');
      showApiSuccess(res, 'Option item updated');
      if (selectedCollection) {
        await loadStatusItems(selectedCollection._id || selectedCollection.id);
      }
      return { success: true, data: res.data.data };
    } catch (err) {
      showApiError(err, 'Failed to update option item');
      return { success: false, error: err };
    } finally {
      setSaving(false);
    }
  }, [loadStatusItems, selectedCollection]);

  const deleteStatusItem = useCallback(async (itemId) => {
    setSaving(true);
    try {
      const res = await adminAPI.deleteStatusItem(itemId);
      ensureSuccess(res, 'Option item deactivated');
      showApiSuccess(res, 'Option item deactivated');
      if (selectedCollection) {
        await loadStatusItems(selectedCollection._id || selectedCollection.id);
      }
      return { success: true };
    } catch (err) {
      showApiError(err, 'Failed to delete option item');
      return { success: false, error: err };
    } finally {
      setSaving(false);
    }
  }, [loadStatusItems, selectedCollection]);

  const toggleStatusItem = useCallback(async (itemId) => {
    setSaving(true);
    try {
      const res = await adminAPI.toggleStatusItem(itemId);
      ensureSuccess(res, 'Option item toggled');
      showApiSuccess(res, 'Option item toggled');
      if (selectedCollection) {
        await loadStatusItems(selectedCollection._id || selectedCollection.id);
      }
      return { success: true };
    } catch (err) {
      showApiError(err, 'Failed to toggle option item');
      return { success: false, error: err };
    } finally {
      setSaving(false);
    }
  }, [loadStatusItems, selectedCollection]);

  const setDefaultStatusItem = useCallback(async (itemId) => {
    setSaving(true);
    try {
      const res = await adminAPI.setDefaultStatusItem(itemId);
      ensureSuccess(res, 'Default status set');
      showApiSuccess(res, 'Default option updated');
      if (selectedCollection) {
        await loadStatusItems(selectedCollection._id || selectedCollection.id);
      }
      return { success: true };
    } catch (err) {
      showApiError(err, 'Failed to set default option');
      return { success: false, error: err };
    } finally {
      setSaving(false);
    }
  }, [loadStatusItems, selectedCollection]);

  const value = useMemo(() => ({
    collections,
    stats,
    loading,
    saving,
    drawerOpen,
    selectedCollection,
    statusItems,
    drawerLoading,
    loadCollections,
    loadStats,
    createCollection,
    updateCollection,
    deleteCollection,
    openDrawer,
    closeDrawer,
    loadStatusItems,
    createStatusItem,
    updateStatusItem,
    deleteStatusItem,
    toggleStatusItem,
    setDefaultStatusItem,
  }), [
    collections, stats, loading, saving, drawerOpen, selectedCollection, statusItems, drawerLoading,
    loadCollections, loadStats, createCollection, updateCollection, deleteCollection,
    openDrawer, closeDrawer, loadStatusItems, createStatusItem, updateStatusItem,
    deleteStatusItem, toggleStatusItem, setDefaultStatusItem,
  ]);

  return (
    <StatusManagementContext.Provider value={value}>
      {children}
    </StatusManagementContext.Provider>
  );
}

const ensureSuccess = (response, fallback) => {
  if (!(response?.status >= 200 && response?.status < 300 && response?.data?.success === true)) {
    throw new Error(response?.data?.message || fallback);
  }
};

export const useStatusManagement = () => {
  const ctx = useContext(StatusManagementContext);
  if (!ctx) throw new Error('useStatusManagement must be used within StatusManagementProvider');
  return ctx;
};

export default StatusManagementContext;
