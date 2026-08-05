/**
 * Parts Sales Controller (MongoDB)
 *
 * Quotations, bookings, sales orders and invoices for spare parts. These live
 * in their own collections (part_quotations, part_bookings, part_sales_orders,
 * part_invoices) and on their own number series (PQT / PBK / PSO / PINV) so a
 * parts document never mixes with the vehicle documents handled by
 * salesManagement.controller.js.
 *
 * What is deliberately different from the vehicle side:
 *   - a line is always a part, always has a quantity, and is checked against
 *     stock rather than against a physical unit's status
 *   - stock moves at the invoice and only there (services/partStock.service.js)
 *   - there is no vehicle allocation, no dispatch and no Dealer Pro import
 *   - a sale may be to the shared walk-in customer (utils/walkInCustomer.js)
 *
 * Maintained by Hussain Developer
 * AMS ERP
 */

const mongoose = require('mongoose');
const { AppError } = require('../middleware/errorHandler');
const logger = require('../utils/logger');
const PartQuotation = require('../models/PartQuotation.model');
const PartBooking = require('../models/PartBooking.model');
const PartSalesOrder = require('../models/PartSalesOrder.model');
const PartInvoice = require('../models/PartInvoice.model');
const Customer = require('../models/Customer.model');
const { nextDocNumber } = require('../utils/docNumber');
const { recordCustomerActivity } = require('../utils/customerSync');
const { resolveLineItems, summarizeLineItems, linesToRequested, round2 } = require('../services/lineItems.service');
const { applyInvoiceStock, revertInvoiceStock, assertPartsAvailable } = require('../services/partStock.service');
const { resolveDocumentCustomer } = require('../utils/walkInCustomer');
const { allowedOwnerIds, canDo } = require('../utils/roleJobs');
const { sendCustomerDocumentEmail } = require('../services/documentEmail.service');
const { buildEstimatePdf, buildEstimateEmailContext, defaultEstimateEmailHtml } = require('../services/estimate.service');
const { sendTemplateEmail, sendRawEmail } = require('../services/emailSender.service');
const { companyName } = require('../services/pdfData.service');

// ═══════════════════════════════════════════════════════════════════════════
// SHARED HELPERS
// ═══════════════════════════════════════════════════════════════════════════

const sanitizeId = (id) => {
    if (id === '' || id === undefined || id === null) return null;
    return mongoose.Types.ObjectId.isValid(id) ? id : null;
};

const num = (value, fallback = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const customerName = (customer) => {
    if (!customer || typeof customer !== 'object') return '';
    return [customer.firstName, customer.lastName].filter(Boolean).join(' ') || customer.companyName || '';
};

/** What to print as the buyer: the typed walk-in name wins over the shared record. */
const buyerName = (doc) => (doc.walkIn && doc.walkInName ? doc.walkInName : customerName(doc.customer));

async function requireCustomer(customerId) {
    if (!sanitizeId(customerId)) throw new AppError('Customer is required', 400);
    const customer = await Customer.findOne({ _id: customerId, deletedAt: null }).lean();
    if (!customer) throw new AppError('Customer not found', 404);
    return customer;
}

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

/**
 * Turn the request's products into validated, priced part lines.
 *
 * Every line is forced to itemType 'part' regardless of what the client sent,
 * so a vehicle can never reach a parts document even if the payload claims one.
 * resolveLineItems does the pricing, the per-part stock check and the
 * combined-quantity check.
 */
async function resolvePartLines(body = {}, { checkStock = false } = {}) {
    const raw = Array.isArray(body.lineItems) && body.lineItems.length
        ? body.lineItems
        : Array.isArray(body.items) ? body.items : [];
    const requested = raw
        .filter((line) => line && (line.partId || line.part))
        .map((line) => ({ ...line, itemType: 'part' }));
    if (!requested.length) throw new AppError('Add at least one part to the document', 400);
    return resolveLineItems(requested, { checkStock });
}

/** Document-level totals on top of the line totals. */
function documentTotals(body, lines) {
    const summary = summarizeLineItems(lines);
    const discountAmount = round2(num(body.discountAmount) + summary.lineDiscountAmount);
    const taxAmount = round2(num(body.taxAmount) + summary.lineTaxAmount);
    const additionalCharges = round2(num(body.additionalCharges) || num(body.otherCharges));
    const totalAmount = round2(summary.subtotal - discountAmount + taxAmount + additionalCharges);
    if (totalAmount < 0) throw new AppError('Discount cannot exceed the value of the parts', 400);
    return {
        subtotal: summary.subtotal,
        discountAmount,
        taxAmount,
        additionalCharges,
        otherCharges: additionalCharges,
        totalAmount,
    };
}

/**
 * Split a stored document's discount/tax back into the document-level part.
 *
 * documentTotals() stores `body.discountAmount + line discounts` in one field.
 * When one document becomes another the lines come across unchanged and are
 * re-summed, so only the residue may be passed on — otherwise every conversion
 * would discount the sale twice.
 */
function documentLevelOnly(doc) {
    const summary = summarizeLineItems(doc.lineItems || []);
    return {
        discountAmount: Math.max(0, round2(num(doc.discountAmount) - summary.lineDiscountAmount)),
        taxAmount: Math.max(0, round2(num(doc.taxAmount) - summary.lineTaxAmount)),
    };
}

const lineDescription = (lines) => lines.map((line) => line.description).filter(Boolean).join(', ');

const mapLine = (line) => ({
    id: line._id ? String(line._id) : undefined,
    item_type: 'part',
    part_id: line.part ? String(line.part._id || line.part) : null,
    code: line.code || '',
    barcode: line.barcode || '',
    name: line.name || '',
    description: line.description || '',
    quantity: num(line.quantity, 1),
    unit_price: num(line.unitPrice),
    discount_amount: num(line.discountAmount),
    tax_amount: num(line.taxAmount),
    total_price: num(line.totalPrice),
});

/** Fields every parts document exposes to the client. */
const commonFields = (doc) => ({
    id: doc._id,
    customer_id: doc.customer?._id || doc.customer || null,
    customer_name: buyerName(doc),
    walk_in: doc.walkIn === true,
    walk_in_name: doc.walkInName || '',
    walk_in_phone: doc.walkInPhone || '',
    sale_type: 'parts',
    line_items: (doc.lineItems || []).map(mapLine),
    item_count: (doc.lineItems || []).length,
    item_name: doc.lineItems?.[0]?.description || '',
    total_quantity: (doc.lineItems || []).reduce((sum, line) => sum + num(line.quantity, 1), 0),
    notes: doc.notes || '',
    status: doc.status || 'draft',
    created_at: doc.createdAt,
    updated_at: doc.updatedAt,
});

/**
 * Build a list handler shared by all four document types.
 *
 * `decorate` gets the raw rows and returns the mapped list, for the one case
 * (bookings) that needs a second query before it can map. Without it, `map` is
 * applied row by row.
 */
function listHandler({ Model, permissionKey, numberField, sortMap, searchFields, map, decorate = null, populate = [] }) {
    return async (req, res, next) => {
        try {
            const {
                status, customerId, search, dateFrom, dateTo,
                sortBy = 'created_at', sortOrder = 'DESC', page = 1, limit = 20,
            } = req.query;

            const filter = { status: { $ne: 'cancelled' } };
            const ownerIds = await allowedOwnerIds(req.user, permissionKey);
            if (ownerIds !== null) filter.createdBy = { $in: ownerIds };
            if (status) filter.status = status;
            if (sanitizeId(customerId)) filter.customer = customerId;
            const range = dateRangeFilter(dateFrom, dateTo);
            if (range) filter.createdAt = range;
            if (search) {
                const regex = new RegExp(String(search).trim().split(/\s+/).map(escapeRegex).join('|'), 'i');
                const customerIds = await findCustomerIdsBySearch(search);
                filter.$or = [
                    ...searchFields.map((field) => ({ [field]: regex })),
                    { 'lineItems.name': regex },
                    { 'lineItems.code': regex },
                    { walkInName: regex },
                    ...(customerIds.length ? [{ customer: { $in: customerIds } }] : []),
                ];
            }

            const pageNum = Math.max(1, parseInt(page, 10) || 1);
            const limitNum = Math.min(1000, Math.max(1, parseInt(limit, 10) || 20));
            const sortField = sortMap[sortBy] || 'createdAt';
            const sortDir = String(sortOrder).toUpperCase() === 'ASC' ? 1 : -1;

            let query = Model.find(filter)
                .populate('customer', 'firstName lastName companyName phone customerCode');
            populate.forEach((entry) => { query = query.populate(entry.path, entry.select); });

            const [rows, total] = await Promise.all([
                query.sort({ [sortField]: sortDir }).skip((pageNum - 1) * limitNum).limit(limitNum).lean(),
                Model.countDocuments(filter),
            ]);

            res.json({
                success: true,
                data: decorate ? await decorate(rows) : rows.map(map),
                pagination: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum) },
            });
        } catch (error) {
            logger.error(`Error listing parts ${numberField}:`, error);
            next(error);
        }
    };
}

// ═══════════════════════════════════════════════════════════════════════════
// PARTS QUOTATIONS
// ═══════════════════════════════════════════════════════════════════════════

const mapQuotation = (q) => ({
    ...commonFields(q),
    quotation_number: q.quotationNumber,
    subtotal: q.subtotal || 0,
    vehicle_price: q.subtotal || 0,
    discount_amount: q.discountAmount || 0,
    discount_percentage: q.discountPercentage || 0,
    tax_amount: q.taxAmount || 0,
    additional_charges: q.additionalCharges || 0,
    total_amount: q.totalAmount || 0,
    validity_days: q.validityDays || 7,
    valid_until: q.validUntil || null,
    approval_status: q.approvalStatus || 'pending',
    approved_at: q.approvedAt || null,
    approval_notes: q.approvalNotes || '',
    terms_and_conditions: q.termsAndConditions || '',
});

const getAllQuotations = listHandler({
    Model: PartQuotation,
    permissionKey: 'quotations',
    numberField: 'quotations',
    sortMap: {
        created_at: 'createdAt', total_amount: 'totalAmount',
        quotation_number: 'quotationNumber', valid_until: 'validUntil', status: 'status',
    },
    searchFields: ['quotationNumber'],
    map: mapQuotation,
});

const getQuotationById = async (req, res, next) => {
    try {
        const quotation = await PartQuotation.findById(sanitizeId(req.params.id))
            .populate('customer', 'firstName lastName companyName phone customerCode email')
            .lean();
        if (!quotation) throw new AppError('Quotation not found', 404);
        res.json({ success: true, data: mapQuotation(quotation) });
    } catch (error) { next(error); }
};

const createQuotation = async (req, res, next) => {
    try {
        // A quotation is an offer: stock is never checked or touched here, so a
        // customer can be quoted for parts that still have to be ordered in.
        const lines = await resolvePartLines(req.body, { checkStock: false });
        const { customer, walkIn, walkInName, walkInPhone } = await resolveDocumentCustomer(req.body, requireCustomer);

        const totals = documentTotals(req.body, lines);
        const quotationNumber = await nextDocNumber(PartQuotation, 'quotationNumber', 'PQT');
        const validity = Math.max(1, num(req.body.validityDays, 7));

        const quotation = await PartQuotation.create({
            quotationNumber,
            customer: customer._id,
            walkIn, walkInName, walkInPhone,
            lead: sanitizeId(req.body.leadId),
            lineItems: lines,
            status: 'draft',
            approvalStatus: 'pending',
            ...totals,
            discountPercentage: num(req.body.discountPercentage),
            validityDays: validity,
            validUntil: new Date(Date.now() + validity * 24 * 60 * 60 * 1000),
            termsAndConditions: req.body.termsAndConditions,
            notes: req.body.notes,
            createdBy: req.user.id,
        });

        await recordCustomerActivity({
            customerId: customer._id,
            docType: 'quotation',
            docId: quotation._id,
            number: quotationNumber,
            amount: totals.totalAmount,
            description: `Parts quotation ${quotationNumber} — ${lineDescription(lines)}`,
            userId: req.user.id,
        });

        logger.info(`Parts quotation ${quotationNumber} created by user ${req.user.id}`);
        res.status(201).json({
            success: true,
            data: { id: quotation._id, quotationNumber },
            message: 'Quotation created successfully',
        });
    } catch (error) {
        logger.error('Error creating parts quotation:', error);
        next(error);
    }
};

const updateQuotation = async (req, res, next) => {
    try {
        const quotation = await PartQuotation.findById(sanitizeId(req.params.id));
        if (!quotation) throw new AppError('Quotation not found', 404);
        if (quotation.status === 'converted') throw new AppError('Converted quotations cannot be edited', 400);

        const sentProducts = Array.isArray(req.body.lineItems) && req.body.lineItems.length > 0;
        // An edit that does not mention products keeps the ones already on the
        // quotation, so a note-only change cannot silently empty the document.
        const lines = sentProducts
            ? await resolvePartLines(req.body, { checkStock: false })
            : await resolveLineItems(linesToRequested(quotation.lineItems).map((line) => ({ ...line, itemType: 'part' })), { checkStock: false });

        if (req.body.customerId !== undefined || req.body.walkIn !== undefined) {
            const resolved = await resolveDocumentCustomer(req.body, requireCustomer);
            quotation.customer = resolved.customer._id;
            quotation.walkIn = resolved.walkIn;
            quotation.walkInName = resolved.walkInName;
            quotation.walkInPhone = resolved.walkInPhone;
        }

        const totals = documentTotals(req.body, lines);
        const validity = Math.max(1, num(req.body.validityDays, quotation.validityDays || 7));

        Object.assign(quotation, {
            lineItems: lines,
            ...totals,
            discountPercentage: num(req.body.discountPercentage, quotation.discountPercentage),
            validityDays: validity,
            validUntil: new Date(quotation.createdAt.getTime() + validity * 24 * 60 * 60 * 1000),
            ...(req.body.status ? { status: req.body.status } : {}),
            termsAndConditions: req.body.termsAndConditions !== undefined ? req.body.termsAndConditions : quotation.termsAndConditions,
            notes: req.body.notes !== undefined ? req.body.notes : quotation.notes,
            updatedBy: req.user.id,
        });
        // Changing what is being quoted invalidates an earlier approval.
        if (sentProducts && quotation.approvalStatus === 'approved') {
            quotation.approvalStatus = 'pending';
            quotation.approvedBy = null;
            quotation.approvedAt = null;
        }
        await quotation.save();

        res.json({ success: true, message: 'Quotation updated successfully' });
    } catch (error) {
        logger.error('Error updating parts quotation:', error);
        next(error);
    }
};

const deleteQuotation = async (req, res, next) => {
    try {
        const quotation = await PartQuotation.findById(sanitizeId(req.params.id));
        if (!quotation) throw new AppError('Quotation not found', 404);
        if (quotation.status === 'converted') throw new AppError('Converted quotations cannot be deleted', 400);
        quotation.status = 'cancelled';
        quotation.cancelledAt = new Date();
        quotation.updatedBy = req.user.id;
        await quotation.save();
        res.json({ success: true, message: 'Quotation cancelled successfully' });
    } catch (error) { next(error); }
};

const updateQuotationStatus = async (req, res, next) => {
    try {
        const quotation = await PartQuotation.findById(sanitizeId(req.params.id));
        if (!quotation) throw new AppError('Quotation not found', 404);
        if (!req.body.status) throw new AppError('Status is required', 400);
        quotation.status = String(req.body.status);
        quotation.updatedBy = req.user.id;
        await quotation.save();
        res.json({ success: true, message: 'Quotation status updated' });
    } catch (error) { next(error); }
};

const approveQuotation = async (req, res, next) => {
    try {
        const quotation = await PartQuotation.findById(sanitizeId(req.params.id));
        if (!quotation) throw new AppError('Quotation not found', 404);
        if (quotation.status === 'cancelled') throw new AppError('Cancelled quotations cannot be approved', 400);

        const decision = String(req.body.decision || 'approved').toLowerCase();
        if (!['approved', 'rejected'].includes(decision)) throw new AppError('Decision must be approved or rejected', 400);

        quotation.approvalStatus = decision;
        quotation.approvedBy = req.user.id;
        quotation.approvedAt = new Date();
        quotation.approvalNotes = String(req.body.notes || '');
        if (decision === 'approved' && quotation.status === 'draft') quotation.status = 'accepted';
        if (decision === 'rejected') quotation.status = 'rejected';
        await quotation.save();

        res.json({ success: true, message: `Quotation ${decision}` });
    } catch (error) { next(error); }
};

/** A quotation becomes a booking only once it has been approved. */
/**
 * The parts flow is quotation → invoice, nothing in between. Conversion keeps
 * every line and its quantity from the quotation; the caller may confirm or
 * adjust the unit prices (that is the only question the screen asks) and may
 * record what the customer paid. The invoice raised here is what moves stock.
 *
 * `req.body.prices` — optional map of partId → unit price. Lines not in the
 * map keep their quoted price.
 */
const convertQuotationToInvoice = async (req, res, next) => {
    try {
        const quotation = await PartQuotation.findById(sanitizeId(req.params.id));
        if (!quotation) throw new AppError('Quotation not found', 404);
        if (quotation.status === 'cancelled') throw new AppError('Cancelled quotations cannot be converted', 400);
        if (quotation.status === 'converted') throw new AppError('This quotation has already been converted', 400);
        if (quotation.approvalStatus !== 'approved') {
            throw new AppError('This quotation must be approved before it can be converted to an invoice', 400);
        }

        const prices = req.body.prices && typeof req.body.prices === 'object' ? req.body.prices : {};
        const body = {
            customerId: quotation.customer ? String(quotation.customer) : undefined,
            walkIn: quotation.walkIn,
            walkInName: quotation.walkInName,
            walkInPhone: quotation.walkInPhone,
            lineItems: (quotation.lineItems || []).map((line) => {
                const partId = line.part ? String(line.part._id || line.part) : null;
                const override = partId != null ? prices[partId] : undefined;
                return {
                    itemType: 'part',
                    partId,
                    quantity: num(line.quantity, 1),
                    unitPrice: override != null && override !== '' ? num(override) : num(line.unitPrice),
                    discountAmount: num(line.discountAmount),
                    taxAmount: num(line.taxAmount),
                    description: line.description,
                };
            }),
            // Only the document-level residue carries over — the line-level
            // discount/tax travels on the lines themselves (see documentLevelOnly).
            ...documentLevelOnly(quotation),
            additionalCharges: num(quotation.otherCharges),
            paidAmount: num(req.body.paidAmount),
            notes: req.body.notes || quotation.notes,
        };

        const lines = await resolvePartLines(body, { checkStock: true });
        const { customer, walkIn, walkInName, walkInPhone } = await resolveDocumentCustomer(body, requireCustomer);
        await assertPartsAvailable(lines);

        const totals = documentTotals(body, lines);
        if (totals.totalAmount <= 0) throw new AppError('Valid price is required', 400);
        const tendered = round2(num(body.paidAmount));
        if (tendered < 0) throw new AppError('Paid amount cannot be negative', 400);
        const changeDue = round2(Math.max(0, tendered - totals.totalAmount));
        const paidAmount = changeDue > 0 ? totals.totalAmount : tendered;

        const invoiceNumber = await nextDocNumber(PartInvoice, 'invoiceNumber', 'PINV');
        const now = new Date();
        const invoice = await PartInvoice.create({
            invoiceNumber,
            quotation: quotation._id,
            customer: customer._id,
            walkIn, walkInName, walkInPhone,
            lineItems: lines,
            status: statusForPayment(totals.totalAmount, paidAmount),
            invoiceDate: now,
            dueDate: new Date(now.getTime() + Math.max(0, num(req.body.dueDays, 30)) * 24 * 60 * 60 * 1000),
            subtotal: totals.subtotal,
            taxAmount: totals.taxAmount,
            discountAmount: totals.discountAmount,
            otherCharges: totals.otherCharges,
            totalAmount: totals.totalAmount,
            paidAmount,
            balanceAmount: round2(totals.totalAmount - paidAmount),
            amountTendered: changeDue > 0 ? tendered : 0,
            changeDue,
            notes: body.notes,
            termsAndConditions: quotation.termsAndConditions,
            salePerson: [req.user.firstName, req.user.lastName].filter(Boolean).join(' '),
            seller: req.user.id,
            createdBy: req.user.id,
        });

        try {
            const result = await applyInvoiceStock(invoice);
            if (result.applied) {
                invoice.stockApplied = true;
                invoice.stockAppliedAt = new Date();
                await invoice.save();
            }
        } catch (stockError) {
            // Nothing was consumed if this threw, so the invoice must not stand.
            await PartInvoice.deleteOne({ _id: invoice._id });
            throw stockError;
        }

        quotation.status = 'converted';
        quotation.updatedBy = req.user.id;
        await quotation.save();

        await recordCustomerActivity({
            customerId: customer._id,
            docType: 'invoice',
            docId: invoice._id,
            number: invoiceNumber,
            amount: totals.totalAmount,
            description: `Parts invoice ${invoiceNumber} from quotation ${quotation.quotationNumber}`,
            userId: req.user.id,
            spentDelta: totals.totalAmount,
            paidDelta: paidAmount,
            outstandingDelta: round2(totals.totalAmount - paidAmount),
        });

        logger.info(`Parts quotation ${quotation.quotationNumber} converted to invoice ${invoiceNumber}`);
        res.status(201).json({
            success: true,
            data: { id: invoice._id, invoiceNumber, changeDue },
            message: 'Quotation converted to invoice',
        });
    } catch (error) {
        logger.error('Error converting parts quotation to invoice:', error);
        next(error);
    }
};

const convertQuotationToBooking = async (req, res, next) => {
    try {
        const quotation = await PartQuotation.findById(sanitizeId(req.params.id));
        if (!quotation) throw new AppError('Quotation not found', 404);
        if (quotation.status === 'cancelled') throw new AppError('Cancelled quotations cannot be converted', 400);
        if (quotation.status === 'converted') throw new AppError('This quotation has already been converted', 400);
        if (quotation.approvalStatus !== 'approved') {
            throw new AppError('This quotation must be approved before it can be converted to a booking', 400);
        }

        const bookingNumber = await nextDocNumber(PartBooking, 'bookingNumber', 'PBK');
        const booking = await PartBooking.create({
            bookingNumber,
            quotation: quotation._id,
            customer: quotation.customer,
            walkIn: quotation.walkIn,
            walkInName: quotation.walkInName,
            walkInPhone: quotation.walkInPhone,
            lineItems: quotation.lineItems,
            itemDescription: lineDescription(quotation.lineItems),
            status: 'confirmed',
            subtotal: quotation.subtotal,
            discountAmount: quotation.discountAmount,
            taxAmount: quotation.taxAmount,
            totalAmount: quotation.totalAmount,
            bookingAmount: num(req.body.bookingAmount),
            paidAmount: num(req.body.bookingAmount),
            balanceAmount: round2(num(quotation.totalAmount) - num(req.body.bookingAmount)),
            bookingDate: new Date(),
            deliveryDate: req.body.expectedDeliveryDate ? new Date(req.body.expectedDeliveryDate) : null,
            notes: req.body.notes || quotation.notes,
            seller: req.user.id,
            createdBy: req.user.id,
        });

        quotation.status = 'converted';
        quotation.updatedBy = req.user.id;
        await quotation.save();

        await recordCustomerActivity({
            customerId: quotation.customer,
            docType: 'booking',
            docId: booking._id,
            number: bookingNumber,
            amount: booking.totalAmount,
            description: `Parts booking ${bookingNumber} from quotation ${quotation.quotationNumber}`,
            userId: req.user.id,
        });

        res.status(201).json({
            success: true,
            data: { id: booking._id, bookingNumber },
            message: 'Quotation converted to booking',
        });
    } catch (error) {
        logger.error('Error converting parts quotation:', error);
        next(error);
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// PARTS BOOKINGS
// ═══════════════════════════════════════════════════════════════════════════

const mapBooking = (b, order = null) => ({
    ...commonFields(b),
    booking_number: b.bookingNumber,
    quotation_id: b.quotation || null,
    subtotal: b.subtotal || 0,
    booking_amount: b.bookingAmount || 0,
    paid_amount: b.paidAmount || 0,
    balance_amount: b.balanceAmount || 0,
    discount_amount: b.discountAmount || 0,
    tax_amount: b.taxAmount || 0,
    total_amount: b.totalAmount || 0,
    expected_delivery_date: b.deliveryDate || null,
    priority: b.priority || 'normal',
    sale_person: b.salePerson || '',
    sales_order_id: order?._id || null,
    sales_order_number: order?.orderNumber || null,
});

/**
 * Bookings additionally report whether an order already exists, so the list can
 * hide "convert" on a booking that has already been ordered. That extra lookup
 * is why this one does not go through listHandler.
 */
const getAllBookings = listHandler({
    Model: PartBooking,
    permissionKey: 'bookings',
    numberField: 'bookings',
    sortMap: {
        created_at: 'createdAt', booking_amount: 'bookingAmount', total_amount: 'totalAmount',
        booking_number: 'bookingNumber', expected_delivery_date: 'deliveryDate', status: 'status',
    },
    searchFields: ['bookingNumber', 'salePerson', 'itemDescription'],
    map: mapBooking,
    decorate: async (rows) => {
        if (!rows.length) return rows;
        const orders = await PartSalesOrder.find({
            booking: { $in: rows.map((row) => row._id) },
            status: { $ne: 'cancelled' },
        }).select('booking orderNumber').lean();
        const byBooking = Object.fromEntries(orders.map((order) => [String(order.booking), order]));
        return rows.map((row) => mapBooking(row, byBooking[String(row._id)] || null));
    },
});

const getBookingById = async (req, res, next) => {
    try {
        const booking = await PartBooking.findById(sanitizeId(req.params.id))
            .populate('customer', 'firstName lastName companyName phone customerCode email')
            .lean();
        if (!booking) throw new AppError('Booking not found', 404);
        const order = await PartSalesOrder.findOne({ booking: booking._id, status: { $ne: 'cancelled' } })
            .select('orderNumber').lean();
        res.json({ success: true, data: mapBooking(booking, order) });
    } catch (error) { next(error); }
};

const createBooking = async (req, res, next) => {
    try {
        // A booking commits the dealer to supplying these parts, so the shelf is
        // checked — but nothing is consumed until the invoice.
        const lines = await resolvePartLines(req.body, { checkStock: true });
        const { customer, walkIn, walkInName, walkInPhone } = await resolveDocumentCustomer(req.body, requireCustomer);

        const totals = documentTotals(req.body, lines);
        const bookingAmount = num(req.body.bookingAmount);
        if (bookingAmount < 0) throw new AppError('Booking amount cannot be negative', 400);

        const bookingNumber = await nextDocNumber(PartBooking, 'bookingNumber', 'PBK');
        const booking = await PartBooking.create({
            bookingNumber,
            customer: customer._id,
            walkIn, walkInName, walkInPhone,
            lineItems: lines,
            itemDescription: lineDescription(lines),
            status: 'confirmed',
            priority: req.body.priority || 'normal',
            subtotal: totals.subtotal,
            discountAmount: totals.discountAmount,
            taxAmount: totals.taxAmount,
            totalAmount: totals.totalAmount,
            bookingAmount,
            paidAmount: bookingAmount,
            balanceAmount: round2(totals.totalAmount - bookingAmount),
            bookingDate: new Date(),
            deliveryDate: req.body.expectedDeliveryDate ? new Date(req.body.expectedDeliveryDate) : null,
            notes: req.body.notes,
            salePerson: [req.user.firstName, req.user.lastName].filter(Boolean).join(' '),
            seller: req.user.id,
            createdBy: req.user.id,
        });

        await recordCustomerActivity({
            customerId: customer._id,
            docType: 'booking',
            docId: booking._id,
            number: bookingNumber,
            amount: totals.totalAmount,
            description: `Parts booking ${bookingNumber} — ${lineDescription(lines)}`,
            userId: req.user.id,
            paidDelta: bookingAmount,
        });

        logger.info(`Parts booking ${bookingNumber} created by user ${req.user.id}`);
        res.status(201).json({
            success: true,
            data: { id: booking._id, bookingNumber },
            message: 'Booking created successfully',
        });
    } catch (error) {
        logger.error('Error creating parts booking:', error);
        next(error);
    }
};

const updateBooking = async (req, res, next) => {
    try {
        const booking = await PartBooking.findById(sanitizeId(req.params.id));
        if (!booking) throw new AppError('Booking not found', 404);
        if (booking.status === 'cancelled') throw new AppError('Cancelled bookings cannot be edited', 400);

        const sentProducts = Array.isArray(req.body.lineItems) && req.body.lineItems.length > 0;
        if (sentProducts) {
            const lines = await resolvePartLines(req.body, { checkStock: true });
            const totals = documentTotals(req.body, lines);
            booking.lineItems = lines;
            booking.itemDescription = lineDescription(lines);
            booking.subtotal = totals.subtotal;
            booking.discountAmount = totals.discountAmount;
            booking.taxAmount = totals.taxAmount;
            booking.totalAmount = totals.totalAmount;
        }

        if (req.body.customerId !== undefined || req.body.walkIn !== undefined) {
            const resolved = await resolveDocumentCustomer(req.body, requireCustomer);
            booking.customer = resolved.customer._id;
            booking.walkIn = resolved.walkIn;
            booking.walkInName = resolved.walkInName;
            booking.walkInPhone = resolved.walkInPhone;
        }

        if (req.body.bookingAmount !== undefined) booking.bookingAmount = num(req.body.bookingAmount);
        if (req.body.priority) booking.priority = req.body.priority;
        if (req.body.status) booking.status = req.body.status;
        if (req.body.notes !== undefined) booking.notes = req.body.notes;
        if (req.body.expectedDeliveryDate !== undefined) {
            booking.deliveryDate = req.body.expectedDeliveryDate ? new Date(req.body.expectedDeliveryDate) : null;
        }
        booking.paidAmount = num(booking.bookingAmount) + num(booking.subsequentPayments);
        booking.balanceAmount = round2(num(booking.totalAmount) - num(booking.paidAmount));
        booking.updatedBy = req.user.id;
        await booking.save();

        res.json({ success: true, message: 'Booking updated successfully' });
    } catch (error) {
        logger.error('Error updating parts booking:', error);
        next(error);
    }
};

const deleteBooking = async (req, res, next) => {
    try {
        const booking = await PartBooking.findById(sanitizeId(req.params.id));
        if (!booking) throw new AppError('Booking not found', 404);
        const order = await PartSalesOrder.findOne({ booking: booking._id, status: { $ne: 'cancelled' } }).lean();
        if (order) throw new AppError(`This booking already has sales order ${order.orderNumber}`, 400);
        // Nothing to release: a parts booking never reserved stock.
        booking.status = 'cancelled';
        booking.cancelledAt = new Date();
        booking.cancellationReason = String(req.body?.reason || '');
        booking.updatedBy = req.user.id;
        await booking.save();
        res.json({ success: true, message: 'Booking cancelled successfully' });
    } catch (error) { next(error); }
};

// ═══════════════════════════════════════════════════════════════════════════
// PARTS SALES ORDERS  (and the invoice each one generates)
// ═══════════════════════════════════════════════════════════════════════════

const mapOrder = (o, invoice = null) => ({
    ...commonFields(o),
    order_number: o.orderNumber,
    booking_id: o.booking || null,
    quotation_id: o.quotation || null,
    subtotal: o.subtotal || 0,
    vehicle_price: o.subtotal || 0,
    discount_amount: o.discountAmount || 0,
    tax_amount: o.taxAmount || 0,
    other_charges: o.otherCharges || 0,
    grand_total: o.totalAmount || 0,
    total_amount: o.totalAmount || 0,
    paid_amount: o.paidAmount || 0,
    balance_amount: o.balanceAmount || 0,
    payment_mode: o.paymentMode || '',
    expected_delivery_date: o.deliveryDate || null,
    sale_person: o.salePerson || '',
    invoice_id: invoice?._id || o.invoice || null,
    invoice_number: invoice?.invoiceNumber || null,
    invoice_status: invoice?.status || null,
});

const statusForPayment = (totalAmount, paidAmount) => {
    if (totalAmount > 0 && paidAmount >= totalAmount) return 'paid';
    if (paidAmount > 0) return 'partial';
    return 'draft';
};

/**
 * Create the invoice for a parts order. Idempotent — an order that already has
 * a live invoice gets that one back rather than a second document.
 *
 * This is the point of sale: stock leaves the shelf here and nowhere else. If
 * the stock move fails the invoice is removed again, so an order can never end
 * up with an invoice that was never paid for in stock.
 */
async function createInvoiceForOrder(order, { userId = null, dueDays = 30 } = {}) {
    const existing = await PartInvoice.findOne({ salesOrder: order._id, status: { $ne: 'cancelled' } });
    if (existing) {
        if (!order.invoice || String(order.invoice) !== String(existing._id)) {
            await PartSalesOrder.updateOne({ _id: order._id }, { $set: { invoice: existing._id } });
        }
        return { invoice: existing, created: false };
    }

    const invoiceNumber = await nextDocNumber(PartInvoice, 'invoiceNumber', 'PINV');
    const now = new Date();
    const totalAmount = round2(order.totalAmount);
    const paidAmount = round2(order.paidAmount);

    const invoice = await PartInvoice.create({
        invoiceNumber,
        salesOrder: order._id,
        customer: order.customer,
        walkIn: order.walkIn,
        walkInName: order.walkInName,
        walkInPhone: order.walkInPhone,
        lineItems: order.lineItems,
        status: statusForPayment(totalAmount, paidAmount),
        invoiceDate: now,
        dueDate: new Date(now.getTime() + Math.max(0, num(dueDays, 30)) * 24 * 60 * 60 * 1000),
        subtotal: order.subtotal,
        taxAmount: order.taxAmount,
        discountAmount: order.discountAmount,
        otherCharges: order.otherCharges,
        totalAmount,
        paidAmount,
        balanceAmount: round2(totalAmount - paidAmount),
        salePerson: order.salePerson,
        seller: order.seller,
        createdBy: userId,
    });

    try {
        const result = await applyInvoiceStock(invoice);
        if (result.applied) {
            invoice.stockApplied = true;
            invoice.stockAppliedAt = new Date();
            await invoice.save();
        }
    } catch (stockError) {
        // Nothing was consumed if this threw, so the invoice must not stand either.
        await PartInvoice.deleteOne({ _id: invoice._id });
        throw stockError;
    }

    await PartSalesOrder.updateOne({ _id: order._id }, { $set: { invoice: invoice._id } });

    await recordCustomerActivity({
        customerId: order.customer,
        docType: 'invoice',
        docId: invoice._id,
        number: invoiceNumber,
        amount: totalAmount,
        description: `Parts invoice ${invoiceNumber} for order ${order.orderNumber}`,
        userId,
        outstandingDelta: round2(totalAmount - paidAmount),
    });

    logger.info(`Parts invoice ${invoiceNumber} generated for order ${order.orderNumber}`);
    return { invoice, created: true };
}

/**
 * Shared order creation used by the counter screen and by booking conversion.
 * Availability is re-checked here so an order cannot promise stock that has
 * gone since the booking; the invoice below is what consumes it.
 */
async function createOrderInternal({ body, userId, user, bookingId = null, quotationId = null }) {
    const lines = await resolvePartLines(body, { checkStock: true });
    const { customer, walkIn, walkInName, walkInPhone } = await resolveDocumentCustomer(body, requireCustomer);

    const totals = documentTotals(body, lines);
    if (totals.totalAmount <= 0) throw new AppError('Valid price is required', 400);

    const tendered = round2(num(body.paidAmount));
    if (tendered < 0) throw new AppError('Paid amount cannot be negative', 400);
    // Handing over more than the total is normal at a counter: only the amount
    // owed is applied and the surplus is change. Recording the full tender as
    // "paid" would post a negative balance and corrupt receivables.
    const changeDue = round2(Math.max(0, tendered - totals.totalAmount));
    const paidAmount = changeDue > 0 ? totals.totalAmount : tendered;

    const orderNumber = await nextDocNumber(PartSalesOrder, 'orderNumber', 'PSO');
    const now = new Date();

    const order = await PartSalesOrder.create({
        orderNumber,
        booking: sanitizeId(bookingId),
        quotation: sanitizeId(quotationId),
        customer: customer._id,
        walkIn, walkInName, walkInPhone,
        lineItems: lines,
        status: 'confirmed',
        subtotal: totals.subtotal,
        discountAmount: totals.discountAmount,
        taxAmount: totals.taxAmount,
        otherCharges: totals.otherCharges,
        totalAmount: totals.totalAmount,
        paidAmount,
        balanceAmount: round2(totals.totalAmount - paidAmount),
        paymentMode: body.paymentMode || 'cash',
        orderDate: now,
        deliveryDate: body.expectedDeliveryDate ? new Date(body.expectedDeliveryDate) : null,
        notes: body.notes,
        salePerson: [user?.firstName, user?.lastName].filter(Boolean).join(' '),
        seller: userId,
        createdBy: userId,
    });

    await recordCustomerActivity({
        customerId: customer._id,
        docType: 'sales_order',
        docId: order._id,
        number: orderNumber,
        amount: totals.totalAmount,
        description: `Parts order ${orderNumber} — ${lineDescription(lines)}`,
        userId,
        spentDelta: totals.totalAmount,
        paidDelta: paidAmount,
    });

    // The invoice is what moves stock. If it cannot be raised — usually because
    // the shelf changed underneath us — the order must not stand either.
    let invoice = null;
    try {
        const result = await createInvoiceForOrder(order, { userId });
        invoice = result.invoice;
        order.status = 'invoiced';
        order.invoice = invoice._id;
        await order.save();
    } catch (invoiceError) {
        await PartSalesOrder.deleteOne({ _id: order._id });
        throw invoiceError;
    }

    if (changeDue > 0) {
        invoice.amountTendered = tendered;
        invoice.changeDue = changeDue;
        await invoice.save();
    }

    return { order, invoice, orderNumber, amountTendered: tendered, changeDue };
}

const getAllOrders = listHandler({
    Model: PartSalesOrder,
    permissionKey: 'sales_orders',
    numberField: 'orders',
    sortMap: {
        created_at: 'createdAt', total_amount: 'totalAmount',
        paid_amount: 'paidAmount', order_number: 'orderNumber', status: 'status',
    },
    searchFields: ['orderNumber', 'salePerson'],
    map: (order) => mapOrder(order),
});

const getOrderById = async (req, res, next) => {
    try {
        const order = await PartSalesOrder.findById(sanitizeId(req.params.id))
            .populate('customer', 'firstName lastName companyName phone customerCode email')
            .lean();
        if (!order) throw new AppError('Sales order not found', 404);
        const invoice = order.invoice
            ? await PartInvoice.findById(order.invoice).select('invoiceNumber status').lean()
            : null;
        res.json({ success: true, data: mapOrder(order, invoice) });
    } catch (error) { next(error); }
};

const createOrder = async (req, res, next) => {
    try {
        const { order, invoice, orderNumber, amountTendered, changeDue } = await createOrderInternal({
            body: req.body,
            userId: req.user.id,
            user: req.user,
            bookingId: req.body.bookingId,
        });
        logger.info(`Parts sales order ${orderNumber} created by user ${req.user.id}`);
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
        logger.error('Error creating parts sales order:', error);
        next(error);
    }
};

const convertBookingToOrder = async (req, res, next) => {
    try {
        const booking = await PartBooking.findById(sanitizeId(req.params.id));
        if (!booking) throw new AppError('Booking not found', 404);
        if (booking.status === 'cancelled') throw new AppError('Cancelled bookings cannot be converted', 400);
        const existing = await PartSalesOrder.findOne({ booking: booking._id, status: { $ne: 'cancelled' } }).lean();
        if (existing) throw new AppError(`This booking already has sales order ${existing.orderNumber}`, 400);

        const { order, invoice, orderNumber, changeDue } = await createOrderInternal({
            body: {
                ...req.body,
                // The booking's own products and buyer win over anything the
                // client re-sent, so a conversion cannot quietly change the deal.
                lineItems: linesToRequested(booking.lineItems),
                customerId: booking.customer,
                walkIn: booking.walkIn,
                walkInName: booking.walkInName,
                walkInPhone: booking.walkInPhone,
                // The booking's stored discount/tax already include what sits on
                // the lines, and the lines carry over as they are. Only the
                // document-level part must be passed on, or documentTotals would
                // add the line amounts a second time.
                ...documentLevelOnly(booking),
                // Whatever was taken at booking counts as already paid.
                paidAmount: num(req.body.paidAmount) + num(booking.paidAmount),
            },
            userId: req.user.id,
            user: req.user,
            bookingId: booking._id,
            quotationId: booking.quotation,
        });

        booking.status = 'completed';
        booking.updatedBy = req.user.id;
        await booking.save();

        res.status(201).json({
            success: true,
            data: { id: order._id, orderNumber, invoiceNumber: invoice?.invoiceNumber || null, changeDue },
            message: 'Booking converted to sales order',
        });
    } catch (error) {
        logger.error('Error converting parts booking:', error);
        next(error);
    }
};

const updateOrderStatus = async (req, res, next) => {
    try {
        const order = await PartSalesOrder.findById(sanitizeId(req.params.id));
        if (!order) throw new AppError('Sales order not found', 404);
        if (!req.body.status) throw new AppError('Status is required', 400);
        order.status = String(req.body.status);
        if (order.status === 'delivered') order.deliveredAt = new Date();
        if (req.body.notes !== undefined) order.notes = req.body.notes;
        order.updatedBy = req.user.id;
        await order.save();
        res.json({ success: true, message: 'Order status updated' });
    } catch (error) { next(error); }
};

/**
 * Cancelling an order cancels its invoice too, which is what returns the stock.
 */
const deleteOrder = async (req, res, next) => {
    try {
        const order = await PartSalesOrder.findById(sanitizeId(req.params.id));
        if (!order) throw new AppError('Sales order not found', 404);
        if (order.status === 'cancelled') throw new AppError('This order is already cancelled', 400);

        const invoice = await PartInvoice.findOne({ salesOrder: order._id, status: { $ne: 'cancelled' } });
        if (invoice) {
            await revertInvoiceStock(invoice);
            invoice.stockApplied = false;
            invoice.status = 'cancelled';
            invoice.cancelledAt = new Date();
            invoice.updatedBy = req.user.id;
            await invoice.save();
        }

        order.status = 'cancelled';
        order.cancelledAt = new Date();
        order.updatedBy = req.user.id;
        await order.save();

        res.json({
            success: true,
            message: invoice
                ? `Order cancelled and stock returned (invoice ${invoice.invoiceNumber} cancelled)`
                : 'Order cancelled',
        });
    } catch (error) {
        logger.error('Error cancelling parts order:', error);
        next(error);
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// PARTS INVOICES
// ═══════════════════════════════════════════════════════════════════════════

const mapInvoice = (inv) => ({
    ...commonFields(inv),
    invoice_number: inv.invoiceNumber,
    invoice_type: 'parts',
    sales_order_id: inv.salesOrder || null,
    invoice_date: inv.invoiceDate || null,
    due_date: inv.dueDate || null,
    subtotal: inv.subtotal || 0,
    tax_amount: inv.taxAmount || 0,
    discount_amount: inv.discountAmount || 0,
    other_charges: inv.otherCharges || 0,
    total_amount: inv.totalAmount || 0,
    paid_amount: inv.paidAmount || 0,
    balance_amount: inv.balanceAmount || 0,
    amount_tendered: inv.amountTendered || 0,
    change_due: inv.changeDue || 0,
    stock_applied: inv.stockApplied === true,
    terms_and_conditions: inv.termsAndConditions || '',
});

const getAllInvoices = listHandler({
    Model: PartInvoice,
    permissionKey: 'invoices',
    numberField: 'invoices',
    sortMap: {
        created_at: 'createdAt', total_amount: 'totalAmount', paid_amount: 'paidAmount',
        invoice_number: 'invoiceNumber', due_date: 'dueDate', status: 'status',
    },
    searchFields: ['invoiceNumber', 'salePerson'],
    map: mapInvoice,
});

const getInvoiceById = async (req, res, next) => {
    try {
        const invoice = await PartInvoice.findById(sanitizeId(req.params.id))
            .populate('customer', 'firstName lastName companyName phone customerCode email')
            .lean();
        if (!invoice) throw new AppError('Invoice not found', 404);
        res.json({ success: true, data: mapInvoice(invoice) });
    } catch (error) { next(error); }
};

/**
 * A standalone parts invoice — a straight over-the-counter sale with no order
 * behind it. It moves stock the moment it is created, exactly like the invoice
 * an order generates.
 */
const createInvoice = async (req, res, next) => {
    try {
        const lines = await resolvePartLines(req.body, { checkStock: true });
        const { customer, walkIn, walkInName, walkInPhone } = await resolveDocumentCustomer(req.body, requireCustomer);
        await assertPartsAvailable(lines);

        const totals = documentTotals(req.body, lines);
        const tendered = round2(num(req.body.paidAmount));
        const changeDue = round2(Math.max(0, tendered - totals.totalAmount));
        const paidAmount = changeDue > 0 ? totals.totalAmount : tendered;

        const invoiceNumber = await nextDocNumber(PartInvoice, 'invoiceNumber', 'PINV');
        const now = new Date();

        const invoice = await PartInvoice.create({
            invoiceNumber,
            customer: customer._id,
            walkIn, walkInName, walkInPhone,
            lineItems: lines,
            status: statusForPayment(totals.totalAmount, paidAmount),
            invoiceDate: now,
            dueDate: new Date(now.getTime() + Math.max(0, num(req.body.dueDays, 30)) * 24 * 60 * 60 * 1000),
            subtotal: totals.subtotal,
            taxAmount: totals.taxAmount,
            discountAmount: totals.discountAmount,
            otherCharges: totals.otherCharges,
            totalAmount: totals.totalAmount,
            paidAmount,
            balanceAmount: round2(totals.totalAmount - paidAmount),
            amountTendered: changeDue > 0 ? tendered : 0,
            changeDue,
            notes: req.body.notes,
            termsAndConditions: req.body.termsAndConditions,
            salePerson: [req.user.firstName, req.user.lastName].filter(Boolean).join(' '),
            seller: req.user.id,
            createdBy: req.user.id,
        });

        try {
            const result = await applyInvoiceStock(invoice);
            if (result.applied) {
                invoice.stockApplied = true;
                invoice.stockAppliedAt = new Date();
                await invoice.save();
            }
        } catch (stockError) {
            await PartInvoice.deleteOne({ _id: invoice._id });
            throw stockError;
        }

        await recordCustomerActivity({
            customerId: customer._id,
            docType: 'invoice',
            docId: invoice._id,
            number: invoiceNumber,
            amount: totals.totalAmount,
            description: `Parts invoice ${invoiceNumber} — ${lineDescription(lines)}`,
            userId: req.user.id,
            spentDelta: totals.totalAmount,
            paidDelta: paidAmount,
            outstandingDelta: round2(totals.totalAmount - paidAmount),
        });

        logger.info(`Parts invoice ${invoiceNumber} created by user ${req.user.id}`);
        res.status(201).json({
            success: true,
            data: { id: invoice._id, invoiceNumber, changeDue },
            message: 'Invoice created successfully',
        });
    } catch (error) {
        logger.error('Error creating parts invoice:', error);
        next(error);
    }
};

const updateInvoiceStatus = async (req, res, next) => {
    try {
        const invoice = await PartInvoice.findById(sanitizeId(req.params.id));
        if (!invoice) throw new AppError('Invoice not found', 404);
        const status = String(req.body.status || '');
        if (!status) throw new AppError('Status is required', 400);
        if (status === 'cancelled') throw new AppError('Use delete to cancel an invoice so the stock is returned', 400);
        invoice.status = status;
        invoice.updatedBy = req.user.id;
        await invoice.save();
        res.json({ success: true, message: 'Invoice status updated' });
    } catch (error) { next(error); }
};

/** Cancelling a parts invoice is what puts its stock back on the shelf. */
const deleteInvoice = async (req, res, next) => {
    try {
        const invoice = await PartInvoice.findById(sanitizeId(req.params.id));
        if (!invoice) throw new AppError('Invoice not found', 404);
        if (invoice.status === 'cancelled') throw new AppError('This invoice is already cancelled', 400);

        await revertInvoiceStock(invoice);
        invoice.stockApplied = false;
        invoice.status = 'cancelled';
        invoice.cancelledAt = new Date();
        invoice.updatedBy = req.user.id;
        await invoice.save();

        await recordCustomerActivity({
            customerId: invoice.customer,
            docType: 'invoice',
            docId: invoice._id,
            number: invoice.invoiceNumber,
            amount: -num(invoice.totalAmount),
            description: `Parts invoice ${invoice.invoiceNumber} cancelled — stock returned`,
            userId: req.user.id,
            countDocument: false,
            outstandingDelta: -num(invoice.balanceAmount),
        });

        res.json({ success: true, message: 'Invoice cancelled and stock returned' });
    } catch (error) {
        logger.error('Error cancelling parts invoice:', error);
        next(error);
    }
};

const recordPayment = async (req, res, next) => {
    try {
        const invoice = await PartInvoice.findById(sanitizeId(req.params.id));
        if (!invoice) throw new AppError('Invoice not found', 404);
        if (invoice.status === 'cancelled') throw new AppError('A cancelled invoice cannot take a payment', 400);

        const amount = round2(num(req.body.amount));
        if (amount <= 0) throw new AppError('Payment amount must be greater than zero', 400);
        if (amount > num(invoice.balanceAmount)) {
            throw new AppError(`Payment exceeds the outstanding balance of ${num(invoice.balanceAmount)}`, 400);
        }

        invoice.paidAmount = round2(num(invoice.paidAmount) + amount);
        invoice.balanceAmount = round2(num(invoice.totalAmount) - invoice.paidAmount);
        invoice.status = statusForPayment(num(invoice.totalAmount), invoice.paidAmount);
        invoice.updatedBy = req.user.id;
        await invoice.save();

        if (invoice.salesOrder) {
            await PartSalesOrder.updateOne(
                { _id: invoice.salesOrder },
                { $set: { paidAmount: invoice.paidAmount, balanceAmount: invoice.balanceAmount } },
            );
        }

        await recordCustomerActivity({
            customerId: invoice.customer,
            docType: 'payment',
            docId: invoice._id,
            number: invoice.invoiceNumber,
            amount,
            description: `Payment against parts invoice ${invoice.invoiceNumber}`,
            userId: req.user.id,
            countDocument: false,
            paidDelta: amount,
            outstandingDelta: -amount,
        });

        res.json({ success: true, message: 'Payment recorded', data: { balance: invoice.balanceAmount } });
    } catch (error) { next(error); }
};

// ═══════════════════════════════════════════════════════════════════════════
// EMAIL  (shared templates with the vehicle documents)
// ═══════════════════════════════════════════════════════════════════════════
//
// A parts document goes out on exactly the same email template as its vehicle
// counterpart — same usage key, same design, one place to edit. Only the
// collection it is read from differs. The PDF side needs nothing here at all:
// pdfData.service.js resolves an id against both collections, so
// /api/pdf/:documentType/:id already returns a parts document rendered by the
// vehicle template.

/** Per document type: which collection, which template, what the body gets. */
const EMAIL_DOCUMENTS = {
    quotation: {
        Model: PartQuotation,
        usageKey: 'quotation_customer',
        documentKey: 'quotation',
        number: 'quotationNumber',
        build: (d) => ({
            number: d.quotationNumber, date: d.createdAt, validUntil: d.validUntil,
            amount: d.totalAmount, status: d.status,
        }),
    },
    booking: {
        Model: PartBooking,
        usageKey: 'booking_customer',
        documentKey: 'booking',
        number: 'bookingNumber',
        build: (d) => ({
            number: d.bookingNumber, date: d.bookingDate || d.createdAt, deliveryDate: d.deliveryDate,
            amount: d.bookingAmount, totalAmount: d.totalAmount, status: d.status,
        }),
    },
    order: {
        Model: PartSalesOrder,
        usageKey: 'sales_order_customer',
        documentKey: 'order',
        number: 'orderNumber',
        build: (d) => ({
            number: d.orderNumber, date: d.orderDate || d.createdAt, deliveryDate: d.deliveryDate,
            amount: d.totalAmount, status: d.status,
        }),
    },
    invoice: {
        Model: PartInvoice,
        usageKey: 'invoice_customer',
        documentKey: 'invoice',
        number: 'invoiceNumber',
        build: (d) => ({
            number: d.invoiceNumber, date: d.invoiceDate || d.createdAt, dueDate: d.dueDate,
            amount: d.totalAmount, paidAmount: d.paidAmount, balanceAmount: d.balanceAmount, status: d.status,
        }),
    },
};

const sendDocumentEmail = (type) => async (req, res, next) => {
    try {
        const entry = EMAIL_DOCUMENTS[type];
        const { recipient } = await sendCustomerDocumentEmail({
            Model: entry.Model,
            id: req.params.id,
            usageKey: entry.usageKey,
            documentKey: entry.documentKey,
            buildDocument: entry.build,
            userId: req.user.id,
        });
        res.json({ success: true, message: `Email sent to ${recipient}` });
    } catch (error) { next(error); }
};

const sendQuotationEmail = sendDocumentEmail('quotation');
const sendBookingEmail = sendDocumentEmail('booking');
const sendOrderEmail = sendDocumentEmail('order');
const sendInvoiceEmail = sendDocumentEmail('invoice');

/**
 * Download the parts quotation as a customer-facing Estimate PDF. Rendered by
 * the same `quotation` template the vehicle estimate uses.
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

/** Email that same Estimate, with the PDF attached. */
const sendQuotationEstimateEmail = async (req, res, next) => {
    try {
        const quotationId = sanitizeId(req.params.id);
        const { buffer, fileName, quotation } = await buildEstimatePdf(quotationId);
        const recipient = String(req.body?.to || quotation.customer?.email || '').trim();
        if (!recipient) throw new AppError('This customer has no email address; add one first', 400);

        const context = buildEstimateEmailContext(quotation, { companyName: await companyName() });
        const attachments = [{ filename: fileName, content: buffer, contentType: 'application/pdf' }];

        // The dealer's own estimate template when one is configured; the
        // built-in body keeps this working before anyone designs one.
        let result;
        try {
            result = await sendTemplateEmail({
                usageKey: 'quotation_estimate', to: recipient, sentBy: req.user.id, attachments, context,
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

        await PartQuotation.updateOne({ _id: quotationId }, { $set: { estimateSentAt: new Date(), updatedBy: req.user.id } });
        res.json({ success: true, message: `Estimate ${quotation.quotationNumber} emailed to ${recipient}` });
    } catch (error) { next(error); }
};

/** Email or cancel several documents at once, mirroring the vehicle endpoint. */
const bulkDocuments = async (req, res, next) => {
    try {
        const { operation, ids = [] } = req.body;
        const entry = EMAIL_DOCUMENTS[req.params.type];
        if (!entry) throw new AppError('Invalid document type', 400);
        if (!Array.isArray(ids) || !ids.length) throw new AppError('Select at least one record', 400);

        const resource = { quotation: 'quotations', booking: 'bookings', order: 'sales_orders', invoice: 'invoices' }[req.params.type];
        if (!canDo(req.user, resource, operation === 'email' ? 'sendEmail' : 'delete')) {
            throw new AppError(`${operation === 'email' ? 'Email' : 'Delete'} permission denied`, 403);
        }

        const results = [];
        for (const id of ids) {
            try {
                if (operation === 'email') {
                    const sent = await sendCustomerDocumentEmail({
                        Model: entry.Model, id, usageKey: entry.usageKey,
                        documentKey: entry.documentKey, buildDocument: entry.build, userId: req.user.id,
                    });
                    results.push({ id, success: true, recipient: sent.recipient });
                } else if (operation === 'delete') {
                    const doc = await entry.Model.findById(sanitizeId(id));
                    if (!doc) throw new Error('Document not found');
                    if (doc.status === 'converted') throw new Error('A converted document cannot be cancelled');
                    // An invoice has consumed stock, so cancelling it must hand
                    // that stock back rather than only flipping the status.
                    if (req.params.type === 'invoice' && doc.stockApplied) {
                        await revertInvoiceStock(doc);
                        doc.stockApplied = false;
                    }
                    doc.status = 'cancelled';
                    doc.cancelledAt = new Date();
                    doc.updatedBy = req.user.id;
                    await doc.save();
                    results.push({ id, success: true });
                } else {
                    throw new Error('Invalid bulk operation');
                }
            } catch (error) {
                results.push({ id, success: false, error: error.message });
            }
        }

        const done = results.filter((r) => r.success).length;
        res.json({
            success: true,
            message: `${done} of ${ids.length} ${operation === 'email' ? 'emailed' : 'cancelled'}`,
            data: results,
        });
    } catch (error) { next(error); }
};

// ═══════════════════════════════════════════════════════════════════════════
// STATS
// ═══════════════════════════════════════════════════════════════════════════

const getStats = async (req, res, next) => {
    try {
        const live = { status: { $ne: 'cancelled' } };
        const [quotations, bookings, orders, invoices, revenue] = await Promise.all([
            PartQuotation.countDocuments(live),
            PartBooking.countDocuments(live),
            PartSalesOrder.countDocuments(live),
            PartInvoice.countDocuments(live),
            PartInvoice.aggregate([
                { $match: live },
                { $group: { _id: null, total: { $sum: '$totalAmount' }, paid: { $sum: '$paidAmount' } } },
            ]),
        ]);
        res.json({
            success: true,
            data: {
                total_quotations: quotations,
                total_bookings: bookings,
                total_orders: orders,
                total_invoices: invoices,
                total_revenue: revenue[0]?.total || 0,
                total_paid: revenue[0]?.paid || 0,
            },
        });
    } catch (error) { next(error); }
};

module.exports = {
    // Quotations
    getAllQuotations, getQuotationById, createQuotation, updateQuotation,
    deleteQuotation, updateQuotationStatus, approveQuotation, convertQuotationToBooking,
    convertQuotationToInvoice,
    // Bookings
    getAllBookings, getBookingById, createBooking, updateBooking, deleteBooking,
    // Orders
    getAllOrders, getOrderById, createOrder, convertBookingToOrder, updateOrderStatus, deleteOrder,
    // Invoices
    getAllInvoices, getInvoiceById, createInvoice, updateInvoiceStatus, deleteInvoice, recordPayment,
    // Email — same templates as the vehicle documents
    sendQuotationEmail, sendBookingEmail, sendOrderEmail, sendInvoiceEmail,
    downloadQuotationEstimate, sendQuotationEstimateEmail, bulkDocuments,
    // Stats
    getStats,
};
