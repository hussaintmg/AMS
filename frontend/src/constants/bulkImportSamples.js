/**
 * Download filenames for bulk-import sample templates.
 * The actual file content is generated server-side by the
 * GET /api/bulk-import/template/:type endpoint (real MongoDB data).
 */

export const BULK_IMPORT_DOWNLOAD_NAMES = {
    leads: {
        csv: 'ams_leads_import_template.csv',
        xlsx: 'ams_leads_import_template.xlsx'
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
    },
    customers: {
        csv: 'ams_customers_import_template.csv',
        xlsx: 'ams_customers_import_template.xlsx'
    },
    parts: {
        csv: 'ams_parts_import_template.csv',
        xlsx: 'ams_parts_import_template.xlsx'
    },
    employees: {
        csv: 'ams_employees_import_template.csv',
        xlsx: 'ams_employees_import_template.xlsx'
    }
};
