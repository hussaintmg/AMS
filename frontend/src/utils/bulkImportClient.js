/**
 * Client-side bulk import: parse CSV/XLSX in the browser and call existing REST APIs
 * (no /api/bulk-import/* required — avoids 404 when the API server is not updated).
 */

import * as XLSX from 'xlsx';
import api from '../services/api';

const silent = { silentBulkImport: true };

function normalizeHeader(cell) {
    if (cell === undefined || cell === null) return '';
    let s = String(cell).replace(/^\uFEFF/, '').trim();
    s = s.replace(/\s*\*\s*$/u, '');
    s = s.replace(/\s*\(required\)\s*$/iu, '');
    s = s.replace(/\s*\(optional\)\s*$/iu, '');
    s = s.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    return s;
}

function stripLeadingHashCommentLines(text) {
    return text
        .split(/\r?\n/)
        .filter((line) => !line.trim().startsWith('#'))
        .join('\n');
}

function findHeaderRowIndex(matrix) {
    for (let i = 0; i < matrix.length; i++) {
        const row = matrix[i];
        if (!row || !row.length) continue;
        const first = String(row[0] ?? '').trim();
        if (first.startsWith('#')) continue;
        const nonEmpty = row.filter((c) => String(c ?? '').trim() !== '').length;
        if (nonEmpty >= 2) return i;
    }
    return -1;
}

function matrixToObjects(matrix) {
    const hi = findHeaderRowIndex(matrix);
    if (hi === -1) {
        throw new Error('Could not find a header row. Add a header row after any # comment lines.');
    }
    const headerCells = matrix[hi];
    const rows = [];
    for (let r = hi + 1; r < matrix.length; r++) {
        const line = matrix[r] || [];
        if (line.every((c) => String(c ?? '').trim() === '')) continue;

        const obj = {};
        headerCells.forEach((rawH, colIdx) => {
            const h = normalizeHeader(rawH);
            if (!h) return;
            obj[h] = String(line[colIdx] ?? '').trim();
        });

        if (Object.values(obj).some((v) => v !== '')) rows.push(obj);
    }
    return rows;
}

export async function parseBulkImportFile(file) {
    const name = (file.name || '').toLowerCase();
    const buf = await file.arrayBuffer();

    if (name.endsWith('.xlsx')) {
        const wb = XLSX.read(buf, { type: 'array' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });
        return matrixToObjects(matrix);
    }

    if (name.endsWith('.csv')) {
        const text = stripLeadingHashCommentLines(new TextDecoder('utf-8').decode(buf));
        const wb = XLSX.read(text, { type: 'string', FS: ',', raw: false });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });
        return matrixToObjects(matrix);
    }

    throw new Error('Unsupported file type. Use .csv or .xlsx');
}

function normalizePhone(phone) {
    if (phone === undefined || phone === null) return phone;
    const original = String(phone).trim();
    if (!original) return original;
    let normalized = original.replace(/[^\d+]/g, '');
    if (normalized.startsWith('+')) normalized = normalized.slice(1);
    if (normalized.startsWith('00')) normalized = normalized.slice(2);
    normalized = normalized.replace(/^0+/, '');
    if (normalized.startsWith('92')) return `+${normalized}`;
    if (normalized.startsWith('3')) return `+92${normalized}`;
    return original;
}

function resolveSourceId(row, sourcesList, sourcesByNameLower) {
    const sid = String(row.source_id || '').trim();
    if (sid && !Number.isNaN(parseInt(sid, 10))) {
        const id = parseInt(sid, 10);
        if (sourcesList.some((s) => Number(s.id) === id)) return id;
    }
    const name = String(row.source || '').trim();
    if (!name) return null;
    return sourcesByNameLower.get(name.toLowerCase())?.id ?? null;
}

async function importLeadsClient(rows) {
    const srcRes = await api.get('/leads/sources/list', silent);
    const sources = srcRes.data?.data || [];
    const sourcesByNameLower = new Map();
    sources.forEach((s) => {
        if (s.name) sourcesByNameLower.set(String(s.name).toLowerCase().trim(), s);
    });

    const errors = [];
    let created = 0;
    const userStr = localStorage.getItem('user');
    let userId = null;
    try {
        if (userStr) userId = JSON.parse(userStr).id;
    } catch {
        /* ignore */
    }

    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const rowNum = i + 1;
        const first = row.first_name;
        const last = row.last_name;
        const phone = row.phone;
        if (!first || !last || !phone) {
            errors.push({
                row: rowNum,
                message: 'Missing required field(s): first_name, last_name, and phone are required.'
            });
            continue;
        }
        try {
            const sourceId = resolveSourceId(row, sources, sourcesByNameLower);
            const payload = {
                first_name: first,
                last_name: last,
                email: row.email || '',
                phone: normalizePhone(phone),
                source_id: sourceId || '',
                status: row.status || 'new',
                priority: row.priority || 'medium',
                interested_in: row.interested_in || '',
                city: row.city || '',
                notes: row.notes || ''
            };
            if (userId) payload.assigned_to = userId;

            await api.post('/leads', payload, silent);
            created += 1;
        } catch (e) {
            const msg = e.response?.data?.message || e.message || 'Failed to create customer';
            errors.push({ row: rowNum, message: msg });
        }
    }

    return {
        success: true,
        summary: { total: rows.length, created, failed: errors.length },
        errors: errors.slice(0, 100)
    };
}

async function importVehicleBrandsClient(rows) {
    const errors = [];
    let created = 0;

    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const rowNum = i + 1;
        const name = String(row.name || '').trim();
        if (!name) {
            errors.push({ row: rowNum, message: 'name is required.' });
            continue;
        }
        try {
            const est = row.established_year ? parseInt(row.established_year, 10) : null;
            await api.post(
                '/vehicle-branding',
                {
                    name,
                    description: row.description || '',
                    logo_url: row.logo_url || '',
                    country_of_origin: row.country_of_origin || '',
                    established_year: Number.isFinite(est) ? est : null,
                    website: row.website || ''
                },
                silent
            );
            created += 1;
        } catch (e) {
            const msg = e.response?.data?.message || e.message || 'Failed to create brand';
            errors.push({ row: rowNum, message: msg });
        }
    }

    return {
        success: true,
        summary: { total: rows.length, created, failed: errors.length },
        errors: errors.slice(0, 100)
    };
}

function num(v, def = 0) {
    if (v === undefined || v === null || v === '') return def;
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : def;
}

async function importVehiclesClient(rows) {
    const errors = [];
    let created = 0;

    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const rowNum = i + 1;
        if (!row.vin || !row.engine_number || !row.variant_id || !row.color_id || !row.year) {
            errors.push({
                row: rowNum,
                message: 'Missing required field(s): vin, engine_number, variant_id, color_id, year.'
            });
            continue;
        }
        if (!row.purchase_price || !row.selling_price) {
            errors.push({ row: rowNum, message: 'purchase_price and selling_price are required.' });
            continue;
        }
        try {
            const payload = {
                vin: String(row.vin).trim(),
                engineNumber: String(row.engine_number).trim(),
                variantId: parseInt(row.variant_id, 10),
                colorId: parseInt(row.color_id, 10),
                year: parseInt(row.year, 10),
                status: row.status || 'at_yard',
                conditionType: row.condition_type || 'new',
                mileage: num(row.mileage, 0),
                purchasePrice: num(row.purchase_price),
                sellingPrice: num(row.selling_price),
                location: row.location || 'Main Yard',
                warehouseId: row.warehouse_id ? String(row.warehouse_id) : '',
                arrivalDate: row.arrival_date || '',
                notes: row.notes || ''
            };
            await api.post('/vehicles', payload, silent);
            created += 1;
        } catch (e) {
            const msg = e.response?.data?.message || e.message || 'Failed to create vehicle';
            errors.push({ row: rowNum, message: msg });
        }
    }

    return {
        success: true,
        summary: { total: rows.length, created, failed: errors.length },
        errors: errors.slice(0, 100)
    };
}

async function importSalesOrdersClient(rows) {
    const errors = [];
    let created = 0;

    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const rowNum = i + 1;
        const customerId = row.customer_id;
        const vehicleId = row.vehicle_id;
        const vehiclePrice = num(row.vehicle_price);
        if (!customerId || !vehicleId) {
            errors.push({ row: rowNum, message: 'customer_id and vehicle_id are required.' });
            continue;
        }
        if (!vehiclePrice || vehiclePrice <= 0) {
            errors.push({ row: rowNum, message: 'vehicle_price must be greater than zero.' });
            continue;
        }
        try {
            const saleType = (row.sale_type || 'vehicle').toLowerCase();
            if (saleType !== 'vehicle') {
                errors.push({ row: rowNum, message: 'Only sale_type "vehicle" is supported in bulk import.' });
                continue;
            }

            const payload = {
                customerId: String(customerId),
                saleType: 'vehicle',
                vehicleId: String(vehicleId),
                partId: '',
                partQuantity: '1',
                vehiclePrice: String(vehiclePrice),
                accessoriesTotal: String(num(row.accessories_total)),
                discountAmount: String(num(row.discount_amount)),
                taxAmount: String(num(row.tax_amount)),
                registrationCharges: String(num(row.registration_charges)),
                insuranceCharges: String(num(row.insurance_charges)),
                otherCharges: String(num(row.other_charges)),
                paidAmount: String(num(row.paid_amount)),
                paymentMode: row.payment_mode || 'cash',
                financeCompany: row.finance_company || '',
                financeAmount: row.finance_amount ? String(num(row.finance_amount)) : '',
                exchangeVehicleDetails: row.exchange_vehicle_details || '',
                exchangeValue: String(num(row.exchange_value)),
                expectedDeliveryDate: row.expected_delivery_date || '',
                notes: row.notes || ''
            };

            await api.post('/sales/direct', payload, silent);
            created += 1;
        } catch (e) {
            const msg = e.response?.data?.message || e.message || 'Failed to create order';
            errors.push({ row: rowNum, message: msg });
        }
    }

    return {
        success: true,
        summary: { total: rows.length, created, failed: errors.length },
        errors: errors.slice(0, 100)
    };
}

/**
 * @param {string} templateType leads | vehicle-brands | vehicles | sales-orders
 * @param {File} file
 * @returns {Promise<{ success: boolean, summary: object, errors: array }>}
 */
export async function runClientBulkImport(templateType, file) {
    const rows = await parseBulkImportFile(file);
    if (rows.length === 0) {
        throw new Error('No data rows found after the header row.');
    }

    switch (templateType) {
        case 'leads':
            return importLeadsClient(rows);
        case 'vehicle-brands':
            return importVehicleBrandsClient(rows);
        case 'vehicles':
            return importVehiclesClient(rows);
        case 'sales-orders':
            return importSalesOrdersClient(rows);
        default:
            throw new Error('Unknown import type.');
    }
}
