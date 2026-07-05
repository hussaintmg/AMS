/**
 * API Service
 * Created by LOGIXINVENTOR (PVT) Ltd.
 * www.logixinventor.com | AMS
 */

import axios from 'axios';
import toast from 'react-hot-toast';
import eventBus from '../utils/eventBus';

const API_URL = process.env.REACT_APP_API_URL || '/api';

const api = axios.create({
    baseURL: API_URL,
    withCredentials: true,
    headers: { 'Content-Type': 'application/json' }
});

// Request interceptor
api.interceptors.request.use((config) => {
    return config;
});

// Response interceptor - handle errors
api.interceptors.response.use(
    (response) => response,
    (error) => {
        const message = error.response?.data?.message || 'An error occurred';
        const resolution = error.response?.data?.resolution;
        const statusCode = error.response?.status;

        if (statusCode === 401) {
            if (!error.config?.skipAuthRedirect) {
                window.location.href = '/login';
            }
            return Promise.reject(error);
        }

        /** Bulk import loops handle errors per row — skip global toast/popup noise */
        if (error.config?.silentBulkImport) {
            return Promise.reject(error);
        }

        // Don't dispatch error popup or toast for 403 (permission denied) - it's expected behavior
        if (statusCode !== 403) {
            // Dispatch error event for global popup
            eventBus.dispatch('api:error', {
                message,
                resolution,
                statusCode
            });

            // Keep toast for minor errors or if preferred
            // Suppress 404 errors for GET requests (empty lists/items)
            const isGet404 = statusCode === 404 && error.config.method === 'get';

            if (!resolution && !isGet404) {
                toast.error(message);
            }
        }

        return Promise.reject(error);
    }
);

// Auth
export const authAPI = {
    login: (data) => api.post('/auth/login', data),
    register: (data) => api.post('/auth/register', data),
    getProfile: () => api.get('/auth/me', { skipAuthRedirect: true }),
    logout: () => api.post('/auth/logout'),
    forgotPassword: (data) => api.post('/auth/forgot-password', data),
    checkForgotToken: (data) => api.post('/auth/check-forgot-token', data),
    checkResetCode: (data) => api.post('/auth/check-reset-code', data),
    checkResetToken: (data) => api.post('/auth/check-reset-token', data),
    resetPassword: (data) => api.post('/auth/reset-password', data)
};

export const serverManagementAPI = {
    getPermissionSettings: () => api.get('/server-management/permission-settings'),
    updatePermissionSettings: (data) => api.put('/server-management/permission-settings', data),
    getOverview: () => api.get('/server-management/overview'),
    getPages: () => api.get('/server-management/pages'),
    createPage: (data) => api.post('/server-management/pages', data),
    syncPages: (pages) => api.post('/server-management/pages/sync', { pages }),
    updatePages: (pages) => api.put('/server-management/pages', { pages }),
    getSidebar: () => api.get('/server-management/sidebar'),
    saveSidebar: (pages) => api.put('/server-management/sidebar', { pages }),
    updateSidebar: (pages) => api.put('/server-management/sidebar', { pages }),
    getBranding: () => api.get('/server-management/branding'),
    updateBranding: (data) => api.put('/server-management/branding', data),
    getAssets: () => api.get('/server-management/branding/assets'),
    uploadAssets: (formData) => api.post('/server-management/branding/assets/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
    }),
    saveAssetAssignments: (assignments) => api.post('/server-management/assets/assignments', { assignments }),
    deleteAsset: (id) => api.delete(`/server-management/branding/assets/${id}`),
    replaceAsset: (id, formData) => api.put(`/server-management/branding/assets/${id}/replace`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
    }),
    getRoles: () => api.get('/server-management/roles'),
    createRole: (data) => api.post('/server-management/roles', data),
    updateRole: (id, data) => api.put(`/server-management/roles/${id}`, data),
    updateRoles: (role) => api.put('/server-management/roles', { role }),
    deleteRole: (id) => api.delete(`/server-management/roles/${id}`),
    getUsers: () => api.get('/server-management/users'),
    createUser: (data) => api.post('/server-management/users', data),
    updateUser: (id, data) => api.put(`/server-management/users/${id}`, data),
    getUserPermissions: (id) => id ? api.get(`/server-management/users/${id}/permissions`) : api.get('/server-management/user-permissions'),
    updateUserPermissions: (id, permissions) => api.put(`/server-management/users/${id}/permissions`, { permissions }),
    updateRolePermissions: (id, permissions) => api.put(`/server-management/roles/${id}/permissions`, { permissions }),
    updateUserLogsPermissions: (id, payload) => api.put(
        `/server-management/users/${id}/logs-permissions`,
        payload && typeof payload === 'object' && ('logsPermissions' in payload || 'logPermissionSource' in payload)
            ? payload
            : { logsPermissions: payload },
    ),
    updateRoleLogsPermissions: (id, payload) => api.put(
        `/server-management/roles/${id}/logs-permissions`,
        payload && typeof payload === 'object' && 'logsPermissions' in payload ? payload : { logsPermissions: payload },
    ),
};

// Dashboard
export const dashboardAPI = {
    getStats: () => api.get('/dashboard/stats'),
    getRecentLeads: () => api.get('/dashboard/recent-leads'),
    getRecentSales: () => api.get('/dashboard/recent-sales'),
    getSalesChart: () => api.get('/dashboard/sales-chart'),
    getInventoryByStatus: () => api.get('/dashboard/inventory-by-status'),
    // New endpoints for enhanced dashboard
    getSalesTrend: (months = 12) => api.get('/dashboard/sales-trend', { params: { months } }),
    getInventoryDistribution: () => api.get('/dashboard/inventory-distribution'),
    getTopPerformers: (period = 'month', limit = 5) => api.get('/dashboard/top-performers', { params: { period, limit } }),
    getActivities: (limit = 10) => api.get('/dashboard/activities', { params: { limit } }),
    getKPIs: () => api.get('/dashboard/kpis'),
    getAlerts: () => api.get('/dashboard/alerts')
};

// Leads
export const leadAPI = {
    getAll: (params) => api.get('/leads', { params }),
    getById: (id) => api.get(`/leads/${id}`),
    create: (data) => api.post('/leads', data),
    update: (id, data) => api.put(`/leads/${id}`, data),
    delete: (id) => api.delete(`/leads/${id}`),
    getSources: () => api.get('/leads/sources/list'),
    getFilterOptions: () => api.get('/leads/filter-options'),
    getAnalytics: () => api.get('/leads/analytics'),
    getStats: () => api.get('/leads/stats'),
    export: (params) => api.get('/leads/export', { params, responseType: 'blob' }),
    convert: (id) => api.post(`/leads/${id}/convert`)
};

// Customers
export const customerAPI = {
    getAll: (params) => api.get('/customers', { params }),
    getAllForDropdown: () => api.get('/customers/all'),
    getById: (id) => api.get(`/customers/${id}`),
    create: (data) => api.post('/customers', data),
    update: (id, data) => api.put(`/customers/${id}`, data),
    delete: (id) => api.delete(`/customers/${id}`),
    toggleStatus: (id) => api.patch(`/customers/${id}/status`),
    getStats: () => api.get('/customers/stats'),
    getCities: () => api.get('/customers/cities')
};

// Vehicles
export const vehicleAPI = {
    getAll: (params) => api.get('/vehicles', { params }),
    getById: (id) => api.get(`/vehicles/${id}`),
    create: (data) => api.post('/vehicles', data),
    update: (id, data) => api.put(`/vehicles/${id}`, data),
    delete: (id) => api.delete(`/vehicles/${id}`),
    updateStatus: (id, status) => api.patch(`/vehicles/${id}/status`, { status }),
    getStats: () => api.get('/vehicles/stats'),
    getWarehouses: () => api.get('/vehicles/warehouses/list'),
    getMakes: () => api.get('/vehicles/makes/list'),
    getModels: (makeId) => api.get('/vehicles/models/list', { params: { makeId } }),
    getVariants: (modelId) => api.get('/vehicles/variants/list', { params: { modelId } }),
    getColors: () => api.get('/vehicles/colors/list')
};

// Parts Inventory
export const partsAPI = {
    getAll: (params) => api.get('/parts', { params }),
    getById: (id) => api.get(`/parts/${id}`),
    create: (data) => api.post('/parts', data),
    update: (id, data) => api.put(`/parts/${id}`, data),
    delete: (id) => api.delete(`/parts/${id}`),
    adjustStock: (id, data) => api.post(`/parts/${id}/adjust`, data),
    getStats: () => api.get('/parts/stats'),
    getLowStock: () => api.get('/parts/low-stock'),
    getCategories: () => api.get('/parts/categories/list'),
    getSuppliers: () => api.get('/parts/suppliers/list')
};

// Warehouse Management
export const warehouseAPI = {
    getAll: (params) => api.get('/warehouses', { params }),
    getById: (id) => api.get(`/warehouses/${id}`),
    create: (data) => api.post('/warehouses', data),
    update: (id, data) => api.put(`/warehouses/${id}`, data),
    delete: (id) => api.delete(`/warehouses/${id}`),
    getStats: () => api.get('/warehouses/stats'),
    getInventory: (id, type) => api.get(`/warehouses/${id}/inventory`, { params: { type } }),
    getCities: () => api.get('/warehouses/cities/list'),
    getManagers: () => api.get('/warehouses/managers/list')
};

// Sales
export const salesAPI = {
    // Quotations
    getQuotations: (params) => api.get('/quotations', { params }),
    getQuotation: (id) => api.get(`/quotations/${id}`),
    createQuotation: (data) => api.post('/quotations', data),
    updateQuotation: (id, data) => api.put(`/quotations/${id}`, data),
    deleteQuotation: (id) => api.delete(`/quotations/${id}`),
    updateQuotationStatus: (id, status) => api.patch(`/quotations/${id}/status`, { status }),
    convertQuotation: (id, data) => api.post(`/quotations/${id}/convert`, data),
    getQuotationStats: () => api.get('/quotations/stats'),
    // Bookings
    getBookings: (params) => api.get('/bookings', { params }),
    getBooking: (id) => api.get(`/bookings/${id}`),
    createBooking: (data) => api.post('/bookings', data),
    updateBooking: (id, data) => api.put(`/bookings/${id}`, data),
    deleteBooking: (id, data) => api.delete(`/bookings/${id}`, { data }),
    allocateVehicle: (id, vehicleId) => api.post(`/bookings/${id}/allocate`, { vehicleId }),
    convertBooking: (id, data) => api.post(`/bookings/${id}/convert`, data),
    getBookingStats: () => api.get('/bookings/stats'),
    // Sales Orders
    getOrders: (params) => api.get('/sales', { params }),
    getOrdersWithInvoices: (params) => api.get('/sales/with-invoices', { params }),
    getOrder: (id) => api.get(`/sales/${id}`),
    createOrder: (data) => api.post('/sales', data),
    createDirectOrder: (data) => api.post('/sales/direct', data),
    updateOrder: (id, data) => api.put(`/sales/${id}`, data),
    updateOrderStatus: (id, status, notes) => api.put(`/sales/${id}/status`, { status, notes }),
    deleteOrder: (id) => api.delete(`/sales/${id}`),
    deliverOrder: (id) => api.post(`/sales/${id}/deliver`),
    generateInvoice: (id, dueDays = 30) => api.post(`/sales/${id}/invoice`, { dueDays }),
    getOrderHistory: (id) => api.get(`/sales/${id}/history`),
    getSalesStats: () => api.get('/sales/stats'),
    getOrderStats: () => api.get('/sales/order-stats'),

    // Master Data Lookups
    getQuotationStatuses: (params) => api.get('/sales-master/quotation-statuses', { params }),
    getBookingStatuses: (params) => api.get('/sales-master/booking-statuses', { params }),
    getOrderStatuses: (params) => api.get('/sales-master/order-statuses', { params }),
    getInvoiceStatuses: (params) => api.get('/sales-master/invoice-statuses', { params }),
    getPriorities: (params) => api.get('/sales-master/priorities', { params })
};


// Invoices
export const invoiceAPI = {
    getAll: (params) => api.get('/invoices', { params }),
    getById: (id) => api.get(`/invoices/${id}`),
    create: (data) => api.post('/invoices', data),
    createFromSalesOrder: (data) => api.post('/invoices/from-sales-order', data),
    update: (id, data) => api.put(`/invoices/${id}`, data),
    delete: (id, data) => api.delete(`/invoices/${id}`, { data }),
    updateStatus: (id, status) => api.put(`/invoices/${id}/status`, { status }),
    send: (id) => api.post(`/invoices/${id}/send`),
    getHistory: (id) => api.get(`/invoices/${id}/history`),
    // Items
    addItem: (id, item) => api.post(`/invoices/${id}/items`, item),
    updateItem: (id, itemId, data) => api.put(`/invoices/${id}/items/${itemId}`, data),
    removeItem: (id, itemId) => api.delete(`/invoices/${id}/items/${itemId}`),
    // Payments
    recordPayment: (id, data) => api.post(`/invoices/${id}/payments`, data),
    // Stats & Helpers
    getStats: () => api.get('/invoices/stats'),
    getQRData: (id) => api.get(`/invoices/${id}/qr-data`),
    getPaymentMethods: () => api.get('/invoices/payment-methods')
};


// Finance (legacy payments)
export const financeAPI = {
    getInvoices: (params) => api.get('/invoices', { params }),
    createInvoice: (data) => api.post('/invoices', data),
    getPayments: (params) => api.get('/payments', { params }),
    createPayment: (data) => api.post('/payments', data),
    getPaymentMethods: () => api.get('/payments/methods/list')
};


// Service
export const serviceAPI = {
    // Appointments
    getAppointments: (params) => api.get('/services/appointments', { params }),
    getAppointment: (id) => api.get(`/services/appointments/${id}`),
    createAppointment: (data) => api.post('/services/appointments', data),
    updateAppointment: (id, data) => api.put(`/services/appointments/${id}`, data),
    deleteAppointment: (id) => api.delete(`/services/appointments/${id}`),
    updateAppointmentStatus: (id, status) => api.patch(`/services/appointments/${id}/status`, { status }),
    getAppointmentStats: () => api.get('/services/appointments/stats'),

    // Job Cards
    getJobCards: (params) => api.get('/services/job-cards', { params }),
    getJobCard: (id) => api.get(`/services/job-cards/${id}`),
    createJobCard: (data) => api.post('/services/job-cards', data),
    updateJobCard: (id, data) => api.put(`/services/job-cards/${id}`, data),
    deleteJobCard: (id) => api.delete(`/services/job-cards/${id}`),
    updateJobCardStatus: (id, status) => api.patch(`/services/job-cards/${id}/status`, { status }),
    completeJobCard: (id, data) => api.post(`/services/job-cards/${id}/complete`, data),
    getJobCardStats: () => api.get('/services/job-cards/stats'),

    // Job Card Services
    addJobCardService: (jobCardId, data) => api.post(`/services/job-cards/${jobCardId}/services`, data),
    updateJobCardService: (jobCardId, serviceId, data) => api.put(`/services/job-cards/${jobCardId}/services/${serviceId}`, data),
    deleteJobCardService: (jobCardId, serviceId) => api.delete(`/services/job-cards/${jobCardId}/services/${serviceId}`),

    // Job Card Parts
    addJobCardPart: (jobCardId, data) => api.post(`/services/job-cards/${jobCardId}/parts`, data),
    updateJobCardPart: (jobCardId, partId, data) => api.put(`/services/job-cards/${jobCardId}/parts/${partId}`, data),
    deleteJobCardPart: (jobCardId, partId) => api.delete(`/services/job-cards/${jobCardId}/parts/${partId}`),

    // Lookups
    getServiceTypes: () => api.get('/services/types/list'),
    getTechnicians: () => api.get('/services/technicians/list'),
    getAdvisors: () => api.get('/services/advisors/list')
};


// Reports Management
export const reportsAPI = {
    getAll: (params) => api.get('/reports', { params }),
    getById: (id) => api.get(`/reports/${id}`),
    create: (data) => api.post('/reports', data),
    update: (id, data) => api.put(`/reports/${id}`, data),
    delete: (id) => api.delete(`/reports/${id}`),
    execute: (id, data) => api.post(`/reports/${id}/execute`, data)
};

// Legacy Reports (if any)
export const reportAPI = {
    getSalesPerformance: (params) => api.get('/reports/sales-performance', { params }),
    getSalesByModel: (params) => api.get('/reports/sales-by-model', { params }),
    getInventoryHealth: (params) => api.get('/reports/inventory-health', { params }),
    getInventoryStockMovement: (params) => api.get('/reports/inventory-stock-movement', { params }),
    getInventoryStockSnapshot: (params) => api.get('/reports/inventory-stock-snapshot', { params }),
    getPendingDeliveries: (params) => api.get('/reports/pending-deliveries', { params }),
    getCustomerReceivables: (params) => api.get('/reports/customer-receivables', { params }),
    getReceivablesAging: (params) => api.get('/reports/receivables-aging', { params }),
    getLeadStatistics: (params) => api.get('/reports/lead-statistics', { params }),
    getServiceAnalytics: (params) => api.get('/reports/service-analytics', { params }),
    getServiceKpiDetail: (params) => api.get('/reports/service-kpi-detail', { params }),
    getLowStockParts: (params) => api.get('/reports/low-stock-parts', { params })
};

// Admin - User Management
export const adminAPI = {
    // Users
    getUsers: (params) => api.get('/admin/users', { params }),
    getUser: (id) => api.get(`/admin/users/${id}`),
    createUser: (data) => api.post('/admin/users', data),
    updateUser: (id, data) => api.put(`/admin/users/${id}`, data),
    deleteUser: (id) => api.delete(`/admin/users/${id}`),
    toggleUserStatus: (id) => api.patch(`/admin/users/${id}/status`),
    assignRole: (id, roleId) => api.patch(`/admin/users/${id}/role`, { roleId }),
    assignDepartment: (id, deptId) => api.patch(`/admin/users/${id}/department`, { deptId }),
    getUserStats: () => api.get('/admin/users/stats'),

    // Roles
    getRoles: () => api.get('/admin/roles'),
    getRole: (id) => api.get(`/admin/roles/${id}`),
    createRole: (data) => api.post('/admin/roles', data),
    updateRole: (id, data) => api.put(`/admin/roles/${id}`, data),
    deleteRole: (id) => api.delete(`/admin/roles/${id}`),
    updateRolePermissions: (id, permissions) => api.put(`/admin/roles/${id}/permissions`, { permissions }),

    // Permissions
    getPermissions: () => api.get('/admin/permissions'),
    getPermissionMatrix: () => api.get('/admin/permissions/matrix'),
    getPermissionModules: () => api.get('/admin/permissions/modules'),

    // Departments
    getDepartments: (params) => api.get('/admin/departments', { params }),
    getDepartment: (id) => api.get(`/admin/departments/${id}`),
    createDepartment: (data) => api.post('/admin/departments', data),
    updateDepartment: (id, data) => api.put(`/admin/departments/${id}`, data),
    deleteDepartment: (id) => api.delete(`/admin/departments/${id}`),
    assignDepartmentManager: (id, userId) => api.patch(`/admin/departments/${id}/manager`, { userId }),
    getDepartmentStats: () => api.get('/admin/departments/stats'),

    // Statuses
    getStatuses: () => api.get('/admin/statuses'),
    getStatusesByTable: (table, params) => api.get(`/admin/statuses/table/${table}`, { params }),
    createStatus: (data) => api.post('/admin/statuses', data),
    updateStatus: (id, data) => api.put(`/admin/statuses/${id}`, data),
    deleteStatus: (id) => api.delete(`/admin/statuses/${id}`),
    reorderStatuses: (table, statuses) => api.put(`/admin/statuses/${table}/reorder`, { statuses }),
    getAvailableTables: () => api.get('/admin/statuses/tables'),
    getStatusAnalytics: () => api.get('/admin/statuses/analytics')
};

// ERP Settings
export const erpSettingsAPI = {
    // Stats
    getStats: () => api.get('/erp-settings/stats'),
    getManagers: () => api.get('/erp-settings/managers'),

    // Companies
    getCompanies: (params) => api.get('/erp-settings/companies', { params }),
    getCompany: (id) => api.get(`/erp-settings/companies/${id}`),
    createCompany: (data) => api.post('/erp-settings/companies', data),
    updateCompany: (id, data) => api.put(`/erp-settings/companies/${id}`, data),
    deleteCompany: (id) => api.delete(`/erp-settings/companies/${id}`),

    // Branches
    getBranches: (params) => api.get('/erp-settings/branches', { params }),
    getBranch: (id) => api.get(`/erp-settings/branches/${id}`),
    createBranch: (data) => api.post('/erp-settings/branches', data),
    updateBranch: (id, data) => api.put(`/erp-settings/branches/${id}`, data),
    deleteBranch: (id) => api.delete(`/erp-settings/branches/${id}`),

    // Settings
    getSettings: (category) => api.get('/erp-settings/settings', { params: { category } }),
    updateSettings: (settings) => api.put('/erp-settings/settings', { settings }),
    getSettingCategories: () => api.get('/erp-settings/settings/categories'),

    // Currencies
    getCurrencies: (params) => api.get('/erp-settings/currencies', { params }),
    createCurrency: (data) => api.post('/erp-settings/currencies', data),
    updateCurrency: (id, data) => api.put(`/erp-settings/currencies/${id}`, data),
    deleteCurrency: (id) => api.delete(`/erp-settings/currencies/${id}`),

    // Taxes
    getTaxes: (params) => api.get('/erp-settings/taxes', { params }),
    createTax: (data) => api.post('/erp-settings/taxes', data),
    updateTax: (id, data) => api.put(`/erp-settings/taxes/${id}`, data),
    deleteTax: (id) => api.delete(`/erp-settings/taxes/${id}`),

    // Document HTML templates (sales print)
    getDocumentTemplates: (params) => api.get('/erp-settings/document-templates', { params }),
    getDocumentTemplate: (id) => api.get(`/erp-settings/document-templates/${id}`),
    getDocumentTemplateDefault: (documentType, params) =>
        api.get(`/erp-settings/document-templates/default/${documentType}`, { params }),
    createDocumentTemplate: (data) => api.post('/erp-settings/document-templates', data),
    updateDocumentTemplate: (id, data) => api.put(`/erp-settings/document-templates/${id}`, data),
    deleteDocumentTemplate: (id) => api.delete(`/erp-settings/document-templates/${id}`),
    seedDocumentTemplates: () => api.post('/erp-settings/document-templates/seed-defaults')
};

// Vehicle Master Data
export const vehicleMasterAPI = {
    // Stats
    getStats: () => api.get('/vehicle-master/stats'),

    // Makes
    getMakes: (params) => api.get('/vehicle-master/makes', { params }),
    createMake: (data) => api.post('/vehicle-master/makes', data),
    updateMake: (id, data) => api.put(`/vehicle-master/makes/${id}`, data),
    deleteMake: (id) => api.delete(`/vehicle-master/makes/${id}`),

    // Models
    getModels: (params) => api.get('/vehicle-master/models', { params }),
    createModel: (data) => api.post('/vehicle-master/models', data),
    updateModel: (id, data) => api.put(`/vehicle-master/models/${id}`, data),
    deleteModel: (id) => api.delete(`/vehicle-master/models/${id}`),

    // Variants
    getVariants: (params) => api.get('/vehicle-master/variants', { params }),
    createVariant: (data) => api.post('/vehicle-master/variants', data),
    updateVariant: (id, data) => api.put(`/vehicle-master/variants/${id}`, data),
    deleteVariant: (id) => api.delete(`/vehicle-master/variants/${id}`),

    // Colors
    getColors: (params) => api.get('/vehicle-master/colors', { params }),
    createColor: (data) => api.post('/vehicle-master/colors', data),
    updateColor: (id, data) => api.put(`/vehicle-master/colors/${id}`, data),
    deleteColor: (id) => api.delete(`/vehicle-master/colors/${id}`),

    // Categories (Part Categories)
    getCategories: (params) => api.get('/vehicle-master/categories', { params }),
    createCategory: (data) => api.post('/vehicle-master/categories', data),
    updateCategory: (id, data) => api.put(`/vehicle-master/categories/${id}`, data),
    deleteCategory: (id) => api.delete(`/vehicle-master/categories/${id}`),

    // Suppliers
    getSuppliers: (params) => api.get('/vehicle-master/suppliers', { params }),
    createSupplier: (data) => api.post('/vehicle-master/suppliers', data),
    updateSupplier: (id, data) => api.put(`/vehicle-master/suppliers/${id}`, data),
    deleteSupplier: (id) => api.delete(`/vehicle-master/suppliers/${id}`)
};

// Service Master Data
export const serviceMasterAPI = {
    getStats: () => api.get('/service-master/stats'),

    // Service Types
    getTypes: (params) => api.get('/service-master/types', { params }),
    createType: (data) => api.post('/service-master/types', data),
    updateType: (id, data) => api.put(`/service-master/types/${id}`, data),
    deleteType: (id) => api.delete(`/service-master/types/${id}`),

    // Labor Rates
    getLaborRates: (params) => api.get('/service-master/labor-rates', { params }),
    createLaborRate: (data) => api.post('/service-master/labor-rates', data),
    updateLaborRate: (id, data) => api.put(`/service-master/labor-rates/${id}`, data),
    deleteLaborRate: (id) => api.delete(`/service-master/labor-rates/${id}`),

    // Service Packages
    getPackages: (params) => api.get('/service-master/packages', { params }),
    getPackage: (id) => api.get(`/service-master/packages/${id}`),
    createPackage: (data) => api.post('/service-master/packages', data),
    updatePackage: (id, data) => api.put(`/service-master/packages/${id}`, data),
    deletePackage: (id) => api.delete(`/service-master/packages/${id}`),
    addPackageItem: (id, data) => api.post(`/service-master/packages/${id}/items`, data),
    removePackageItem: (id, itemId) => api.delete(`/service-master/packages/${id}/items/${itemId}`),

    // Warranty Types
    getWarranties: (params) => api.get('/service-master/warranties', { params }),
    createWarranty: (data) => api.post('/service-master/warranties', data),
    updateWarranty: (id, data) => api.put(`/service-master/warranties/${id}`, data),
    deleteWarranty: (id) => api.delete(`/service-master/warranties/${id}`),

    // Lookups
    getCategories: () => api.get('/service-master/categories')
};

// Payment Methods API
export const paymentMethodsAPI = {
    getAll: (params) => api.get('/payment-methods', { params }),
    getById: (id) => api.get(`/payment-methods/${id}`),
    getTypes: () => api.get('/payment-methods/types'),
    create: (data) => api.post('/payment-methods', data),
    update: (id, data) => api.put(`/payment-methods/${id}`, data),
    toggleStatus: (id) => api.patch(`/payment-methods/${id}/toggle`),
    delete: (id) => api.delete(`/payment-methods/${id}`)
};

// Profile API
export const profileAPI = {
    getProfile: () => api.get('/profile'),
    updateProfile: (data) => api.put('/profile', data),
    uploadAvatar: (formData) => api.post('/profile/avatar', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
    }),
    deleteAvatar: () => api.delete('/profile/avatar')
};

// Global Search API
export const searchAPI = {
    search: (query, limit = 20) => api.get('/search', { params: { query, limit } })
};

// Order Form Customers API
export const ofCustomerAPI = {
    getAll: (params) => api.get('/of-customers', { params }),
    getById: (id) => api.get(`/of-customers/${id}`),
    create: (data) => api.post('/of-customers', data),
    update: (id, data) => api.put(`/of-customers/${id}`, data),
    delete: (id) => api.delete(`/of-customers/${id}`),
    getStats: () => api.get('/of-customers/stats')
};

// Order Form Products API
export const ofProductAPI = {
    getAll: (params) => api.get('/of-products', { params }),
    getById: (id) => api.get(`/of-products/${id}`),
    create: (data) => api.post('/of-products', data),
    update: (id, data) => api.put(`/of-products/${id}`, data),
    delete: (id) => api.delete(`/of-products/${id}`),
    getStats: () => api.get('/of-products/stats')
};

// Order Form Orders API
export const ofOrderAPI = {
    getAll: (params) => api.get('/of-orders', { params }),
    getById: (id) => api.get(`/of-orders/${id}`),
    create: (data) => api.post('/of-orders', data),
    update: (id, data) => api.put(`/of-orders/${id}`, data),
    delete: (id) => api.delete(`/of-orders/${id}`),
    getStats: () => api.get('/of-orders/stats'),
    getCustomersList: () => api.get('/of-orders/customers/list'),
    getProductsList: () => api.get('/of-orders/products/list'),
    getDeliveryMonths: () => api.get('/of-orders/delivery-months/list')
};

/** HR & Finance */
export const employeeAPI = {
    list: (params) => api.get('/employees', { params }),
    get: (id) => api.get(`/employees/${id}`),
    create: (data) => api.post('/employees', data),
    update: (id, data) => api.put(`/employees/${id}`, data),
    remove: (id) => api.delete(`/employees/${id}`)
};

export const payrollAPI = {
    listPeriods: () => api.get('/payroll/periods'),
    createPeriod: (data) => api.post('/payroll/periods', data),
    getPeriodLines: (id) => api.get(`/payroll/periods/${id}/lines`),
    generateLines: (id) => api.post(`/payroll/periods/${id}/generate`),
    lockPeriod: (id) => api.post(`/payroll/periods/${id}/lock`),
    postPeriod: (id) => api.post(`/payroll/periods/${id}/post`),
    updateLine: (lineId, data) => api.patch(`/payroll/lines/${lineId}`, data)
};

export const leavesAPI = {
    listTypes: () => api.get('/leaves/types'),
    listBalances: (params) => api.get('/leaves/balances', { params }),
    listRequests: (params) => api.get('/leaves/requests', { params }),
    submitRequest: (data) => api.post('/leaves/requests', data),
    setRequestStatus: (id, data) => api.patch(`/leaves/requests/${id}/status`, data)
};

export const expensesAPI = {
    listAccounts: () => api.get('/expenses/accounts'),
    listCategories: () => api.get('/expenses/categories'),
    createCategory: (data) => api.post('/expenses/categories', data),
    updateCategory: (id, data) => api.patch(`/expenses/categories/${id}`, data),
    listExpenses: (params) => api.get('/expenses/items', { params }),
    createExpense: (data) => api.post('/expenses/items', data),
    updateExpense: (id, data) => api.patch(`/expenses/items/${id}`, data),
    postExpense: (id) => api.post(`/expenses/items/${id}/post`)
};

export const ledgerAPI = {
    list: (params) => api.get('/ledger', { params })
};

export const logsAPI = {
    getLogs: (params) => api.get('/logs', { params }),
    getLog: (id) => api.get(`/logs/${id}`),
    deleteLog: (id) => api.delete(`/logs/${id}`),
    getLogStats: (params) => api.get('/logs/stats', { params }),
    getFilterOptions: () => api.get('/logs/filter-options'),

    // Legacy aliases — still work
    getApiLogs: (params) => api.get('/logs/api-logs', { params }),
    getApiLog: (id) => api.get(`/logs/api-logs/${id}`),
    deleteApiLog: (id) => api.delete(`/logs/api-logs/${id}`),
    getApiLogStats: (params) => api.get('/logs/api-logs/stats', { params }),
    getAuditLogs: (params) => api.get('/logs/audit-logs', { params }),
    getAuditLog: (id) => api.get(`/logs/audit-logs/${id}`),
    deleteAuditLog: (id) => api.delete(`/logs/audit-logs/${id}`),
    getAuditLogStats: (params) => api.get('/logs/audit-logs/stats', { params }),
};

export default api;
