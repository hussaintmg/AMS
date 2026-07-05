import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { adminAPI } from '../services/api';
import { useUserManagement } from './UserManagementContext';
import toast from 'react-hot-toast';

const AppDataContext = createContext(null);

export function AppDataProvider({ children }) {
    const [paymentMethods, setPaymentMethods] = useState([]);
    const [loading, setLoading] = useState({});

    const refreshPaymentMethods = useCallback(async () => {
        try {
            setLoading(prev => ({ ...prev, paymentMethods: true }));
            const res = await adminAPI?.getStatuses?.();
            return res?.data?.data;
        } catch (err) {
            return [];
        } finally {
            setLoading(prev => ({ ...prev, paymentMethods: false }));
        }
    }, []);

    const value = useMemo(() => ({
        paymentMethods,
        loading,
        refreshPaymentMethods
    }), [paymentMethods, loading, refreshPaymentMethods]);

    return (
        <AppDataContext.Provider value={value}>
            {children}
        </AppDataContext.Provider>
    );
}

export const useAppData = () => useContext(AppDataContext);

export default AppDataContext;
