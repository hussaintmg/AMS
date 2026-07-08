/**
 * Bulk import (CSV / XLSX) for Customers (leads), Vehicle brands, Vehicles, Sales orders.
 */

const xlsx = require('xlsx');
const logger = require('../utils/logger');
const { AppError } = require('../middleware/errorHandler');
const { parseSpreadsheet } = require('../utils/bulkImport.parse');
const { query } = require('../config/database');
const { normalizePhone } = require('../utils/phone.util');
const Lead = require('../models/Lead.model');
const LeadSource = require('../models/LeadSource.model');

async function generateLeadNo() {
  const lastLead = await Lead.findOne({ leadNo: { $regex: /^LEAD-/ } }).sort({ createdAt: -1 }).lean();
  let nextNum = 1;
  if (lastLead && lastLead.leadNo) {
    const match = lastLead.leadNo.match(/LEAD-(\d+)/);
    if (match) nextNum = parseInt(match[1], 10) + 1;
  }
  return `LEAD-${String(nextNum).padStart(6, '0')}`;
}

const TEMPLATE_SPECS = {
    leads: {
        filename: 'ams_customers_import_template',
        comment:
            '# AMS Customer (Lead) bulk import. REQUIRED columns: first_name, last_name, phone. OPTIONAL: email, source_id, source (name), city, priority, status, interested_in, notes. Match "source" to Lead Sources name if source_id is empty.',
        headers: [
            'first_name*',
            'last_name*',
            'phone*',
            'email',
            'source_id',
            'source',
            'city',
            'priority',
            'status',
            'interested_in',
            'notes'
        ],
        sample: [
            'John',
            'Doe',
            '+923001234567',
            'john.doe@example.com',
            '',
            'Walk-in',
            'Karachi',
            'medium',
            'new',
            'SUV OMODA 5',
            'Imported row'
        ]
    },
    'vehicle-brands': {
        filename: 'ams_vehicle_brands_import_template',
        comment:
            '# AMS Vehicle Brand bulk import. REQUIRED: name. OPTIONAL: description, country_of_origin, established_year, website, logo_url, is_active (1/0/true/false).',
        headers: ['name*', 'description', 'country_of_origin', 'established_year', 'website', 'logo_url', 'is_active'],
        sample: ['Sample Motors', 'Demo brand row', 'Pakistan', '2020', 'https://example.com', '', '1']
    },
    vehicles: {
        filename: 'ams_vehicles_import_template',
        comment:
            '# AMS Vehicle inventory bulk import. REQUIRED: vin, engine_number, variant_id, color_id, year, purchase_price, selling_price. OPTIONAL: status, condition_type, mileage, warehouse_id, location, arrival_date (YYYY-MM-DD), notes. variant_id and color_id come from Vehicle Master / API lists.',
        headers: [
            'vin*',
            'engine_number*',
            'variant_id*',
            'color_id*',
            'year*',
            'purchase_price*',
            'selling_price*',
            'status',
            'condition_type',
            'mileage',
            'warehouse_id',
            'location',
            'arrival_date',
            'notes'
        ],
        sample: [
            'DEMO1VIN000000001',
            'DEMO1ENG00000001',
            '1',
            '1',
            String(new Date().getFullYear()),
            '1000000',
            '1150000',
            'at_yard',
            'new',
            '0',
            '',
            'Main Yard',
            '',
            'Template row — replace IDs with valid variant_id/color_id from your tenant.'
        ]
    },
    'sales-orders': {
        filename: 'ams_sales_orders_import_template',
        comment:
            '# AMS Direct Sales Order bulk import (vehicle line). REQUIRED: customer_id, vehicle_id, vehicle_price (>0). OPTIONAL: sale_type (vehicle), accessories_total, discount_amount, tax_amount, registration_charges, insurance_charges, other_charges, paid_amount, payment_mode, finance_company, finance_amount, exchange_vehicle_details, exchange_value, expected_delivery_date (YYYY-MM-DD), notes. Vehicle must be at_yard or in_transit.',
        headers: [
            'customer_id*',
            'vehicle_id*',
            'vehicle_price*',
            'accessories_total',
            'discount_amount',
            'tax_amount',
            'registration_charges',
            'insurance_charges',
            'other_charges',
            'paid_amount',
            'payment_mode',
            'notes'
        ],
        sample: [
            '1',
            '1',
            '2500000',
            '0',
            '0',
            '0',
            '0',
            '0',
            '0',
            '0',
            'cash',
            'Replace customer_id and vehicle_id with valid IDs from AMS.'
        ]
    }
};

function buildTemplateMatrix(spec) {
    return [[spec.comment], spec.headers, spec.sample];
}

async function resolveSourceId(row) {
  const sid = String(row.source_id || '').trim();
  if (sid && !Number.isNaN(parseInt(sid, 10))) {
    const source = await LeadSource.findById(sid).lean();
    if (source) return source._id;
  }
  const name = String(row.source || '').trim();
  if (!name) return null;
  const source = await LeadSource.findOne({ isActive: true, name: { $regex: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } }).lean();
  return source ? source._id : null;
}

exports.downloadTemplate = async (req, res, next) => {
    try {
        const { type } = req.params;
        const format = (req.query.format || 'csv').toLowerCase();
        const spec = TEMPLATE_SPECS[type];
        if (!spec) {
            return next(new AppError('Unknown template type', 400));
        }
        if (format !== 'csv' && format !== 'xlsx') {
            return next(new AppError('format must be csv or xlsx', 400));
        }

        const matrix = buildTemplateMatrix(spec);
        if (format === 'csv') {
            const lines = matrix.map((row) =>
                row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')
            );
            const body = lines.join('\r\n');
            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename="${spec.filename}.csv"`);
            return res.send('\uFEFF' + body);
        }

        const wb = xlsx.utils.book_new();
        const ws = xlsx.utils.aoa_to_sheet(matrix);
        xlsx.utils.book_append_sheet(wb, ws, 'Import');
        const buf = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
        res.setHeader(
            'Content-Type',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        );
        res.setHeader('Content-Disposition', `attachment; filename="${spec.filename}.xlsx"`);
        return res.send(Buffer.from(buf));
    } catch (err) {
        logger.error('downloadTemplate error', err);
        next(err);
    }
};

exports.importLeads = async (req, res, next) => {
    try {
        if (!req.file?.buffer) {
            return next(new AppError('No file uploaded', 400));
        }
        const { rows } = parseSpreadsheet(req.file.buffer, req.file.originalname);
        if (rows.length === 0) {
            return next(new AppError('No data rows found after the header row.', 400));
        }

        const errors = [];
        let created = 0;
        const userId = req.user.id;

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
                const sourceId = await resolveSourceId(row);
                const leadNo = await generateLeadNo();
                const leadData = {
                    leadNo,
                    customerName: `${first} ${last}`.trim(),
                    email: row.email || '',
                    phone: normalizePhone(phone),
                    source: sourceId,
                    status: row.status || '',
                    description: row.notes || '',
                    leadValue: row.budget_range ? parseFloat(row.budget_range) || 0 : 0,
                    assignedTo: userId,
                    createdBy: userId,
                    activities: [{ type: 'created', description: `Lead ${leadNo} created via import`, performedBy: userId, performedAt: new Date() }],
                };
                await Lead.create(leadData);
                created += 1;
            } catch (e) {
                logger.warn(`importLeads row ${rowNum}`, e);
                errors.push({
                    row: rowNum,
                    message: e.sqlMessage || e.message || 'Failed to create customer'
                });
            }
        }

        res.json({
            success: true,
            summary: { total: rows.length, created, failed: errors.length },
            errors: errors.slice(0, 100)
        });
    } catch (err) {
        if (err.message?.includes('Unsupported')) {
            return next(new AppError(err.message, 400));
        }
        next(err);
    }
};

exports.importVehicleBrands = async (req, res, next) => {
    try {
        if (!req.file?.buffer) {
            return next(new AppError('No file uploaded', 400));
        }
        const { rows } = parseSpreadsheet(req.file.buffer, req.file.originalname);
        if (rows.length === 0) {
            return next(new AppError('No data rows found after the header row.', 400));
        }

        const errors = [];
        let created = 0;
        const userId = req.user?.id || 1;

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const rowNum = i + 1;
            const name = String(row.name || '').trim();
            if (!name) {
                errors.push({ row: rowNum, message: 'name is required.' });
                continue;
            }
            try {
                const dupRows = await query(
                    'SELECT COUNT(*) as c FROM vehicle_brands WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) AND deleted_at IS NULL',
                    [name]
                );
                if (dupRows[0]?.c > 0) {
                    errors.push({ row: rowNum, message: `Brand "${name}" already exists (skipped).` });
                    continue;
                }

                let active = 1;
                if (row.is_active !== undefined && row.is_active !== '') {
                    const v = String(row.is_active).toLowerCase();
                    active = ['0', 'false', 'no'].includes(v) ? 0 : 1;
                }

                const est = row.established_year ? parseInt(row.established_year, 10) : null;
                await query(
                    `INSERT INTO vehicle_brands (
                        name, description, logo_url, country_of_origin,
                        established_year, website, is_active, created_by, updated_by
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        name,
                        row.description || null,
                        row.logo_url || null,
                        row.country_of_origin || null,
                        Number.isFinite(est) ? est : null,
                        row.website || null,
                        active,
                        userId,
                        userId
                    ]
                );
                created += 1;
            } catch (e) {
                errors.push({ row: rowNum, message: e.sqlMessage || e.message || 'Insert failed' });
            }
        }

        res.json({
            success: true,
            summary: { total: rows.length, created, failed: errors.length },
            errors: errors.slice(0, 100)
        });
    } catch (err) {
        if (err.message?.includes('Unsupported')) {
            return next(new AppError(err.message, 400));
        }
        next(err);
    }
};

exports.importVehicles = async (req, res, next) => {
    try {
        if (!req.file?.buffer) {
            return next(new AppError('No file uploaded', 400));
        }
        const { rows } = parseSpreadsheet(req.file.buffer, req.file.originalname);
        if (rows.length === 0) {
            return next(new AppError('No data rows found after the header row.', 400));
        }

        const errors = [];
        let created = 0;
        const userId = req.user.id;

        const sanitizeId = (id) => (id === '' || id === undefined || id === null ? null : parseInt(id, 10));
        const sanitizeDate = (date) => (date === '' || date === undefined || date === null ? null : date);
        const sanitizeInt = (val) => (val === '' || val === undefined || val === null ? 0 : parseInt(val, 10));
        const sanitizeFloat = (val) => (val === '' || val === undefined || val === null ? 0 : parseFloat(val));

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const rowNum = i + 1;
            const {
                vin,
                engine_number: engineNumber,
                variant_id: variantId,
                color_id: colorId,
                year
            } = row;
            if (!vin || !engineNumber || !variantId || !colorId || !year) {
                errors.push({
                    row: rowNum,
                    message:
                        'Missing required field(s): vin, engine_number, variant_id, color_id, year are required.'
                });
                continue;
            }
            if (!row.purchase_price || !row.selling_price) {
                errors.push({
                    row: rowNum,
                    message: 'purchase_price and selling_price are required.'
                });
                continue;
            }
            try {
                await query(
                    'CALL sp_create_vehicle(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, @id)',
                    [
                        String(vin).trim(),
                        String(engineNumber).trim(),
                        parseInt(variantId, 10),
                        parseInt(colorId, 10),
                        parseInt(year, 10),
                        row.status || 'at_yard',
                        row.condition_type || 'new',
                        sanitizeInt(row.mileage),
                        sanitizeFloat(row.purchase_price),
                        sanitizeFloat(row.selling_price),
                        row.location || 'Main Yard',
                        sanitizeId(row.warehouse_id),
                        sanitizeDate(row.arrival_date),
                        row.notes || '',
                        userId
                    ]
                );
                const result = await query('SELECT @id as vehicleId');
                if (!result[0]?.vehicleId) {
                    throw new Error('Vehicle creation returned no ID');
                }
                created += 1;
            } catch (e) {
                errors.push({ row: rowNum, message: e.sqlMessage || e.message || 'Create vehicle failed' });
            }
        }

        res.json({
            success: true,
            summary: { total: rows.length, created, failed: errors.length },
            errors: errors.slice(0, 100)
        });
    } catch (err) {
        if (err.message?.includes('Unsupported')) {
            return next(new AppError(err.message, 400));
        }
        next(err);
    }
};

exports.importSalesOrders = async (req, res, next) => {
    try {
        if (!req.file?.buffer) {
            return next(new AppError('No file uploaded', 400));
        }
        const { rows } = parseSpreadsheet(req.file.buffer, req.file.originalname);
        if (rows.length === 0) {
            return next(new AppError('No data rows found after the header row.', 400));
        }

        const errors = [];
        let created = 0;
        const userId = req.user.id;

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const rowNum = i + 1;
            const customerId = row.customer_id;
            const vehicleId = row.vehicle_id;
            const vehiclePrice = parseFloat(row.vehicle_price);
            if (!customerId || !vehicleId) {
                errors.push({
                    row: rowNum,
                    message: 'customer_id and vehicle_id are required.'
                });
                continue;
            }
            if (!vehiclePrice || vehiclePrice <= 0) {
                errors.push({ row: rowNum, message: 'vehicle_price must be greater than zero.' });
                continue;
            }
            try {
                const vehicles = await query('SELECT id, status FROM vehicles WHERE id = ?', [vehicleId]);
                if (vehicles.length === 0) {
                    errors.push({ row: rowNum, message: 'Vehicle not found.' });
                    continue;
                }
                if (!['at_yard', 'in_transit'].includes(vehicles[0].status)) {
                    errors.push({
                        row: rowNum,
                        message: `Vehicle not available for sale (status: ${vehicles[0].status}).`
                    });
                    continue;
                }

                const saleType = row.sale_type || 'vehicle';
                if (saleType !== 'vehicle') {
                    errors.push({
                        row: rowNum,
                        message: 'Only sale_type "vehicle" is supported in this bulk import.'
                    });
                    continue;
                }

                const procedureParams = [
                    customerId,
                    saleType,
                    vehicleId,
                    null,
                    1,
                    vehiclePrice,
                    parseFloat(row.accessories_total) || 0,
                    parseFloat(row.discount_amount) || 0,
                    parseFloat(row.tax_amount) || 0,
                    parseFloat(row.registration_charges) || 0,
                    parseFloat(row.insurance_charges) || 0,
                    parseFloat(row.other_charges) || 0,
                    parseFloat(row.paid_amount) || 0,
                    row.payment_mode || 'cash',
                    row.finance_company || null,
                    parseFloat(row.finance_amount) || 0,
                    row.exchange_vehicle_details || null,
                    parseFloat(row.exchange_value) || 0,
                    row.expected_delivery_date || null,
                    row.notes || null,
                    userId
                ];

                try {
                    await query(
                        'CALL sp_create_direct_sales_order(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, @id, @num)',
                        procedureParams
                    );
                } catch (spError) {
                    const isWrongArgCount = spError?.code === 'ER_SP_WRONG_NO_OF_ARGS' || spError?.errno === 1318;
                    if (!isWrongArgCount) throw spError;

                    await query(
                        'CALL sp_create_direct_sales_order(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, @id, @num)',
                        [
                            customerId,
                            vehicleId,
                            vehiclePrice,
                            parseFloat(row.accessories_total) || 0,
                            parseFloat(row.discount_amount) || 0,
                            parseFloat(row.tax_amount) || 0,
                            parseFloat(row.registration_charges) || 0,
                            parseFloat(row.insurance_charges) || 0,
                            parseFloat(row.other_charges) || 0,
                            parseFloat(row.paid_amount) || 0,
                            row.payment_mode || 'cash',
                            row.finance_company || null,
                            parseFloat(row.finance_amount) || 0,
                            row.exchange_vehicle_details || null,
                            parseFloat(row.exchange_value) || 0,
                            row.expected_delivery_date || null,
                            row.notes || null,
                            userId
                        ]
                    );
                }
                created += 1;
            } catch (e) {
                errors.push({ row: rowNum, message: e.sqlMessage || e.message || 'Order creation failed' });
            }
        }

        res.json({
            success: true,
            summary: { total: rows.length, created, failed: errors.length },
            errors: errors.slice(0, 100)
        });
    } catch (err) {
        if (err.message?.includes('Unsupported')) {
            return next(new AppError(err.message, 400));
        }
        next(err);
    }
};
