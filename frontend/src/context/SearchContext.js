import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { searchAPI } from '../services/api';
import useDebounce from '../hooks/useDebounce';
import eventBus from '../utils/eventBus';

const SearchContext = createContext(null);

const SEARCH_ICONS = {
  lead: 'UserPlus',
  customer: 'Users',
  invoice: 'FileText',
  order: 'ShoppingCart',
  quotation: 'FileText',
  booking: 'CalendarCheck',
  vehicle: 'Truck',
  part: 'Package',
  employee: 'Briefcase',
  leave: 'Calendar',
  expense: 'DollarSign',
  ledger: 'BookOpen',
  user: 'UserCircle',
  department: 'Building2',
  service_appointment: 'Wrench',
  job_card: 'ClipboardList',
  warehouse: 'Warehouse',
  email_template: 'Mail',
  pdf_template: 'FileText',
  page: 'Layout',
  payment_method: 'CreditCard',
  status_item: 'CheckCircle2',
  file_upload: 'File',
};

const COMMANDS = [
  { id: 'create_lead', label: 'Create Lead', action: 'navigate', url: '/leads?action=create', icon: 'UserPlus', keywords: 'new lead add create' },
  { id: 'create_customer', label: 'Create Customer', action: 'navigate', url: '/customers?action=create', icon: 'Users', keywords: 'new customer add create' },
  { id: 'create_invoice', label: 'Create Invoice', action: 'navigate', url: '/invoices?action=create', icon: 'FileText', keywords: 'new invoice add create bill' },
  { id: 'create_quotation', label: 'Create Quotation', action: 'navigate', url: '/quotations?action=create', icon: 'FileText', keywords: 'new quotation quote add create' },
  { id: 'create_booking', label: 'Create Booking', action: 'navigate', url: '/booking?action=create', icon: 'CalendarCheck', keywords: 'new booking reserve add create' },
  { id: 'create_vehicle', label: 'Add Vehicle', action: 'navigate', url: '/vehicles?action=create', icon: 'Truck', keywords: 'new vehicle add create' },
  { id: 'create_employee', label: 'Add Employee', action: 'navigate', url: '/hr/employees?action=create', icon: 'Briefcase', keywords: 'new employee hire add create staff' },
  { id: 'create_expense', label: 'Add Expense', action: 'navigate', url: '/hr/expenses?action=create', icon: 'DollarSign', keywords: 'new expense add create cost' },
  { id: 'create_leave', label: 'Apply Leave', action: 'navigate', url: '/hr/leaves?action=create', icon: 'Calendar', keywords: 'new leave apply vacation holiday' },
  { id: 'create_order', label: 'Create Order', action: 'navigate', url: '/orders?action=create', icon: 'ShoppingCart', keywords: 'new order add create sales' },
  { id: 'create_job_card', label: 'Create Job Card', action: 'navigate', url: '/job-cards?action=create', icon: 'ClipboardList', keywords: 'new job card create service repair' },
  { id: 'create_appointment', label: 'Schedule Appointment', action: 'navigate', url: '/service?action=create', icon: 'CalendarCheck', keywords: 'new appointment schedule service booking' },
  { id: 'go_dashboard', label: 'Go to Dashboard', action: 'navigate', url: '/dashboard', icon: 'LayoutDashboard', keywords: 'dashboard home main' },
  { id: 'go_leads', label: 'Go to Leads', action: 'navigate', url: '/leads', icon: 'UserPlus', keywords: 'leads prospects' },
  { id: 'go_customers', label: 'Go to Customers', action: 'navigate', url: '/customers', icon: 'Users', keywords: 'customers clients' },
  { id: 'go_vehicles', label: 'Go to Vehicles', action: 'navigate', url: '/vehicles', icon: 'Truck', keywords: 'vehicles inventory stock' },
  { id: 'go_parts', label: 'Go to Parts Inventory', action: 'navigate', url: '/parts', icon: 'Package', keywords: 'parts inventory spare stock' },
  { id: 'go_invoices', label: 'Go to Invoices', action: 'navigate', url: '/invoices', icon: 'FileText', keywords: 'invoices billing payments' },
  { id: 'go_quotations', label: 'Go to Quotations', action: 'navigate', url: '/quotations', icon: 'FileText', keywords: 'quotations quotes estimates' },
  { id: 'go_bookings', label: 'Go to Bookings', action: 'navigate', url: '/booking', icon: 'CalendarCheck', keywords: 'bookings reservations' },
  { id: 'go_orders', label: 'Go to Orders', action: 'navigate', url: '/orders', icon: 'ShoppingCart', keywords: 'orders sales' },
  { id: 'go_employees', label: 'Go to Employees', action: 'navigate', url: '/hr/employees', icon: 'Briefcase', keywords: 'employees hr staff' },
  { id: 'go_leaves', label: 'Go to Leaves', action: 'navigate', url: '/hr/leaves', icon: 'Calendar', keywords: 'leaves vacation hr' },
  { id: 'go_expenses', label: 'Go to Expenses', action: 'navigate', url: '/hr/expenses', icon: 'DollarSign', keywords: 'expenses hr cost' },
  { id: 'go_ledger', label: 'Go to Ledger', action: 'navigate', url: '/hr/ledger', icon: 'BookOpen', keywords: 'ledger finance accounting' },
  { id: 'go_reports', label: 'Go to Reports', action: 'navigate', url: '/reports', icon: 'BarChart3', keywords: 'reports analytics statistics' },
  { id: 'go_service', label: 'Go to Service', action: 'navigate', url: '/service', icon: 'Wrench', keywords: 'service repair maintenance' },
  { id: 'go_job_cards', label: 'Go to Job Cards', action: 'navigate', url: '/job-cards', icon: 'ClipboardList', keywords: 'job cards service work orders' },
  { id: 'go_warehouses', label: 'Go to Warehouses', action: 'navigate', url: '/warehouses', icon: 'Warehouse', keywords: 'warehouses stores storage' },
  { id: 'go_notifications', label: 'Notification Settings', action: 'navigate', url: '/notification-settings', icon: 'Bell', keywords: 'notifications settings alerts' },
  { id: 'go_users', label: 'Go to User Management', action: 'navigate', url: '/admin/users', icon: 'UserCircle', keywords: 'users admin management' },
  { id: 'go_roles', label: 'Go to Role Management', action: 'navigate', url: '/admin/roles', icon: 'Shield', keywords: 'roles permissions admin' },
  { id: 'go_settings', label: 'Open Settings', action: 'navigate', url: '/settings', icon: 'Settings', keywords: 'settings configuration preferences' },
  { id: 'go_logs', label: 'Open Logs', action: 'navigate', url: '/logs', icon: 'ScrollText', keywords: 'logs audit history activity' },
  { id: 'go_server', label: 'Server Management', action: 'navigate', url: '/server-management', icon: 'Server', keywords: 'server management admin config' },
  { id: 'go_profile', label: 'Open Profile', action: 'navigate', url: '/profile', icon: 'User', keywords: 'profile account settings' },
  { id: 'go_search', label: 'Advanced Search', action: 'navigate', url: '/search', icon: 'Search', keywords: 'search advanced find' },
  { id: 'action_logout', label: 'Logout', action: 'logout', url: '/logout', icon: 'LogOut', keywords: 'logout sign out exit' },
];

export function SearchProvider({ children }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [isSearching, setIsSearching] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [searchHistory, setSearchHistory] = useState([]);
  const [searchError, setSearchError] = useState(null);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState('');
  const abortRef = useRef(null);

  const debouncedQuery = useDebounce(searchQuery, 300);

  const performSearch = useCallback(async (query, options = {}) => {
    if (!query || query.length < 2) {
      setSearchResults(null);
      setSuggestions([]);
      setIsSearching(false);
      return;
    }

    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsSearching(true);
    setSearchError(null);

    try {
      if (query.length <= 4) {
        const suggestRes = await searchAPI.suggest(query, { signal: controller.signal });
        setSuggestions(suggestRes.data?.suggestions || []);
      }

      const searchRes = await searchAPI.search(query, options.limit || 10, options.type || 'all', { signal: controller.signal });
      setSearchResults(searchRes.data);
      setSuggestions([]);
    } catch (err) {
      if (err.name !== 'AbortError' && err.code !== 'ERR_CANCELED') {
        setSearchError(err.response?.data?.message || 'Search failed');
        setSearchResults(null);
      }
    } finally {
      setIsSearching(false);
    }
  }, []);

  const loadHistory = useCallback(async () => {
    try {
      const res = await searchAPI.history();
      setSearchHistory(res.data?.history || []);
    } catch { /* silent */ }
  }, []);

  const clearHistory = useCallback(async () => {
    try {
      await searchAPI.clearHistory();
      setSearchHistory([]);
    } catch { /* silent */ }
  }, []);

  const recordClick = useCallback(async (query, entityType, entityId, position, url) => {
    try {
      await searchAPI.recordClick({ query, entityType, entityId, position, url });
    } catch { /* silent */ }
  }, []);

  const openCommandPalette = useCallback(() => {
    setIsCommandPaletteOpen(true);
    setCommandQuery('');
    eventBus.dispatch('command-palette:open');
  }, []);

  const closeCommandPalette = useCallback(() => {
    setIsCommandPaletteOpen(false);
    setCommandQuery('');
    eventBus.dispatch('command-palette:close');
  }, []);

  const getFilteredCommands = useCallback((query) => {
    if (!query) return COMMANDS.slice(0, 10);
    const q = query.toLowerCase();
    return COMMANDS
      .filter(cmd =>
        cmd.label.toLowerCase().includes(q) ||
        cmd.keywords.toLowerCase().includes(q) ||
        cmd.id.toLowerCase().includes(q)
      )
      .slice(0, 15);
  }, []);

  const executeCommand = useCallback((command, navigate) => {
    if (command.action === 'navigate' && command.url) {
      navigate(command.url);
    } else if (command.action === 'logout') {
      eventBus.dispatch('command:logout');
    }
    closeCommandPalette();
  }, [closeCommandPalette]);

  const value = {
    searchQuery,
    setSearchQuery,
    searchResults,
    setSearchResults,
    isSearching,
    suggestions,
    searchHistory,
    searchError,
    debouncedQuery,
    performSearch,
    loadHistory,
    clearHistory,
    recordClick,
    isCommandPaletteOpen,
    openCommandPalette,
    closeCommandPalette,
    commandQuery,
    setCommandQuery,
    getFilteredCommands,
    executeCommand,
    SEARCH_ICONS,
    COMMANDS,
  };

  return (
    <SearchContext.Provider value={value}>
      {children}
    </SearchContext.Provider>
  );
}

export function useSearch() {
  const ctx = useContext(SearchContext);
  if (!ctx) {
    throw new Error('useSearch must be used within a SearchProvider');
  }
  return ctx;
}

export default SearchContext;
