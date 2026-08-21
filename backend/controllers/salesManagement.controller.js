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
const { parseServiceCharges, serviceChargeSummary } = require('../models/serviceCharges.fields');
const { recordCustomerActivity } = require('../utils/customerSync');
const { createInvoiceForOrder } = require('../utils/invoiceFactory');
const { applyVehicleLifecycle, canonicalStatus } = require('../utils/vehicleLifecycle');
const { sendTemplateEmail, sendRawEmail } = require('../services/emailSender.service');
const { sendCustomerDocumentEmail } = require('../services/documentEmail.service');
const { buildEstimatePdf, buildEstimateEmailContext, defaultEstimateEmailHtml } = require('../services/estimate.service');
const { companyName } = require('../services/pdfData.service');
const { canDo } = require('../utils/roleJobs');
const { allowedOwnerIds } = require('../utils/roleJobs');
const {
    readRequestedItems, resolveLineItems, summarizeLineItems,
    legacyFieldsFromLines, linesToRequested, mapLineItem, round2,
} = require('../services/lineItems.service');
const { reserveBookingVehicles, releaseBookingVehicles, revertInvoiceStock } = require('../services/stockLedger.service');
const { resolveDocumentCustomer } = require('../utils/walkInCustomer');
const { resolvePaymentMethod } = require('../utils/paymentMethod.util');
const { assertFullPayment } = require('../utils/fullPayment.util');
const { realCustomerEmail } = require('../utils/customerEmail.util');

/**
 * These documents are the vehicle side of the business. Parts have their own
 * quotations, bookings, orders and invoices in separate collections
 * (controllers/partsSales.controller.js), so a part on a vehicle document is
 * rejected rather than stored where the vehicle screens cannot show it.
 */
const VEHICLE_ONLY = ['vehicle'];

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

const DOCUMENT_STATUS = Object.freeze({
    quotation: {
        draft: ['pending', 'sent', 'accepted', 'rejected', 'expired', 'cancelled'],
        pending: ['sent', 'accepted', 'rejected', 'expired', 'cancelled'],
        sent: ['pending', 'accepted', 'rejected', 'expired', 'cancelled'],
        accepted: ['converted', 'cancelled'],
        rejected: [],
        expired: [],
        converted: [],
        cancelled: [],
    },
    booking: {
        pending: ['confirmed', 'scheduled', 'in_progress', 'completed', 'cancelled'],
        confirmed: ['scheduled', 'in_progress', 'completed', 'cancelled'],
        scheduled: ['in_progress', 'completed', 'cancelled'],
        in_progress: ['completed', 'cancelled'],
        completed: [],
        cancelled: [],
    },
    sales_order: {
        pending: ['confirmed', 'invoiced', 'ready', 'dispatched', 'cancelled'],
        draft: ['confirmed', 'invoiced', 'ready', 'dispatched', 'cancelled'],
        confirmed: ['invoiced', 'ready', 'dispatched', 'cancelled'],
        invoiced: ['ready', 'dispatched', 'cancelled'],
        ready: ['dispatched', 'cancelled'],
        dispatched: ['delivered'],
        delivered: [],
        completed: [],
        cancelled: [],
    },
});

const documentStatus = (kind, value) => {
    const normalized = String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
    if (kind === 'booking' && normalized === 'processing') return 'in_progress';
    return normalized;
};

function assertDocumentStatusTransition(kind, currentValue, nextValue) {
    const current = documentStatus(kind, currentValue);
    const next = documentStatus(kind, nextValue);
    const transitions = DOCUMENT_STATUS[kind];
    if (!transitions || !Object.prototype.hasOwnProperty.call(transitions, next)) {
        throw new AppError(`Invalid ${kind.replace('_', ' ')} status: ${nextValue}`, 400);
    }
    if (current === next) return next;
    if (!Object.prototype.hasOwnProperty.call(transitions, current)
        || !transitions[current].includes(next)) {
        throw new AppError(`Status cannot move from ${currentValue} to ${nextValue}`, 409);
    }
    return next;
}

const customerName = (customer) => {
    if (!customer || typeof customer !== 'object') return '';
    const name = [customer.firstName, customer.lastName].filter(Boolean).join(' ');
    return name || customer.companyName || '';
};

/** What to print as the buyer: the typed walk-in name wins over the shared record. */
const buyerName = (doc) => (doc.walkIn && doc.walkInName ? doc.walkInName : customerName(doc.customer));

/** The walk-in fields every document mapper exposes to the client. */
const walkInFieldsOf = (doc) => ({
    walk_in: doc.walkIn === true,
    walk_in_name: doc.walkInName || '',
    walk_in_phone: doc.walkInPhone || '',
});

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
    ...serviceChargeSummary(q),
    id: q._id,
    quotation_number: q.quotationNumber,
    customer_id: q.customer?._id || q.customer || null,
    customer_name: buyerName(q),
    ...walkInFieldsOf(q),
    sale_type: q.saleType || 'vehicle',
    vehicle_variant_id: q.vehicleVariant || q.vehicle || null,
    vehicle_color_id: q.vehicleColor || null,
    part_id: q.part?._id || q.part || null,
    service_type_id: q.serviceType?._id || q.serviceType || null,
    part_quantity: q.partQuantity || 1,
    item_name: q.lineItems?.[0]?.description || q.items?.[0]?.description || '',
    vehicle_full_name: q.lineItems?.[0]?.description || q.items?.[0]?.description || '',
    line_items: (q.lineItems || []).map(mapLineItem),
    item_count: (q.lineItems || []).length,
    approval_status: q.approvalStatus || 'pending',
    approved_at: q.approvedAt || null,
    approval_notes: q.approvalNotes || '',
    estimate_sent_at: q.estimateSentAt || null,
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
        const limitNum = Math.min(1000, Math.max(1, parseInt(limit, 10) || 20));
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
        const { document, recipient, attached } = await sendCustomerDocumentEmail({
            Model: Quotation, id: req.params.id, usageKey: 'quotation_customer', documentKey: 'quotation', userId: req.user.id,
            to: req.body?.to,
            // The quotation PDF rides along, and "balance due" resolves to the
            // whole amount because nothing has been paid on a quotation yet.
            pdfType: 'quotation',
            buildDocument: (quote) => ({
                number: quote.quotationNumber, date: quote.createdAt, validUntil: quote.validUntil,
                amount: quote.totalAmount, totalAmount: quote.totalAmount,
                paidAmount: 0, balanceAmount: quote.totalAmount, dueAmount: quote.totalAmount,
                serviceChargesTotal: quote.serviceChargesTotal || 0, serviceTaxTotal: quote.serviceTaxTotal || 0,
                status: quote.status,
            }),
        });
        res.json({ success: true, message: `Quotation ${document.quotationNumber} emailed to ${recipient}${attached ? ' with the PDF attached' : ''}` });
    } catch (error) { next(error); }
};

/**
 * Document money from the priced lines plus the document-level adjustments.
 * `vehiclePrice` keeps its old meaning — the pre-adjustment subtotal — so every
 * existing reader and PDF variable still shows the right figure now that the
 * subtotal can come from several products instead of one.
 */
/**
 * Download the quotation as a customer-facing Estimate PDF listing every
 * product. Works with or without a designed PDF template.
 */
const downloadQuotationEstimate = async (req, res, next) => {
    try {
        const { buffer, fileName } = await buildEstimatePdf(sanitizeId(req.params.id));
        res.set({
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="${fileName}"`,
            'Content-Length': buffer.length,
        }).send(buffer);
    } catch (error) { next(error); }
};

/**
 * Email the Estimate to the quotation's customer with the PDF attached and
 * every product itemised in the body.
 */
const sendQuotationEstimateEmail = async (req, res, next) => {
    try {
        const quotationId = sanitizeId(req.params.id);
        const { buffer, fileName, quotation } = await buildEstimatePdf(quotationId);
        // A typed-in address wins; the customer's own only counts when it is a
        // real one, not the placeholder the import invents (customerEmail.util).
        const recipient = String(req.body?.to || '').trim() || realCustomerEmail(quotation.customer?.email);
        if (!recipient) throw new AppError('This customer has no email address; add one first', 400);

        const context = buildEstimateEmailContext(quotation, { companyName: await companyName() });
        const attachments = [{ filename: fileName, content: buffer, contentType: 'application/pdf' }];

        // Use the dealer's own estimate template when one is configured; the
        // built-in body keeps the feature working before anyone designs one.
        let result;
        try {
            result = await sendTemplateEmail({
                usageKey: 'quotation_estimate',
                to: recipient,
                sentBy: req.user.id,
                attachments,
                context,
            });
        } catch (templateError) {
            logger.info(`No quotation_estimate email template (${templateError.message}); sending the built-in estimate body`);
            result = await sendRawEmail({
                to: recipient,
                subject: `Estimate ${quotation.quotationNumber} — ${context.company.name || 'Your estimate'}`,
                html: defaultEstimateEmailHtml(context),
                attachments,
                sentBy: req.user.id,
                usageKey: 'quotation_estimate',
            });
        }
        if (result.status !== 'sent') throw new AppError(result.errorMessage || 'Email could not be sent', 502);

        await Quotation.updateOne({ _id: quotationId }, { $set: { estimateSentAt: new Date(), updatedBy: req.user.id } });
        res.json({ success: true, message: `Estimate ${quotation.quotationNumber} emailed to ${recipient}` });
    } catch (error) { next(error); }
};

const quotationTotals = (body, lines = []) => {
    const summary = summarizeLineItems(lines);
    const vehiclePrice = lines.length ? summary.subtotal : num(body.vehiclePrice);
    const discountAmount = num(body.discountAmount) + (lines.length ? summary.lineDiscountAmount : 0);
    const taxAmount = num(body.taxAmount) + (lines.length ? summary.lineTaxAmount : 0);
    const additionalCharges = num(body.additionalCharges);
    // Optional service charges block (models/serviceCharges.fields.js): its
    // own rows and per-line tax, added on top of the products.
    const service = parseServiceCharges(body);
    return {
        vehiclePrice,
        subtotal: vehiclePrice,
        discountAmount,
        taxAmount,
        additionalCharges,
        totalAmount: vehiclePrice - discountAmount + taxAmount + additionalCharges + service.grand,
        hasServiceCharges: service.rows.length > 0,
        serviceCharges: service.rows,
        serviceChargesTotal: service.serviceChargesTotal,
        serviceTaxTotal: service.serviceTaxTotal,
    };
};

const createQuotation = async (req, res, next) => {
    try {
        const { leadId, discountPercentage, validityDays, termsAndConditions, notes } = req.body;

        const requested = readRequestedItems(req.body);
        if (!requested.length) throw new AppError('Add at least one vehicle to the quotation', 400);

        const { customer, walkIn, walkInName, walkInPhone } = await resolveDocumentCustomer(req.body, requireCustomer);
        // A quotation is an offer, not a commitment: stock is never checked or
        // touched here, and no inventory unit has to be allocated yet.
        const lines = await resolveLineItems(requested, {
            checkStock: false, requireInventoryVehicle: false, allowedTypes: VEHICLE_ONLY,
        });
        const legacy = legacyFieldsFromLines(lines);

        const totals = quotationTotals(req.body, lines);
        const quotationNumber = await nextDocNumber(Quotation, 'quotationNumber', 'QT');
        const validity = Math.max(1, num(validityDays, 7));

        const quotation = await Quotation.create({
            quotationNumber,
            customer: customer._id,
            walkIn, walkInName, walkInPhone,
            lead: sanitizeId(leadId),
            ...legacy,
            lineItems: lines,
            status: 'draft',
            approvalStatus: 'pending',
            ...totals,
            discountPercentage: num(discountPercentage),
            validityDays: validity,
            validUntil: new Date(Date.now() + validity * 24 * 60 * 60 * 1000),
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
            description: `Quotation ${quotationNumber} — ${legacy.itemDescription}`,
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

        const { customerId, discountPercentage, validityDays, status, termsAndConditions, notes } = req.body;

        if (sanitizeId(customerId) || req.body.walkIn !== undefined) {
            const resolved = await resolveDocumentCustomer(req.body, requireCustomer);
            quotation.customer = resolved.customer._id;
            quotation.walkIn = resolved.walkIn;
            quotation.walkInName = resolved.walkInName;
            quotation.walkInPhone = resolved.walkInPhone;
        }

        // An edit that does not mention products keeps the ones already on the
        // quotation, so a note-only change cannot silently empty the document.
        const requested = readRequestedItems(req.body);
        const lines = await resolveLineItems(
            requested.length ? requested : linesToRequested(quotation.lineItems),
            { checkStock: false, requireInventoryVehicle: false, allowedTypes: VEHICLE_ONLY },
        );
        const legacy = legacyFieldsFromLines(lines);

        const totals = quotationTotals(req.body, lines);
        const validity = Math.max(1, num(validityDays, quotation.validityDays || 7));

        Object.assign(quotation, {
            ...legacy,
            lineItems: lines,
            ...totals,
            discountPercentage: num(discountPercentage, quotation.discountPercentage),
            validityDays: validity,
            validUntil: new Date(quotation.createdAt.getTime() + validity * 24 * 60 * 60 * 1000),
            ...(status ? { status } : {}),
            termsAndConditions: termsAndConditions !== undefined ? termsAndConditions : quotation.termsAndConditions,
            notes: notes !== undefined ? notes : quotation.notes,
            updatedBy: req.user.id,
        });
        // Changing what is being quoted invalidates an earlier approval.
        if (requested.length && quotation.approvalStatus === 'approved') {
            quotation.approvalStatus = 'pending';
            quotation.approvedBy = null;
            quotation.approvedAt = null;
        }
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

        const quotation = await Quotation.findById(req.params.id);
        if (!quotation) throw new AppError('Quotation not found', 404);
        quotation.status = assertDocumentStatusTransition('quotation', quotation.status, status);
        quotation.updatedBy = req.user.id;
        await quotation.save();

        logger.info(`Quotation ${req.params.id} status updated to ${status}`);
        res.json({ success: true, message: 'Status updated successfully' });
    } catch (error) {
        next(error);
    }
};

/**
 * Approve or reject a quotation. Only an approved quotation may become a
 * Booking (see convertQuotationToBooking) — that is the gate the client asked
 * for, and it is enforced on the server, not just hidden in the UI.
 */
const approveQuotation = async (req, res, next) => {
    try {
        const { decision = 'approved', notes = '' } = req.body;
        if (!['approved', 'rejected', 'pending'].includes(decision)) {
            throw new AppError('Decision must be approved, rejected or pending', 400);
        }
        const quotation = await Quotation.findById(sanitizeId(req.params.id));
        if (!quotation) throw new AppError('Quotation not found', 404);
        if (quotation.status === 'converted') throw new AppError('Quotation is already converted', 400);
        if (quotation.status === 'cancelled') throw new AppError('Cancelled quotations cannot be approved', 400);

        quotation.approvalStatus = decision;
        quotation.approvalNotes = String(notes || '').trim();
        quotation.approvedBy = decision === 'pending' ? null : req.user.id;
        quotation.approvedAt = decision === 'pending' ? null : new Date();
        // The visible status follows the decision so the list reads correctly.
        if (decision === 'approved' && ['draft', 'sent'].includes(quotation.status)) quotation.status = 'accepted';
        if (decision === 'rejected') quotation.status = 'rejected';
        quotation.updatedBy = req.user.id;
        await quotation.save();

        logger.info(`Quotation ${quotation.quotationNumber} ${decision} by user ${req.user.id}`);
        res.json({
            success: true,
            message: `Quotation ${decision}`,
            data: { id: quotation._id, approvalStatus: quotation.approvalStatus, status: quotation.status },
        });
    } catch (error) { next(error); }
};

const convertQuotationToBooking = async (req, res, next) => {
    try {
        const { bookingAmount, expectedDeliveryDate, priority, notes } = req.body;

        const quotation = await Quotation.findById(req.params.id).populate('customer', 'firstName lastName companyName');
        if (!quotation) throw new AppError('Quotation not found', 404);
        if (quotation.status === 'converted') throw new AppError('Quotation already converted', 400);
        if (quotation.status === 'cancelled') throw new AppError('Cancelled quotations cannot be converted', 400);
        // The approval gate: nothing moves to a Booking until someone approves.
        if (quotation.approvalStatus !== 'approved') {
            throw new AppError('This quotation must be approved before it can become a booking', 409);
        }
        if (!num(bookingAmount)) throw new AppError('Booking amount is required', 400);

        // Vehicles must be actual inventory units by booking time; the client may
        // re-send the lines with allocations filled in, otherwise the quotation's
        // own lines are used as they stand.
        const requested = readRequestedItems(req.body);
        const lines = await resolveLineItems(
            requested.length ? requested : linesToRequested(quotation.lineItems),
            {
                checkStock: false, requireInventoryVehicle: true,
                vehicleStatuses: ['available', 'booked'], allowedTypes: VEHICLE_ONLY,
            },
        );
        const legacy = legacyFieldsFromLines(lines);
        const summary = summarizeLineItems(lines);

        const bookingNumber = await nextDocNumber(Booking, 'bookingNumber', 'BK');
        const booking = await Booking.create({
            bookingNumber,
            quotation: quotation._id,
            customer: quotation.customer?._id || quotation.customer,
            walkIn: quotation.walkIn,
            walkInName: quotation.walkInName,
            walkInPhone: quotation.walkInPhone,
            ...legacy,
            lineItems: lines,
            status: 'pending',
            priority: priority || 'normal',
            bookingAmount: num(bookingAmount),
            // The quotation's agreed total carries over — a booking does not
            // re-price what the customer already accepted.
            totalAmount: num(quotation.totalAmount) || summary.lineTotal,
            taxAmount: num(quotation.taxAmount),
            balanceAmount: Math.max(0, (num(quotation.totalAmount) || summary.lineTotal) - num(bookingAmount)),
            paidAmount: num(bookingAmount),
            bookingDate: new Date(),
            deliveryDate: expectedDeliveryDate ? new Date(expectedDeliveryDate) : null,
            notes,
            createdBy: req.user.id,
            seller: req.user.id,
            salePerson: [req.user.firstName, req.user.lastName].filter(Boolean).join(' '),
        });

        // Vehicles are reserved; parts stay on the shelf until the invoice.
        try {
            await reserveBookingVehicles(booking, { userId: req.user.id });
        } catch (error) {
            await Booking.deleteOne({ _id: booking._id });
            throw error;
        }

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

const hierarchyName = (value) => value?.name || '';
const bookingVehicleName = (booking) => [
    booking.vehicle?.make?.name || hierarchyName(booking.vehicleMake),
    booking.vehicle?.model?.name || hierarchyName(booking.vehicleModel),
    booking.vehicle?.variant?.name || hierarchyName(booking.vehicleVariant),
    booking.vehicle?.color?.name || hierarchyName(booking.vehicleColor),
].filter(Boolean).join(' ');

const mapBooking = (b, order = null) => ({
    ...serviceChargeSummary(b),
    id: b._id,
    booking_number: b.bookingNumber,
    external_order_number: b.externalOrderNumber || '',
    quotation_id: b.quotation || null,
    customer_id: b.customer?._id || b.customer || null,
    customer_name: buyerName(b),
    ...walkInFieldsOf(b),
    sale_type: b.saleType || 'vehicle',
    vehicle_id: b.vehicle?._id || b.vehicle || null,
    vehicle_variant_id: b.vehicleVariant?._id || b.vehicleVariant || null,
    vehicle_color_id: b.vehicleColor?._id || b.vehicleColor || null,
    part_id: b.part || null,
    service_type_id: b.serviceType || null,
    part_quantity: b.partQuantity || 1,
    item_name: b.itemDescription || bookingVehicleName(b),
    vehicle_full_name: bookingVehicleName(b) || b.itemDescription || '',
    line_items: (b.lineItems || []).map(mapLineItem),
    item_count: (b.lineItems || []).length,
    booking_amount: b.bookingAmount || 0,
    total_amount: b.totalAmount || 0,
    tax_amount: b.taxAmount || 0,
    expected_delivery_date: b.deliveryDate || null,
    priority: b.priority || 'normal',
    status: b.status || 'pending',
    sale_person: b.salePerson || '',
    seller_id: b.seller || null,
    sales_order_id: order?._id || null,
    sales_order_number: order?.orderNumber || null,
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
                { externalOrderNumber: regex },
                { salePerson: regex },
                { itemDescription: regex },
                ...(customerIds.length ? [{ customer: { $in: customerIds } }] : []),
            ];
        }

        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        const limitNum = Math.min(1000, Math.max(1, parseInt(limit, 10) || 20));
        const sortField = BOOKING_SORT[sortBy] || 'createdAt';
        const sortDir = String(sortOrder).toUpperCase() === 'ASC' ? 1 : -1;

        const [bookings, total] = await Promise.all([
            Booking.find(filter)
                .populate('customer', 'firstName lastName companyName phone customerCode')
                .populate('vehicle', 'vin make model variant color chassisNumber engineNumber registrationNumber')
                .populate('vehicleMake', 'name code')
                .populate('vehicleModel', 'name code year')
                .populate('vehicleVariant', 'name code')
                .populate('vehicleColor', 'name code hex_code')
                .sort({ [sortField]: sortDir })
                .skip((pageNum - 1) * limitNum)
                .limit(limitNum)
                .lean(),
            Booking.countDocuments(filter),
        ]);
        const linkedOrders = bookings.length
            ? await SalesOrder.find({ booking: { $in: bookings.map((booking) => booking._id) }, status: { $ne: 'cancelled' } })
                .select('booking orderNumber').lean()
            : [];
        const orderByBooking = Object.fromEntries(linkedOrders.map((order) => [String(order.booking), order]));

        res.json({
            success: true,
            data: bookings.map((booking) => mapBooking(booking, orderByBooking[String(booking._id)] || null)),
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
            .populate('vehicle', 'vin make model variant color chassisNumber engineNumber registrationNumber')
            .populate('vehicleMake', 'name code')
            .populate('vehicleModel', 'name code year')
            .populate('vehicleVariant', 'name code')
            .populate('vehicleColor', 'name code hex_code')
            .lean();
        if (!booking) throw new AppError('Booking not found', 404);
        const order = await SalesOrder.findOne({ booking: booking._id, status: { $ne: 'cancelled' } })
            .select('orderNumber').lean();
        res.json({ success: true, data: mapBooking(booking, order) });
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
            quotationId, bookingAmount, totalAmount, taxAmount,
            expectedDeliveryDate, priority, notes,
        } = req.body;

        if (!num(bookingAmount)) throw new AppError('Booking amount is required', 400);
        const requested = readRequestedItems(req.body);
        if (!requested.length) throw new AppError('Add at least one vehicle to the booking', 400);

        const { customer, walkIn, walkInName, walkInPhone } = await resolveDocumentCustomer(req.body, requireCustomer);
        // Vehicles must be real inventory units at booking time so they can be
        // reserved.
        const lines = await resolveLineItems(requested, {
            checkStock: false,
            requireInventoryVehicle: true,
            vehicleStatuses: ['available', 'booked'],
            allowedTypes: VEHICLE_ONLY,
        });
        const legacy = legacyFieldsFromLines(lines);
        const summary = summarizeLineItems(lines);
        // The optional service charges block sits on top of the products.
        const service = parseServiceCharges(req.body);
        const documentTotal = (num(totalAmount) || summary.lineTotal) + service.grand;

        const bookingNumber = await nextDocNumber(Booking, 'bookingNumber', 'BK');
        const booking = await Booking.create({
            bookingNumber,
            quotation: sanitizeId(quotationId),
            customer: customer._id,
            walkIn, walkInName, walkInPhone,
            ...legacy,
            lineItems: lines,
            status: 'pending',
            priority: priority || 'normal',
            bookingAmount: num(bookingAmount),
            paidAmount: num(bookingAmount),
            totalAmount: documentTotal,
            taxAmount: num(taxAmount),
            balanceAmount: Math.max(0, documentTotal - num(bookingAmount)),
            hasServiceCharges: service.rows.length > 0,
            serviceCharges: service.rows,
            serviceChargesTotal: service.serviceChargesTotal,
            serviceTaxTotal: service.serviceTaxTotal,
            bookingDate: new Date(),
            deliveryDate: expectedDeliveryDate ? new Date(expectedDeliveryDate) : null,
            notes,
            salePerson: [req.user.firstName, req.user.lastName].filter(Boolean).join(' '),
            seller: req.user.id,
            createdBy: req.user.id,
        });

        try {
            await reserveBookingVehicles(booking, { userId: req.user.id });
        } catch (error) {
            await Booking.deleteOne({ _id: booking._id });
            throw error;
        }

        await recordCustomerActivity({
            customerId: customer._id,
            docType: 'booking',
            docId: booking._id,
            number: bookingNumber,
            amount: booking.totalAmount || booking.bookingAmount,
            description: `Booking ${bookingNumber} — ${legacy.itemDescription} (deposit PKR ${num(bookingAmount).toLocaleString()})`,
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
            customerId, bookingAmount, totalAmount, taxAmount,
            expectedDeliveryDate, status, priority, notes,
        } = req.body;
        const nextStatus = status
            ? assertDocumentStatusTransition('booking', booking.status, status)
            : null;
        if (['completed', 'cancelled'].includes(nextStatus)) {
            throw new AppError(`Use the ${nextStatus === 'completed' ? 'Convert to Sales Order' : 'Cancel Booking'} action`, 409);
        }

        if (sanitizeId(customerId) || req.body.walkIn !== undefined) {
            const resolved = await resolveDocumentCustomer(req.body, requireCustomer);
            booking.customer = resolved.customer._id;
            booking.walkIn = resolved.walkIn;
            booking.walkInName = resolved.walkInName;
            booking.walkInPhone = resolved.walkInPhone;
        }

        const requested = readRequestedItems(req.body);
        if (requested.length) {
            const previousVehicles = new Set((booking.lineItems || [])
                .filter((line) => line.itemType === 'vehicle' && line.vehicle)
                .map((line) => String(line.vehicle)));
            const lines = await resolveLineItems(requested, {
                checkStock: false,
                requireInventoryVehicle: true,
                vehicleStatuses: ['available', 'booked'],
                allowedTypes: VEHICLE_ONLY,
            });
            const nextVehicles = new Set(lines
                .filter((line) => line.itemType === 'vehicle' && line.vehicle)
                .map((line) => String(line.vehicle)));
            // Swapping an already-reserved unit hides which chassis the customer
            // was promised; cancelling and re-booking keeps that history honest.
            const removed = [...previousVehicles].filter((id) => !nextVehicles.has(id));
            if (removed.length) {
                throw new AppError('A reserved vehicle cannot be removed or replaced on a booking; cancel it and create a new Booking.', 409);
            }
            Object.assign(booking, legacyFieldsFromLines(lines));
            booking.lineItems = lines;
            // Newly added vehicles get reserved; parts still do not move stock.
            await reserveBookingVehicles(booking, { userId: req.user.id });
        }

        Object.assign(booking, {
            bookingAmount: num(bookingAmount, booking.bookingAmount),
            totalAmount: num(totalAmount, booking.totalAmount),
            taxAmount: num(taxAmount, booking.taxAmount),
            deliveryDate: expectedDeliveryDate ? new Date(expectedDeliveryDate) : booking.deliveryDate,
            ...(nextStatus ? { status: nextStatus } : {}),
            ...(priority ? { priority } : {}),
            notes: notes !== undefined ? notes : booking.notes,
            updatedBy: req.user.id,
        });
        booking.paidAmount = num(booking.bookingAmount) + num(booking.subsequentPayments);
        booking.balanceAmount = Math.max(0, num(booking.totalAmount) - num(booking.paidAmount));
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
        if (booking.status === 'completed') {
            throw new AppError('Completed bookings cannot be cancelled', 409);
        }
        const linkedOrder = await SalesOrder.findOne({ booking: booking._id, status: { $ne: 'cancelled' } })
            .select('orderNumber')
            .lean();
        if (linkedOrder) {
            throw new AppError(`Booking is linked to sales order ${linkedOrder.orderNumber} and cannot be cancelled independently`, 409);
        }
        // Every reserved unit on the booking goes back to available. No part
        // stock has to be returned — a booking never took any.
        await releaseBookingVehicles(booking);

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
        if (['cancelled', 'completed'].includes(booking.status)) {
            throw new AppError(`Booking is ${booking.status} and cannot receive a Vehicle allocation`, 400);
        }
        if (booking.vehicle) throw new AppError('Booking already has an allocated Vehicle', 409);

        const vehicle = await Vehicle.findById(vehicleId);
        if (!vehicle) throw new AppError('Vehicle not found', 404);
        if (!['available'].includes(canonicalStatus(vehicle.status))) {
            throw new AppError(`Vehicle is not available for allocation (current status: ${vehicle.status})`, 400);
        }

        await applyVehicleLifecycle(vehicle.toObject(), 'reserved', {
            sourceType: 'booking',
            sourceId: booking._id,
            reference: booking.bookingNumber,
            userId: req.user.id,
        });

        booking.vehicle = vehicle._id;
        // Fill the allocation into the first unallocated vehicle line so the
        // multi-product list and the legacy field agree on what was allocated.
        const openLine = (booking.lineItems || []).find((line) => line.itemType === 'vehicle' && !line.vehicle);
        if (openLine) {
            openLine.vehicle = vehicle._id;
            openLine.code = vehicle.chassisNumber || vehicle.vin || vehicle.vehicleCode || '';
            openLine.barcode = vehicle.barcode || '';
        } else if (!(booking.lineItems || []).length) {
            booking.lineItems = [{
                itemType: 'vehicle',
                vehicle: vehicle._id,
                code: vehicle.chassisNumber || vehicle.vin || vehicle.vehicleCode || '',
                barcode: vehicle.barcode || '',
                name: booking.itemDescription || 'Vehicle',
                description: booking.itemDescription || 'Vehicle',
                quantity: 1,
                unitPrice: num(booking.totalAmount),
                totalPrice: num(booking.totalAmount),
            }];
        }
        booking.status = 'in_progress';
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
    ...serviceChargeSummary(o),
    id: o._id,
    order_number: o.orderNumber,
    external_order_number: o.externalOrderNumber || '',
    pbo_no: o.pboNo || o.bookingNo || '',
    booking_number: o.booking?.bookingNumber || o.bookingNo || o.pboNo || '',
    booking_id: o.booking?._id || o.booking || null,
    customer_id: o.customer?._id || o.customer || null,
    customer_name: buyerName(o),
    ...walkInFieldsOf(o),
    sale_type: o.saleType || 'vehicle',
    vehicle_id: o.vehicle?._id || o.vehicle || null,
    part_id: o.part || null,
    part_quantity: o.partQuantity || 1,
    item_name: o.lineItems?.[0]?.description || o.items?.[0]?.description || '',
    line_items: (o.lineItems || []).map(mapLineItem),
    item_count: (o.lineItems || []).length,
    make_name: o.vehicle?.make?.name || hierarchyName(o.vehicleMake),
    model_name: o.vehicle?.model?.name || hierarchyName(o.vehicleModel),
    variant_name: o.vehicle?.variant?.name || hierarchyName(o.vehicleVariant),
    color_name: o.vehicle?.color?.name || hierarchyName(o.vehicleColor),
    vin: o.vehicle?.vin || '',
    chassis_number: o.vehicle?.chassisNumber || '',
    engine_number: o.vehicle?.engineNumber || '',
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
    sale_person: o.salePerson || '',
    external_invoice_number: o.invoiceNo || '',
    dispatch_number: o.dispatchNo || '',
    dispatch_date: o.dispatchDate || null,
    transport_company: o.transportCompany || '',
    ship_from: o.shipFrom || '',
    ship_to: o.shipTo || '',
    notes: o.notes || '',
    created_at: o.createdAt,
    updated_at: o.updatedAt,
    invoice_id: invoice?._id || null,
    external_invoice_reference: invoice?.externalInvoiceNumber || o.invoiceNo || '',
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
            Invoice.find({
                $or: [{ invoiceNumber: regex }, { externalInvoiceNumber: regex }],
                salesOrder: { $ne: null },
            }).select('salesOrder').limit(200).lean(),
            Vehicle.find({
                $or: [
                    { vin: regex },
                    { chassisNumber: regex },
                    { engineNumber: regex },
                    { registrationNumber: regex },
                ],
            }).select('_id').limit(200).lean(),
        ]);
        filter.$or = [
            { orderNumber: regex },
            { externalOrderNumber: regex },
            { pboNo: regex },
            { bookingNo: regex },
            { invoiceNo: regex },
            { dispatchNo: regex },
            { salePerson: regex },
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
        const limitNum = Math.min(1000, Math.max(1, parseInt(limit, 10) || 20));
        const sortField = ORDER_SORT[sortBy] || 'createdAt';
        const sortDir = String(sortOrder).toUpperCase() === 'ASC' ? 1 : -1;

        const [orders, total] = await Promise.all([
            SalesOrder.find(filter)
                .populate('customer', 'firstName lastName companyName phone customerCode')
                .populate('vehicle', 'vin make model variant color chassisNumber engineNumber registrationNumber')
                .populate('vehicleMake', 'name code')
                .populate('vehicleModel', 'name code year')
                .populate('vehicleVariant', 'name code')
                .populate('vehicleColor', 'name code hex_code')
                .populate('booking', 'bookingNumber externalOrderNumber')
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
            }).select('salesOrder invoiceNumber externalInvoiceNumber status').lean();
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
            .populate('vehicle', 'vin make model variant color chassisNumber engineNumber registrationNumber')
            .populate('vehicleMake', 'name code')
            .populate('vehicleModel', 'name code year')
            .populate('vehicleVariant', 'name code')
            .populate('vehicleColor', 'name code hex_code')
            .populate('booking', 'bookingNumber externalOrderNumber')
            .lean();
        if (!order) throw new AppError('Order not found', 404);

        const invoice = await Invoice.findOne({ salesOrder: order._id, status: { $ne: 'cancelled' } })
            .select('invoiceNumber externalInvoiceNumber status').lean();
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
  if(operation==='delete'&&type!=='quotation')throw new AppError('Bookings and sales orders must be cancelled individually so linked inventory and invoices remain consistent',409);
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
    const service = parseServiceCharges(body);
    const total = basePrice + accessories - discount + tax + registration + insurance + other - exchange + service.grand;
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
        hasServiceCharges: service.rows.length > 0,
        serviceCharges: service.rows,
        serviceChargesTotal: service.serviceChargesTotal,
        serviceTaxTotal: service.serviceTaxTotal,
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
async function createOrderInternal({
    body,
    userId,
    bookingId = null,
    quotationId = null,
    sellerId = userId,
    sellerEmployeeId = null,
    salePerson = '',
}) {
    const {
        financeCompany, financeAmount, exchangeVehicleDetails,
        expectedDeliveryDate, notes,
    } = body;

    const { customer, walkIn, walkInName, walkInPhone } = await resolveDocumentCustomer(body, requireCustomer);
    // A method picked from the Payment Methods master wins over the free-text
    // mode older callers still send.
    const method = await resolvePaymentMethod(body.paymentMethodId);
    const paymentMode = method.name || body.paymentMode;

    const requested = readRequestedItems(body);
    if (!requested.length) throw new AppError('Add at least one vehicle to the sales order', 400);

    // Availability is checked so the order cannot promise a unit that is gone,
    // but nothing is consumed here — vehicles become sold only once the invoice
    // is raised (services/stockLedger.service.js).
    const lines = await resolveLineItems(requested, {
        checkStock: true,
        requireInventoryVehicle: true,
        vehicleStatuses: ['available', 'booked'],
        allowedTypes: VEHICLE_ONLY,
    });
    const legacy = legacyFieldsFromLines(lines);
    const summary = summarizeLineItems(lines);

    const basePrice = num(body.vehiclePrice) || summary.subtotal;
    if (basePrice <= 0) throw new AppError('Valid price is required', 400);

    const totals = orderTotals({ ...body, vehiclePrice: basePrice });

    if (totals.paidAmount < 0) {
        throw new AppError('Paid amount cannot be negative', 400);
    }
    // Handing over more than the total is normal at a counter: only the amount
    // owed is applied, and the surplus is change to return. Recording the full
    // tender as "paid" would post a negative balance and corrupt receivables.
    const amountTendered = totals.paidAmount;
    const changeDue = round2(Math.max(0, amountTendered - totals.totalAmount));
    if (changeDue > 0) totals.paidAmount = totals.totalAmount;
    totals.balanceAmount = round2(totals.totalAmount - totals.paidAmount);

    // Confirming this order raises its invoice immediately, so the money has to
    // be here now — an invoice never leaves with a balance on it.
    assertFullPayment(totals.totalAmount, amountTendered, { document: 'invoice' });

    const description = legacy.itemDescription;

    const orderNumber = await nextDocNumber(SalesOrder, 'orderNumber', 'SO');
    const now = new Date();

    const order = await SalesOrder.create({
        orderNumber,
        booking: sanitizeId(bookingId),
        quotation: sanitizeId(quotationId),
        customer: customer._id,
        walkIn, walkInName, walkInPhone,
        ...legacy,
        lineItems: lines,
        status: 'confirmed',
        ...totals,
        paymentMode: paymentMode || 'cash',
        financeCompany: financeCompany || '',
        financeAmount: num(financeAmount),
        exchangeVehicleDetails: exchangeVehicleDetails || '',
        orderDate: now,
        deliveryDate: expectedDeliveryDate ? new Date(expectedDeliveryDate) : null,
        notes,
        seller: sanitizeId(sellerId),
        sellerEmployee: sanitizeId(sellerEmployeeId),
        salePerson: String(salePerson || '').trim(),
        createdBy: userId,
    });

    // No stock moves here on purpose. The order confirms intent; the invoice
    // created below is what decrements parts and marks vehicles sold.

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
            const payment = await Payment.create({
                paymentNumber,
                invoice: invoice._id,
                customer: customer._id,
                methodRef: method.id,
                method: { name: paymentMode || 'cash', code: method.code, type: method.type },
                amount: totals.paidAmount,
                paymentDate: now,
                notes: `Initial payment with sales order ${orderNumber}`,
                status: 'completed',
                createdBy: userId,
            });
            // ...and into the money account it actually went into, so the
            // Accounts screen agrees with the counter.
            const { postCustomerReceipt } = require('../services/receipts.service');
            const receipt = await postCustomerReceipt({
                amount: totals.paidAmount,
                accountId: body.accountId,
                paymentMethod: method,
                date: now,
                description: `Receipt against invoice ${invoice.invoiceNumber} (order ${orderNumber})`,
                referenceType: 'invoice_payment',
                referenceId: `${invoice.invoiceNumber}#${payment._id}`,
                userId,
            });
            if (receipt.account) { invoice.paymentAccount = receipt.account._id; await invoice.save(); }
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

    // Change is recorded on the invoice so it can be printed on the receipt /
    // shown on the generated list, and nowhere else in the money figures.
    if (invoice && changeDue > 0) {
        invoice.amountTendered = amountTendered;
        invoice.changeDue = changeDue;
        await invoice.save();
    }

    return { order, invoice, orderNumber, amountTendered, changeDue };
}

const createSalesOrder = async (req, res, next) => {
    try {
        const { order, orderNumber, changeDue } = await createOrderInternal({
            body: req.body,
            userId: req.user.id,
            bookingId: req.body.bookingId,
            sellerId: req.user.id,
            salePerson: [req.user.firstName, req.user.lastName].filter(Boolean).join(' '),
        });
        res.status(201).json({ success: true, data: { id: order._id, orderNumber, changeDue } });
    } catch (error) {
        next(error);
    }
};

const createDirectSalesOrder = async (req, res, next) => {
    try {
        const { order, invoice, orderNumber, amountTendered, changeDue } = await createOrderInternal({
            body: req.body,
            userId: req.user.id,
            sellerId: req.user.id,
            salePerson: [req.user.firstName, req.user.lastName].filter(Boolean).join(' '),
        });
        logger.info(`Direct sales order ${orderNumber} created by user ${req.user.id}`);
        res.status(201).json({
            success: true,
            data: {
                id: order._id,
                orderNumber,
                invoiceNumber: invoice?.invoiceNumber || null,
                amountTendered,
                changeDue,
            },
            message: changeDue > 0
                ? `Sales order created. Return change of PKR ${changeDue.toLocaleString('en-PK')}`
                : 'Sales order created successfully',
        });
    } catch (error) {
        logger.error('Error creating direct sales order:', error);
        next(error);
    }
};

const convertBookingToOrder = async (req, res, next) => {
    try {
        const {
            vehicleId, paidAmount, paymentMode, paymentMethodId,
            registrationCharges, insuranceCharges, notes,
        } = req.body;

        const booking = await Booking.findById(req.params.id);
        if (!booking) throw new AppError('Booking not found', 404);
        if (booking.status === 'cancelled') throw new AppError('Cancelled bookings cannot be converted', 400);
        if (booking.status === 'completed') throw new AppError('This booking has already been converted to a sales order', 400);
        if (booking.saleType === 'service') throw new AppError('Services are managed from Service Management', 400);
        const existingOrder = await SalesOrder.findOne({ booking: booking._id, status: { $ne: 'cancelled' } }).lean();
        if (existingOrder) {
            throw new AppError(`Booking is already linked to sales order ${existingOrder.orderNumber}`, 409);
        }

        // Every line carries over. A vehicle line still missing its inventory
        // unit can be filled from `vehicleId` for the single-vehicle case the
        // older UI sends.
        const bookingLines = linesToRequested(booking.lineItems);
        const fallbackVehicleId = sanitizeId(vehicleId) || (booking.vehicle ? String(booking.vehicle) : null);
        bookingLines.forEach((line) => {
            if (line.itemType === 'vehicle' && !line.vehicleId && fallbackVehicleId) line.vehicleId = fallbackVehicleId;
        });
        if (!bookingLines.length) throw new AppError('This booking has no products to convert', 400);
        if (bookingLines.some((line) => line.itemType === 'vehicle' && !line.vehicleId)) {
            throw new AppError('Every vehicle on the booking must be allocated an inventory unit first', 400);
        }

        const { order, orderNumber } = await createOrderInternal({
            body: {
                customerId: booking.customer,
                walkIn: booking.walkIn,
                walkInName: booking.walkInName,
                walkInPhone: booking.walkInPhone,
                lineItems: bookingLines,
                vehiclePrice: booking.totalAmount,
                registrationCharges,
                insuranceCharges,
                // Whatever was taken as the booking deposit is already paid, so
                // anything collected at handover adds to it rather than
                // replacing it (the parts side does the same).
                paidAmount: paidAmount !== undefined
                    ? num(paidAmount) + num(booking.bookingAmount)
                    : booking.bookingAmount,
                paymentMethodId,
                paymentMode: paymentMode || 'cash',
                expectedDeliveryDate: booking.deliveryDate,
                notes,
            },
            userId: req.user.id,
            bookingId: booking._id,
            quotationId: booking.quotation,
            sellerId: booking.seller || req.user.id,
            sellerEmployeeId: booking.sellerEmployee || null,
            salePerson: booking.salePerson || [req.user.firstName, req.user.lastName].filter(Boolean).join(' '),
        });

        if (fallbackVehicleId && !booking.vehicle) booking.vehicle = fallbackVehicleId;
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
        const nextStatus = status
            ? assertDocumentStatusTransition('sales_order', order.status, status)
            : null;
        if (nextStatus === 'cancelled') {
            throw new AppError('Use the Cancel Sales Order action so linked inventory and invoice records remain consistent', 409);
        }

        const totals = orderTotals({
            ...order.toObject(),
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
            ...(nextStatus ? { status: nextStatus } : {}),
            deliveryDate: expectedDeliveryDate ? new Date(expectedDeliveryDate) : order.deliveryDate,
            notes: notes !== undefined ? notes : order.notes,
            updatedBy: req.user.id,
        });

        if (order.items?.length) {
            order.items[0].totalPrice = totals.subtotal;
            order.items[0].unitPrice = order.items[0].quantity ? totals.subtotal / order.items[0].quantity : totals.subtotal;
        }
        if (nextStatus && ['dispatched', 'delivered'].includes(nextStatus) && order.vehicle) {
            const vehicle = await Vehicle.findById(order.vehicle).lean();
            if (!vehicle) throw new AppError('Order references a Vehicle that no longer exists', 409);
            await applyVehicleLifecycle(vehicle, nextStatus, {
                sourceType: 'sales_order_status',
                sourceId: order._id,
                reference: order.orderNumber,
                userId: req.user.id,
            });
            if (nextStatus === 'delivered') order.deliveredAt = new Date();
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
        if (['dispatched', 'in_transit', 'delivered', 'completed'].includes(canonicalStatus(order.status))) {
            throw new AppError('Dispatched or completed orders cannot be cancelled', 400);
        }

        order.status = 'cancelled';
        order.cancelledAt = new Date();
        order.updatedBy = req.user.id;
        await order.save();

        // Cancel the linked unpaid invoice. That invoice is what took the stock,
        // so returning it is handled there — the order itself took nothing.
        const invoice = await Invoice.findOne({ salesOrder: order._id, status: { $nin: ['cancelled', 'paid'] } });
        if (invoice) {
            const outstandingDelta = -num(invoice.balanceAmount);
            await revertInvoiceStock(invoice);
            invoice.stockApplied = false;
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
        if (!['dispatched', 'in_transit'].includes(canonicalStatus(order.status))) {
            throw new AppError('Only dispatched orders can be delivered', 400);
        }

        order.status = 'delivered';
        order.deliveredAt = new Date();
        order.updatedBy = req.user.id;
        await order.save();
        if (order.vehicle) {
            const vehicle = await Vehicle.findById(order.vehicle).lean();
            if (vehicle) {
                await applyVehicleLifecycle(vehicle, 'delivered', {
                    sourceType: 'delivery',
                    sourceId: order._id,
                    reference: order.dispatchNo || order.orderNumber,
                    userId: req.user.id,
                });
            }
        }

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
        if (!status) throw new AppError('Status is required', 400);

        if (status === 'cancelled') return deleteSalesOrder(req, res, next);
        if (status === 'delivered') return deliverSalesOrder(req, res, next);

        const order = await SalesOrder.findById(req.params.id);
        if (!order) throw new AppError('Order not found', 404);
        order.status = assertDocumentStatusTransition('sales_order', order.status, status);
        order.updatedBy = req.user.id;
        await order.save();

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
        // An order still owing money cannot be turned into an invoice; settle it
        // against the order first.
        assertFullPayment(order.totalAmount, order.paidAmount, { document: 'invoice' });

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
                    approved: { $sum: { $cond: [{ $eq: ['$approvalStatus', 'approved'] }, 1, 0] } },
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

// ═══════════════════════════════════════════════════════════════════════════
// DISPATCH LISTING
// ═══════════════════════════════════════════════════════════════════════════

const DISPATCH_SORT = {
    created_at: 'createdAt', dispatch_date: 'dispatchDate', dispatch_no: 'dispatchNo',
    order_number: 'orderNumber', total_amount: 'totalAmount', status: 'status',
};

async function buildDispatchFilter(query = {}) {
    const {
        status, customerId, search, dateFrom, dateTo, dispatchFrom, dispatchTo,
    } = query;
    const filter = { dispatchNo: { $exists: true, $nin: [null, ''] } };
    if (status) filter.status = status === 'delivered' ? { $in: ['delivered', 'completed'] } : status;
    if (sanitizeId(customerId)) filter.customer = customerId;

    const dispatchRange = dateRangeFilter(dispatchFrom, dispatchTo);
    if (dispatchRange) filter.dispatchDate = dispatchRange;
    const createdRange = dateRangeFilter(dateFrom, dateTo);
    if (createdRange) filter.createdAt = createdRange;

    if (search) {
        const regex = new RegExp(String(search).trim().split(/\s+/).map(escapeRegex).join('|'), 'i');
        const [customerIds, vehicleIds, invoiceOrders] = await Promise.all([
            findCustomerIdsBySearch(search),
            Vehicle.find({
                $or: [
                    { vin: regex },
                    { chassisNumber: regex },
                    { engineNumber: regex },
                    { registrationNumber: regex },
                ],
            }).select('_id').limit(200).lean(),
            Invoice.find({
                $or: [
                    { invoiceNumber: regex },
                    { externalInvoiceNumber: regex },
                ],
            }).select('salesOrder').limit(200).lean(),
        ]);
        const invoiceOrderIds = invoiceOrders.map((invoice) => invoice.salesOrder).filter(Boolean);
        filter.$or = [
            { orderNumber: regex },
            { dispatchNo: regex },
            { externalOrderNumber: regex },
            { pboNo: regex },
            { bookingNo: regex },
            { salePerson: regex },
            { transportCompany: regex },
            { builtyNo: regex },
            { sapOrderNo: regex },
            { invoiceNo: regex },
            ...(customerIds.length ? [{ customer: { $in: customerIds } }] : []),
            ...(vehicleIds.length ? [{ vehicle: { $in: vehicleIds.map((vehicle) => vehicle._id) } }] : []),
            ...(invoiceOrderIds.length ? [{ _id: { $in: invoiceOrderIds } }] : []),
        ];
    }
    return filter;
}

const getDispatchedOrders = async (req, res, next) => {
    try {
        const {
            status, customerId, search, dateFrom, dateTo, dispatchFrom, dispatchTo,
            sortBy = 'dispatch_date', sortOrder = 'DESC', page = 1, limit = 20,
        } = req.query;

        const filter = await buildDispatchFilter(req.query);

        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        const limitNum = Math.min(1000, Math.max(1, parseInt(limit, 10) || 20));
        const sortField = DISPATCH_SORT[sortBy] || 'dispatchDate';
        const sortDir = String(sortOrder).toUpperCase() === 'ASC' ? 1 : -1;

        const [orders, total] = await Promise.all([
            SalesOrder.find(filter)
                .populate('customer', 'firstName lastName companyName phone customerCode')
                .populate('vehicle', 'vin make model variant color chassisNumber engineNumber')
                .populate('vehicleMake', 'name code')
                .populate('vehicleModel', 'name code year')
                .populate('vehicleVariant', 'name code')
                .populate('vehicleColor', 'name code hex_code')
                .populate('booking', 'bookingNumber')
                .populate('invoice', 'invoiceNumber externalInvoiceNumber status totalAmount paidAmount balanceAmount')
                .populate('seller', 'firstName lastName fullName email')
                .populate('sellerEmployee', 'firstName lastName employeeCode')
                .sort({ [sortField]: sortDir })
                .skip((pageNum - 1) * limitNum)
                .limit(limitNum)
                .lean(),
            SalesOrder.countDocuments(filter),
        ]);

        const mapped = orders.map((o) => ({
            id: o._id,
            order_number: o.orderNumber,
            external_order_number: o.externalOrderNumber || '',
            customer_name: customerName(o.customer),
            customer_id: o.customer?._id || o.customer || null,
            vehicle_name: [
                o.vehicle?.make?.name || hierarchyName(o.vehicleMake),
                o.vehicle?.model?.name || hierarchyName(o.vehicleModel),
                o.vehicle?.variant?.name || hierarchyName(o.vehicleVariant),
            ].filter(Boolean).join(' ') || o.vehicle?.chassisNumber || o.vehicle?.vin || o.vehicle?.engineNumber || '',
            vehicle_id: o.vehicle?._id || o.vehicle || null,
            chassis_number: o.vehicle?.chassisNumber || o.vehicle?.vin || '',
            engine_number: o.vehicle?.engineNumber || '',
            dispatch_no: o.dispatchNo || null,
            dispatch_date: o.dispatchDate || null,
            transport_company: o.transportCompany || '',
            builty_no: o.builtyNo || '',
            ship_from: o.shipFrom || '',
            ship_to: o.shipTo || '',
            sap_order_no: o.sapOrderNo || '',
            sap_order_date: o.sapOrderDate || null,
            source_invoice_no: o.invoice?.externalInvoiceNumber || o.invoiceNo || '',
            invoice_number: o.invoice?.invoiceNumber || '',
            invoice_no: o.invoice?.externalInvoiceNumber || o.invoice?.invoiceNumber || o.invoiceNo || '',
            invoice_id: o.invoice?._id || o.invoice || null,
            booking_no: o.bookingNo || o.booking?.bookingNumber || '',
            booking_id: o.booking?._id || o.booking || null,
            status: canonicalStatus(o.status),
            total_amount: o.totalAmount || 0,
            paid_amount: o.paidAmount || 0,
            balance_amount: o.balanceAmount || 0,
            sale_person: o.salePerson || '',
            seller_id: o.seller?._id || o.seller || null,
            seller_name: [o.seller?.firstName, o.seller?.lastName].filter(Boolean).join(' ') || o.seller?.fullName || [o.sellerEmployee?.firstName, o.sellerEmployee?.lastName].filter(Boolean).join(' '),
            seller_employee_id: o.sellerEmployee?._id || o.sellerEmployee || null,
            dealer_name: o.dealerName || '',
            created_at: o.createdAt,
            updated_at: o.updatedAt,
        }));

        res.json({
            success: true,
            data: mapped,
            pagination: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum) },
        });
    } catch (error) {
        next(error);
    }
};

const getDispatchStats = async (req, res, next) => {
    try {
        const filter = await buildDispatchFilter(req.query);
        const [result] = await SalesOrder.aggregate([
            { $match: filter },
            {
                $group: {
                    _id: null,
                    totalDispatched: { $sum: 1 },
                    totalValue: { $sum: '$totalAmount' },
                    delivered: { $sum: { $cond: [{ $eq: ['$status', 'delivered'] }, 1, 0] } },
                    dispatched: { $sum: { $cond: [{ $eq: ['$status', 'dispatched'] }, 1, 0] } },
                },
            },
        ]);
        res.json({ success: true, data: result || { totalDispatched: 0, totalValue: 0, delivered: 0, dispatched: 0 } });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    // Quotations
    getAllQuotations, getQuotationById, createQuotation, updateQuotation,
    deleteQuotation, updateQuotationStatus, convertQuotationToBooking, getQuotationStats, sendQuotationEmail,
    approveQuotation, downloadQuotationEstimate, sendQuotationEstimateEmail,
    // Bookings
    getAllBookings, getBookingById, createBooking, updateBooking,
    deleteBooking, allocateVehicle, convertBookingToOrder, getBookingStats, sendBookingEmail,
    // Sales Orders
    getAllSalesOrders, getSalesOrderById, createSalesOrder, updateSalesOrder,
    deleteSalesOrder, deliverSalesOrder, getOrderStats,
    // New Sales Order Endpoints
    createDirectSalesOrder, updateSalesOrderStatus, generateInvoiceFromOrder,
    getSalesOrderHistory, getSalesOrdersWithInvoices, sendSalesOrderEmail, bulkSalesDocuments,
    // Dispatch
    getDispatchedOrders, getDispatchStats,
    // Stats
    getSalesStats,
};
