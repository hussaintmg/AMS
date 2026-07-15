/**
 * Uploader Controller
 * Handles processing of uploaded XLSX or CSV files for Order Forms
 * Maps data into existing ERP tables: leads, vehicles, sales_orders
 * Maintained by Hussain Developer
 * hussaintmerng@gmail.com | +92 319 1634446
 * AMS ERP
 * Date: 2026-03-13
 */

const logger = require('../utils/logger');
const { normalizePhone } = require('../utils/phone.util');
const xlsx = require('xlsx');
const csv = require('csv-parser');
const { Readable } = require('stream');
const { query, pool } = require('../config/database');
const crypto = require('crypto');

/**
 * Splits a full name into first_name and last_name
 * @param {string} fullName 
 * @returns {{ firstName: string, lastName: string }}
 */
function splitName(fullName) {
    if (!fullName || !fullName.trim()) return { firstName: 'Unknown', lastName: 'Customer' };
    const parts = fullName.trim().split(/\s+/);
    if (parts.length === 1) return { firstName: parts[0], lastName: '' };
    const lastName = parts.pop();
    const firstName = parts.join(' ');
    return { firstName, lastName };
}

/**
 * Generates a unique VIN-like identifier for uploaded vehicle records
 * @returns {string}
 */
function generateUploadVIN() {
    const prefix = 'UPL';
    const random = crypto.randomBytes(7).toString('hex').toUpperCase().substring(0, 14);
    return `${prefix}${random}`;
}

/**
 * Generates a unique engine number for uploaded vehicle records
 * @returns {string}
 */
function generateUploadEngineNumber() {
    const prefix = 'ENG';
    const random = crypto.randomBytes(6).toString('hex').toUpperCase().substring(0, 12);
    return `${prefix}${random}`;
}

/**
 * Handles processing of uploaded XLSX or CSV files for Order Forms.
 * Parses data and maps into existing ERP tables (leads, vehicles, sales_orders).
 * @route POST /api/uploader/order-form
 */
exports.uploadOrderForm = async (req, res, next) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'No file uploaded. Please upload a valid .xlsx or .csv file.'
            });
        }

        const buffer = req.file.buffer;
        const mimetype = req.file.mimetype;
        const extension = req.file.originalname.split('.').pop().toLowerCase();
        const userId = req.user?.id;

        let records = [];

        // ──────────────────────────────────────────────────────────────
        // PARSE XLSX
        // ──────────────────────────────────────────────────────────────
        if (extension === 'xlsx' || mimetype.includes('spreadsheetml')) {
            const workbook = xlsx.read(buffer, { type: 'buffer' });
            const sheetName = workbook.SheetNames[0];
            const rawData = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1 });

            // Headers on row 2 (index 1), data from row 3 (index 2)
            const dataRows = rawData.slice(2);

            for (const row of dataRows) {
                if (!row[1]) continue; // Skip empty rows (must have order_no at minimum)

                records.push({
                    s_no: row[0] || null,
                    order_no: String(row[1]).trim(),
                    order_date: row[2] ? String(row[2]).trim() : null,
                    ref_no: row[3] ? String(row[3]).trim() : null, // PBO No.
                    applicant: row[11] ? String(row[11]).trim() : null, // Customer Name
                    dob: row[13] ? String(row[13]).trim() : null,
                    customer_type: row[14] ? String(row[14]).trim() : null, // Client Category
                    bank: row[15] ? String(row[15]).trim() : null, // Financing Bank
                    cnic: row[16] ? String(row[16]).trim() : null,
                    ntn: row[17] ? String(row[17]).trim() : null,
                    phone: row[18] ? normalizePhone(String(row[18]).trim()) : null, // Mobile
                    alternate_phone: row[19] ? normalizePhone(String(row[19]).trim()) : null, // Landline No.
                    email: row[20] ? String(row[20]).trim() : null,
                    address: row[21] ? String(row[21]).trim() : null,
                    city: row[22] ? String(row[22]).trim() : null,
                    variant: row[24] ? String(row[24]).trim() : null, // Vehicle
                    model_year: row[25] ? parseInt(row[25]) : new Date().getFullYear(),
                    color: row[26] ? String(row[26]).trim() : null,
                    delivery_month: row[27] ? String(row[27]).trim() : null,
                    vin: row[28] ? String(row[28]).trim() : null, // Chassis No.
                    engine_no: row[29] ? String(row[29]).trim() : null, // Engine No.
                    ex_factory_price: parseFloat(row[31]) || 0,
                    tax_amount: parseFloat(row[32]) || 0,
                    freight_charges: parseFloat(row[33]) || 0,
                    discount: parseFloat(row[35]) || 0,
                    msrp: parseFloat(row[36]) || parseFloat(row[31]) || 0, // MSRP or Ex-Factory
                    grand_total: parseFloat(row[38]) || 0, // Total Receivable
                    on_booking: parseFloat(row[73]) || 0, // Total Amount Received
                    remaining_balance: parseFloat(row[76]) || 0, // Balance Amount
                    type: row[79] ? String(row[79]).trim() : null // Order Type
                });
            }
        }
        // ──────────────────────────────────────────────────────────────
        // PARSE CSV
        // ──────────────────────────────────────────────────────────────
        else if (extension === 'csv' || mimetype.includes('csv')) {
            const results = await new Promise((resolve, reject) => {
                const resultsArray = [];
                const stream = Readable.from(buffer.toString());
                stream
                    .pipe(csv())
                    .on('data', (data) => resultsArray.push(data))
                    .on('end', () => resolve(resultsArray))
                    .on('error', (error) => reject(error));
            });

            records = results.map(row => ({
                s_no: row['S. No.'] || null,
                order_no: (row['Order No.'] || '').trim(),
                order_date: row['Order Date'] || null,
                ref_no: (row['PBO No.'] || '').trim() || null,
                applicant: (row['Customer Name'] || '').trim() || null,
                dob: (row['DOB'] || '').trim() || null,
                customer_type: (row['Client Category'] || '').trim() || null,
                bank: (row['Financing Bank'] || '').trim() || null,
                cnic: (row['CNIC'] || '').trim() || null,
                ntn: (row['NTN'] || '').trim() || null,
                phone: (row['Mobile'] || '').trim() ? normalizePhone((row['Mobile'] || '').trim()) : null,
                alternate_phone: (row['Landline No.'] || '').trim() ? normalizePhone((row['Landline No.'] || '').trim()) : null,
                email: (row['Email'] || '').trim() || null,
                address: (row['Address'] || '').trim() || null,
                city: (row['City'] || '').trim() || null,
                variant: (row['Vehicle'] || '').trim() || null,
                model_year: parseInt(row['Model Year']) || new Date().getFullYear(),
                color: (row['Color'] || '').trim() || null,
                delivery_month: (row['Delivery Month'] || '').trim() || null,
                vin: (row['Chassis No.'] || '').trim() || null,
                engine_no: (row['Engine No.'] || '').trim() || null,
                ex_factory_price: parseFloat(row['Ex-Factory']) || 0,
                tax_amount: parseFloat(row['Advance Tax']) || 0,
                freight_charges: parseFloat(row['Freight Charges']) || 0,
                discount: parseFloat(row['Discount']) || 0,
                msrp: parseFloat(row['MSRP']) || parseFloat(row['Ex-Factory']) || 0,
                grand_total: parseFloat(row['Total Receivable']) || 0,
                on_booking: parseFloat(row['Total Amount Received']) || 0,
                remaining_balance: parseFloat(row['Balance Amount']) || 0,
                type: (row['Order Type'] || '').trim() || null
            })).filter(r => r.order_no);
        } else {
            return res.status(400).json({
                success: false,
                message: 'Unsupported file format. Please upload .xlsx or .csv'
            });
        }

        if (records.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No valid records found in the uploaded file.'
            });
        }

        // ──────────────────────────────────────────────────────────────
        // CREATE UPLOAD LOG ENTRY
        // ──────────────────────────────────────────────────────────────
        const [uploadResult] = await pool.query(
            `INSERT INTO of_order_uploads (filename, file_size, total_records, status, uploaded_by)
             VALUES (?, ?, ?, 'processing', ?)`,
            [req.file.originalname, req.file.size, records.length, userId]
        );
        const uploadId = uploadResult.insertId;

        // ──────────────────────────────────────────────────────────────
        // MAP AND INSERT INTO EXISTING ERP TABLES
        // leads, vehicles (via vehicle_variants + vehicle_colors), sales_orders
        // ──────────────────────────────────────────────────────────────
        const connection = await pool.getConnection();
        let insertedLeads = 0;
        let insertedVehicles = 0;
        let insertedSalesOrders = 0;
        let skippedOrders = 0;

        try {
            await connection.beginTransaction();

            // ── Ensure a default vehicle make exists for uploads ─────────
            let defaultMakeId = null;
            const [existingMake] = await connection.execute(
                "SELECT id FROM vehicle_makes WHERE LOWER(name) = 'uploaded' LIMIT 1"
            );
            if (existingMake.length > 0) {
                defaultMakeId = existingMake[0].id;
            } else {
                const [makeInsert] = await connection.execute(
                    "INSERT INTO vehicle_makes (name, country, is_active) VALUES ('Uploaded', 'Pakistan', 1)"
                );
                defaultMakeId = makeInsert.insertId;
            }

            for (const record of records) {
                // ── 0. Check for duplicate order (skip everything if exists) ──
                const orderNumber = String(record.order_no);
                const [existingOrder] = await connection.execute(
                    'SELECT id FROM sales_orders WHERE order_number = ? LIMIT 1',
                    [orderNumber]
                );

                if (existingOrder.length > 0) {
                    skippedOrders++;
                    continue;
                }

                // ── 1. Find or Create Lead ─────────────────────────
                let leadId = null;
                const { firstName, lastName } = splitName(record.applicant);
                const leadPhone = record.phone || '0000000000';

                // Try to find existing lead by phone
                const [existingLead] = await connection.execute(
                    'SELECT id FROM leads WHERE phone = ? LIMIT 1',
                    [leadPhone]
                );

                if (existingLead.length > 0) {
                    leadId = existingLead[0].id;
                } else {
                   // Correct Mapping: Customers (CSV) -> leads (AMS Table)
                // Using professional stored procedure sp_create_lead
                await connection.query(
                    'CALL sp_create_lead(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, @p_lead_id, @p_lead_num)',
                    [
                        firstName,
                        lastName,
                        record.email || null, // email
                        leadPhone,
                        record.alternate_phone || null, // alternate_phone
                        record.address || null, // address
                        record.city || null, // city
                        null, // state
                        null, // postal_code
                        null, // source_id
                        'new', // status
                        'medium', // priority
                        record.variant || null, // interested_in
                        null, // budget_range
                        `Imported from Order Form Upload (Batch #${uploadId}). DOB: ${record.dob || 'N/A'} | Client Category: ${record.customer_type || 'N/A'} | CNIC: ${record.cnic || 'N/A'} | NTN: ${record.ntn || 'N/A'}`, // notes
                        null, // assigned_to
                        userId // created_by
                    ]
                );

                const [[{ leadId: lid }]] = await connection.query('SELECT @p_lead_id as leadId');
                leadId = lid;
                insertedLeads++;
                }

                // ── 2. Find or Create Customer (needed for sales_orders) ──
                let customerId = null;
                const [existingCustomer] = await connection.execute(
                    'SELECT id FROM customers WHERE phone = ? LIMIT 1',
                    [leadPhone]
                );

                if (existingCustomer.length > 0) {
                    customerId = existingCustomer[0].id;
                } else {
                    // Using professional stored procedure sp_create_customer
                    // Format date_of_birth properly or send null
                    let dobFormatted = null;
                    if (record.dob) {
                        try {
                            const dParts = record.dob.split('-');
                            if (dParts.length === 3) {
                                const m = { 'Jan': '01', 'Feb': '02', 'Mar': '03', 'Apr': '04', 'May': '05', 'Jun': '06', 'Jul': '07', 'Aug': '08', 'Sep': '09', 'Oct': '10', 'Nov': '11', 'Dec': '12' }[dParts[1]] || '01';
                                dobFormatted = `${dParts[2]}-${m}-${dParts[0].padStart(2, '0')}`;
                            }
                        } catch (e) {}
                    }

                    await connection.query(
                        `CALL sp_create_customer(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, @p_customer_id, @p_customer_num)`,
                        [
                            firstName,
                            lastName,
                            record.email || null, // email
                            leadPhone,
                            record.alternate_phone || null, // alternate_phone
                            dobFormatted, // date_of_birth
                            null, // gender
                            record.cnic || null, // cnic_number
                            record.address || null, // address
                            record.city || null, // city
                            null, // state
                            null, // postal_code
                            'Pakistan', // country
                            (record.customer_type && record.customer_type.toLowerCase() === 'corporate') ? 'corporate' : 'individual', // customer_type
                            null, // company_name
                            record.ntn || null, // company_ntn
                            0, // credit_limit
                            userId // created_by
                        ]
                    );

                    const [[{ customerId: cid }]] = await connection.query('SELECT @p_customer_id as customerId');
                    customerId = cid;
                }

                // ── 3. Find or Create Vehicle ─────────────────────
                let vehicleId = null;
                const variantName = record.variant || 'Unknown Variant';
                const colorName = record.color || 'Default';
                const vehiclePrice = record.msrp || record.ex_factory_price || 0;

                // 3a. Find or create vehicle model
                let modelId = null;
                const [existingModel] = await connection.execute(
                    'SELECT id FROM vehicle_models WHERE LOWER(name) = LOWER(?) AND make_id = ? LIMIT 1',
                    [variantName, defaultMakeId]
                );
                if (existingModel.length > 0) {
                    modelId = existingModel[0].id;
                } else {
                    const [modelInsert] = await connection.execute(
                        `INSERT INTO vehicle_models (make_id, name, year, body_type, fuel_type, transmission, is_active)
                         VALUES (?, ?, ?, 'sedan', 'petrol', 'automatic', 1)`,
                        [defaultMakeId, variantName, new Date().getFullYear()]
                    );
                    modelId = modelInsert.insertId;
                }

                // 3b. Find or create vehicle variant
                let variantId = null;
                const [existingVariant] = await connection.execute(
                    'SELECT id FROM vehicle_variants WHERE model_id = ? AND LOWER(name) = LOWER(?) LIMIT 1',
                    [modelId, variantName]
                );
                if (existingVariant.length > 0) {
                    variantId = existingVariant[0].id;
                } else {
                    const [variantInsert] = await connection.execute(
                        `INSERT INTO vehicle_variants (model_id, name, base_price, is_active)
                         VALUES (?, ?, ?, 1)`,
                        [modelId, variantName, vehiclePrice]
                    );
                    variantId = variantInsert.insertId;
                }

                // 3c. Find or create vehicle color
                let colorId = null;
                const [existingColor] = await connection.execute(
                    'SELECT id FROM vehicle_colors WHERE LOWER(name) = LOWER(?) LIMIT 1',
                    [colorName]
                );
                if (existingColor.length > 0) {
                    colorId = existingColor[0].id;
                } else {
                    const [colorInsert] = await connection.execute(
                        `INSERT INTO vehicle_colors (name, is_active) VALUES (?, 1)`,
                        [colorName]
                    );
                    colorId = colorInsert.insertId;
                }

                // 3d. Create vehicle record using professional stored procedure sp_create_vehicle
                const vin = record.vin || generateUploadVIN();
                const engineNumber = record.engine_no || generateUploadEngineNumber();
                const modelYear = record.model_year || new Date().getFullYear();

                await connection.query(
                    'CALL sp_create_vehicle(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, @p_vehicle_id)',
                    [
                        vin,
                        engineNumber,
                        variantId,
                        colorId,
                        modelYear,
                        'at_yard', // status
                        'new', // condition_type
                        0, // mileage
                        record.ex_factory_price || 0, // purchase_price
                        vehiclePrice, // selling_price
                        'Main Yard', // location
                        null, // warehouse_id
                        null, // arrival_date
                        `Imported from Order Form Upload (Batch #${uploadId}). Variant: ${variantName}, Color: ${colorName}`, // notes
                        userId // created_by
                    ]
                );

                const [[{ vehicleId: vid }]] = await connection.query('SELECT @p_vehicle_id as vehicleId');
                vehicleId = vid;
                insertedVehicles++;

                // ── 4. Create Sales Order ─────────────────────────
                // Parse order date
                let orderDate = new Date().toISOString().split('T')[0]; // default to today
                if (record.order_date) {
                    try {
                        const parts = record.order_date.split('-');
                        if (parts.length === 3) {
                            const months = { 'Jan': '01', 'Feb': '02', 'Mar': '03', 'Apr': '04', 'May': '05', 'Jun': '06',
                                           'Jul': '07', 'Aug': '08', 'Sep': '09', 'Oct': '10', 'Nov': '11', 'Dec': '12' };
                            const day = parts[0].padStart(2, '0');
                            const month = months[parts[1]] || '01';
                            const year = parts[2];
                            orderDate = `${year}-${month}-${day}`;
                        }
                    } catch (e) {
                        // Keep default date
                    }
                }

                // Calculate totals
                const grandTotal = vehiclePrice;
                const paidAmount = record.on_booking || 0;
                const balanceAmount = grandTotal - paidAmount;

                // Determine payment mode from type
                let paymentMode = 'cash';
                if (record.bank) paymentMode = 'bank_finance';
                if (record.type && record.type.toLowerCase().includes('lease')) paymentMode = 'lease';

                const taxAmount = record.tax_amount || 0;
                const freightCharges = record.freight_charges || 0;
                const discountAmount = record.discount || 0;
                const grandTotalMapped = record.grand_total > 0 ? record.grand_total : grandTotal;

                // Using professional stored procedure sp_create_sales_order
                await connection.query(
                    'CALL sp_create_sales_order(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, @p_order_id, @p_order_num)',
                    [
                        null, // p_booking_id
                        customerId, // p_customer_id
                        vehicleId, // p_vehicle_id
                        vehiclePrice, // p_vehicle_price
                        0, // p_accessories_total
                        discountAmount, // p_discount_amount
                        taxAmount, // p_tax_amount
                        0, // p_registration_charges
                        0, // p_insurance_charges
                        freightCharges, // p_other_charges
                        grandTotalMapped, // p_grand_total
                        paidAmount, // p_paid_amount
                        paymentMode, // p_payment_mode
                        record.bank || null, // p_finance_company
                        0, // p_finance_amount
                        null, // p_exchange_vehicle_details
                        0, // p_exchange_value
                        null, // p_expected_delivery_date
                        `PBO No.: ${record.ref_no || 'N/A'} | Type: ${record.type || 'N/A'} | Delivery: ${record.delivery_month || 'N/A'} | Remaining Balance: ${record.remaining_balance || 0} | Upload #${uploadId}`, // p_notes
                        userId, // p_sales_executive_id
                        orderNumber // p_custom_order_number
                    ]
                );

                insertedSalesOrders++;
            }

            await connection.commit();

            // Update upload log with results
            await pool.query(
                `UPDATE of_order_uploads SET
                    inserted_leads = ?, inserted_vehicles = ?,
                    inserted_sales_orders = ?, skipped_orders = ?, status = 'completed'
                 WHERE id = ?`,
                [insertedLeads, insertedVehicles, insertedSalesOrders, skippedOrders, uploadId]
            );

        } catch (error) {
            await connection.rollback();

            // Update upload log with failure
            await pool.query(
                `UPDATE of_order_uploads SET status = 'failed', error_message = ? WHERE id = ?`,
                [error.message, uploadId]
            );

            throw error;
        } finally {
            connection.release();
        }

        logger.info(`Order form upload processed: ${req.file.originalname}. Leads: ${insertedLeads}, Vehicles: ${insertedVehicles}, Sales Orders: ${insertedSalesOrders}, Skipped: ${skippedOrders}`);

        res.status(200).json({
            success: true,
            message: `Successfully processed file. Created ${insertedLeads} leads, ${insertedVehicles} vehicles, ${insertedSalesOrders} sales orders.`,
            data: {
                uploadId,
                totalProcessed: records.length,
                insertedLeads,
                insertedVehicles,
                insertedSalesOrders,
                skippedOrders
            }
        });

    } catch (error) {
        logger.error('Error in uploadOrderForm:', error);
        next(error);
    }
};
