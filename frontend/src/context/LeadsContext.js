import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { leadAPI } from '../services/api';

const LeadsContext = createContext(null);

export function LeadsProvider({ children }) {
  const [leads, setLeads] = useState([]);
  const [meta, setMeta] = useState({ statuses: [], sources: [], types: [], priorities: [], cities: [], users: [], departments: [] });
  const [stats, setStats] = useState(null);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, pages: 0 });
  const [filters, setFilters] = useState({});
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState('desc');
  const [loading, setLoading] = useState(false);
  const [metaLoading, setMetaLoading] = useState(false);
  const initialLoadDone = useRef(false);
  const previousLimit = useRef(20);

  const loadMeta = useCallback(async (form) => {
    setMetaLoading(true);
    try {
      // `form` narrows the pickers to that form's dropdown rules; without it
      // the widest rule of the three applies, which is what a list page wants.
      const { data } = await leadAPI.getMeta(form ? { forForm: form } : undefined);
      if (data?.success) {
        setMeta(data.data);
      }
    } catch (err) {
      console.error('Failed to load lead meta:', err);
    } finally {
      setMetaLoading(false);
    }
  }, []);

  const loadStats = useCallback(async () => {
    try {
      const { data } = await leadAPI.getStats();
      if (data?.success) {
        setStats(data.data);
      }
    } catch (err) {
      console.error('Failed to load lead stats:', err);
    }
  }, []);

  const buildParams = useCallback((page = 1) => {
    const params = { page, limit: pagination.limit, sortBy, sortOrder };
    if (search) params.search = search;
    Object.entries(filters).forEach(([k, v]) => {
      if (v || v === false) {
        let key = k;
        if (key === 'startDate') key = 'dateFrom';
        if (key === 'endDate') key = 'dateTo';
        params[key] = v;
      }
    });
    Object.keys(params).forEach((k) => { if (!params[k] && params[k] !== false && params[k] !== 0) delete params[k]; });
    return params;
  }, [filters, search, sortBy, sortOrder, pagination.limit]);

  const loadLeads = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const params = buildParams(page);
      const { data } = await leadAPI.getAll(params);
      if (data?.success) {
        setLeads(data.data);
        setPagination((prev) => ({ ...prev, ...data.pagination }));
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load leads');
    } finally {
      setLoading(false);
    }
  }, [buildParams]);

  useEffect(() => {
    if (!initialLoadDone.current) {
      initialLoadDone.current = true;
      loadMeta();
      loadStats();
      loadLeads(1);
    }
  }, []);

  useEffect(() => {
    if (previousLimit.current === pagination.limit) return;
    previousLimit.current = pagination.limit;
    loadLeads(1);
  }, [pagination.limit, loadLeads]);

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

  const handleSort = useCallback((field, order) => {
    if (field) setSortBy(field);
    if (order) setSortOrder(order);
  }, []);

  const goToPage = useCallback((page) => {
    loadLeads(page);
  }, [loadLeads]);

  const setPageSize = useCallback((limit) => {
    setPagination((prev) => ({ ...prev, page: 1, limit: Math.min(1000, limit) }));
  }, []);

  const applyFilters = useCallback(() => {
    loadLeads(1);
  }, [loadLeads]);

  const refreshLeads = useCallback(() => {
    loadLeads(pagination.page);
    loadStats();
  }, [loadLeads, loadStats, pagination.page]);

  const getLeadById = useCallback(async (id) => {
    const { data } = await leadAPI.getById(id);
    return data?.success ? data.data : null;
  }, []);

  const createLead = useCallback(async (formData) => {
    const { data } = await leadAPI.create(formData);
    return data;
  }, []);

  const updateLead = useCallback(async (id, formData) => {
    const { data } = await leadAPI.update(id, formData);
    return data;
  }, []);

  const deleteLead = useCallback(async (id) => {
    const { data } = await leadAPI.delete(id);
    if (data?.success) refreshLeads();
    return data;
  }, [refreshLeads]);

  const assignLead = useCallback(async (id, assignedTo) => {
    const { data } = await leadAPI.assign(id, { assignedTo });
    return data;
  }, []);

  const changeStatus = useCallback(async (id, status) => {
    const { data } = await leadAPI.changeStatus(id, { status });
    return data;
  }, []);

  const addNote = useCallback(async (id, content) => {
    const { data } = await leadAPI.addNote(id, { content });
    return data;
  }, []);

  const getActivities = useCallback(async (id) => {
    const { data } = await leadAPI.getActivities(id);
    return data?.success ? data.data : [];
  }, []);

  const convertLead = useCallback(async (id) => {
    const { data } = await leadAPI.convert(id);
    return data;
  }, []);

  const markLeadLost = useCallback(async (id, lostReason) => {
    const { data } = await leadAPI.markLost(id, { lostReason });
    return data;
  }, []);

  const value = {
    leads, meta, stats, pagination, filters, search,
    sortBy, sortOrder, loading, metaLoading,
    handleSearch, handleFilter, clearFilters,
    handleSort, goToPage, setPageSize, applyFilters, refreshLeads,
    getLeadById, createLead, updateLead, deleteLead,
    assignLead, changeStatus, addNote, getActivities, convertLead, markLeadLost,
    loadMeta, loadStats, loadLeads,
  };

  return <LeadsContext.Provider value={value}>{children}</LeadsContext.Provider>;
}

export function useLeads() {
  const ctx = useContext(LeadsContext);
  if (!ctx) throw new Error('useLeads must be used within LeadsProvider');
  return ctx;
}
