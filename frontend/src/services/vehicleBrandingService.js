/**
 * Vehicle Brand lookup service
 * Brands are now managed as "Makes/Brands" inside Vehicle Master Data.
 * This thin service exposes the active brand list (sourced from the vehicle
 * master makes endpoint) for dropdowns in Sales & Service.
 * Maintained by Hussain Developer
 * AMS ERP
 */

import api from './api';

const handleApiError = (error) => {
    const message = error?.response?.data?.message || error?.message || 'An unexpected error occurred';
    throw new Error(message);
};

// Returns active brands in the legacy shape { success, data: { brands: [{id, name, ...}] } }
export const getActiveBrands = async () => {
    try {
        const response = await api.get('/vehicle-master/makes', { params: { is_active: true, limit: 1000 } });
        const makes = response?.data?.data?.makes || [];
        const brands = makes.map((m) => ({
            id: m.id,
            name: m.name,
            logo_url: m.logo || '',
            country_of_origin: m.country || '',
            description: m.description || '',
            website: m.website || '',
            established_year: m.established_year || null,
            is_active: m.is_active,
        }));
        return { success: true, data: { brands } };
    } catch (error) {
        handleApiError(error);
    }
};

export default {
    getActiveBrands,
};
