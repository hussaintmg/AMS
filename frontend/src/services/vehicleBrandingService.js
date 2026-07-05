/**
 * Vehicle Branding Service
 * AJAX/Async API calls for vehicle brand management
 * Created by LOGIXINVENTOR (PVT) Ltd.
 * www.logixinventor.com | AMS
 * Date: 2026-05-08
 */

import api from './api';

const handleApiError = (error) => {
    const message = error?.response?.data?.message || error?.message || 'An unexpected error occurred';
    throw new Error(message);
};

export const getAllBrands = async (params = {}) => {
    try {
        const queryParams = {};

        if (params.page !== undefined) queryParams.page = params.page;
        if (params.limit !== undefined) queryParams.limit = params.limit;
        if (params.search !== undefined) queryParams.search = params.search;
        if (params.is_active !== undefined && params.is_active !== null) queryParams.is_active = params.is_active;

        const response = await api.get('/vehicle-branding', { params: queryParams });
        return response.data;
    } catch (error) {
        handleApiError(error);
    }
};

export const getBrandById = async (id) => {
    try {
        const response = await api.get(`/vehicle-branding/${id}`);
        return response.data;
    } catch (error) {
        handleApiError(error);
    }
};

export const createBrand = async (brandData) => {
    try {
        const payload = {
            name: brandData.name,
            description: brandData.description || '',
            logo_url: brandData.logo_url || '',
            country_of_origin: brandData.country_of_origin || '',
            established_year: brandData.established_year || null,
            website: brandData.website || ''
        };
        const response = await api.post('/vehicle-branding', payload);
        return response.data;
    } catch (error) {
        handleApiError(error);
    }
};

export const updateBrand = async (id, brandData) => {
    try {
        const payload = {
            name: brandData.name,
            description: brandData.description || '',
            logo_url: brandData.logo_url || '',
            country_of_origin: brandData.country_of_origin || '',
            established_year: brandData.established_year || null,
            website: brandData.website || '',
            is_active: brandData.is_active !== undefined ? brandData.is_active : true,
            display_order: brandData.display_order || 0
        };
        const response = await api.put(`/vehicle-branding/${id}`, payload);
        return response.data;
    } catch (error) {
        handleApiError(error);
    }
};

export const deleteBrand = async (id) => {
    try {
        const response = await api.delete(`/vehicle-branding/${id}`);
        return response.data;
    } catch (error) {
        handleApiError(error);
    }
};

export const getActiveBrands = async () => {
    try {
        const response = await api.get('/vehicle-branding/active');
        return response.data;
    } catch (error) {
        handleApiError(error);
    }
};

export const getBrandStats = async () => {
    try {
        const response = await api.get('/vehicle-branding/stats');
        return response.data;
    } catch (error) {
        handleApiError(error);
    }
};

export const bulkUpdateStatus = async (brandIds, is_active) => {
    try {
        const response = await api.post('/vehicle-branding/bulk-update-status', {
            brandIds,
            is_active
        });
        return response.data;
    } catch (error) {
        handleApiError(error);
    }
};

export default {
    getAllBrands,
    getBrandById,
    createBrand,
    updateBrand,
    deleteBrand,
    getActiveBrands,
    getBrandStats,
    bulkUpdateStatus
};
