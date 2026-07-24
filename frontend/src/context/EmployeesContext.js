import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { employeeAPI, adminAPI } from '../services/api';
import { showApiSuccess, showApiError, getErrorMessage } from '../utils/toastResponse';
import eventBus from '../utils/eventBus';

const EmployeesContext = createContext(null);

export function EmployeesProvider({ children }) {
  const [employees, setEmployees] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [roles, setRoles] = useState([]);
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const reset = () => {
      setEmployees([]); setDepartments([]); setRoles([]);
      setStats({}); setLoading(false); setSaving(false); setError(null);
    };
    eventBus.on('auth:logout', reset);
    return () => eventBus.remove('auth:logout', reset);
  }, []);

  const loadEmployees = useCallback(async (params = {}) => {
    try { setLoading(true); const res = await employeeAPI.list(params);
      const d = res.data?.data || res.data;
      const list = d?.employees || (Array.isArray(d) ? d : []);
      const pagination = { total: d?.total || list.length, page: d?.page || 1, limit: d?.limit || 50 };
      setEmployees(list); return { employees: list, pagination };
    } catch (err) { showApiError(err, 'Failed to load employees'); throw err;
    } finally { setLoading(false); }
  }, []);

  const loadStats = useCallback(async () => {
    try { const res = await employeeAPI.getStats(); const d = res.data?.data || {}; setStats(d); return d;
    } catch (err) { showApiError(err, 'Failed to load stats'); throw err; }
  }, []);

  const loadDepartments = useCallback(async () => {
    try { const res = await adminAPI.getDepartments({ flat: true });
      const d = res.data?.data || []; const list = d?.flat || (Array.isArray(d) ? d : []);
      // Only active departments should be selectable in the employee form.
      const active = list.filter((x) => (x.is_active ?? x.isActive) !== false);
      setDepartments(active); return active;
    } catch (err) { showApiError(err, 'Failed to load departments'); throw err; }
  }, []);

  const loadRoles = useCallback(async () => {
    try { const res = await adminAPI.getRoles(); const d = res.data?.data || [];
      setRoles(Array.isArray(d) ? d : []); return d;
    } catch (err) { showApiError(err, 'Failed to load roles'); throw err; }
  }, []);

  const loadReferenceData = useCallback(async () => {
    await Promise.all([loadStats(), loadDepartments(), loadRoles()]);
  }, [loadStats, loadDepartments, loadRoles]);

  const createEmployee = useCallback(async (formData) => {
    try { setSaving(true); const res = await employeeAPI.create(formData);
      showApiSuccess(res, 'Employee created'); await loadReferenceData(); return { success: true };
    } catch (err) { showApiError(err, 'Failed to create employee');
      return { success: false, error: err.response?.data };
    } finally { setSaving(false); }
  }, [loadReferenceData]);

  const updateEmployee = useCallback(async (id, formData) => {
    try { setSaving(true); const res = await employeeAPI.update(id, formData);
      showApiSuccess(res, 'Employee updated'); await loadReferenceData(); return { success: true };
    } catch (err) { showApiError(err, 'Failed to update employee');
      return { success: false, error: err.response?.data };
    } finally { setSaving(false); }
  }, [loadReferenceData]);

  const deleteEmployee = useCallback(async (id) => {
    try { setSaving(true); const res = await employeeAPI.remove(id);
      showApiSuccess(res, 'Employee deleted'); return { success: true };
    } catch (err) { showApiError(err, 'Failed to delete employee');
      return { success: false, error: err.response?.data };
    } finally { setSaving(false); }
  }, []);

  const toggleEmployeeStatus = useCallback(async (id) => {
    try { setSaving(true); const res = await employeeAPI.toggleStatus(id);
      showApiSuccess(res, 'Status toggled'); return { success: true };
    } catch (err) { showApiError(err, 'Failed to toggle status');
      return { success: false, error: err.response?.data };
    } finally { setSaving(false); }
  }, []);

  const bulkDeleteEmployees = useCallback(async (ids) => {
    try { setSaving(true); const res = await employeeAPI.bulkDelete(ids); showApiSuccess(res, 'Employees deleted'); return { success: true };
    } catch (err) { showApiError(err, 'Failed to delete employees'); return { success: false, error: err.response?.data }; }
    finally { setSaving(false); }
  }, []);

  const bulkDeactivateEmployees = useCallback(async (ids) => {
    try { setSaving(true); const res = await employeeAPI.bulkDeactivate(ids); showApiSuccess(res, 'Employees deactivated'); return { success: true };
    } catch (err) { showApiError(err, 'Failed to deactivate employees'); return { success: false, error: err.response?.data }; }
    finally { setSaving(false); }
  }, []);

  const value = useMemo(() => ({
    employees, departments, roles, stats, loading, saving, error,
    setEmployees, setDepartments,
    loadEmployees, loadStats, loadReferenceData,
    createEmployee, updateEmployee, deleteEmployee, toggleEmployeeStatus, bulkDeleteEmployees, bulkDeactivateEmployees,
  }), [employees, departments, roles, stats, loading, saving, error]);

  return <EmployeesContext.Provider value={value}>{children}</EmployeesContext.Provider>;
}

export const useEmployees = () => useContext(EmployeesContext);
export default EmployeesContext;
