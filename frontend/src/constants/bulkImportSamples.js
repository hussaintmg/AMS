/**
 * Static bulk-import samples live under `public/samples/` (served at /samples/…).
 * Avoids relying on the API for downloads so templates work even if the API is older or unreachable.
 */

export const BULK_IMPORT_SAMPLE_SLUG = {
    leads: 'leads',
    'vehicle-brands': 'vehicle-brands',
    vehicles: 'vehicles',
    'sales-orders': 'sales-orders'
};

export const BULK_IMPORT_DOWNLOAD_NAMES = {
    leads: {
        csv: 'ams_customers_import_template.csv',
        xlsx: 'ams_customers_import_template.xlsx'
    },
    'vehicle-brands': {
        csv: 'ams_vehicle_brands_import_template.csv',
        xlsx: 'ams_vehicle_brands_import_template.xlsx'
    },
    vehicles: {
        csv: 'ams_vehicles_import_template.csv',
        xlsx: 'ams_vehicles_import_template.xlsx'
    },
    'sales-orders': {
        csv: 'ams_sales_orders_import_template.csv',
        xlsx: 'ams_sales_orders_import_template.xlsx'
    }
};

export function getBulkImportSampleUrl(templateType, format) {
    const slug = BULK_IMPORT_SAMPLE_SLUG[templateType];
    if (!slug || (format !== 'csv' && format !== 'xlsx')) return null;
    const base = (process.env.PUBLIC_URL || '').replace(/\/$/, '');
    return `${base}/samples/bulk-import-${slug}.${format}`;
}
