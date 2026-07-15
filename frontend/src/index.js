/**
 * AMS Frontend Entry Point
 * Maintained by Hussain Developer
 * AMS ERP
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import toast, { Toaster, ToastBar } from 'react-hot-toast';
import { AuthProvider } from './context/AuthContext';
import { BrandingProvider } from './context/BrandingContext';
import { ApiProvider } from './context/ApiProvider';
import { AppDataProvider } from './context/AppDataContext';
import { ServerManagementProvider } from './context/ServerManagementContext';
import { UserManagementProvider } from './context/UserManagementContext';
import { StatusManagementProvider } from './context/StatusManagementContext';
import { ProfileProvider } from './context/ProfileContext';
import { LogsProvider } from './context/LogsContext';
import { EmployeesProvider } from './context/EmployeesContext';
import { LeavesProvider } from './context/LeavesContext';
import { ExpensesProvider } from './context/ExpensesContext';
import { LedgerProvider } from './context/LedgerContext';
import App from './App';
import './styles/index.css';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
    <React.StrictMode>
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <ApiProvider>
                <BrandingProvider>
                    <AuthProvider>
                        <AppDataProvider>
                            <ServerManagementProvider>
                                <UserManagementProvider>
                                    <EmployeesProvider>
                                    <LeavesProvider>
                                    <ExpensesProvider>
                                    <LedgerProvider>
                                    <StatusManagementProvider>
                                    <LogsProvider>
                                        <ProfileProvider>
                                        <Toaster
                                            position="top-right"
                                            toastOptions={{
                                                duration: 4000,
                                                style: { background: '#1e3a5f', color: '#fff', cursor: 'pointer' }
                                            }}
                                        >{(t) => <ToastBar toast={t} style={{ ...t.style, cursor: 'pointer' }} onClick={() => toast.dismiss(t.id)} />}</Toaster>
                                        <App />
                                    </ProfileProvider>
                                    </LogsProvider>
                                    </StatusManagementProvider>
                                    </LedgerProvider>
                                    </ExpensesProvider>
                                    </LeavesProvider>
                                    </EmployeesProvider>
                                </UserManagementProvider>
                            </ServerManagementProvider>
                        </AppDataProvider>
                    </AuthProvider>
                </BrandingProvider>
            </ApiProvider>
        </BrowserRouter>
    </React.StrictMode>
);
