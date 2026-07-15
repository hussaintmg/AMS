/**
 * Bulk import client — uploads the CSV/XLSX file to the server-side
 * /api/bulk-import/:type routes. All parsing, name→id resolution and
 * validation happen on the server (MongoDB insertMany, row-level errors).
 */

import api from '../services/api';

const IMPORT_TYPES = new Set([
    'leads',
    'customers',
    'vehicles',
    'sales-orders',
    'parts',
    'employees'
]);

/**
 * @param {string} templateType leads | customers | vehicle-brands | vehicles | sales-orders | parts
 * @param {File} file
 * @returns {Promise<{ success: boolean, summary: object, errors: array }>}
 */
export async function runClientBulkImport(templateType, file) {
    if (!IMPORT_TYPES.has(templateType)) {
        throw new Error('Unknown import type.');
    }
    const formData = new FormData();
    formData.append('file', file);
    const res = await api.post(`/bulk-import/${templateType}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        silentBulkImport: true
    });
    return res.data;
}
