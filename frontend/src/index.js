/**
 * AMS Frontend Entry Point
 * Created by LOGIXINVENTOR (PVT) Ltd.
 * www.logixinventor.com | AMS
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from './context/AuthContext';
import { BrandingProvider } from './context/BrandingContext';
import { ApiProvider } from './context/ApiProvider';
import { AppDataProvider } from './context/AppDataContext';
import { ServerManagementProvider } from './context/ServerManagementContext';
import { UserManagementProvider } from './context/UserManagementContext';
import { StatusManagementProvider } from './context/StatusManagementContext';
import { ProfileProvider } from './context/ProfileContext';
import { LogsProvider } from './context/LogsContext';
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
                                    <StatusManagementProvider>
                                    <LogsProvider>
                                        <ProfileProvider>
                                        <Toaster
                                            position="top-right"
                                            toastOptions={{
                                                duration: 4000,
                                                style: { background: '#1e3a5f', color: '#fff' }
                                            }}
                                        />
                                        <App />
                                    </ProfileProvider>
                                    </LogsProvider>
                                    </StatusManagementProvider>
                                </UserManagementProvider>
                            </ServerManagementProvider>
                        </AppDataProvider>
                    </AuthProvider>
                </BrandingProvider>
            </ApiProvider>
        </BrowserRouter>
    </React.StrictMode>
);
