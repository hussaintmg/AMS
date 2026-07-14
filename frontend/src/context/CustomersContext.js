import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { customerAPI } from '../services/api';

const CustomersContext = createContext();

export function CustomersProvider({ children }) {
  const [customers, setCustomers] = useState([]);
  const [stats, setStats] = useState({ total: 0, active: 0, inactive: 0, individual: 0, corporate: 0, convertedFromLead: 0, newThisMonth: 0 });
  const [cities, setCities] = useState([]);
  const [meta, setMeta] = useState({ sources: [], types: [], cities: [], statuses: [], users: [], departments: [], statusCollectionId: null, statusCollectionName: null });
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, pages: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({});
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState('desc');
  const [selectedCustomerId, setSelectedCustomerId] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const requestIdRef = useRef(0);

  const buildParams = useCallback((page = 1) => {
    const params = { page, limit: pagination.limit, sortBy, sortOrder };
    if (search) params.search = search;
    Object.entries(filters).forEach(([k, v]) => { if (v || v === false || v === 0) params[k] = v; });
    Object.keys(params).forEach((k) => { if (!params[k] && params[k] !== false && params[k] !== 0) delete params[k]; });
    return params;
  }, [filters, search, sortBy, sortOrder, pagination.limit]);

  const loadCustomers = useCallback(async (page = 1) => {
    const reqId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const params = buildParams(page);
      const { data: res } = await customerAPI.getAll(params);
      if (reqId !== requestIdRef.current) return;
      if (res?.success) {
        setCustomers(res.data);
        setPagination(res.pagination);
      }
    } catch (err) {
      if (reqId !== requestIdRef.current) return;
      setError(err.response?.data?.message || 'Failed to load customers');
    } finally {
      if (reqId === requestIdRef.current) setLoading(false);
    }
  }, [buildParams]);

  const loadMeta = useCallback(async () => {
    try {
      const { data: res } = await customerAPI.getMeta();
      if (res?.success) setMeta(res.data);
    } catch (_) { /* ignore */ }
  }, []);

  const loadStats = useCallback(async () => {
    try {
      const { data: res } = await customerAPI.getStats();
      if (res?.success) setStats(res.data);
    } catch (_) { /* ignore */ }
  }, []);

  const loadCities = useCallback(async () => {
    try {
      const { data: res } = await customerAPI.getCities();
      if (res?.success) setCities(res.data || []);
    } catch (_) { /* ignore */ }
  }, []);

  const handleSearch = useCallback((val) => {
    setSearch(val);
  }, []);

  const handleFilter = useCallback((newFilters) => {
    setFilters((prev) => ({ ...prev, ...newFilters }));
  }, []);

  const clearFilters = useCallback(() => {
    setFilters({});
    setSearch('');
  }, []);

  const loadAll = useCallback(async (page) => {
    await Promise.all([loadCustomers(page), loadStats(), loadCities(), loadMeta()]);
  }, [loadCustomers, loadStats, loadCities, loadMeta]);

  useEffect(() => {
    loadAll(1);
  }, [loadAll]);

  const getCustomerById = useCallback(async (id) => {
    try {
      const { data: res } = await customerAPI.getById(id);
      if (res?.success) return res.data;
      return null;
    } catch (err) {
      throw err;
    }
  }, []);

  const createCustomer = useCallback(async (payload) => {
    try {
      const { data: res } = await customerAPI.create(payload);
      if (res?.success) {
        const tempId = `temp_${Date.now()}`;
        const tempItem = { ...payload, _id: tempId, customerCode: '...', createdAt: new Date().toISOString() };
        setCustomers((prev) => [tempItem, ...prev]);
        setPagination((prev) => ({ ...prev, total: prev.total + 1 }));
        const realData = res.data;
        setCustomers((prev) => prev.map((c) => c._id === tempId ? { ...c, ...realData } : c));
        loadStats();
      }
      return res;
    } catch (err) {
      setCustomers((prev) => prev.filter((c) => !c._id?.startsWith('temp_')));
      throw err;
    }
  }, [loadStats]);

  const updateCustomer = useCallback(async (id, payload) => {
    const prev = customers.find((c) => c._id === id);
    setCustomers((prevList) => prevList.map((c) => c._id === id ? { ...c, ...payload } : c));
    try {
      const { data: res } = await customerAPI.update(id, payload);
      if (res?.success) {
        loadStats();
        return res;
      }
      setCustomers((prevList) => prevList.map((c) => c._id === id ? prev : c));
      return res;
    } catch (err) {
      setCustomers((prevList) => prevList.map((c) => c._id === id ? prev : c));
      throw err;
    }
  }, [customers, loadStats]);

  const deleteCustomer = useCallback(async (id) => {
    const prev = customers.find((c) => c._id === id);
    setCustomers((prevList) => prevList.filter((c) => c._id !== id));
    setPagination((prev) => ({ ...prev, total: prev.total - 1 }));
    try {
      const { data: res } = await customerAPI.delete(id);
      if (res?.success) {
        loadStats();
        return res;
      }
      setCustomers((prevList) => [...prevList, prev]);
      setPagination((prev) => ({ ...prev, total: prev.total + 1 }));
      return res;
    } catch (err) {
      setCustomers((prevList) => [...prevList, prev]);
      setPagination((prev) => ({ ...prev, total: prev.total + 1 }));
      throw err;
    }
  }, [customers, loadStats]);

  const toggleCustomerStatus = useCallback(async (id) => {
    const prev = customers.find((c) => c._id === id);
    setCustomers((prevList) => prevList.map((c) => c._id === id ? { ...c, isActive: !c.isActive } : c));
    try {
      const { data: res } = await customerAPI.toggleStatus(id);
      if (res?.success) {
        loadStats();
        return res;
      }
      setCustomers((prevList) => prevList.map((c) => c._id === id ? prev : c));
      return res;
    } catch (err) {
      setCustomers((prevList) => prevList.map((c) => c._id === id ? prev : c));
      throw err;
    }
  }, [customers, loadStats]);

  const openDrawer = useCallback((id) => {
    setSelectedCustomerId(id);
    setDrawerOpen(true);
  }, []);

  const closeDrawer = useCallback(() => {
    setDrawerOpen(false);
    setSelectedCustomerId(null);
  }, []);

  const refresh = useCallback(() => {
    loadCustomers(pagination.page);
    loadStats();
  }, [loadCustomers, loadStats, pagination.page]);

  return (
    <CustomersContext.Provider value={{
      customers, stats, cities, meta, pagination, loading, error, filters, search, sortBy, sortOrder,
      selectedCustomerId, drawerOpen,
      handleSearch, handleFilter, clearFilters,
      loadCustomers, loadStats, loadCities, loadMeta, loadAll,
      getCustomerById, createCustomer, updateCustomer, deleteCustomer,
      toggleCustomerStatus, openDrawer, closeDrawer, refresh,
    }}>
      {children}
    </CustomersContext.Provider>
  );
}

export function useCustomers() {
  const ctx = useContext(CustomersContext);
  if (!ctx) throw new Error('useCustomers must be used within CustomersProvider');
  return ctx;
}
