import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { leavesAPI, employeeAPI } from '../services/api';
import { showApiSuccess, showApiError, getErrorMessage } from '../utils/toastResponse';
import eventBus from '../utils/eventBus';

const LeavesContext = createContext(null);

export function LeavesProvider({ children }) {
  const [leaves, setLeaves] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const reset = () => {
      setLeaves([]); setEmployees([]);
      setStats({}); setLoading(false); setSaving(false); setError(null);
    };
    eventBus.on('auth:logout', reset);
    return () => eventBus.remove('auth:logout', reset);
  }, []);

  const loadLeaves = useCallback(async (params = {}) => {
    try { setLoading(true); const res = await leavesAPI.list(params);
      const d = res.data?.data || res.data;
      const list = d?.leaves || (Array.isArray(d) ? d : []);
      const pagination = { total: d?.total || list.length, page: d?.page || 1, limit: d?.limit || 50 };
      setLeaves(list); return { leaves: list, pagination };
    } catch (err) { showApiError(err, 'Failed to load leaves'); throw err;
    } finally { setLoading(false); }
  }, []);

  const loadStats = useCallback(async () => {
    try { const res = await leavesAPI.getStats(); const d = res.data?.data || {}; setStats(d); return d;
    } catch (err) { showApiError(err, 'Failed to load stats'); throw err; }
  }, []);

  const loadEmployees = useCallback(async () => {
    // Names its dropdown so Role Jobs → Leaves → Forms can narrow whose employees it lists.
    try { const res = await employeeAPI.list({ limit: 200, forPage: 'leaves', forForm: 'create', forField: 'employee' });
      const d = res.data?.data || res.data; const list = d?.employees || (Array.isArray(d) ? d : []);
      setEmployees(list); return list;
    } catch (err) { showApiError(err, 'Failed to load employees'); throw err; }
  }, []);

  const loadReferenceData = useCallback(async () => {
    await Promise.all([loadStats(), loadEmployees()]);
  }, [loadStats, loadEmployees]);

  const createLeave = useCallback(async (formData) => {
    try { setSaving(true); const res = await leavesAPI.create(formData);
      showApiSuccess(res, 'Leave request created'); await loadReferenceData(); return { success: true };
    } catch (err) { showApiError(err, 'Failed to create leave');
      return { success: false, error: err.response?.data };
    } finally { setSaving(false); }
  }, [loadReferenceData]);

  const updateLeave = useCallback(async (id, formData) => {
    try { setSaving(true); const res = await leavesAPI.update(id, formData);
      showApiSuccess(res, 'Leave updated'); await loadReferenceData(); return { success: true };
    } catch (err) { showApiError(err, 'Failed to update leave');
      return { success: false, error: err.response?.data };
    } finally { setSaving(false); }
  }, [loadReferenceData]);

  const deleteLeave = useCallback(async (id) => {
    try { setSaving(true); const res = await leavesAPI.remove(id);
      showApiSuccess(res, 'Leave deleted'); return { success: true };
    } catch (err) { showApiError(err, 'Failed to delete leave');
      return { success: false, error: err.response?.data };
    } finally { setSaving(false); }
  }, []);

  const approveRejectLeave = useCallback(async (id, status) => {
    try { setSaving(true); const res = await leavesAPI.setStatus(id, { status });
      showApiSuccess(res, `Leave ${status}`); return { success: true };
    } catch (err) { showApiError(err, `Failed to ${status} leave`);
      return { success: false, error: err.response?.data };
    } finally { setSaving(false); }
  }, []);

  const bulkDeleteLeaves = useCallback(async (ids) => {
    try { setSaving(true); const res = await leavesAPI.bulkDelete(ids); showApiSuccess(res, 'Leave requests deleted'); return { success: true };
    } catch (err) { showApiError(err, 'Failed to delete leave requests'); return { success: false, error: err.response?.data }; }
    finally { setSaving(false); }
  }, []);
  const bulkDeactivateLeaves = useCallback(async (ids) => {
    try { setSaving(true); const res = await leavesAPI.bulkDeactivate(ids); showApiSuccess(res, 'Leave requests deactivated'); return { success: true };
    } catch (err) { showApiError(err, 'Failed to deactivate leave requests'); return { success: false, error: err.response?.data }; }
    finally { setSaving(false); }
  }, []);

  const value = useMemo(() => ({
    leaves, employees, stats, loading, saving, error,
    setLeaves, setEmployees,
    loadLeaves, loadStats, loadReferenceData,
    createLeave, updateLeave, deleteLeave, approveRejectLeave, bulkDeleteLeaves, bulkDeactivateLeaves,
  }), [leaves, employees, stats, loading, saving, error]);

  return <LeavesContext.Provider value={value}>{children}</LeavesContext.Provider>;
}

export const useLeaves = () => useContext(LeavesContext);
export default LeavesContext;
