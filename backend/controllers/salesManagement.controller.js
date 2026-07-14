/**
 * Sales Management Controller
 * Comprehensive CRUD operations for Quotations, Bookings, and Sales Orders
 * Created by LOGIXINVENTOR (PVT) Ltd.
 * info@logixinventor.com +92 333 3836851
 * www.logixinventor.com | AMS
 * Date: 2026-01-06
 */

const mongoose = require('mongoose');
const { query, pool } = require('../config/database');
const { AppError } = require('../middleware/errorHandler');
const logger = require('../utils/logger');
const SalesOrder = require('../models/SalesOrder.model');
const Vehicle = require('../models/Vehicle.model');
const Part = require('../models/Part.model');
const Customer = require('../models/Customer.model');

// ═══════════════════════════════════════════════════════════════════════════
// QUOTATIONS CONTROLLER
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get all quotations with filters
 */
/**
 * Get all quotations with filters
 */
const getAllQuotations = async (req, res, next) => {
    try {
        const {
            status, customerId, search,
            dateFrom, dateTo,
            sortBy = 'created_at', sortOrder = 'DESC',
            page = 1, limit = 20
        } = req.query;

        const offset = (parseInt(page) - 1) * parseInt(limit);

        let sql = 'SELECT * FROM vw_quotations_full WHERE 1=1';
        const params = [];

        if (status) { sql += ' AND status = ?'; params.push(status); }
        if (customerId) { sql += ' AND customer_id = ?'; params.push(customerId); }
        if (dateFrom) { sql += ' AND created_at >= ?'; params.push(dateFrom); }
        if (dateTo) { sql += ' AND created_at <= ?'; params.push(dateTo + ' 23:59:59'); }
        if (search) {
            sql += ' AND (quotation_number LIKE ? OR customer_name LIKE ? OR vehicle_full_name LIKE ?)';
            const searchPattern = `%${search}%`;
            params.push(searchPattern, searchPattern, searchPattern);
        }

        const countSql = sql.replace('SELECT *', 'SELECT COUNT(*) as total');

        // Sorting
        const validSortCols = ['created_at', 'total_amount', 'quotation_number', 'valid_until', 'status'];
        const sortCol = validSortCols.includes(sortBy) ? sortBy : 'created_at';
        const sortDir = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

        sql += ` ORDER BY ${sortCol} ${sortDir} LIMIT ? OFFSET ?`;
        params.push(parseInt(limit), offset);

        const [quotations, countResult] = await Promise.all([
            query(sql, params),
            query(countSql, params.slice(0, -2))
        ]);

        res.json({
            success: true,
            data: quotations,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: countResult[0]?.total || 0,
                totalPages: Math.ceil((countResult[0]?.total || 0) / parseInt(limit))
            }
        });
    } catch (error) {
        logger.error('Error fetching quotations:', error);
        next(error);
    }
};

/**
 * Get quotation by ID
 */
const getQuotationById = async (req, res, next) => {
    try {
        const quotations = await query('SELECT * FROM vw_quotations_full WHERE id = ?', [req.params.id]);
        if (quotations.length === 0) throw new AppError('Quotation not found', 404);
        res.json({ success: true, data: quotations[0] });
    } catch (error) {
        next(error);
    }
};

/**
 * Create quotation
 */
const createQuotation = async (req, res, next) => {
    try {
        const {
            customerId, leadId, opportunityId, saleType, vehicleVariantId, vehicleColorId,
            partId, partQuantity, vehiclePrice, discountAmount, discountPercentage, taxAmount,
            additionalCharges, validityDays, termsAndConditions, notes
        } = req.body;

        // Validate based on sale type
        if (saleType === 'parts') {
            if (!partId) {
                throw new AppError('Part is required for parts sales', 400);
            }
        } else {
            if (!vehicleVariantId || !vehiclePrice) {
                throw new AppError('Vehicle variant and price are required', 400);
            }
        }

        // Sanitize optional inputs to ensure proper NULL handling for foreign keys
        const sanitizeId = (id) => (id === '' || id === undefined || id === null) ? null : id;

        const result = await query(
            'CALL sp_create_quotation(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, @id, @num)',
            [customerId, sanitizeId(leadId), sanitizeId(opportunityId), saleType || 'vehicle',
                sanitizeId(vehicleVariantId), sanitizeId(vehicleColorId), sanitizeId(partId), partQuantity || 1,
                vehiclePrice || 0, discountAmount || 0, discountPercentage || 0, taxAmount || 0,
                additionalCharges || 0, validityDays || 7, termsAndConditions, notes, req.user.id]
        );

        const [{ quotationId, quotationNumber }] = await query('SELECT @id as quotationId, @num as quotationNumber');

        logger.info(`Quotation ${quotationNumber} created by user ${req.user.id}`);
        res.status(201).json({
            success: true,
            data: { id: quotationId, quotationNumber },
            message: 'Quotation created successfully'
        });
    } catch (error) {
        logger.error('Error creating quotation:', error);
        next(error);
    }
};

/**
 * Update quotation
 */
const updateQuotation = async (req, res, next) => {
    try {
        const {
            customerId, saleType, vehicleVariantId, vehicleColorId, partId, partQuantity,
            vehiclePrice, discountAmount, discountPercentage, taxAmount, additionalCharges,
            validityDays, status, termsAndConditions, notes
        } = req.body;

        // Sanitize optional inputs
        const sanitizeId = (id) => (id === '' || id === undefined || id === null) ? null : id;

        await query(
            'CALL sp_update_quotation(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [req.params.id, customerId, saleType, sanitizeId(vehicleVariantId), sanitizeId(vehicleColorId),
            sanitizeId(partId), partQuantity || 1, vehiclePrice,
                discountAmount, discountPercentage, taxAmount, additionalCharges,
                validityDays, status, termsAndConditions, notes, req.user.id]
        );

        logger.info(`Quotation ${req.params.id} updated by user ${req.user.id}`);
        res.json({ success: true, message: 'Quotation updated successfully' });
    } catch (error) {
        logger.error('Error updating quotation:', error);
        next(error);
    }
};

/**
 * Delete quotation
 */
const deleteQuotation = async (req, res, next) => {
    try {
        await query('CALL sp_delete_quotation(?, ?)', [req.params.id, req.user.id]);
        logger.info(`Quotation ${req.params.id} deleted by user ${req.user.id}`);
        res.json({ success: true, message: 'Quotation cancelled successfully' });
    } catch (error) {
        logger.error('Error deleting quotation:', error);
        next(error);
    }
};

/**
 * Update quotation status
 */
const updateQuotationStatus = async (req, res, next) => {
    try {
        const { status } = req.body;
        if (!status) throw new AppError('Status is required', 400);

        await query('UPDATE quotations SET status = ?, updated_at = NOW() WHERE id = ?', [status, req.params.id]);
        logger.info(`Quotation ${req.params.id} status updated to ${status}`);
        res.json({ success: true, message: 'Status updated successfully' });
    } catch (error) {
        next(error);
    }
};

/**
 * Convert quotation to booking
 */
const convertQuotationToBooking = async (req, res, next) => {
    try {
        const { bookingAmount, expectedDeliveryDate, priority, notes } = req.body;

        // Get quotation details
        const quotations = await query('SELECT * FROM quotations WHERE id = ?', [req.params.id]);
        if (quotations.length === 0) throw new AppError('Quotation not found', 404);
        const q = quotations[0];

        if (q.status === 'converted') throw new AppError('Quotation already converted', 400);
        if (!bookingAmount) throw new AppError('Booking amount is required', 400);

        // Sanitize optional inputs
        const sanitizeId = (id) => (id === '' || id === undefined || id === null) ? null : id;

        // Create booking
        await query(
            'CALL sp_create_booking(?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, @id, @num)',
            [q.id, q.customer_id, q.vehicle_variant_id, sanitizeId(q.vehicle_color_id),
                bookingAmount, q.total_amount, expectedDeliveryDate, priority || 'normal', notes, req.user.id]
        );

        const [{ bookingId, bookingNumber }] = await query('SELECT @id as bookingId, @num as bookingNumber');

        logger.info(`Quotation ${q.quotation_number} converted to booking ${bookingNumber}`);
        res.status(201).json({
            success: true,
            data: { id: bookingId, bookingNumber },
            message: 'Quotation converted to booking successfully'
        });
    } catch (error) {
        logger.error('Error converting quotation:', error);
        next(error);
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// BOOKINGS CONTROLLER
// ═══════════════════════════════════════════════════════════════════════════

const getAllBookings = async (req, res, next) => {
    try {
        const {
            status, customerId, priority, search,
            dateFrom, dateTo,
            sortBy = 'created_at', sortOrder = 'DESC',
            page = 1, limit = 20
        } = req.query;

        const offset = (parseInt(page) - 1) * parseInt(limit);

        let sql = 'SELECT * FROM vw_bookings_full WHERE 1=1';
        const params = [];

        if (status) { sql += ' AND status = ?'; params.push(status); }
        if (customerId) { sql += ' AND customer_id = ?'; params.push(customerId); }
        if (priority) { sql += ' AND priority = ?'; params.push(priority); }
        if (dateFrom) { sql += ' AND created_at >= ?'; params.push(dateFrom); }
        if (dateTo) { sql += ' AND created_at <= ?'; params.push(dateTo + ' 23:59:59'); }
        if (search) {
            sql += ' AND (booking_number LIKE ? OR customer_name LIKE ?)';
            params.push(`%${search}%`, `%${search}%`);
        }

        const countSql = sql.replace('SELECT *', 'SELECT COUNT(*) as total');

        // Sorting
        const validSortCols = ['created_at', 'booking_amount', 'total_amount', 'booking_number', 'expected_delivery_date', 'status'];
        const sortCol = validSortCols.includes(sortBy) ? sortBy : 'created_at';
        const sortDir = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

        sql += ` ORDER BY ${sortCol} ${sortDir} LIMIT ? OFFSET ?`;
        params.push(parseInt(limit), offset);

        const [bookings, countResult] = await Promise.all([
            query(sql, params),
            query(countSql, params.slice(0, -2))
        ]);

        res.json({
            success: true,
            data: bookings,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: countResult[0]?.total || 0,
                totalPages: Math.ceil((countResult[0]?.total || 0) / parseInt(limit))
            }
        });
    } catch (error) {
        next(error);
    }
};

const getBookingById = async (req, res, next) => {
    try {
        const bookings = await query('SELECT * FROM vw_bookings_full WHERE id = ?', [req.params.id]);
        if (bookings.length === 0) throw new AppError('Booking not found', 404);
        res.json({ success: true, data: bookings[0] });
    } catch (error) {
        next(error);
    }
};

const createBooking = async (req, res, next) => {
    try {
        const { quotationId, customerId, saleType, vehicleVariantId, vehicleColorId, vehicleId,
            partId, partQuantity, bookingAmount, totalAmount, expectedDeliveryDate, priority, notes } = req.body;

        // Validate based on sale type
        if (saleType === 'parts') {
            if (!customerId || !partId || !bookingAmount) {
                throw new AppError('Customer, part, and booking amount are required for parts sales', 400);
            }
        } else {
            if (!customerId || !vehicleVariantId || !bookingAmount) {
                throw new AppError('Customer, vehicle variant, and booking amount are required', 400);
            }
        }

        // Sanitize optional inputs
        const sanitizeId = (id) => (id === '' || id === undefined || id === null) ? null : id;

        await query(
            'CALL sp_create_booking(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, @id, @num)',
            [sanitizeId(quotationId), customerId, saleType || 'vehicle', sanitizeId(vehicleVariantId), sanitizeId(vehicleColorId),
            sanitizeId(vehicleId), sanitizeId(partId), partQuantity || 1,
                bookingAmount, totalAmount, sanitizeId(expectedDeliveryDate), priority || 'normal', notes, req.user.id]
        );

        const [{ bookingId, bookingNumber }] = await query('SELECT @id as bookingId, @num as bookingNumber');

        res.status(201).json({ success: true, data: { id: bookingId, bookingNumber } });
    } catch (error) {
        next(error);
    }
};

const updateBooking = async (req, res, next) => {
    try {
        const { customerId, saleType, vehicleVariantId, vehicleColorId, vehicleId, partId, partQuantity,
            bookingAmount, totalAmount, expectedDeliveryDate, status, priority, notes } = req.body;

        // Sanitize optional inputs
        const sanitizeId = (id) => (id === '' || id === undefined || id === null) ? null : id;

        await query('CALL sp_update_booking(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [req.params.id, customerId, saleType, sanitizeId(vehicleVariantId), sanitizeId(vehicleColorId),
            sanitizeId(vehicleId), sanitizeId(partId), partQuantity || 1, bookingAmount, totalAmount,
            sanitizeId(expectedDeliveryDate), status, priority, notes]);

        res.json({ success: true, message: 'Booking updated successfully' });
    } catch (error) {
        next(error);
    }
};

const deleteBooking = async (req, res, next) => {
    try {
        const { cancellationReason } = req.body;
        await query('CALL sp_delete_booking(?, ?, ?)', [req.params.id, cancellationReason, req.user.id]);
        res.json({ success: true, message: 'Booking cancelled successfully' });
    } catch (error) {
        next(error);
    }
};

const allocateVehicle = async (req, res, next) => {
    try {
        const { vehicleId } = req.body;
        if (!vehicleId) throw new AppError('Vehicle ID is required', 400);

        await query('UPDATE vehicles SET status = "allocated", allocated_to_order_id = ? WHERE id = ?',
            [req.params.id, vehicleId]);
        await query('UPDATE bookings SET vehicle_id = ?, status = "processing" WHERE id = ?',
            [vehicleId, req.params.id]);

        res.json({ success: true, message: 'Vehicle allocated successfully' });
    } catch (error) {
        next(error);
    }
};

const convertBookingToOrder = async (req, res, next) => {
    try {
        const { vehicleId, paidAmount, paymentMode, registrationCharges, insuranceCharges, notes } = req.body;

        const bookings = await query('SELECT * FROM bookings WHERE id = ?', [req.params.id]);
        if (bookings.length === 0) throw new AppError('Booking not found', 404);
        const b = bookings[0];

        if (!vehicleId && !b.vehicle_id) throw new AppError('Vehicle must be allocated first', 400);

        const sanitizeId = (id) => (id === '' || id === undefined || id === null) ? null : id;

        await query(
            'CALL sp_create_sales_order(?, ?, ?, ?, 0, 0, 0, ?, ?, 0, ?, ?, NULL, NULL, NULL, NULL, ?, ?, ?, NULL, @id, @num)',
            [b.id, b.customer_id, sanitizeId(vehicleId || b.vehicle_id), b.total_amount,
            registrationCharges || 0, insuranceCharges || 0, paidAmount || b.booking_amount,
            paymentMode || 'cash', b.expected_delivery_date, notes, req.user.id]
        );

        const [{ orderId, orderNumber }] = await query('SELECT @id as orderId, @num as orderNumber');

        res.status(201).json({ success: true, data: { id: orderId, orderNumber } });
    } catch (error) {
        next(error);
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// SALES ORDERS CONTROLLER
// ═══════════════════════════════════════════════════════════════════════════

const getAllSalesOrders = async (req, res, next) => {
    try {
        const {
            status, customerId, search,
            dateFrom, dateTo,
            sortBy = 'created_at', sortOrder = 'DESC',
            page = 1, limit = 20
        } = req.query;

        const offset = (parseInt(page) - 1) * parseInt(limit);

        let sql = 'SELECT * FROM vw_sales_orders_full WHERE 1=1';
        const params = [];

        if (status) { sql += ' AND status = ?'; params.push(status); }
        if (customerId) { sql += ' AND customer_id = ?'; params.push(customerId); }
        if (dateFrom) { sql += ' AND created_at >= ?'; params.push(dateFrom); }
        if (dateTo) { sql += ' AND created_at <= ?'; params.push(dateTo + ' 23:59:59'); }
        if (search) {
            sql += ' AND (order_number LIKE ? OR customer_name LIKE ? OR vin LIKE ?)';
            params.push(`%${search}%`, `%${search}%`, `%${search}%`);
        }

        const countSql = sql.replace('SELECT *', 'SELECT COUNT(*) as total');

        // Sorting
        const validSortCols = ['created_at', 'total_amount', 'paid_amount', 'order_number', 'status'];
        const sortCol = validSortCols.includes(sortBy) ? sortBy : 'created_at';
        const sortDir = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

        sql += ` ORDER BY ${sortCol} ${sortDir} LIMIT ? OFFSET ?`;
        params.push(parseInt(limit), offset);

        const [orders, countResult] = await Promise.all([
            query(sql, params),
            query(countSql, params.slice(0, -2))
        ]);

        res.json({
            success: true,
            data: orders,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: countResult[0]?.total || 0,
                totalPages: Math.ceil((countResult[0]?.total || 0) / parseInt(limit))
            }
        });
    } catch (error) {
        next(error);
    }
};

const getSalesOrderById = async (req, res, next) => {
    try {
        const orders = await query('SELECT * FROM vw_sales_orders_full WHERE id = ?', [req.params.id]);
        if (orders.length === 0) throw new AppError('Order not found', 404);
        res.json({ success: true, data: orders[0] });
    } catch (error) {
        next(error);
    }
};

const createSalesOrder = async (req, res, next) => {
    try {
        const { bookingId, customerId, saleType, vehicleId, partId, partQuantity, vehiclePrice, accessoriesTotal,
            discountAmount, taxAmount, registrationCharges, insuranceCharges,
            otherCharges, paidAmount, paymentMode, financeCompany, financeAmount,
            exchangeVehicleDetails, exchangeValue, expectedDeliveryDate, status, notes } = req.body;

        // Validate based on sale type
        if (saleType === 'parts') {
            if (!customerId || !partId) throw new AppError('Customer and part are required for parts sales', 400);
        } else {
            if (!customerId || !vehicleId) throw new AppError('Customer and vehicle are required', 400);
        }

        // Sanitize optional inputs
        const sanitizeId = (id) => (id === '' || id === undefined || id === null) ? null : id;

        await query(
            'CALL sp_create_sales_order(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, @id, @num)',
            [sanitizeId(bookingId), customerId, saleType || 'vehicle', sanitizeId(vehicleId), sanitizeId(partId), partQuantity || 1,
            vehiclePrice || 0, accessoriesTotal || 0,
            discountAmount || 0, taxAmount || 0, registrationCharges || 0, insuranceCharges || 0,
            otherCharges || 0, paidAmount || 0, paymentMode || 'cash', financeCompany, financeAmount,
                exchangeVehicleDetails, exchangeValue, sanitizeId(expectedDeliveryDate), notes, req.user.id]
        );

        const [{ orderId, orderNumber }] = await query('SELECT @id as orderId, @num as orderNumber');

        res.status(201).json({ success: true, data: { id: orderId, orderNumber } });
    } catch (error) {
        next(error);
    }
};

const updateSalesOrder = async (req, res, next) => {
    try {
        const { vehiclePrice, accessoriesTotal, discountAmount, taxAmount,
            registrationCharges, insuranceCharges, otherCharges, paidAmount,
            paymentMode, financeCompany, financeAmount, exchangeVehicleDetails,
            exchangeValue, status, expectedDeliveryDate, notes } = req.body;

        await query(
            'CALL sp_update_sales_order(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [req.params.id, vehiclePrice, accessoriesTotal || 0, discountAmount || 0, taxAmount || 0,
            registrationCharges || 0, insuranceCharges || 0, otherCharges || 0, paidAmount, paymentMode,
                financeCompany, financeAmount, exchangeVehicleDetails, exchangeValue,
                status, expectedDeliveryDate, notes, req.user.id]
        );

        res.json({ success: true, message: 'Order updated successfully' });
    } catch (error) {
        next(error);
    }
};

const deleteSalesOrder = async (req, res, next) => {
    try {
        await query('CALL sp_delete_sales_order(?, ?)', [req.params.id, req.user.id]);
        res.json({ success: true, message: 'Order cancelled successfully' });
    } catch (error) {
        next(error);
    }
};

const deliverSalesOrder = async (req, res, next) => {
    try {
        await query('CALL sp_deliver_sales_order(?, ?)', [req.params.id, req.user.id]);
        res.json({ success: true, message: 'Order delivered successfully' });
    } catch (error) {
        next(error);
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// STATISTICS
// ═══════════════════════════════════════════════════════════════════════════

const getSalesStats = async (req, res, next) => {
    try {
        const stats = await query('SELECT * FROM vw_sales_stats');
        res.json({ success: true, data: stats[0] || {} });
    } catch (error) {
        next(error);
    }
};

const getQuotationStats = async (req, res, next) => {
    try {
        const result = await query(`
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END) as draft,
                SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) as sent,
                SUM(CASE WHEN status = 'converted' THEN 1 ELSE 0 END) as converted,
                SUM(CASE WHEN valid_until < CURDATE() AND status NOT IN ('converted','cancelled') THEN 1 ELSE 0 END) as expired
            FROM quotations WHERE status != 'cancelled'
        `);
        res.json({ success: true, data: result[0] });
    } catch (error) {
        next(error);
    }
};

const getBookingStats = async (req, res, next) => {
    try {
        const result = await query(`
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
                SUM(CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END) as confirmed,
                SUM(CASE WHEN status = 'processing' THEN 1 ELSE 0 END) as processing,
                SUM(CASE WHEN status = 'ready' THEN 1 ELSE 0 END) as ready,
                COALESCE(SUM(booking_amount), 0) as totalCollected
            FROM bookings WHERE status != 'cancelled'
        `);
        res.json({ success: true, data: result[0] });
    } catch (error) {
        next(error);
    }
};

const getOrderStats = async (req, res, next) => {
    try {
        const result = await query(`
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END) as confirmed,
                SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) as delivered,
                COALESCE(SUM(total_amount), 0) as totalValue,
                COALESCE(SUM(paid_amount), 0) as totalPaid
            FROM sales_orders WHERE status != 'cancelled'
        `);
        res.json({ success: true, data: result[0] });
    } catch (error) {
        next(error);
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// DIRECT SALES ORDER (WITHOUT BOOKING)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create direct sales order (without booking)
 * @route POST /api/sales/direct
 */
const createDirectSalesOrder = async (req, res, next) => {
    try {
        const {
            customerId, saleType = 'vehicle', vehicleId, partId, partQuantity,
            vehiclePrice, accessoriesTotal,
            discountAmount, taxAmount, registrationCharges, insuranceCharges,
            otherCharges, paidAmount, paymentMode, financeCompany, financeAmount,
            exchangeVehicleDetails, exchangeValue, expectedDeliveryDate, notes
        } = req.body;

        if (!customerId) throw new AppError('Customer is required', 400);

        if (saleType === 'vehicle') {
            if (!vehicleId) throw new AppError('Vehicle is required for vehicle sales', 400);
            if (!vehiclePrice || vehiclePrice <= 0) throw new AppError('Valid vehicle price is required', 400);

            const vehicle = await Vehicle.findById(vehicleId);
            if (!vehicle) throw new AppError('Vehicle not found', 404);
            if (!['at_yard', 'in_transit'].includes(vehicle.status)) {
                throw new AppError(`Vehicle is not available (current status: ${vehicle.status})`, 400);
            }
        } else if (saleType === 'parts') {
            if (!partId) throw new AppError('Part is required for parts sales', 400);
            if (!partQuantity || partQuantity <= 0) throw new AppError('Valid quantity is required', 400);

            const part = await Part.findById(partId);
            if (!part) throw new AppError('Part not found', 404);
            if (part.currentStock < partQuantity) {
                throw new AppError(`Insufficient stock. Available: ${part.currentStock}`, 400);
            }
        } else {
            throw new AppError('Invalid sale type', 400);
        }

        const qty = Number(partQuantity) || 1;

        let basePrice;
        if (saleType === 'vehicle') {
            basePrice = Number(vehiclePrice);
        } else {
            const part = await Part.findById(partId);
            basePrice = Number(vehiclePrice) > 0
                ? Number(vehiclePrice)
                : (Number(part.sellingPrice || 0) * qty);
        }

        const accessories = Number(accessoriesTotal || 0);
        const discount = Number(discountAmount || 0);
        const tax = Number(taxAmount || 0);
        const registration = Number(registrationCharges || 0);
        const insurance = Number(insuranceCharges || 0);
        const other = Number(otherCharges || 0);
        const paid = Number(paidAmount || 0);
        const exchange = Number(exchangeValue || 0);
        const grandTotal = basePrice + accessories - discount + tax + registration + insurance + other - exchange;
        const balanceAmount = grandTotal - paid;

        const now = new Date();
        const year = now.getFullYear();
        const yearPrefix = `SO-${year}-`;
        const lastOrder = await SalesOrder.findOne({ orderNumber: { $regex: `^${yearPrefix}` } }).sort({ createdAt: -1 }).lean();
        let sequence = 1;
        if (lastOrder?.orderNumber) {
            const match = lastOrder.orderNumber.match(/SO-\d{4}-(\d+)/);
            if (match) sequence = parseInt(match[1], 10) + 1;
        }
        const orderNumber = `${yearPrefix}${String(sequence).padStart(6, '0')}`;

        const items = [];
        if (saleType === 'vehicle') {
            const vehicle = await Vehicle.findById(vehicleId);
            items.push({
                description: `${vehicle.make || ''} ${vehicle.model || ''} ${vehicle.year || ''}`.trim() || 'Vehicle',
                quantity: 1,
                unitPrice: basePrice,
                totalPrice: basePrice,
                type: 'vehicle'
            });
        } else {
            const part = await Part.findById(partId);
            items.push({
                description: part.partName || part.name || 'Part',
                quantity: qty,
                unitPrice: basePrice / qty,
                totalPrice: basePrice,
                type: 'parts'
            });
        }

        const salesOrder = await SalesOrder.create({
            orderNumber,
            customer: customerId,
            vehicle: saleType === 'vehicle' ? vehicleId : undefined,
            status: 'confirmed',
            subtotal: basePrice,
            taxAmount: tax,
            discountAmount: discount,
            totalAmount: grandTotal,
            paidAmount: paid,
            balanceAmount,
            orderDate: now,
            deliveryDate: expectedDeliveryDate || undefined,
            items,
            createdBy: req.user.id
        });

        if (saleType === 'parts') {
            await Part.findByIdAndUpdate(partId, { $inc: { currentStock: -qty } });
        }

        if (saleType === 'vehicle') {
            await Vehicle.findByIdAndUpdate(vehicleId, { status: 'sold' });
        }

        logger.info(`Direct sales order ${orderNumber} created by user ${req.user.id}`);
        res.status(201).json({
            success: true,
            data: { id: salesOrder._id, orderNumber },
            message: 'Sales order created successfully'
        });
    } catch (error) {
        logger.error('Error creating direct sales order:', error);
        next(error);
    }
};

/**
 * Update sales order status
 * @route PUT /api/sales/:id/status
 */
const updateSalesOrderStatus = async (req, res, next) => {
    try {
        const { status, notes } = req.body;
        const validStatuses = ['confirmed', 'invoiced', 'delivered', 'cancelled'];

        if (!status) throw new AppError('Status is required', 400);
        if (!validStatuses.includes(status)) {
            throw new AppError(`Invalid status. Must be one of: ${validStatuses.join(', ')}`, 400);
        }

        await query('CALL sp_update_sales_order_status(?, ?, ?, ?)',
            [req.params.id, status, req.user.id, notes || null]);

        logger.info(`Sales order ${req.params.id} status updated to ${status} by user ${req.user.id}`);
        res.json({ success: true, message: `Order status updated to ${status}` });
    } catch (error) {
        logger.error('Error updating order status:', error);
        next(error);
    }
};

/**
 * Generate invoice from sales order
 * @route POST /api/sales/:id/invoice
 */
const generateInvoiceFromOrder = async (req, res, next) => {
    try {
        const { dueDays } = req.body;

        await query('CALL sp_convert_sales_order_to_invoice(?, ?, ?, @invoice_id, @invoice_num)',
            [req.params.id, req.user.id, dueDays || 30]);

        const [{ invoiceId, invoiceNumber }] = await query(
            'SELECT @invoice_id as invoiceId, @invoice_num as invoiceNumber'
        );

        logger.info(`Invoice ${invoiceNumber} generated from order ${req.params.id} by user ${req.user.id}`);
        res.status(201).json({
            success: true,
            data: { id: invoiceId, invoiceNumber },
            message: 'Invoice generated successfully'
        });
    } catch (error) {
        logger.error('Error generating invoice from order:', error);
        next(error);
    }
};

/**
 * Get sales order history/audit trail
 * @route GET /api/sales/:id/history
 */
const getSalesOrderHistory = async (req, res, next) => {
    try {
        const history = await query('CALL sp_get_sales_order_history(?)', [req.params.id]);
        res.json({ success: true, data: history[0] || [] });
    } catch (error) {
        logger.error('Error fetching order history:', error);
        next(error);
    }
};

/**
 * Get all sales orders with invoice information
 * @route GET /api/sales/with-invoices
 */
const getSalesOrdersWithInvoices = async (req, res, next) => {
    try {
        const { status, customerId, search, page = 1, limit = 25 } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);

        let sql = `SELECT so.*, i.invoice_number, i.status as invoice_status, i.id as invoice_id 
                   FROM vw_sales_orders_full so 
                   LEFT JOIN invoices i ON so.id = i.sales_order_id 
                   WHERE 1=1`;
        const params = [];

        if (status) { sql += ' AND so.status = ?'; params.push(status); }
        if (customerId) { sql += ' AND so.customer_id = ?'; params.push(customerId); }
        if (search) {
            sql += ' AND (so.order_number LIKE ? OR so.customer_name LIKE ? OR so.vin LIKE ? OR i.invoice_number LIKE ?)';
            params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
        }

        const countSql = sql.replace(/SELECT .* FROM/s, 'SELECT COUNT(*) as total FROM');
        sql += ' ORDER BY so.created_at DESC LIMIT ? OFFSET ?';
        params.push(parseInt(limit), offset);

        const [orders, countResult] = await Promise.all([
            query(sql, params),
            query(countSql, params.slice(0, -2))
        ]);

        res.json({
            success: true,
            data: orders,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: countResult[0]?.total || 0,
                totalPages: Math.ceil((countResult[0]?.total || 0) / parseInt(limit))
            }
        });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    // Quotations
    getAllQuotations, getQuotationById, createQuotation, updateQuotation,
    deleteQuotation, updateQuotationStatus, convertQuotationToBooking, getQuotationStats,
    // Bookings
    getAllBookings, getBookingById, createBooking, updateBooking,
    deleteBooking, allocateVehicle, convertBookingToOrder, getBookingStats,
    // Sales Orders
    getAllSalesOrders, getSalesOrderById, createSalesOrder, updateSalesOrder,
    deleteSalesOrder, deliverSalesOrder, getOrderStats,
    // New Sales Order Endpoints
    createDirectSalesOrder, updateSalesOrderStatus, generateInvoiceFromOrder,
    getSalesOrderHistory, getSalesOrdersWithInvoices,
    // Stats
    getSalesStats
};

