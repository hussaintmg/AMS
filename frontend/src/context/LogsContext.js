import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { io as socketIO } from 'socket.io-client';
import { logsAPI } from '../services/api';
import { showApiError, showApiSuccess, getErrorMessage } from '../utils/toastResponse';
import eventBus from '../utils/eventBus';

const LogsContext = createContext(null);
const isPermissionDeniedError = (error) => error?.response?.status === 403 || error?.status === 403;
const emptyFilterOptions = { methods: [], severities: [], roles: [], users: [], statusCodes: [], endpoints: [], requestIds: [], includeServerErrors: false };
const emptyPagination = { page: 1, limit: 25, total: 0, totalPages: 1, hasNextPage: false, hasPrevPage: false };

function getSocketUrl() {
    const socketUrl = process.env.REACT_APP_SOCKET_URL;
    if (socketUrl) return socketUrl.replace(/\/$/, '');

    const apiUrl = process.env.REACT_APP_API_URL || '/api';

    if (apiUrl.startsWith('http')) {
        return apiUrl.replace(/\/api\/?$/, '').replace(/\/$/, '');
    }

    if (apiUrl === '/api' || apiUrl.startsWith('/api')) {
        return 'http://localhost:3002';
    }

    return 'http://localhost:3002';
}

export function LogsProvider({ children }) {
    const [logs, setLogs] = useState([]);
    const [stats, setStats] = useState(null);
    const [filterOptions, setFilterOptions] = useState(emptyFilterOptions);
    const [pagination, setPagination] = useState(emptyPagination);
    const [tableLoading, setTableLoading] = useState(false);
    const [statsLoading, setStatsLoading] = useState(false);
    const [error, setError] = useState(null);
    const [accessDenied, setAccessDenied] = useState(false);
    const [socketConnected, setSocketConnected] = useState(false);
    const [activeFilters, setActiveFilters] = useState({});
    const [currentPage, setCurrentPage] = useState(1);
    const [newLogsAvailable, setNewLogsAvailable] = useState(0);

    const socketRef = useRef(null);
    const filterVersionRef = useRef('');
    const currentFiltersRef = useRef({});
    const currentPageRef = useRef(1);
    const filterOptionsStaleRef = useRef(false);
    const statsRef = useRef(null);

    currentPageRef.current = currentPage;
    statsRef.current = stats;

    const getToken = useCallback(() => {
        const fromCookie = document.cookie.match(/(?:^|;\s*)token=([^;]*)/);
        if (fromCookie) return decodeURIComponent(fromCookie[1]);
        const fromStorage = localStorage.getItem('token');
        if (fromStorage) return fromStorage;
        return null;
    }, []);

    const logMatchesFilters = (log, filters) => {
        if (!filters || !Object.keys(filters).length) return true;
        if (filters.search) {
            const s = filters.search.toLowerCase();
            const logStr = JSON.stringify(log).toLowerCase();
            if (!logStr.includes(s)) return false;
        }
        if (filters.method && log.method !== filters.method) return false;
        if (filters.severity && log.severity !== filters.severity) return false;
        if (filters.statusCode && String(log.statusCode) !== String(filters.statusCode)) return false;
        if (filters.endpoint) {
            const ep = String(log.endpoint || log.apiName || '').toLowerCase();
            if (!ep.includes(filters.endpoint.toLowerCase())) return false;
        }
        if (filters.requestId) {
            const rid = String(log.requestId || '').toLowerCase();
            if (!rid.includes(filters.requestId.toLowerCase())) return false;
        }
        if (filters.logsOf === 'server-errors') {
            if (!log.serverError) return false;
        } else if (filters.logsOf && log.user?.id !== filters.logsOf) {
            return false;
        }
        if (filters.roleName || filters.role) {
            const targetRole = filters.roleName || filters.role;
            if (log.user?.role !== targetRole && log.roleName !== targetRole) return false;
        }
        return true;
    };

    const updateStatsLocal = useCallback((log, isAdd) => {
        const multiplier = isAdd ? 1 : -1;
        setStats((prev) => {
            if (!prev) return prev;
            return {
                ...prev,
                total: Math.max(0, (prev.total || 0) + multiplier),
                success: log && log.statusCode < 400
                    ? Math.max(0, (prev.success || 0) + multiplier)
                    : prev.success,
                errors: log && log.statusCode >= 400
                    ? Math.max(0, (prev.errors || 0) + multiplier)
                    : prev.errors,
            };
        });
    }, []);

    const connectSocket = useCallback(() => {
        if (socketRef.current) {
            if (socketRef.current.connected || socketRef.current.active) return;
            socketRef.current.disconnect();
            socketRef.current = null;
        }

        const token = getToken();
        if (!token) {
            console.warn('[LogsContext] Socket token missing; skipping connection');
            return;
        }

        const url = getSocketUrl();
        console.log('[LogsContext] Socket URL:', url);

        const socket = socketIO(url, {
            auth: { token },
            transports: ['websocket', 'polling'],
            withCredentials: true,
            reconnection: true,
            reconnectionAttempts: 10,
            reconnectionDelay: 2000,
            timeout: 10000,
        });

        socket.on('connect', () => {
            setSocketConnected(true);
            socket.emit('subscribe:logs');
            console.log('[LogsContext] Socket connected, subscribed to logs');
        });

        socket.on('disconnect', () => {
            setSocketConnected(false);
            console.log('[LogsContext] Socket disconnected');
        });

        socket.on('connect_error', (err) => {
            setSocketConnected(false);
            console.warn('[LogsContext] Socket connect error:', err?.message || err);
        });

        socket.on('logs:new', (payload) => {
            console.log('[LogsContext] logs:new received', payload?.log?._id);
            const newLog = payload?.log;
            if (!newLog) return;

            const filters = currentFiltersRef.current || {};
            if (!logMatchesFilters(newLog, filters)) return;

            if (currentPageRef.current === 1) {
                setLogs((prev) => {
                    const exists = prev.some((l) => (l._id || l.id) === (newLog._id || newLog.id));
                    if (exists) return prev;
                    const limit = filters.limit || 25;
                    const next = [newLog, ...prev];
                    return next.slice(0, limit);
                });
            }

            setPagination((prev) => ({
                ...prev,
                total: prev.total + 1,
            }));

            updateStatsLocal(newLog, true);

            if (currentPageRef.current !== 1) {
                setNewLogsAvailable((prev) => prev + 1);
            }
        });

        socket.on('logs:deleted', (payload) => {
            const logId = payload?.logId;
            if (!logId) return;

            let removedLog = null;
            setLogs((prev) => {
                const idx = prev.findIndex((l) => (l._id || l.id) === logId);
                if (idx === -1) return prev;
                removedLog = prev[idx];
                const next = [...prev];
                next.splice(idx, 1);
                return next;
            });

            setPagination((prev) => ({
                ...prev,
                total: Math.max(0, prev.total - 1),
            }));

            if (removedLog) {
                updateStatsLocal(removedLog, false);
            }
        });

        socket.on('logs:filter-update', () => {
            filterOptionsStaleRef.current = true;
            console.log('[LogsContext] logs:filter-update received');
        });

        socketRef.current = socket;
    }, [updateStatsLocal]);

    const disconnectSocket = useCallback(() => {
        if (socketRef.current) {
            socketRef.current.emit('unsubscribe:logs');
            socketRef.current.disconnect();
            socketRef.current = null;
        }
        setSocketConnected(false);
    }, []);

    useEffect(() => {
        const handleLogin = () => {
            setTimeout(() => connectSocket(), 500);
        };
        const handleLogout = () => {
            disconnectSocket();
            setLogs([]);
            setStats(null);
            setFilterOptions(emptyFilterOptions);
            setPagination(emptyPagination);
            setTableLoading(false);
            setStatsLoading(false);
            setError(null);
            setAccessDenied(false);
            setActiveFilters({});
            setCurrentPage(1);
            setNewLogsAvailable(0);
            filterVersionRef.current = '';
            currentFiltersRef.current = {};
            filterOptionsStaleRef.current = false;
        };

        eventBus.on('auth:login', handleLogin);
        eventBus.on('auth:logout', handleLogout);

        connectSocket();

        return () => {
            disconnectSocket();
            eventBus.remove('auth:login', handleLogin);
            eventBus.remove('auth:logout', handleLogout);
        };
    }, [connectSocket, disconnectSocket]);

    const loadLogs = useCallback(async (params = {}) => {
        setTableLoading(true);
        setError(null);
        setAccessDenied(false);

        const mergedParams = { ...params };

        if (filterVersionRef.current) {
            mergedParams.filterVersion = filterVersionRef.current;
        }

        if (filterOptionsStaleRef.current) {
            mergedParams.includeFilters = true;
        }

        currentFiltersRef.current = mergedParams;

        try {
            const res = await logsAPI.getLogs(mergedParams);
            const payload = res?.data?.data;
            const responseLogs = Array.isArray(payload) ? payload : (payload?.logs || []);
            const responsePagination = payload?.pagination || emptyPagination;
            const responseFilters = payload?.filters;
            const responseFilterVersion = payload?.filterVersion || '';

            setLogs(responseLogs);
            setPagination({ ...emptyPagination, ...responsePagination });

            if (responseFilters && typeof responseFilters === 'object') {
                setFilterOptions((prev) => ({
                    ...prev,
                    ...responseFilters,
                }));
            }

            if (responseFilterVersion) {
                filterVersionRef.current = responseFilterVersion;
            }

            if (filterOptionsStaleRef.current && responseFilters && typeof responseFilters === 'object') {
                filterOptionsStaleRef.current = false;
            }

            setCurrentPage(responsePagination.page || 1);
            setNewLogsAvailable(0);
            return { data: responseLogs, pagination: responsePagination };
        } catch (err) {
            const msg = getErrorMessage(err, 'Failed to load logs');
            setError(msg);
            setAccessDenied(isPermissionDeniedError(err));
            setLogs([]);
            setPagination(emptyPagination);
            return { data: [], pagination: emptyPagination };
        } finally {
            setTableLoading(false);
        }
    }, []);

    const fetchLog = useCallback(async (id) => {
        try {
            const res = await logsAPI.getLog(id);
            return res?.data?.data || null;
        } catch (err) {
            if (!isPermissionDeniedError(err)) {
                showApiError(err, 'Failed to load log details');
            }
            return null;
        }
    }, []);

    const removeLog = useCallback(async (id) => {
        try {
            const res = await logsAPI.deleteLog(id);
            if (res?.data?.success === true) {
                setLogs(prev => prev.filter(log => (log._id || log.id) !== id));
                showApiSuccess(res, 'Log deleted');
                return true;
            }
            return false;
        } catch (err) {
            if (!isPermissionDeniedError(err)) {
                showApiError(err, 'Failed to delete log');
            }
            return false;
        }
    }, []);

    const loadStats = useCallback(async (params = {}) => {
        setStatsLoading(true);
        try {
            const res = await logsAPI.getLogStats(params);
            const s = res?.data?.data || null;
            setStats(s);
            return s;
        } catch (err) {
            if (!isPermissionDeniedError(err)) {
                showApiError(err, 'Failed to load log stats');
            }
            return null;
        } finally {
            setStatsLoading(false);
        }
    }, []);

    const applyFilters = useCallback((newFilters) => {
        setActiveFilters(newFilters);
        setCurrentPage(1);
    }, []);

    const resetFilters = useCallback(() => {
        setActiveFilters({});
        setCurrentPage(1);
    }, []);

    const changePage = useCallback((page) => {
        setCurrentPage(page);
    }, []);

    const refreshFilterOptions = useCallback(async () => {
        try {
            const res = await logsAPI.getFilterOptions();
            const opts = res?.data?.data?.options || res?.data?.data || emptyFilterOptions;
            setFilterOptions((prev) => ({
                ...prev,
                ...opts,
            }));
            const version = res?.data?.data?.version || '';
            if (version) filterVersionRef.current = version;
            filterOptionsStaleRef.current = false;
            return opts;
        } catch (err) {
            if (!isPermissionDeniedError(err)) {
                console.warn('Failed to load filter options:', getErrorMessage(err));
            }
            return null;
        }
    }, []);

    const showNewLogs = useCallback(async () => {
        const params = { ...currentFiltersRef.current, page: 1, includeFilters: true };
        await loadLogs(params);
    }, [loadLogs]);

    const value = useMemo(() => ({
        logs,
        stats,
        filterOptions,
        pagination,
        loading: tableLoading,
        tableLoading,
        statsLoading,
        error,
        accessDenied,
        socketConnected,
        activeFilters,
        currentPage,
        newLogsAvailable,
        loadLogs,
        fetchLog,
        removeLog,
        loadStats,
        applyFilters,
        resetFilters,
        changePage,
        refreshFilterOptions,
        showNewLogs,
    }), [
        logs, stats, filterOptions, pagination, tableLoading, statsLoading, error, accessDenied,
        socketConnected, activeFilters, currentPage, newLogsAvailable,
        loadLogs, fetchLog, removeLog, loadStats,
        applyFilters, resetFilters, changePage, refreshFilterOptions, showNewLogs,
    ]);

    return (
        <LogsContext.Provider value={value}>
            {children}
        </LogsContext.Provider>
    );
}

export const useLogs = () => useContext(LogsContext);
export default LogsContext;
