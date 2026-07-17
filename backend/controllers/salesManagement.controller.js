/**
 * Sales Management Controller (MongoDB)
 * Comprehensive CRUD operations for Quotations, Bookings, and Sales Orders.
 * Every document created for a customer is also written back to the
 * customer's document (salesSummary + salesHistory) and sales orders
 * automatically generate their invoice.
 * Maintained by Hussain Developer
 * hussaintmerng@gmail.com | +92 319 1634446
 * AMS ERP
 */

const mongoose = require('mongoose');
const { AppError } = require('../middleware/errorHandler');
const logger = require('../utils/logger');
const Quotation = require('../models/Quotation.model');
const Booking = require('../models/Booking.model');
const SalesOrder = require('../models/SalesOrder.model');
const Invoice = require('../models/Invoice.model');
const Payment = require('../models/Payment.model');
const Vehicle = require('../models/Vehicle.model');
const Part = require('../models/Part.model');
const ServiceType = require('../models/ServiceType.model');
const Customer = require('../models/Customer.model');
const { VehicleVariant, VehicleColor } = require('../models/VehicleMaster.model');
const { nextDocNumber } = require('../utils/docNumber');
const { recordCustomerActivity } = require('../utils/customerSync');
const { createInvoiceForOrder } = require('../utils/invoiceFactory');
const { sendTemplateEmail } = require('../services/emailSender.service');
const { canDo } = require('../utils/roleJobs');
const { allowedOwnerIds } = require('../utils/roleJobs');

// ═══════════════════════════════════════════════════════════════════════════
// SHARED HELPERS
// ═══════════════════════════════════════════════════════════════════════════

const sanitizeId = (id) => {
    if (id === '' || id === undefined || id === null) return null;
    return mongoose.Types.ObjectId.isValid(id) ? id : null;
};

const num = (v, fallback = 0) => {
    const parsed = Number(v);
    return Number.isFinite(parsed) ? parsed : fallback;
};

const customerName = (customer) => {
    if (!customer || typeof customer !== 'object') return '';
    const name = [customer.firstName, customer.lastName].filter(Boolean).join(' ');
    return name || customer.companyName || '';
};

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Resolve customer ids whose name/phone/code matches the search text. */
async function findCustomerIdsBySearch(search) {
    const regex = new RegExp(String(search).trim().split(/\s+/).map(escapeRegex).join('|'), 'i');
    const customers = await Customer.find({
        $or: [
            { firstName: regex }, { lastName: regex }, { companyName: regex },
            { phone: regex }, { email: regex }, { customerCode: regex },
        ],
    }).select('_id').limit(500).lean();
    return customers.map((c) => c._id);
}

function dateRangeFilter(dateFrom, dateTo) {
    const range = {};
    if (dateFrom) range.$gte = new Date(dateFrom);
    if (dateTo) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        range.$lte = end;
    }
    return Object.keys(range).length ? range : null;
}

/** Send a configured document email to the document's customer. */
async function sendCustomerDocumentEmail({ Model, id, usageKey, documentKey, buildDocument, userId }) {
    const document = await Model.findById(sanitizeId(id))
        .populate('customer', 'firstName lastName companyName email phone customerCode')
        .lean();
    if (!document) throw new AppError('Document not found', 404);
    if (!document.customer?.email) throw new AppError('The selected customer does not have an email address', 400);

    const result = await sendTemplateEmail({
        usageKey,
        to: document.customer.email,
        sentBy: userId,
        context: { customer: document.customer, [documentKey]: buildDocument(document) },
    });
    if (result.status !== 'sent') throw new AppError(result.errorMessage || 'Email could not be sent', 502);
    return { document, recipient: document.customer.email };
}

/**
 * Resolve a human readable line-item description for a sale.
 * `vehicleVariantId` may be a VehicleVariant (master data) id or an
 * inventory Vehicle id — the sales forms send either depending on source.
 */
async function resolveSaleItem({ saleType, vehicleVariantId, vehicleColorId, partId, serviceTypeId, partQuantity }) {
    const result = { description: '', variantId: null, colorId: null, vehicleId: null, partId: null, serviceTypeId: null, unitPrice: 0 };

    if (saleType === 'parts') {
        const part = await Part.findById(partId).lean();
        if (!part) throw new AppError('Part not found', 404);
        const qty = Math.max(1, num(partQuantity, 1));
        result.partId = part._id;
        result.unitPrice = num(part.sellingPrice);
        result.description = `${part.name || 'Part'}${part.partCode ? ` (${part.partCode})` : ''} x ${qty}`;
        return result;
    }

    if (saleType === 'service') {
        const service = await ServiceType.findOne({ _id: serviceTypeId, isActive: true }).lean();
        if (!service) throw new AppError('Active service is required', 400);
        result.serviceTypeId = service._id;
        result.unitPrice = num(service.basePrice);
        result.description = service.name || 'Service';
        return result;
    }

    const variant = vehicleVariantId ? await VehicleVariant.findById(vehicleVariantId).populate({
        path: 'model_id',
        select: 'name make_id',
        populate: { path: 'make_id', select: 'name' },
    }).lean() : null;

    if (variant) {
        result.variantId = variant._id;
        result.unitPrice = num(variant.base_price);
        const makeName = variant.model_id?.make_id?.name || '';
        const modelName = variant.model_id?.name || '';
        let colorName = '';
        if (vehicleColorId) {
            const color = await VehicleColor.findById(vehicleColorId).select('name').lean();
            if (color) { result.colorId = color._id; colorName = color.name; }
        }
        result.description = [makeName, modelName, variant.name, colorName ? `(${colorName})` : ''].filter(Boolean).join(' ');
        return result;
    }

    const vehicle = vehicleVariantId ? await Vehicle.findById(vehicleVariantId).lean() : null;
    if (vehicle) {
        result.vehicleId = vehicle._id;
        result.unitPrice = num(vehicle.salePrice);
        result.description = [
            vehicle.make?.name, vehicle.model?.name, vehicle.variant?.name,
            vehicle.color?.name ? `(${vehicle.color.name})` : '',
        ].filter(Boolean).join(' ') || vehicle.vin || 'Vehicle';
        return result;
    }

    throw new AppError('Vehicle not found', 404);
}

async function requireCustomer(customerId) {
    if (!sanitizeId(customerId)) throw new AppError('Customer is required', 400);
    const customer = await Customer.findOne({ _id: customerId, deletedAt: null }).lean();
    if (!customer) throw new AppError('Customer not found', 404);
    return customer;
}

// ═══════════════════════════════════════════════════════════════════════════
// QUOTATIONS
// ═══════════════════════════════════════════════════════════════════════════

const mapQuotation = (q) => ({
    id: q._id,
    quotation_number: q.quotationNumber,
    customer_id: q.customer?._id || q.customer || null,
    customer_name: customerName(q.customer),
    sale_type: q.saleType || 'vehicle',
    vehicle_variant_id: q.vehicleVariant || q.vehicle || null,
    vehicle_color_id: q.vehicleColor || null,
    part_id: q.part?._id || q.part || null,
    service_type_id: q.serviceType?._id || q.serviceType || null,
    part_quantity: q.partQuantity || 1,
    item_name: q.items?.[0]?.description || '',
    vehicle_full_name: q.items?.[0]?.description || '',
    vehicle_price: q.vehiclePrice || 0,
    discount_amount: q.discountAmount || 0,
    discount_percentage: q.discountPercentage || 0,
    tax_amount: q.taxAmount || 0,
    additional_charges: q.additionalCharges || 0,
    total_amount: q.totalAmount || 0,
    validity_days: q.validityDays || 7,
    valid_until: q.validUntil || null,
    status: q.status || 'draft',
    notes: q.notes || '',
    terms_and_conditions: q.termsAndConditions || '',
    created_at: q.createdAt,
    updated_at: q.updatedAt,
});

const QUOTATION_SORT = {
    created_at: 'createdAt', total_amount: 'totalAmount',
    quotation_number: 'quotationNumber', valid_until: 'validUntil', status: 'status',
};

const getAllQuotations = async (req, res, next) => {
    try {
        const {
            status, customerId, search, dateFrom, dateTo,
            sortBy = 'created_at', sortOrder = 'DESC', page = 1, limit = 20,
        } = req.query;

        const filter = { status: { $ne: 'cancelled' } };
        const quotationOwnerIds = await allowedOwnerIds(req.user, 'quotations');
        if (quotationOwnerIds !== null) filter.createdBy = { $in: quotationOwnerIds };
        if (status) filter.status = status;
        if (sanitizeId(customerId)) filter.customer = customerId;
        const range = dateRangeFilter(dateFrom, dateTo);
        if (range) filter.createdAt = range;
        if (search) {
            const regex = new RegExp(String(search).trim().split(/\s+/).map(escapeRegex).join('|'), 'i');
            const customerIds = await findCustomerIdsBySearch(search);
            filter.$or = [
                { quotationNumber: regex },
                { 'items.description': regex },
                ...(customerIds.length ? [{ customer: { $in: customerIds } }] : []),
            ];
        }

        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
        const sortField = QUOTATION_SORT[sortBy] || 'createdAt';
        const sortDir = String(sortOrder).toUpperCase() === 'ASC' ? 1 : -1;

        const [quotations, total] = await Promise.all([
            Quotation.find(filter)
                .populate('customer', 'firstName lastName companyName phone customerCode')
                .sort({ [sortField]: sortDir })
                .skip((pageNum - 1) * limitNum)
                .limit(limitNum)
                .lean(),
            Quotation.countDocuments(filter),
        ]);

        res.json({
            success: true,
            data: quotations.map(mapQuotation),
            pagination: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum) },
        });
    } catch (error) {
        logger.error('Error fetching quotations:', error);
        next(error);
    }
};

const getQuotationById = async (req, res, next) => {
    try {
        const quotation = await Quotation.findById(req.params.id)
            .populate('customer', 'firstName lastName companyName phone customerCode')
            .lean();
        if (!quotation) throw new AppError('Quotation not found', 404);
        res.json({ success: true, data: mapQuotation(quotation) });
    } catch (error) {
        next(error);
    }
};

const sendQuotationEmail = async (req, res, next) => {
    try {
        const { document, recipient } = await sendCustomerDocumentEmail({
            Model: Quotation, id: req.params.id, usageKey: 'quotation_customer', documentKey: 'quotation', userId: req.user.id,
            buildDocument: (quote) => ({ number: quote.quotationNumber, date: quote.createdAt, validUntil: quote.validUntil, amount: quote.totalAmount, status: quote.status }),
        });
        res.json({ success: true, message: `Quotation ${document.quotationNumber} emailed to ${recipient}` });
    } catch (error) { next(error); }
};

const quotationTotals = (body) => {
    const vehiclePrice = num(body.vehiclePrice);
    const discountAmount = num(body.discountAmount);
    const taxAmount = num(body.taxAmount);
    const additionalCharges = num(body.additionalCharges);
    return {
        vehiclePrice, discountAmount, taxAmount, additionalCharges,
        totalAmount: vehiclePrice - discountAmount + taxAmount + additionalCharges,
    };
};

const createQuotation = async (req, res, next) => {
    try {
        const {
            customerId, leadId, saleType, vehicleVariantId, vehicleColorId,
            partId, serviceTypeId, partQuantity, discountPercentage, validityDays, termsAndConditions, notes,
        } = req.body;

        if (saleType === 'service') throw new AppError('Services are managed from Service Management', 400);

        if (saleType === 'parts') {
            if (!sanitizeId(partId)) throw new AppError('Part is required for parts sales', 400);
        } else if (saleType === 'service') {
            if (!sanitizeId(serviceTypeId)) throw new AppError('Service is required for service sales', 400);
        } else if (!sanitizeId(vehicleVariantId) || !num(req.body.vehiclePrice)) {
            throw new AppError('Vehicle variant and price are required', 400);
        }

        const customer = await requireCustomer(customerId);
        const item = await resolveSaleItem({ saleType, vehicleVariantId, vehicleColorId, partId, serviceTypeId, partQuantity });

        const totals = quotationTotals(req.body);
        if (!totals.vehiclePrice && item.unitPrice) {
            const qty = ['parts', 'service'].includes(saleType) ? Math.max(1, num(partQuantity, 1)) : 1;
            totals.vehiclePrice = item.unitPrice * qty;
            totals.totalAmount = totals.vehiclePrice - totals.discountAmount + totals.taxAmount + totals.additionalCharges;
        }

        const qty = ['parts', 'service'].includes(saleType) ? Math.max(1, num(partQuantity, 1)) : 1;
        const quotationNumber = await nextDocNumber(Quotation, 'quotationNumber', 'QT');
        const validity = Math.max(1, num(validityDays, 7));

        const quotation = await Quotation.create({
            quotationNumber,
            customer: customer._id,
            lead: sanitizeId(leadId),
            vehicle: item.vehicleId,
            saleType: ['parts', 'service'].includes(saleType) ? saleType : 'vehicle',
            vehicleVariant: item.variantId,
            vehicleColor: item.colorId,
            part: item.partId,
            serviceType: item.serviceTypeId,
            partQuantity: qty,
            status: 'draft',
            ...totals,
            discountPercentage: num(discountPercentage),
            validityDays: validity,
            validUntil: new Date(Date.now() + validity * 24 * 60 * 60 * 1000),
            items: [{
                description: item.description,
                quantity: qty,
                unitPrice: qty ? totals.vehiclePrice / qty : totals.vehiclePrice,
                totalPrice: totals.vehiclePrice,
                type: ['parts', 'service'].includes(saleType) ? saleType : 'vehicle',
            }],
            termsAndConditions,
            notes,
            createdBy: req.user.id,
        });

        await recordCustomerActivity({
            customerId: customer._id,
            docType: 'quotation',
            docId: quotation._id,
            number: quotationNumber,
            amount: totals.totalAmount,
            description: `Quotation ${quotationNumber} — ${item.description}`,
            userId: req.user.id,
        });

        logger.info(`Quotation ${quotationNumber} created by user ${req.user.id}`);
        res.status(201).json({
            success: true,
            data: { id: quotation._id, quotationNumber },
            message: 'Quotation created successfully',
        });
    } catch (error) {
        logger.error('Error creating quotation:', error);
        next(error);
    }
};

const updateQuotation = async (req, res, next) => {
    try {
        const quotation = await Quotation.findById(req.params.id);
        if (!quotation) throw new AppError('Quotation not found', 404);
        if (quotation.status === 'converted') throw new AppError('Converted quotations cannot be edited', 400);

        const {
            customerId, saleType, vehicleVariantId, vehicleColorId, partId, serviceTypeId, partQuantity,
            discountPercentage, validityDays, status, termsAndConditions, notes,
        } = req.body;

        if (saleType === 'service' || (!saleType && quotation.saleType === 'service')) {
            throw new AppError('Services are managed from Service Management', 400);
        }

        if (sanitizeId(customerId)) {
            const customer = await requireCustomer(customerId);
            quotation.customer = customer._id;
        }

        const effectiveSaleType = ['parts', 'service'].includes(saleType) ? saleType : 'vehicle';
        const item = await resolveSaleItem({
            saleType: effectiveSaleType,
            vehicleVariantId: sanitizeId(vehicleVariantId) || quotation.vehicleVariant || quotation.vehicle,
            vehicleColorId: sanitizeId(vehicleColorId),
            partId: sanitizeId(partId) || quotation.part,
            serviceTypeId: sanitizeId(serviceTypeId) || quotation.serviceType,
            partQuantity,
        });

        const totals = quotationTotals(req.body);
        const qty = ['parts', 'service'].includes(effectiveSaleType) ? Math.max(1, num(partQuantity, 1)) : 1;
        const validity = Math.max(1, num(validityDays, quotation.validityDays || 7));

        Object.assign(quotation, {
            saleType: effectiveSaleType,
            vehicleVariant: item.variantId,
            vehicleColor: item.colorId,
            vehicle: item.vehicleId,
            part: item.partId,
            serviceType: item.serviceTypeId,
            partQuantity: qty,
            ...totals,
            discountPercentage: num(discountPercentage, quotation.discountPercentage),
            validityDays: validity,
            validUntil: new Date(quotation.createdAt.getTime() + validity * 24 * 60 * 60 * 1000),
            items: [{
                description: item.description,
                quantity: qty,
                unitPrice: qty ? totals.vehiclePrice / qty : totals.vehiclePrice,
                totalPrice: totals.vehiclePrice,
                type: effectiveSaleType,
            }],
            ...(status ? { status } : {}),
            termsAndConditions: termsAndConditions !== undefined ? termsAndConditions : quotation.termsAndConditions,
            notes: notes !== undefined ? notes : quotation.notes,
            updatedBy: req.user.id,
        });
        await quotation.save();

        logger.info(`Quotation ${req.params.id} updated by user ${req.user.id}`);
        res.json({ success: true, message: 'Quotation updated successfully' });
    } catch (error) {
        logger.error('Error updating quotation:', error);
        next(error);
    }
};

const deleteQuotation = async (req, res, next) => {
    try {
        const quotation = await Quotation.findById(req.params.id);
        if (!quotation) throw new AppError('Quotation not found', 404);
        if (quotation.status === 'converted') throw new AppError('Converted quotations cannot be deleted', 400);

        quotation.status = 'cancelled';
        quotation.cancelledAt = new Date();
        quotation.updatedBy = req.user.id;
        await quotation.save();

        logger.info(`Quotation ${req.params.id} cancelled by user ${req.user.id}`);
        res.json({ success: true, message: 'Quotation cancelled successfully' });
    } catch (error) {
        logger.error('Error deleting quotation:', error);
        next(error);
    }
};

const updateQuotationStatus = async (req, res, next) => {
    try {
        const { status } = req.body;
        if (!status) throw new AppError('Status is required', 400);

        const quotation = await Quotation.findByIdAndUpdate(
            req.params.id,
            { status, updatedBy: req.user.id },
            { new: true },
        );
        if (!quotation) throw new AppError('Quotation not found', 404);

        logger.info(`Quotation ${req.params.id} status updated to ${status}`);
        res.json({ success: true, message: 'Status updated successfully' });
    } catch (error) {
        next(error);
    }
};

const convertQuotationToBooking = async (req, res, next) => {
    try {
        const { bookingAmount, expectedDeliveryDate, priority, notes } = req.body;

        const quotation = await Quotation.findById(req.params.id).populate('customer', 'firstName lastName companyName');
        if (!quotation) throw new AppError('Quotation not found', 404);
        if (quotation.status === 'converted') throw new AppError('Quotation already converted', 400);
        if (quotation.saleType === 'service') throw new AppError('Services are managed from Service Management', 400);
        if (!num(bookingAmount)) throw new AppError('Booking amount is required', 400);

        const bookingNumber = await nextDocNumber(Booking, 'bookingNumber', 'BK');
        const booking = await Booking.create({
            bookingNumber,
            quotation: quotation._id,
            customer: quotation.customer?._id || quotation.customer,
            vehicle: quotation.vehicle,
            saleType: quotation.saleType,
            vehicleVariant: quotation.vehicleVariant,
            vehicleColor: quotation.vehicleColor,
            part: quotation.part,
            serviceType: quotation.serviceType,
            partQuantity: quotation.partQuantity,
            itemDescription: quotation.items?.[0]?.description || '',
            status: 'pending',
            priority: priority || 'normal',
            bookingAmount: num(bookingAmount),
            totalAmount: quotation.totalAmount,
            bookingDate: new Date(),
            deliveryDate: expectedDeliveryDate ? new Date(expectedDeliveryDate) : null,
            notes,
            createdBy: req.user.id,
        });

        quotation.status = 'converted';
        quotation.updatedBy = req.user.id;
        await quotation.save();

        await recordCustomerActivity({
            customerId: booking.customer,
            docType: 'booking',
            docId: booking._id,
            number: bookingNumber,
            amount: booking.totalAmount || booking.bookingAmount,
            description: `Booking ${bookingNumber} from quotation ${quotation.quotationNumber} — ${booking.itemDescription}`,
            userId: req.user.id,
        });

        logger.info(`Quotation ${quotation.quotationNumber} converted to booking ${bookingNumber}`);
        res.status(201).json({
            success: true,
            data: { id: booking._id, bookingNumber },
            message: 'Quotation converted to booking successfully',
        });
    } catch (error) {
        logger.error('Error converting quotation:', error);
        next(error);
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// BOOKINGS
// ═══════════════════════════════════════════════════════════════════════════

const mapBooking = (b) => ({
    id: b._id,
    booking_number: b.bookingNumber,
    quotation_id: b.quotation || null,
    customer_id: b.customer?._id || b.customer || null,
    customer_name: customerName(b.customer),
    sale_type: b.saleType || 'vehicle',
    vehicle_variant_id: b.vehicleVariant || b.vehicle || null,
    vehicle_color_id: b.vehicleColor || null,
    part_id: b.part || null,
    service_type_id: b.serviceType || null,
    part_quantity: b.partQuantity || 1,
    item_name: b.itemDescription || '',
    vehicle_full_name: b.itemDescription || '',
    booking_amount: b.bookingAmount || 0,
    total_amount: b.totalAmount || 0,
    tax_amount: b.taxAmount || 0,
    expected_delivery_date: b.deliveryDate || null,
    priority: b.priority || 'normal',
    status: b.status || 'pending',
    notes: b.notes || '',
    created_at: b.createdAt,
    updated_at: b.updatedAt,
});

const BOOKING_SORT = {
    created_at: 'createdAt', booking_amount: 'bookingAmount', total_amount: 'totalAmount',
    booking_number: 'bookingNumber', expected_delivery_date: 'deliveryDate', status: 'status',
};

const getAllBookings = async (req, res, next) => {
    try {
        const {
            status, customerId, priority, search, dateFrom, dateTo,
            sortBy = 'created_at', sortOrder = 'DESC', page = 1, limit = 20,
        } = req.query;

        const filter = { status: { $ne: 'cancelled' } };
        const bookingOwnerIds = await allowedOwnerIds(req.user, 'bookings');
        if (bookingOwnerIds !== null) filter.createdBy = { $in: bookingOwnerIds };
        if (status) filter.status = status;
        if (sanitizeId(customerId)) filter.customer = customerId;
        if (priority) filter.priority = priority;
        const range = dateRangeFilter(dateFrom, dateTo);
        if (range) filter.createdAt = range;
        if (search) {
            const regex = new RegExp(String(search).trim().split(/\s+/).map(escapeRegex).join('|'), 'i');
            const customerIds = await findCustomerIdsBySearch(search);
            filter.$or = [
                { bookingNumber: regex },
                { itemDescription: regex },
                ...(customerIds.length ? [{ customer: { $in: customerIds } }] : []),
            ];
        }

        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
        const sortField = BOOKING_SORT[sortBy] || 'createdAt';
        const sortDir = String(sortOrder).toUpperCase() === 'ASC' ? 1 : -1;

        const [bookings, total] = await Promise.all([
            Booking.find(filter)
                .populate('customer', 'firstName lastName companyName phone customerCode')
                .sort({ [sortField]: sortDir })
                .skip((pageNum - 1) * limitNum)
                .limit(limitNum)
                .lean(),
            Booking.countDocuments(filter),
        ]);

        res.json({
            success: true,
            data: bookings.map(mapBooking),
            pagination: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum) },
        });
    } catch (error) {
        next(error);
    }
};

const getBookingById = async (req, res, next) => {
    try {
        const booking = await Booking.findById(req.params.id)
            .populate('customer', 'firstName lastName companyName phone customerCode')
            .lean();
        if (!booking) throw new AppError('Booking not found', 404);
        res.json({ success: true, data: mapBooking(booking) });
    } catch (error) {
        next(error);
    }
};

const sendBookingEmail = async (req, res, next) => {
    try {
        const { document, recipient } = await sendCustomerDocumentEmail({
            Model: Booking, id: req.params.id, usageKey: 'booking_customer', documentKey: 'booking', userId: req.user.id,
            buildDocument: (booking) => ({ number: booking.bookingNumber, date: booking.bookingDate || booking.createdAt, deliveryDate: booking.deliveryDate, amount: booking.bookingAmount, totalAmount: booking.totalAmount, status: booking.status }),
        });
        res.json({ success: true, message: `Booking ${document.bookingNumber} emailed to ${recipient}` });
    } catch (error) { next(error); }
};

const createBooking = async (req, res, next) => {
    try {
        const {
            quotationId, customerId, saleType, vehicleVariantId, vehicleColorId,
            partId, serviceTypeId, partQuantity, bookingAmount, totalAmount, taxAmount, expectedDeliveryDate, priority, notes,
        } = req.body;

        if (saleType === 'service') throw new AppError('Services are managed from Service Management', 400);

        if (saleType === 'parts') {
            if (!sanitizeId(customerId) || !sanitizeId(partId) || !num(bookingAmount)) {
                throw new AppError('Customer, part, and booking amount are required for parts sales', 400);
            }
        } else if (saleType === 'service') {
            if (!sanitizeId(customerId) || !sanitizeId(serviceTypeId) || !num(bookingAmount)) {
                throw new AppError('Customer, service, and booking amount are required for service sales', 400);
            }
        } else if (!sanitizeId(customerId) || !sanitizeId(vehicleVariantId) || !num(bookingAmount)) {
            throw new AppError('Customer, vehicle, and booking amount are required', 400);
        }

        const customer = await requireCustomer(customerId);
        const effectiveSaleType = ['parts', 'service'].includes(saleType) ? saleType : 'vehicle';
        const item = await resolveSaleItem({
            saleType: effectiveSaleType,
            vehicleVariantId,
            vehicleColorId,
            partId,
            serviceTypeId,
            partQuantity,
        });

        const bookingNumber = await nextDocNumber(Booking, 'bookingNumber', 'BK');
        const booking = await Booking.create({
            bookingNumber,
            quotation: sanitizeId(quotationId),
            customer: customer._id,
            vehicle: item.vehicleId,
            saleType: effectiveSaleType,
            vehicleVariant: item.variantId,
            vehicleColor: item.colorId,
            part: item.partId,
            serviceType: item.serviceTypeId,
            partQuantity: Math.max(1, num(partQuantity, 1)),
            itemDescription: item.description,
            status: 'pending',
            priority: priority || 'normal',
            bookingAmount: num(bookingAmount),
            totalAmount: num(totalAmount, item.unitPrice * Math.max(1, num(partQuantity, 1))),
            taxAmount: num(taxAmount),
            bookingDate: new Date(),
            deliveryDate: expectedDeliveryDate ? new Date(expectedDeliveryDate) : null,
            notes,
            createdBy: req.user.id,
        });

        await recordCustomerActivity({
            customerId: customer._id,
            docType: 'booking',
            docId: booking._id,
            number: bookingNumber,
            amount: booking.totalAmount || booking.bookingAmount,
            description: `Booking ${bookingNumber} — ${item.description} (deposit PKR ${num(bookingAmount).toLocaleString()})`,
            userId: req.user.id,
        });

        logger.info(`Booking ${bookingNumber} created by user ${req.user.id}`);
        res.status(201).json({ success: true, data: { id: booking._id, bookingNumber } });
    } catch (error) {
        next(error);
    }
};

const updateBooking = async (req, res, next) => {
    try {
        const booking = await Booking.findById(req.params.id);
        if (!booking) throw new AppError('Booking not found', 404);
        if (['cancelled', 'completed'].includes(booking.status)) {
            throw new AppError(`Booking is ${booking.status} and cannot be edited`, 400);
        }

        const {
            customerId, saleType, vehicleVariantId, vehicleColorId, partId, serviceTypeId, partQuantity,
            bookingAmount, totalAmount, taxAmount, expectedDeliveryDate, status, priority, notes,
        } = req.body;

        if (sanitizeId(customerId)) {
            const customer = await requireCustomer(customerId);
            booking.customer = customer._id;
        }

        const effectiveSaleType = saleType === 'service' || (!saleType && booking.saleType === 'service')
            ? 'service'
            : (saleType === 'parts' ? 'parts' : (saleType || booking.saleType || 'vehicle'));
        if (effectiveSaleType === 'service') throw new AppError('Services are managed from Service Management', 400);
        const itemSource = sanitizeId(vehicleVariantId) || booking.vehicleVariant || booking.vehicle;
        const hasItem = effectiveSaleType === 'parts'
            ? sanitizeId(partId) || booking.part
            : effectiveSaleType === 'service'
                ? sanitizeId(serviceTypeId) || booking.serviceType
                : itemSource;
        if (hasItem) {
            const item = await resolveSaleItem({
                saleType: effectiveSaleType,
                vehicleVariantId: itemSource,
                vehicleColorId: sanitizeId(vehicleColorId),
                partId: sanitizeId(partId) || booking.part,
                serviceTypeId: sanitizeId(serviceTypeId) || booking.serviceType,
                partQuantity,
            });
            booking.vehicleVariant = item.variantId;
            booking.vehicleColor = item.colorId;
            booking.vehicle = item.vehicleId || booking.vehicle;
            booking.part = item.partId;
            booking.serviceType = item.serviceTypeId;
            booking.itemDescription = item.description;
        }

        Object.assign(booking, {
            saleType: effectiveSaleType,
            partQuantity: Math.max(1, num(partQuantity, booking.partQuantity || 1)),
            bookingAmount: num(bookingAmount, booking.bookingAmount),
            totalAmount: num(totalAmount, booking.totalAmount),
            taxAmount: num(taxAmount, booking.taxAmount),
            deliveryDate: expectedDeliveryDate ? new Date(expectedDeliveryDate) : booking.deliveryDate,
            ...(status ? { status } : {}),
            ...(priority ? { priority } : {}),
            notes: notes !== undefined ? notes : booking.notes,
            updatedBy: req.user.id,
        });
        await booking.save();

        res.json({ success: true, message: 'Booking updated successfully' });
    } catch (error) {
        next(error);
    }
};

const deleteBooking = async (req, res, next) => {
    try {
        const { cancellationReason } = req.body || {};
        const booking = await Booking.findById(req.params.id);
        if (!booking) throw new AppError('Booking not found', 404);

        booking.status = 'cancelled';
        booking.cancellationReason = cancellationReason || '';
        booking.cancelledAt = new Date();
        booking.updatedBy = req.user.id;
        await booking.save();

        res.json({ success: true, message: 'Booking cancelled successfully' });
    } catch (error) {
        next(error);
    }
};

const allocateVehicle = async (req, res, next) => {
    try {
        const { vehicleId } = req.body;
        if (!sanitizeId(vehicleId)) throw new AppError('Vehicle ID is required', 400);

        const booking = await Booking.findById(req.params.id);
        if (!booking) throw new AppError('Booking not found', 404);

        const vehicle = await Vehicle.findById(vehicleId);
        if (!vehicle) throw new AppError('Vehicle not found', 404);

        vehicle.status = 'allocated';
        await vehicle.save();

        booking.vehicle = vehicle._id;
        booking.status = 'processing';
        booking.updatedBy = req.user.id;
        await booking.save();

        res.json({ success: true, message: 'Vehicle allocated successfully' });
    } catch (error) {
        next(error);
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// SALES ORDERS
// ═══════════════════════════════════════════════════════════════════════════

const mapOrder = (o, invoice = null) => ({
    id: o._id,
    order_number: o.orderNumber,
    booking_id: o.booking || null,
    customer_id: o.customer?._id || o.customer || null,
    customer_name: customerName(o.customer),
    sale_type: o.saleType || 'vehicle',
    vehicle_id: o.vehicle?._id || o.vehicle || null,
    part_id: o.part || null,
    part_quantity: o.partQuantity || 1,
    item_name: o.items?.[0]?.description || '',
    make_name: o.vehicle?.make?.name || '',
    model_name: o.vehicle?.model?.name || '',
    variant_name: o.vehicle?.variant?.name || '',
    color_name: o.vehicle?.color?.name || '',
    vin: o.vehicle?.vin || '',
    vehicle_price: o.subtotal || 0,
    accessories_total: o.accessoriesTotal || 0,
    discount_amount: o.discountAmount || 0,
    tax_amount: o.taxAmount || 0,
    registration_charges: o.registrationCharges || 0,
    insurance_charges: o.insuranceCharges || 0,
    other_charges: o.otherCharges || 0,
    exchange_vehicle_details: o.exchangeVehicleDetails || '',
    exchange_value: o.exchangeValue || 0,
    grand_total: o.totalAmount || 0,
    total_amount: o.totalAmount || 0,
    paid_amount: o.paidAmount || 0,
    balance_amount: o.balanceAmount || 0,
    payment_mode: o.paymentMode || '',
    finance_company: o.financeCompany || '',
    finance_amount: o.financeAmount || 0,
    expected_delivery_date: o.deliveryDate || null,
    status: o.status || 'pending',
    notes: o.notes || '',
    created_at: o.createdAt,
    updated_at: o.updatedAt,
    invoice_id: invoice?._id || null,
    invoice_number: invoice?.invoiceNumber || null,
    invoice_status: invoice?.status || null,
});

const ORDER_SORT = {
    created_at: 'createdAt', total_amount: 'totalAmount',
    paid_amount: 'paidAmount', order_number: 'orderNumber', status: 'status',
};

async function buildOrderFilter(query) {
    const { status, customerId, search, dateFrom, dateTo } = query;
    const filter = {};
    if (status) filter.status = status;
    if (sanitizeId(customerId)) filter.customer = customerId;
    const range = dateRangeFilter(dateFrom, dateTo);
    if (range) filter.createdAt = range;
    if (search) {
        const regex = new RegExp(String(search).trim().split(/\s+/).map(escapeRegex).join('|'), 'i');
        const [customerIds, invoiceOrders, vehicleIds] = await Promise.all([
            findCustomerIdsBySearch(search),
            Invoice.find({ invoiceNumber: regex, salesOrder: { $ne: null } }).select('salesOrder').limit(200).lean(),
            Vehicle.find({ vin: regex }).select('_id').limit(200).lean(),
        ]);
        filter.$or = [
            { orderNumber: regex },
            { 'items.description': regex },
            ...(customerIds.length ? [{ customer: { $in: customerIds } }] : []),
            ...(invoiceOrders.length ? [{ _id: { $in: invoiceOrders.map((i) => i.salesOrder) } }] : []),
            ...(vehicleIds.length ? [{ vehicle: { $in: vehicleIds.map((v) => v._id) } }] : []),
        ];
    }
    return filter;
}

async function listOrders(req, res, next, { withInvoices }) {
    try {
        const { sortBy = 'created_at', sortOrder = 'DESC', page = 1, limit = 20 } = req.query;
        const filter = await buildOrderFilter(req.query);
        const orderOwnerIds = await allowedOwnerIds(req.user, 'sales_orders');
        if (orderOwnerIds !== null) filter.createdBy = { $in: orderOwnerIds };

        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
        const sortField = ORDER_SORT[sortBy] || 'createdAt';
        const sortDir = String(sortOrder).toUpperCase() === 'ASC' ? 1 : -1;

        const [orders, total] = await Promise.all([
            SalesOrder.find(filter)
                .populate('customer', 'firstName lastName companyName phone customerCode')
                .populate('vehicle', 'vin make model variant color')
                .sort({ [sortField]: sortDir })
                .skip((pageNum - 1) * limitNum)
                .limit(limitNum)
                .lean(),
            SalesOrder.countDocuments(filter),
        ]);

        let invoiceByOrder = {};
        if (withInvoices && orders.length) {
            const invoices = await Invoice.find({
                salesOrder: { $in: orders.map((o) => o._id) },
                status: { $ne: 'cancelled' },
            }).select('salesOrder invoiceNumber status').lean();
            invoiceByOrder = Object.fromEntries(invoices.map((i) => [String(i.salesOrder), i]));
        }

        res.json({
            success: true,
            data: orders.map((o) => mapOrder(o, invoiceByOrder[String(o._id)] || null)),
            pagination: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum) },
        });
    } catch (error) {
        next(error);
    }
}

const getAllSalesOrders = (req, res, next) => listOrders(req, res, next, { withInvoices: false });
const getSalesOrdersWithInvoices = (req, res, next) => listOrders(req, res, next, { withInvoices: true });

const getSalesOrderById = async (req, res, next) => {
    try {
        const order = await SalesOrder.findById(req.params.id)
            .populate('customer', 'firstName lastName companyName phone customerCode email')
            .populate('vehicle', 'vin make model variant color')
            .lean();
        if (!order) throw new AppError('Order not found', 404);

        const invoice = await Invoice.findOne({ salesOrder: order._id, status: { $ne: 'cancelled' } })
            .select('invoiceNumber status').lean();
        res.json({ success: true, data: mapOrder(order, invoice) });
    } catch (error) {
        next(error);
    }
};

const sendSalesOrderEmail = async (req, res, next) => {
    try {
        const { document, recipient } = await sendCustomerDocumentEmail({
            Model: SalesOrder, id: req.params.id, usageKey: 'sales_order_customer', documentKey: 'order', userId: req.user.id,
            buildDocument: (order) => ({ number: order.orderNumber, date: order.orderDate || order.createdAt, deliveryDate: order.deliveryDate, amount: order.totalAmount, status: order.status }),
        });
        res.json({ success: true, message: `Sales order ${document.orderNumber} emailed to ${recipient}` });
    } catch (error) { next(error); }
};

const bulkSalesDocuments = async (req,res,next) => {
 try { const {ids=[],operation}=req.body;if(!Array.isArray(ids)||!ids.length)throw new AppError('Select at least one record',400);if(ids.length>100)throw new AppError('A maximum of 100 records is allowed',400);
  const type=req.params.type||({'/api/quotations':'quotation','/api/bookings':'booking','/api/sales':'order'}[req.baseUrl]);const resource={quotation:'quotations',booking:'bookings',order:'sales_orders'}[type];const role=String(req.user?.role?.name||req.user?.role_name||req.user?.role||'');const legacyEmail=['super_admin','admin','sales_manager','sales_executive'].includes(role),legacyDelete=type==='order'?role==='super_admin':['super_admin','sales_manager'].includes(role);if(operation==='email'&&!canDo(req.user,resource,'sendEmail')&&!legacyEmail)throw new AppError('Email permission denied',403);if(operation==='delete'&&!canDo(req.user,resource,'delete')&&!legacyDelete)throw new AppError('Delete permission denied',403);const config={quotation:{Model:Quotation,usageKey:'quotation_customer',documentKey:'quotation',number:'quotationNumber',build:d=>({number:d.quotationNumber,date:d.createdAt,validUntil:d.validUntil,amount:d.totalAmount,status:d.status})},booking:{Model:Booking,usageKey:'booking_customer',documentKey:'booking',number:'bookingNumber',build:d=>({number:d.bookingNumber,date:d.bookingDate||d.createdAt,deliveryDate:d.deliveryDate,amount:d.bookingAmount,totalAmount:d.totalAmount,status:d.status})},order:{Model:SalesOrder,usageKey:'sales_order_customer',documentKey:'order',number:'orderNumber',build:d=>({number:d.orderNumber,date:d.orderDate||d.createdAt,deliveryDate:d.deliveryDate,amount:d.totalAmount,status:d.status})}}[type];if(!config)throw new AppError('Invalid document type',400);const results=[];
  for(const id of ids){try{if(operation==='email'){const sent=await sendCustomerDocumentEmail({Model:config.Model,id,usageKey:config.usageKey,documentKey:config.documentKey,buildDocument:config.build,userId:req.user.id});results.push({id,success:true,recipient:sent.recipient});}else if(operation==='delete'){const doc=await config.Model.findById(sanitizeId(id));if(!doc)throw new Error('Document not found');if(req.params.type==='quotation'&&doc.status==='converted')throw new Error('Converted quotation cannot be cancelled');if(req.params.type==='order'&&doc.status==='delivered')throw new Error('Delivered order cannot be cancelled');doc.status='cancelled';doc.cancelledAt=new Date();doc.updatedBy=req.user.id;await doc.save();results.push({id,success:true});}else throw new Error('Invalid bulk operation');}catch(error){results.push({id,success:false,error:error.message});}}
  const succeeded=results.filter(x=>x.success).length;res.json({success:succeeded>0,message:`${succeeded} of ${ids.length} records processed`,data:{succeeded,failed:ids.length-succeeded,results}});
 }catch(e){next(e)}
};

const orderTotals = (body) => {
    const basePrice = num(body.vehiclePrice);
    const accessories = num(body.accessoriesTotal);
    const discount = num(body.discountAmount);
    const tax = num(body.taxAmount);
    const registration = num(body.registrationCharges);
    const insurance = num(body.insuranceCharges);
    const other = num(body.otherCharges);
    const exchange = num(body.exchangeValue);
    const paid = num(body.paidAmount);
    const total = basePrice + accessories - discount + tax + registration + insurance + other - exchange;
    return {
        subtotal: basePrice,
        accessoriesTotal: accessories,
        discountAmount: discount,
        taxAmount: tax,
        registrationCharges: registration,
        insuranceCharges: insurance,
        otherCharges: other,
        exchangeValue: exchange,
        totalAmount: total,
        paidAmount: paid,
        balanceAmount: total - paid,
    };
};

/**
 * Shared order creation used by direct orders, booking conversions and the
 * legacy create endpoint. Handles all cross-model updates:
 *  - vehicle marked sold / part stock decremented
 *  - customer document updated (summary + history)
 *  - invoice generated automatically
 *  - initial payment recorded when an amount was collected
 */
async function createOrderInternal({ body, userId, bookingId = null, quotationId = null }) {
    const {
        customerId, saleType = 'vehicle', vehicleId, partId, serviceTypeId, partQuantity,
        paymentMode, financeCompany, financeAmount, exchangeVehicleDetails,
        expectedDeliveryDate, notes,
    } = body;

    if (saleType === 'service') throw new AppError('Services are managed from Service Management', 400);

    const customer = await requireCustomer(customerId);

    let vehicle = null;
    let part = null;
    let service = null;
    const qty = Math.max(1, num(partQuantity, 1));

    if (saleType === 'vehicle') {
        if (!sanitizeId(vehicleId)) throw new AppError('Vehicle is required for vehicle sales', 400);
        vehicle = await Vehicle.findById(vehicleId);
        if (!vehicle) throw new AppError('Vehicle not found', 404);
        if (!['at_yard', 'in_transit', 'allocated'].includes(vehicle.status)) {
            throw new AppError(`Vehicle is not available (current status: ${vehicle.status})`, 400);
        }
    } else if (saleType === 'parts') {
        if (!sanitizeId(partId)) throw new AppError('Part is required for parts sales', 400);
        part = await Part.findById(partId);
        if (!part) throw new AppError('Part not found', 404);
        if (num(part.currentStock) < qty) {
            throw new AppError(`Insufficient stock. Available: ${part.currentStock}`, 400);
        }
    } else if (saleType === 'service') {
        if (!sanitizeId(serviceTypeId)) throw new AppError('Service is required for service sales', 400);
        service = await ServiceType.findOne({ _id: serviceTypeId, isActive: true });
        if (!service) throw new AppError('Active service not found', 404);
    } else {
        throw new AppError('Invalid sale type', 400);
    }

    let basePrice = num(body.vehiclePrice);
    if (!basePrice) {
        basePrice = saleType === 'vehicle' ? num(vehicle.salePrice) : saleType === 'parts' ? num(part.sellingPrice) * qty : num(service.basePrice) * qty;
    }
    if (basePrice <= 0) throw new AppError('Valid price is required', 400);

    const totals = orderTotals({ ...body, vehiclePrice: basePrice });

    if (totals.paidAmount < 0) {
        throw new AppError('Paid amount cannot be negative', 400);
    }
    // An overpayment would post a negative balance and corrupt receivables.
    if (totals.paidAmount > totals.totalAmount) {
        throw new AppError(
            `Paid amount (${totals.paidAmount}) cannot exceed the order total (${totals.totalAmount})`,
            400
        );
    }

    const description = saleType === 'vehicle'
        ? ([vehicle.make?.name, vehicle.model?.name, vehicle.variant?.name, vehicle.year].filter(Boolean).join(' ') || 'Vehicle')
        : saleType === 'parts' ? `${part.name || 'Part'}${part.partCode ? ` (${part.partCode})` : ''}` : service.name;

    const orderNumber = await nextDocNumber(SalesOrder, 'orderNumber', 'SO');
    const now = new Date();

    const order = await SalesOrder.create({
        orderNumber,
        booking: sanitizeId(bookingId),
        quotation: sanitizeId(quotationId),
        customer: customer._id,
        vehicle: saleType === 'vehicle' ? vehicle._id : undefined,
        saleType,
        part: saleType === 'parts' ? part._id : null,
        serviceType: saleType === 'service' ? service._id : null,
        partQuantity: qty,
        status: 'confirmed',
        ...totals,
        paymentMode: paymentMode || 'cash',
        financeCompany: financeCompany || '',
        financeAmount: num(financeAmount),
        exchangeVehicleDetails: exchangeVehicleDetails || '',
        orderDate: now,
        deliveryDate: expectedDeliveryDate ? new Date(expectedDeliveryDate) : null,
        items: [{
            description,
            quantity: ['parts', 'service'].includes(saleType) ? qty : 1,
            unitPrice: ['parts', 'service'].includes(saleType) ? basePrice / qty : basePrice,
            totalPrice: basePrice,
            type: saleType,
        }],
        notes,
        createdBy: userId,
    });

    // Cross-model: inventory
    if (saleType === 'parts') {
        await Part.findByIdAndUpdate(part._id, { $inc: { currentStock: -qty } });
    } else if (saleType === 'vehicle') {
        vehicle.status = 'sold';
        await vehicle.save();
    }

    // Cross-model: customer document
    await recordCustomerActivity({
        customerId: customer._id,
        docType: 'sales_order',
        docId: order._id,
        number: orderNumber,
        amount: totals.totalAmount,
        description: `Sales order ${orderNumber} — ${description}`,
        userId,
        spentDelta: totals.totalAmount,
        paidDelta: totals.paidAmount,
    });

    // Cross-model: invoice is prepared automatically for every sale
    let invoice = null;
    try {
        const result = await createInvoiceForOrder(order, { userId });
        invoice = result.invoice;
        order.status = 'invoiced';
        await order.save();
    } catch (invoiceError) {
        logger.error(`Auto-invoice failed for order ${orderNumber}:`, invoiceError);
    }

    // Cross-model: initial payment record
    if (totals.paidAmount > 0 && invoice) {
        try {
            const paymentNumber = await nextDocNumber(Payment, 'paymentNumber', 'PAY');
            await Payment.create({
                paymentNumber,
                invoice: invoice._id,
                customer: customer._id,
                method: { name: paymentMode || 'cash', code: '', type: '' },
                amount: totals.paidAmount,
                paymentDate: now,
                notes: `Initial payment with sales order ${orderNumber}`,
                status: 'completed',
                createdBy: userId,
            });
            await recordCustomerActivity({
                customerId: customer._id,
                docType: 'payment',
                docId: invoice._id,
                number: paymentNumber,
                amount: totals.paidAmount,
                description: `Payment ${paymentNumber} against invoice ${invoice.invoiceNumber}`,
                userId,
                countDocument: false,
            });
        } catch (paymentError) {
            logger.error(`Initial payment record failed for order ${orderNumber}:`, paymentError);
        }
    }

    return { order, invoice, orderNumber };
}

const createSalesOrder = async (req, res, next) => {
    try {
        const { order, orderNumber } = await createOrderInternal({
            body: req.body,
            userId: req.user.id,
            bookingId: req.body.bookingId,
        });
        res.status(201).json({ success: true, data: { id: order._id, orderNumber } });
    } catch (error) {
        next(error);
    }
};

const createDirectSalesOrder = async (req, res, next) => {
    try {
        const { order, invoice, orderNumber } = await createOrderInternal({
            body: req.body,
            userId: req.user.id,
        });
        logger.info(`Direct sales order ${orderNumber} created by user ${req.user.id}`);
        res.status(201).json({
            success: true,
            data: { id: order._id, orderNumber, invoiceNumber: invoice?.invoiceNumber || null },
            message: 'Sales order created successfully',
        });
    } catch (error) {
        logger.error('Error creating direct sales order:', error);
        next(error);
    }
};

const convertBookingToOrder = async (req, res, next) => {
    try {
        const { vehicleId, paidAmount, paymentMode, registrationCharges, insuranceCharges, notes } = req.body;

        const booking = await Booking.findById(req.params.id);
        if (!booking) throw new AppError('Booking not found', 404);
        if (booking.status === 'cancelled') throw new AppError('Cancelled bookings cannot be converted', 400);
        if (booking.saleType === 'service') throw new AppError('Services are managed from Service Management', 400);

        const targetVehicleId = sanitizeId(vehicleId) || booking.vehicle;
        if (!['parts', 'service'].includes(booking.saleType) && !targetVehicleId) {
            throw new AppError('Vehicle must be allocated first', 400);
        }

        const { order, orderNumber } = await createOrderInternal({
            body: {
                customerId: booking.customer,
                saleType: booking.saleType || 'vehicle',
                vehicleId: targetVehicleId,
        partId: booking.part,
        serviceTypeId: booking.serviceType,
                partQuantity: booking.partQuantity,
                vehiclePrice: booking.totalAmount,
                registrationCharges,
                insuranceCharges,
                paidAmount: paidAmount !== undefined ? paidAmount : booking.bookingAmount,
                paymentMode: paymentMode || 'cash',
                expectedDeliveryDate: booking.deliveryDate,
                notes,
            },
            userId: req.user.id,
            bookingId: booking._id,
            quotationId: booking.quotation,
        });

        booking.status = 'completed';
        booking.updatedBy = req.user.id;
        await booking.save();

        res.status(201).json({ success: true, data: { id: order._id, orderNumber } });
    } catch (error) {
        next(error);
    }
};

const updateSalesOrder = async (req, res, next) => {
    try {
        const order = await SalesOrder.findById(req.params.id);
        if (!order) throw new AppError('Order not found', 404);
        if (['delivered', 'cancelled'].includes(order.status)) {
            throw new AppError(`Order is ${order.status} and cannot be edited`, 400);
        }

        const {
            paymentMode, financeCompany, financeAmount, exchangeVehicleDetails,
            status, expectedDeliveryDate, notes,
        } = req.body;

        const totals = orderTotals({
            ...req.body,
            vehiclePrice: req.body.vehiclePrice !== undefined ? req.body.vehiclePrice : order.subtotal,
            paidAmount: req.body.paidAmount !== undefined ? req.body.paidAmount : order.paidAmount,
        });

        Object.assign(order, {
            ...totals,
            paymentMode: paymentMode !== undefined ? paymentMode : order.paymentMode,
            financeCompany: financeCompany !== undefined ? financeCompany : order.financeCompany,
            financeAmount: num(financeAmount, order.financeAmount),
            exchangeVehicleDetails: exchangeVehicleDetails !== undefined ? exchangeVehicleDetails : order.exchangeVehicleDetails,
            ...(status ? { status } : {}),
            deliveryDate: expectedDeliveryDate ? new Date(expectedDeliveryDate) : order.deliveryDate,
            notes: notes !== undefined ? notes : order.notes,
            updatedBy: req.user.id,
        });

        if (order.items?.length) {
            order.items[0].totalPrice = totals.subtotal;
            order.items[0].unitPrice = order.items[0].quantity ? totals.subtotal / order.items[0].quantity : totals.subtotal;
        }
        await order.save();

        // Keep the auto-generated draft invoice aligned with the order
        const invoice = await Invoice.findOne({ salesOrder: order._id, status: { $in: ['draft', 'sent'] } });
        if (invoice && num(invoice.paidAmount) === 0) {
            const oldBalance = num(invoice.balanceAmount);
            invoice.subtotal = totals.subtotal + totals.accessoriesTotal + totals.registrationCharges + totals.insuranceCharges + totals.otherCharges;
            invoice.discountAmount = totals.discountAmount + totals.exchangeValue;
            invoice.taxAmount = totals.taxAmount;
            invoice.totalAmount = totals.totalAmount;
            invoice.balanceAmount = totals.totalAmount - num(invoice.paidAmount);
            invoice.updatedBy = req.user.id;
            await invoice.save();
            await recordCustomerActivity({
                customerId: order.customer,
                docType: 'invoice',
                docId: invoice._id,
                number: invoice.invoiceNumber,
                amount: invoice.totalAmount,
                description: `Invoice ${invoice.invoiceNumber} updated with order ${order.orderNumber}`,
                userId: req.user.id,
                countDocument: false,
                outstandingDelta: num(invoice.balanceAmount) - oldBalance,
            });
        }

        res.json({ success: true, message: 'Order updated successfully' });
    } catch (error) {
        next(error);
    }
};

const deleteSalesOrder = async (req, res, next) => {
    try {
        const order = await SalesOrder.findById(req.params.id);
        if (!order) throw new AppError('Order not found', 404);
        if (order.status === 'delivered') throw new AppError('Delivered orders cannot be cancelled', 400);

        order.status = 'cancelled';
        order.cancelledAt = new Date();
        order.updatedBy = req.user.id;
        await order.save();

        // Restore inventory
        if (order.saleType === 'parts' && order.part) {
            await Part.findByIdAndUpdate(order.part, { $inc: { currentStock: order.partQuantity || 1 } });
        } else if (order.vehicle) {
            await Vehicle.findOneAndUpdate({ _id: order.vehicle, status: 'sold' }, { status: 'at_yard' });
        }

        // Cancel the linked unpaid invoice
        const invoice = await Invoice.findOne({ salesOrder: order._id, status: { $nin: ['cancelled', 'paid'] } });
        if (invoice) {
            const outstandingDelta = -num(invoice.balanceAmount);
            invoice.status = 'cancelled';
            invoice.cancelledAt = new Date();
            invoice.updatedBy = req.user.id;
            await invoice.save();
            await recordCustomerActivity({
                customerId: order.customer,
                docType: 'invoice',
                docId: invoice._id,
                number: invoice.invoiceNumber,
                amount: invoice.totalAmount,
                description: `Invoice ${invoice.invoiceNumber} cancelled with order ${order.orderNumber}`,
                userId: req.user.id,
                countDocument: false,
                outstandingDelta,
            });
        }

        await recordCustomerActivity({
            customerId: order.customer,
            docType: 'sales_order',
            docId: order._id,
            number: order.orderNumber,
            amount: order.totalAmount,
            description: `Sales order ${order.orderNumber} cancelled`,
            userId: req.user.id,
            countDocument: false,
            spentDelta: -num(order.totalAmount),
            paidDelta: -num(order.paidAmount),
        });

        res.json({ success: true, message: 'Order cancelled successfully' });
    } catch (error) {
        next(error);
    }
};

const deliverSalesOrder = async (req, res, next) => {
    try {
        const order = await SalesOrder.findById(req.params.id);
        if (!order) throw new AppError('Order not found', 404);
        if (order.status === 'cancelled') throw new AppError('Cancelled orders cannot be delivered', 400);

        order.status = 'delivered';
        order.deliveredAt = new Date();
        order.updatedBy = req.user.id;
        await order.save();

        await recordCustomerActivity({
            customerId: order.customer,
            docType: 'sales_order',
            docId: order._id,
            number: order.orderNumber,
            amount: order.totalAmount,
            description: `Sales order ${order.orderNumber} delivered`,
            userId: req.user.id,
            countDocument: false,
        });

        res.json({ success: true, message: 'Order delivered successfully' });
    } catch (error) {
        next(error);
    }
};

const updateSalesOrderStatus = async (req, res, next) => {
    try {
        const { status } = req.body;
        const validStatuses = ['confirmed', 'invoiced', 'delivered', 'cancelled'];
        if (!status) throw new AppError('Status is required', 400);
        if (!validStatuses.includes(status)) {
            throw new AppError(`Invalid status. Must be one of: ${validStatuses.join(', ')}`, 400);
        }

        if (status === 'cancelled') return deleteSalesOrder(req, res, next);
        if (status === 'delivered') return deliverSalesOrder(req, res, next);

        const order = await SalesOrder.findByIdAndUpdate(
            req.params.id,
            { status, updatedBy: req.user.id },
            { new: true },
        );
        if (!order) throw new AppError('Order not found', 404);

        logger.info(`Sales order ${req.params.id} status updated to ${status} by user ${req.user.id}`);
        res.json({ success: true, message: `Order status updated to ${status}` });
    } catch (error) {
        logger.error('Error updating order status:', error);
        next(error);
    }
};

const generateInvoiceFromOrder = async (req, res, next) => {
    try {
        const { dueDays } = req.body;
        const order = await SalesOrder.findById(req.params.id);
        if (!order) throw new AppError('Order not found', 404);
        if (order.status === 'cancelled') throw new AppError('Cancelled orders cannot be invoiced', 400);

        const { invoice, created } = await createInvoiceForOrder(order, { dueDays, userId: req.user.id });
        if (created) {
            order.status = 'invoiced';
            order.updatedBy = req.user.id;
            await order.save();
        }

        logger.info(`Invoice ${invoice.invoiceNumber} ${created ? 'generated' : 'already exists'} for order ${order.orderNumber}`);
        res.status(created ? 201 : 200).json({
            success: true,
            data: { id: invoice._id, invoiceNumber: invoice.invoiceNumber },
            message: created ? 'Invoice generated successfully' : 'Invoice already exists for this order',
        });
    } catch (error) {
        logger.error('Error generating invoice from order:', error);
        next(error);
    }
};

const getSalesOrderHistory = async (req, res, next) => {
    try {
        const order = await SalesOrder.findById(req.params.id).lean();
        if (!order) throw new AppError('Order not found', 404);

        const customer = await Customer.findById(order.customer).select('salesHistory').lean();
        const history = (customer?.salesHistory || [])
            .filter((entry) => String(entry.docId) === String(order._id) || entry.number === order.orderNumber)
            .map((entry) => ({
                action: entry.description,
                amount: entry.amount,
                created_at: entry.date,
            }));
        res.json({ success: true, data: history });
    } catch (error) {
        logger.error('Error fetching order history:', error);
        next(error);
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// STATISTICS
// ═══════════════════════════════════════════════════════════════════════════

const getSalesStats = async (req, res, next) => {
    try {
        const [quotations, bookings, orders] = await Promise.all([
            Quotation.countDocuments({ status: { $ne: 'cancelled' } }),
            Booking.countDocuments({ status: { $ne: 'cancelled' } }),
            SalesOrder.aggregate([
                { $match: { status: { $ne: 'cancelled' } } },
                { $group: { _id: null, total: { $sum: 1 }, revenue: { $sum: '$totalAmount' }, collected: { $sum: '$paidAmount' } } },
            ]),
        ]);
        const orderStats = orders[0] || { total: 0, revenue: 0, collected: 0 };
        res.json({
            success: true,
            data: {
                total_quotations: quotations,
                total_bookings: bookings,
                total_orders: orderStats.total,
                total_revenue: orderStats.revenue,
                total_collected: orderStats.collected,
            },
        });
    } catch (error) {
        next(error);
    }
};

const getQuotationStats = async (req, res, next) => {
    try {
        const [result] = await Quotation.aggregate([
            { $match: { status: { $ne: 'cancelled' } } },
            {
                $group: {
                    _id: null,
                    total: { $sum: 1 },
                    draft: { $sum: { $cond: [{ $eq: ['$status', 'draft'] }, 1, 0] } },
                    sent: { $sum: { $cond: [{ $eq: ['$status', 'sent'] }, 1, 0] } },
                    converted: { $sum: { $cond: [{ $eq: ['$status', 'converted'] }, 1, 0] } },
                    expired: {
                        $sum: {
                            $cond: [
                                { $and: [{ $lt: ['$validUntil', new Date()] }, { $not: [{ $in: ['$status', ['converted', 'cancelled']] }] }] },
                                1, 0,
                            ],
                        },
                    },
                },
            },
        ]);
        res.json({ success: true, data: result || { total: 0, draft: 0, sent: 0, converted: 0, expired: 0 } });
    } catch (error) {
        next(error);
    }
};

const getBookingStats = async (req, res, next) => {
    try {
        const [result] = await Booking.aggregate([
            { $match: { status: { $ne: 'cancelled' } } },
            {
                $group: {
                    _id: null,
                    total: { $sum: 1 },
                    pending: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] } },
                    confirmed: { $sum: { $cond: [{ $eq: ['$status', 'confirmed'] }, 1, 0] } },
                    processing: { $sum: { $cond: [{ $eq: ['$status', 'processing'] }, 1, 0] } },
                    ready: { $sum: { $cond: [{ $eq: ['$status', 'ready'] }, 1, 0] } },
                    totalCollected: { $sum: '$bookingAmount' },
                },
            },
        ]);
        res.json({ success: true, data: result || { total: 0, pending: 0, confirmed: 0, processing: 0, ready: 0, totalCollected: 0 } });
    } catch (error) {
        next(error);
    }
};

const getOrderStats = async (req, res, next) => {
    try {
        const [result] = await SalesOrder.aggregate([
            { $match: { status: { $ne: 'cancelled' } } },
            {
                $group: {
                    _id: null,
                    total: { $sum: 1 },
                    confirmed: { $sum: { $cond: [{ $eq: ['$status', 'confirmed'] }, 1, 0] } },
                    delivered: { $sum: { $cond: [{ $eq: ['$status', 'delivered'] }, 1, 0] } },
                    totalValue: { $sum: '$totalAmount' },
                    totalPaid: { $sum: '$paidAmount' },
                },
            },
        ]);
        res.json({ success: true, data: result || { total: 0, confirmed: 0, delivered: 0, totalValue: 0, totalPaid: 0 } });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    // Quotations
    getAllQuotations, getQuotationById, createQuotation, updateQuotation,
    deleteQuotation, updateQuotationStatus, convertQuotationToBooking, getQuotationStats, sendQuotationEmail,
    // Bookings
    getAllBookings, getBookingById, createBooking, updateBooking,
    deleteBooking, allocateVehicle, convertBookingToOrder, getBookingStats, sendBookingEmail,
    // Sales Orders
    getAllSalesOrders, getSalesOrderById, createSalesOrder, updateSalesOrder,
    deleteSalesOrder, deliverSalesOrder, getOrderStats,
    // New Sales Order Endpoints
    createDirectSalesOrder, updateSalesOrderStatus, generateInvoiceFromOrder,
    getSalesOrderHistory, getSalesOrdersWithInvoices, sendSalesOrderEmail, bulkSalesDocuments,
    // Stats
    getSalesStats,
};
