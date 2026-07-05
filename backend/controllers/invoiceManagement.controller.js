/**
 * Invoice Management Controller
 * Comprehensive CRUD operations for Invoice Management
 * Created by LOGIXINVENTOR (PVT) Ltd.
 * info@logixinventor.com +92 333 3836851
 * www.logixinventor.com | AMS
 * Date: 2026-01-08
 */

const { query } = require('../config/database');
const { AppError } = require('../middleware/errorHandler');

// ═══════════════════════════════════════════════════════════════════════════
// INVOICE CRUD OPERATIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get all invoices with filters and pagination
 * @route GET /api/invoices
 */
const getAllInvoices = async (req, res, next) => {
    try {
        const {
            status, type, customerId, salesOrderId,
            dateFrom, dateTo, search,
            page = 1, limit = 20, sortBy = 'created_at', sortOrder = 'DESC'
        } = req.query;

        let sql = `SELECT * FROM vw_invoice_summary WHERE 1=1`;
        const params = [];

        // Apply filters
        if (status) {
            sql += ` AND status = ?`;
            params.push(status);
        }
        if (type) {
            sql += ` AND invoice_type = ?`;
            params.push(type);
        }
        if (customerId) {
            sql += ` AND customer_id = ?`;
            params.push(customerId);
        }
        if (salesOrderId) {
            sql += ` AND sales_order_id = ?`;
            params.push(salesOrderId);
        }
        if (dateFrom) {
            sql += ` AND invoice_date >= ?`;
            params.push(dateFrom);
        }
        if (dateTo) {
            sql += ` AND invoice_date <= ?`;
            params.push(dateTo);
        }
        if (search) {
            sql += ` AND (invoice_number LIKE ? OR customer_name LIKE ? OR order_number LIKE ?)`;
            const searchTerm = `%${search}%`;
            params.push(searchTerm, searchTerm, searchTerm);
        }

        // Get total count
        const countSql = sql.replace('SELECT * FROM vw_invoice_summary', 'SELECT COUNT(*) as total FROM vw_invoice_summary');
        const countResult = await query(countSql, params);
        const total = countResult[0]?.total || 0;

        // Add sorting and pagination
        const validSortColumns = ['invoice_number', 'invoice_date', 'due_date', 'total_amount', 'balance_amount', 'status', 'created_at'];
        const sortColumn = validSortColumns.includes(sortBy) ? sortBy : 'created_at';
        const order = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

        sql += ` ORDER BY ${sortColumn} ${order}`;
        sql += ` LIMIT ? OFFSET ?`;
        params.push(parseInt(limit), (parseInt(page) - 1) * parseInt(limit));

        const invoices = await query(sql, params);

        res.json({
            success: true,
            data: invoices,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / parseInt(limit))
            }
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Get invoice by ID with items and payments
 * @route GET /api/invoices/:id
 */
const getInvoiceById = async (req, res, next) => {
    try {
        const { id } = req.params;

        // Validate and parse ID - handle cases like "2:1" or other malformed IDs
        const invoiceId = parseInt(id, 10);
        if (isNaN(invoiceId) || invoiceId <= 0) {
            throw new AppError('Invalid invoice ID', 400);
        }

        // Get invoice with customer and order details
        const invoiceResult = await query(`
            SELECT 
                i.*,
                CONCAT(c.first_name, ' ', c.last_name) as customer_name,
                c.email as customer_email,
                c.phone as customer_phone,
                c.address as customer_address,
                c.city as customer_city,
                c.cnic_number as customer_cnic,
                c.company_name,
                c.company_ntn as customer_ntn,
                c.customer_type,
                so.order_number,
                jc.job_card_number,
                CONCAT(u.first_name, ' ', u.last_name) as created_by_name
            FROM invoices i
            LEFT JOIN customers c ON i.customer_id = c.id
            LEFT JOIN sales_orders so ON i.sales_order_id = so.id
            LEFT JOIN job_cards jc ON i.job_card_id = jc.id
            LEFT JOIN users u ON i.created_by = u.id
            WHERE i.id = ?
        `, [invoiceId]);

        if (invoiceResult.length === 0) {
            throw new AppError('Invoice not found', 404);
        }

        const invoice = invoiceResult[0];

        // Check if company details are missing (snapshot failed or old invoice)
        if (!invoice.company_name) {
            // 1. Try fetching from companies table (Primary source)
            let companyInfo = {};
            try {
                const companies = await query(`
                    SELECT 
                        company_name, address as company_address, phone as company_phone, 
                        email as company_email, tax_id as company_ntn, logo as company_logo
                    FROM companies 
                    WHERE is_active = TRUE 
                    ORDER BY id DESC LIMIT 1
                `);
                if (companies.length > 0) {
                    companyInfo = companies[0];
                }
            } catch (err) {
                console.warn('Could not fetch from companies table, falling back to settings', err.message);
            }

            // 2. Fallback to system_settings if no company found
            if (!companyInfo.company_name) {
                const companySettings = await query(`
                    SELECT 
                        MAX(CASE WHEN setting_key = 'company_name' THEN setting_value END) as company_name,
                        MAX(CASE WHEN setting_key = 'company_address' THEN setting_value END) as company_address,
                        MAX(CASE WHEN setting_key = 'company_phone' THEN setting_value END) as company_phone,
                        MAX(CASE WHEN setting_key = 'company_email' THEN setting_value END) as company_email,
                        MAX(CASE WHEN setting_key = 'company_ntn' THEN setting_value END) as company_ntn,
                        MAX(CASE WHEN setting_key = 'company_logo' THEN setting_value END) as company_logo
                    FROM system_settings 
                    WHERE setting_key IN ('company_name', 'company_address', 'company_phone', 'company_email', 'company_ntn', 'company_logo')
                `);
                companyInfo = companySettings[0] || {};
            }

            // Update invoice object with fetched details
            invoice.company_name = companyInfo.company_name || 'My Company';
            invoice.company_address = companyInfo.company_address || '';
            invoice.company_phone = companyInfo.company_phone || '';
            invoice.company_email = companyInfo.company_email || '';
            invoice.company_ntn = companyInfo.company_ntn || '';
            invoice.company_logo = companyInfo.company_logo || '';
        }

        // Get invoice items
        const items = await query(`
            SELECT 
                ii.*,
                t.name as tax_name,
                t.rate as tax_rate
            FROM invoice_items ii
            LEFT JOIN taxes t ON ii.tax_id = t.id
            WHERE ii.invoice_id = ?
            ORDER BY ii.id
        `, [invoiceId]);

        // Get payment history
        const payments = await query(`
            SELECT 
                p.*,
                pm.name as payment_method_name,
                CONCAT(u.first_name, ' ', u.last_name) as received_by_name
            FROM payments p
            LEFT JOIN payment_methods pm ON p.payment_method_id = pm.id
            LEFT JOIN users u ON p.received_by = u.id
            WHERE p.invoice_id = ?
            ORDER BY p.payment_date DESC
        `, [invoiceId]);

        res.json({
            success: true,
            data: {
                ...invoice,
                items,
                payments
            }
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Create new invoice manually
 * @route POST /api/invoices
 */
const createInvoice = async (req, res, next) => {
    try {
        const {
            invoiceType = 'sales',
            customerId,
            salesOrderId,
            jobCardId,
            dueDays = 30,
            subtotal = 0,
            discountAmount = 0,
            taxAmount = 0,
            notes,
            items = []
        } = req.body;

        if (!customerId) {
            throw new AppError('Customer ID is required', 400);
        }

        // Fetch Company Details for Snapshot
        let companyInfo = {};

        // 1. Try fetching from companies table (Primary source)
        try {
            const companies = await query(`
                SELECT 
                    company_name, address as company_address, phone as company_phone, 
                    email as company_email, tax_id as company_ntn, logo as company_logo
                FROM companies 
                WHERE is_active = TRUE 
                ORDER BY id DESC LIMIT 1
            `);
            if (companies.length > 0) {
                companyInfo = companies[0];
            }
        } catch (err) {
            console.warn('Could not fetch from companies table, falling back to settings', err.message);
        }

        // 2. Fallback to system_settings if no company found
        if (!companyInfo.company_name) {
            const companySettings = await query(`
                SELECT 
                    MAX(CASE WHEN setting_key = 'company_name' THEN setting_value END) as company_name,
                    MAX(CASE WHEN setting_key = 'company_address' THEN setting_value END) as company_address,
                    MAX(CASE WHEN setting_key = 'company_phone' THEN setting_value END) as company_phone,
                    MAX(CASE WHEN setting_key = 'company_email' THEN setting_value END) as company_email,
                    MAX(CASE WHEN setting_key = 'company_ntn' THEN setting_value END) as company_ntn,
                    MAX(CASE WHEN setting_key = 'company_logo' THEN setting_value END) as company_logo
                FROM system_settings 
                WHERE setting_key IN ('company_name', 'company_address', 'company_phone', 'company_email', 'company_ntn', 'company_logo')
            `);
            companyInfo = companySettings[0] || {};
        }

        // Safely parse numeric values with fallback to 0
        const safeParseFloat = (val) => {
            const parsed = parseFloat(val);
            return isNaN(parsed) ? 0 : parsed;
        };

        const parsedSubtotal = safeParseFloat(subtotal);
        const parsedDiscount = safeParseFloat(discountAmount);
        const parsedTax = safeParseFloat(taxAmount);
        const parsedDueDays = parseInt(dueDays) || 30;

        // Calculate subtotal from items if items are provided
        let calculatedSubtotal = parsedSubtotal;
        if (items.length > 0) {
            calculatedSubtotal = items.reduce((sum, item) => {
                const qty = parseInt(item.quantity) || 1;
                const price = safeParseFloat(item.unitPrice);
                return sum + (qty * price);
            }, 0);
        }

        // Calculate total
        const totalAmount = calculatedSubtotal - parsedDiscount + parsedTax;

        // Insert invoice (trigger will generate invoice number)
        // Updated to include company snapshot columns
        const result = await query(`
            INSERT INTO invoices (
                invoice_type, sales_order_id, job_card_id, customer_id,
                company_name, company_address, company_phone, company_email, company_ntn, company_logo,
                invoice_date, due_date, subtotal, discount_amount, tax_amount,
                total_amount, paid_amount, balance_amount, status, notes, created_by
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURDATE(), DATE_ADD(CURDATE(), INTERVAL ? DAY), ?, ?, ?, ?, 0, ?, 'draft', ?, ?)
        `, [
            invoiceType,
            salesOrderId || null,
            jobCardId || null,
            parseInt(customerId),
            companyInfo.company_name || 'My Company',
            companyInfo.company_address || '',
            companyInfo.company_phone || '',
            companyInfo.company_email || '',
            companyInfo.company_ntn || '',
            companyInfo.company_logo || '',
            parsedDueDays,
            calculatedSubtotal,
            parsedDiscount,
            parsedTax,
            totalAmount,
            totalAmount,
            notes || null,
            req.user.id
        ]);

        const invoiceId = result.insertId;

        // Get the generated invoice number
        const invoiceData = await query(`SELECT invoice_number FROM invoices WHERE id = ?`, [invoiceId]);

        // Add invoice items if provided
        if (items.length > 0) {
            for (const item of items) {
                const qty = parseInt(item.quantity) || 1;
                const unitPrice = safeParseFloat(item.unitPrice);
                const itemTaxAmount = safeParseFloat(item.taxAmount);
                const itemTotal = (qty * unitPrice) + itemTaxAmount;

                await query(`
                    INSERT INTO invoice_items (invoice_id, description, quantity, unit_price, tax_id, tax_amount, total)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                `, [
                    invoiceId,
                    item.description || 'Item',
                    qty,
                    unitPrice,
                    item.taxId || null,
                    itemTaxAmount,
                    itemTotal
                ]);
            }

            // Recalculate totals after adding items
            await query(`CALL sp_update_invoice_totals(?)`, [invoiceId]);
        }

        // Update customer outstanding balance (only if total > 0)
        if (totalAmount > 0) {
            await query(`
                UPDATE customers SET outstanding_balance = outstanding_balance + ? WHERE id = ?
            `, [totalAmount, parseInt(customerId)]);
        }

        res.status(201).json({
            success: true,
            message: 'Invoice created successfully',
            data: {
                id: invoiceId,
                invoice_number: invoiceData[0]?.invoice_number
            }
        });
    } catch (error) {
        next(error);
    }
};


/**
 * Create invoice from sales order
 * @route POST /api/invoices/from-sales-order
 */
const createFromSalesOrder = async (req, res, next) => {
    try {
        const { salesOrderId, dueDays = 30 } = req.body;

        if (!salesOrderId) {
            throw new AppError('Sales Order ID is required', 400);
        }

        // Check if invoice already exists for this sales order
        const existing = await query(`
            SELECT id, invoice_number FROM invoices WHERE sales_order_id = ? AND status != 'cancelled'
        `, [salesOrderId]);

        if (existing.length > 0) {
            throw new AppError(`Invoice ${existing[0].invoice_number} already exists for this sales order`, 400);
        }

        // Check sales order exists and is in valid status
        const orderCheck = await query(`
            SELECT id, status, customer_id FROM sales_orders WHERE id = ?
        `, [salesOrderId]);

        if (orderCheck.length === 0) {
            throw new AppError('Sales order not found', 404);
        }

        if (!['confirmed', 'pending'].includes(orderCheck[0].status)) {
            throw new AppError('Cannot create invoice for sales order in ' + orderCheck[0].status + ' status', 400);
        }

        // Call stored procedure to create invoice
        await query(`CALL sp_create_invoice_from_sales_order(?, ?, ?, @invoice_id, @invoice_number)`, [
            salesOrderId,
            req.user.id,
            dueDays
        ]);

        // Get the result
        const result = await query(`SELECT @invoice_id as id, @invoice_number as invoice_number`);

        res.status(201).json({
            success: true,
            message: 'Invoice created from sales order successfully',
            data: {
                id: result[0].id,
                invoice_number: result[0].invoice_number
            }
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Update invoice (draft status only)
 * @route PUT /api/invoices/:id
 */
const updateInvoice = async (req, res, next) => {
    try {
        const { id } = req.params;

        // Validate and parse ID
        const invoiceId = parseInt(id, 10);
        if (isNaN(invoiceId) || invoiceId <= 0) {
            throw new AppError('Invalid invoice ID', 400);
        }

        const {
            dueDays,
            discountAmount,
            taxAmount,
            notes,
            termsAndConditions
        } = req.body;

        // Check invoice exists and is in draft status
        const invoice = await query(`SELECT id, status, subtotal FROM invoices WHERE id = ?`, [invoiceId]);
        if (invoice.length === 0) {
            throw new AppError('Invoice not found', 404);
        }
        if (invoice[0].status !== 'draft') {
            throw new AppError('Can only update invoices in draft status', 400);
        }

        // Build update query dynamically
        const updates = [];
        const params = [];

        if (dueDays !== undefined) {
            updates.push('due_date = DATE_ADD(invoice_date, INTERVAL ? DAY)');
            params.push(dueDays);
        }
        if (discountAmount !== undefined) {
            updates.push('discount_amount = ?');
            params.push(discountAmount);
        }
        if (taxAmount !== undefined) {
            updates.push('tax_amount = ?');
            params.push(taxAmount);
        }
        if (notes !== undefined) {
            updates.push('notes = ?');
            params.push(notes);
        }
        if (termsAndConditions !== undefined) {
            updates.push('terms_and_conditions = ?');
            params.push(termsAndConditions);
        }

        if (updates.length === 0) {
            throw new AppError('No fields to update', 400);
        }

        // Add updated_at
        updates.push('updated_at = NOW()');
        params.push(invoiceId);

        await query(`UPDATE invoices SET ${updates.join(', ')} WHERE id = ?`, params);

        // Recalculate totals
        await query(`CALL sp_update_invoice_totals(?)`, [invoiceId]);

        res.json({
            success: true,
            message: 'Invoice updated successfully'
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Cancel/void invoice
 * @route DELETE /api/invoices/:id
 */
const deleteInvoice = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { reason } = req.body;

        // Validate and parse ID
        const invoiceId = parseInt(id, 10);
        if (isNaN(invoiceId) || invoiceId <= 0) {
            throw new AppError('Invalid invoice ID', 400);
        }

        // Check invoice exists
        const invoice = await query(`
            SELECT id, status, balance_amount, customer_id, sales_order_id 
            FROM invoices WHERE id = ?
        `, [invoiceId]);

        if (invoice.length === 0) {
            throw new AppError('Invoice not found', 404);
        }

        if (invoice[0].status === 'cancelled') {
            throw new AppError('Invoice is already cancelled', 400);
        }

        if (invoice[0].status === 'paid') {
            throw new AppError('Cannot cancel a paid invoice', 400);
        }

        // Update invoice status to cancelled
        await query(`
            UPDATE invoices 
            SET status = 'cancelled', notes = CONCAT(COALESCE(notes, ''), '\nCancelled: ', ?), updated_at = NOW()
            WHERE id = ?
        `, [reason || 'No reason provided', invoiceId]);

        // Revert customer outstanding balance
        await query(`
            UPDATE customers SET outstanding_balance = outstanding_balance - ? WHERE id = ?
        `, [invoice[0].balance_amount, invoice[0].customer_id]);

        // Revert sales order status if linked
        if (invoice[0].sales_order_id) {
            await query(`
                UPDATE sales_orders SET status = 'confirmed' WHERE id = ? AND status = 'invoiced'
            `, [invoice[0].sales_order_id]);
        }

        res.json({
            success: true,
            message: 'Invoice cancelled successfully'
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Update invoice status
 * @route PUT /api/invoices/:id/status
 */
const updateInvoiceStatus = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        // Check if status exists in statuses table
        const statusCheck = await query(`
            SELECT id FROM statuses WHERE name = ? AND (table_name = 'invoices' OR table_name IS NULL)
        `, [status]);

        if (statusCheck.length === 0 && !['draft', 'sent', 'partial', 'paid', 'overdue', 'cancelled'].includes(status)) {
            // Fallback to hardcoded check if master data fails, but ideally master data is the source
            throw new AppError('Invalid status', 400);
        }

        await query(`CALL sp_update_invoice_status(?, ?)`, [id, status]);

        res.json({
            success: true,
            message: 'Invoice status updated successfully'
        });
    } catch (error) {
        next(error);
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// INVOICE ITEMS MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Add invoice item
 * @route POST /api/invoices/:id/items
 */
const addInvoiceItem = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { description, quantity = 1, unitPrice, taxId } = req.body;

        if (!description || !unitPrice) {
            throw new AppError('Description and unit price are required', 400);
        }

        // Check invoice exists and is in draft status
        const invoice = await query(`SELECT id, status FROM invoices WHERE id = ?`, [id]);
        if (invoice.length === 0) {
            throw new AppError('Invoice not found', 404);
        }
        if (invoice[0].status !== 'draft') {
            throw new AppError('Can only add items to draft invoices', 400);
        }

        // Call stored procedure to add item
        await query(`CALL sp_add_invoice_item(?, ?, ?, ?, ?, @item_id)`, [
            id, description, quantity, unitPrice, taxId || null
        ]);

        const result = await query(`SELECT @item_id as id`);

        res.status(201).json({
            success: true,
            message: 'Item added successfully',
            data: { id: result[0].id }
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Update invoice item
 * @route PUT /api/invoices/:id/items/:itemId
 */
const updateInvoiceItem = async (req, res, next) => {
    try {
        const { id, itemId } = req.params;
        const { description, quantity, unitPrice, taxId } = req.body;

        // Check invoice exists and is in draft status
        const invoice = await query(`SELECT id, status FROM invoices WHERE id = ?`, [id]);
        if (invoice.length === 0) {
            throw new AppError('Invoice not found', 404);
        }
        if (invoice[0].status !== 'draft') {
            throw new AppError('Can only update items in draft invoices', 400);
        }

        // Call stored procedure to update item
        await query(`CALL sp_update_invoice_item(?, ?, ?, ?, ?)`, [
            itemId, description, quantity, unitPrice, taxId || null
        ]);

        res.json({
            success: true,
            message: 'Item updated successfully'
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Remove invoice item
 * @route DELETE /api/invoices/:id/items/:itemId
 */
const removeInvoiceItem = async (req, res, next) => {
    try {
        const { id, itemId } = req.params;

        // Check invoice exists and is in draft status
        const invoice = await query(`SELECT id, status FROM invoices WHERE id = ?`, [id]);
        if (invoice.length === 0) {
            throw new AppError('Invoice not found', 404);
        }
        if (invoice[0].status !== 'draft') {
            throw new AppError('Can only remove items from draft invoices', 400);
        }

        // Call stored procedure to delete item
        await query(`CALL sp_delete_invoice_item(?)`, [itemId]);

        res.json({
            success: true,
            message: 'Item removed successfully'
        });
    } catch (error) {
        next(error);
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// PAYMENT MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Record payment against invoice
 * @route POST /api/invoices/:id/payments
 */
const recordPayment = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { amount, paymentMethodId, referenceNumber, notes } = req.body;

        if (!amount || amount <= 0) {
            throw new AppError('Valid payment amount is required', 400);
        }
        if (!paymentMethodId) {
            throw new AppError('Payment method is required', 400);
        }

        // Call stored procedure to record payment
        await query(`CALL sp_record_invoice_payment(?, ?, ?, ?, ?, ?, @payment_id)`, [
            id, amount, paymentMethodId, referenceNumber || null, req.user.id, notes || null
        ]);

        const result = await query(`SELECT @payment_id as id`);

        res.status(201).json({
            success: true,
            message: 'Payment recorded successfully',
            data: { id: result[0].id }
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Get payment methods list
 * @route GET /api/invoices/payment-methods
 */
const getPaymentMethods = async (req, res, next) => {
    try {
        // Use GROUP BY to ensure uniqueness by name
        const methods = await query(`
            SELECT MIN(id) as id, name, MIN(type) as type 
            FROM payment_methods 
            WHERE is_active = TRUE 
            GROUP BY name 
            ORDER BY name
        `);

        res.json({
            success: true,
            data: methods
        });
    } catch (error) {
        next(error);
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// STATISTICS & REPORTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get invoice statistics
 * @route GET /api/invoices/stats
 */
const getInvoiceStats = async (req, res, next) => {
    try {
        const stats = await query(`SELECT * FROM vw_invoice_stats`);
        const aging = await query(`SELECT * FROM vw_invoice_aging`);

        res.json({
            success: true,
            data: {
                summary: stats[0] || {},
                aging: aging || []
            }
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Get QR code data for invoice
 * @route GET /api/invoices/:id/qr-data
 */
const getQRCodeData = async (req, res, next) => {
    try {
        const { id } = req.params;

        const result = await query(`
            SELECT fn_get_invoice_qr_data(?) as qr_data
        `, [id]);

        if (!result[0]?.qr_data) {
            throw new AppError('Invoice not found', 404);
        }

        res.json({
            success: true,
            data: {
                qr_data: result[0].qr_data
            }
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Send invoice (update status to sent)
 * @route POST /api/invoices/:id/send
 */
const sendInvoice = async (req, res, next) => {
    try {
        const { id } = req.params;

        // Check invoice exists and is in draft status
        const invoice = await query(`SELECT id, status, invoice_number FROM invoices WHERE id = ?`, [id]);
        if (invoice.length === 0) {
            throw new AppError('Invoice not found', 404);
        }
        if (invoice[0].status !== 'draft') {
            throw new AppError('Only draft invoices can be sent', 400);
        }

        // Call stored procedure to send invoice
        await query(`CALL sp_send_invoice(?, ?)`, [id, req.user.id]);

        res.json({
            success: true,
            message: `Invoice ${invoice[0].invoice_number} sent successfully`
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Get invoice history/audit trail
 * @route GET /api/invoices/:id/history
 */
const getInvoiceHistory = async (req, res, next) => {
    try {
        const { id } = req.params;

        const history = await query(`CALL sp_get_invoice_history(?)`, [id]);

        res.json({
            success: true,
            data: history[0] || []
        });
    } catch (error) {
        next(error);
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

module.exports = {
    getAllInvoices,
    getInvoiceById,
    createInvoice,
    createFromSalesOrder,
    updateInvoice,
    deleteInvoice,
    updateInvoiceStatus,
    addInvoiceItem,
    updateInvoiceItem,
    removeInvoiceItem,
    recordPayment,
    getPaymentMethods,
    getInvoiceStats,
    getQRCodeData,
    sendInvoice,
    getInvoiceHistory
};

