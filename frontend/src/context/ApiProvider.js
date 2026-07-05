import React, { createContext, useContext, useCallback, useState } from 'react';

const ApiContext = createContext(null);

export function ApiProvider({ children }) {
    const [globalLoading, setGlobalLoading] = useState(false);
    const [globalError, setGlobalError] = useState(null);

    const clearError = useCallback(() => setGlobalError(null), []);

    return (
        <ApiContext.Provider value={{ globalLoading, setGlobalLoading, globalError, setGlobalError, clearError }}>
            {children}
        </ApiContext.Provider>
    );
}

export const useApi = () => useContext(ApiContext);
