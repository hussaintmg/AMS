import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { expensesAPI, employeeAPI } from '../services/api';
import { showApiSuccess, showApiError, getErrorMessage } from '../utils/toastResponse';
import eventBus from '../utils/eventBus';

const ExpensesContext = createContext(null);

export function ExpensesProvider({ children }) {
  const [expenses, setExpenses] = useState([]);
  const [categories, setCategories] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const reset = () => {
      setExpenses([]); setCategories([]); setEmployees([]);
      setStats({}); setLoading(false); setSaving(false); setError(null);
    };
    eventBus.on('auth:logout', reset);
    return () => eventBus.remove('auth:logout', reset);
  }, []);

  const loadExpenses = useCallback(async (params = {}) => {
    try { setLoading(true); const res = await expensesAPI.list(params);
      const d = res.data?.data || res.data;
      const list = d?.expenses || (Array.isArray(d) ? d : []);
      const pagination = { total: d?.total || list.length, page: d?.page || 1, limit: d?.limit || 50 };
      setExpenses(list); return { expenses: list, pagination };
    } catch (err) { showApiError(err, 'Failed to load expenses'); throw err;
    } finally { setLoading(false); }
  }, []);

  const loadCategories = useCallback(async () => {
    try { const res = await expensesAPI.listCategories();
      const d = res.data?.data || res.data;
      const list = Array.isArray(d) ? d : (d?.categories || []);
      setCategories(list); return list;
    } catch (err) { showApiError(err, 'Failed to load categories'); throw err; }
  }, []);

  const loadStats = useCallback(async () => {
    try { const res = await expensesAPI.getStats(); const d = res.data?.data || {}; setStats(d); return d;
    } catch (err) { showApiError(err, 'Failed to load stats'); throw err; }
  }, []);

  const loadEmployees = useCallback(async () => {
    try { const res = await employeeAPI.list({ limit: 200 });
      const d = res.data?.data || res.data; const list = d?.employees || (Array.isArray(d) ? d : []);
      setEmployees(list); return list;
    } catch (err) { showApiError(err, 'Failed to load employees'); throw err; }
  }, []);

  const loadReferenceData = useCallback(async () => {
    await Promise.all([loadStats(), loadCategories(), loadEmployees()]);
  }, [loadStats, loadCategories, loadEmployees]);

  const createExpense = useCallback(async (formData) => {
    try { setSaving(true); const res = await expensesAPI.create(formData);
      showApiSuccess(res, 'Expense created'); await loadReferenceData(); return { success: true };
    } catch (err) { showApiError(err, 'Failed to create expense');
      return { success: false, error: err.response?.data };
    } finally { setSaving(false); }
  }, [loadReferenceData]);

  const updateExpense = useCallback(async (id, formData) => {
    try { setSaving(true); const res = await expensesAPI.update(id, formData);
      showApiSuccess(res, 'Expense updated'); await loadReferenceData(); return { success: true };
    } catch (err) { showApiError(err, 'Failed to update expense');
      return { success: false, error: err.response?.data };
    } finally { setSaving(false); }
  }, [loadReferenceData]);

  const deleteExpense = useCallback(async (id) => {
    try { setSaving(true); const res = await expensesAPI.remove(id);
      showApiSuccess(res, 'Expense deleted'); return { success: true };
    } catch (err) { showApiError(err, 'Failed to delete expense');
      return { success: false, error: err.response?.data };
    } finally { setSaving(false); }
  }, []);

  const setExpenseStatus = useCallback(async (id, status) => {
    try { setSaving(true); const res = await expensesAPI.setStatus(id, { status });
      showApiSuccess(res, `Expense status updated`); return { success: true };
    } catch (err) { showApiError(err, 'Failed to update status');
      return { success: false, error: err.response?.data };
    } finally { setSaving(false); }
  }, []);

  const postExpense = useCallback(async (id) => {
    try { setSaving(true); const res = await expensesAPI.postExpense(id);
      showApiSuccess(res, 'Expense posted to ledger'); return { success: true };
    } catch (err) { showApiError(err, 'Failed to post expense');
      return { success: false, error: err.response?.data };
    } finally { setSaving(false); }
  }, []);

  const bulkDeleteExpenses = useCallback(async (ids) => {
    try { setSaving(true); const res = await expensesAPI.bulkDelete(ids); showApiSuccess(res, 'Expenses deleted'); return { success: true };
    } catch (err) { showApiError(err, 'Failed to delete expenses'); return { success: false, error: err.response?.data }; }
    finally { setSaving(false); }
  }, []);
  const bulkDeactivateExpenses = useCallback(async (ids) => {
    try { setSaving(true); const res = await expensesAPI.bulkDeactivate(ids); showApiSuccess(res, 'Expenses deactivated'); return { success: true };
    } catch (err) { showApiError(err, 'Failed to deactivate expenses'); return { success: false, error: err.response?.data }; }
    finally { setSaving(false); }
  }, []);

  const createCategory = useCallback(async (formData) => {
    try { setSaving(true); const res = await expensesAPI.createCategory(formData);
      showApiSuccess(res, 'Category created'); await loadCategories(); return { success: true, data: res.data?.data };
    } catch (err) { showApiError(err, 'Failed to create category');
      return { success: false, error: err.response?.data };
    } finally { setSaving(false); }
  }, [loadCategories]);

  const updateCategory = useCallback(async (id, formData) => {
    try { setSaving(true); const res = await expensesAPI.updateCategory(id, formData);
      showApiSuccess(res, 'Category updated'); await loadCategories(); return { success: true };
    } catch (err) { showApiError(err, 'Failed to update category');
      return { success: false, error: err.response?.data };
    } finally { setSaving(false); }
  }, [loadCategories]);

  const value = useMemo(() => ({
    expenses, categories, employees, stats, loading, saving, error,
    setExpenses, setCategories, setEmployees,
    loadExpenses, loadCategories, loadStats, loadReferenceData,
    createExpense, updateExpense, deleteExpense, setExpenseStatus, postExpense, bulkDeleteExpenses, bulkDeactivateExpenses,
    createCategory, updateCategory,
  }), [expenses, categories, employees, stats, loading, saving, error]);

  return <ExpensesContext.Provider value={value}>{children}</ExpensesContext.Provider>;
}

export const useExpenses = () => useContext(ExpensesContext);
export default ExpensesContext;
