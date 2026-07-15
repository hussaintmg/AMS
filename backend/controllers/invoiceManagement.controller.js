/**
 * Invoice Management Controller (MongoDB)
 * Full CRUD for invoices, invoice items and payments.
 * Every mutation is written back to the customer's document
 * (salesSummary + salesHistory) and kept in sync with the linked
 * sales order.
 * Maintained by Hussain Developer
 * hussaintmerng@gmail.com | +92 319 1634446
 * AMS ERP
 */

const mongoose = require('mongoose');
const { AppError } = require('../middleware/errorHandler');
const logger = require('../utils/logger');
const Invoice = require('../models/Invoice.model');
const Payment = require('../models/Payment.model');
const PaymentMethod = require('../models/PaymentMethod.model');
const SalesOrder = require('../models/SalesOrder.model');
const Customer = require('../models/Customer.model');
const { nextDocNumber } = require('../utils/docNumber');
const { recordCustomerActivity } = require('../utils/customerSync');
const { createInvoiceForOrder, round2 } = require('../utils/invoiceFactory');
const { sendTemplateEmail } = require('../services/emailSender.service');
const { allowedOwnerIds } = require('../utils/roleJobs');

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

const displayStatus = (invoice) => {
    if (['sent', 'partial'].includes(invoice.status) && invoice.dueDate && new Date(invoice.dueDate) < new Date()) {
        return 'overdue';
    }
    return invoice.status || 'draft';
};

const mapInvoiceRow = (inv) => ({
    id: inv._id,
    invoice_number: inv.invoiceNumber,
    invoice_type: inv.invoiceType || 'sales',
    sales_order_id: inv.salesOrder?._id || inv.salesOrder || null,
    order_number: inv.salesOrder?.orderNumber || null,
    job_card_id: inv.jobCard || null,
    customer_id: inv.customer?._id || inv.customer || null,
    customer_name: customerName(inv.customer),
    status: displayStatus(inv),
    invoice_date: inv.invoiceDate || inv.createdAt,
    due_date: inv.dueDate || null,
    subtotal: inv.subtotal || 0,
    discount_amount: inv.discountAmount || 0,
    tax_amount: inv.taxAmount || 0,
    total_amount: inv.totalAmount || 0,
    paid_amount: inv.paidAmount || 0,
    balance_amount: inv.balanceAmount || 0,
    notes: inv.notes || '',
    terms_and_conditions: inv.termsAndConditions || '',
    created_at: inv.createdAt,
    updated_at: inv.updatedAt,
});

const recomputeInvoiceTotals = (invoice) => {
    const subtotal = round2((invoice.items || []).reduce((sum, item) => sum + num(item.totalPrice), 0));
    const taxAmount = round2((invoice.items || []).reduce((sum, item) => sum + num(item.taxAmount), 0));
    invoice.subtotal = subtotal;
    invoice.taxAmount = taxAmount;
    invoice.totalAmount = round2(subtotal - num(invoice.discountAmount) + taxAmount);
    invoice.balanceAmount = round2(invoice.totalAmount - num(invoice.paidAmount));
};

// ═══════════════════════════════════════════════════════════════════════════
// LIST / DETAIL
// ═══════════════════════════════════════════════════════════════════════════

const getAllInvoices = async (req, res, next) => {
    try {
        const {
            status, type, customerId, salesOrderId, search, dateFrom, dateTo,
            sortBy = 'created_at', sortOrder = 'DESC', page = 1, limit = 20,
        } = req.query;

        const filter = {};
        const invoiceOwnerIds = await allowedOwnerIds(req.user, 'invoices');
        if (invoiceOwnerIds !== null) filter.createdBy = { $in: invoiceOwnerIds };
        if (status === 'overdue') {
            filter.status = { $in: ['sent', 'partial'] };
            filter.dueDate = { $lt: new Date() };
        } else if (status) {
            filter.status = status;
        }
        if (type) filter.invoiceType = type;
        if (sanitizeId(customerId)) filter.customer = customerId;
        if (sanitizeId(salesOrderId)) filter.salesOrder = salesOrderId;
        if (dateFrom || dateTo) {
            filter.invoiceDate = {};
            if (dateFrom) filter.invoiceDate.$gte = new Date(dateFrom);
            if (dateTo) {
                const end = new Date(dateTo);
                end.setHours(23, 59, 59, 999);
                filter.invoiceDate.$lte = end;
            }
        }
        if (search) {
            const regex = new RegExp(String(search).trim().split(/\s+/).map(escapeRegex).join('|'), 'i');
            const customers = await Customer.find({
                $or: [{ firstName: regex }, { lastName: regex }, { companyName: regex }, { phone: regex }, { customerCode: regex }],
            }).select('_id').limit(500).lean();
            filter.$or = [
                { invoiceNumber: regex },
                { 'items.description': regex },
                ...(customers.length ? [{ customer: { $in: customers.map((c) => c._id) } }] : []),
            ];
        }

        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
        const sortMap = {
            created_at: 'createdAt', invoice_date: 'invoiceDate', due_date: 'dueDate',
            total_amount: 'totalAmount', invoice_number: 'invoiceNumber', status: 'status',
        };
        const sortField = sortMap[sortBy] || 'createdAt';
        const sortDir = String(sortOrder).toUpperCase() === 'ASC' ? 1 : -1;

        const [invoices, total] = await Promise.all([
            Invoice.find(filter)
                .populate('customer', 'firstName lastName companyName phone customerCode')
                .populate('salesOrder', 'orderNumber')
                .sort({ [sortField]: sortDir })
                .skip((pageNum - 1) * limitNum)
                .limit(limitNum)
                .lean(),
            Invoice.countDocuments(filter),
        ]);

        res.json({
            success: true,
            data: invoices.map(mapInvoiceRow),
            pagination: {
                page: pageNum,
                limit: limitNum,
                total,
                pages: Math.ceil(total / limitNum),
                totalPages: Math.ceil(total / limitNum),
            },
        });
    } catch (error) {
        logger.error('Error fetching invoices:', error);
        next(error);
    }
};

const getInvoiceById = async (req, res, next) => {
    try {
        const invoice = await Invoice.findById(sanitizeId(req.params.id))
            .populate('customer', 'firstName lastName companyName phone email address city customerCode')
            .populate('salesOrder', 'orderNumber')
            .lean();
        if (!invoice) throw new AppError('Invoice not found', 404);

        const payments = await Payment.find({ invoice: invoice._id, status: { $ne: 'cancelled' } })
            .sort({ paymentDate: 1 })
            .lean();

        const customer = invoice.customer || {};
        res.json({
            success: true,
            data: {
                ...mapInvoiceRow(invoice),
                customer_address: [customer.address, customer.city].filter(Boolean).join(', '),
                customer_phone: customer.phone || '',
                customer_email: customer.email || '',
                items: (invoice.items || []).map((item) => ({
                    id: item._id,
                    description: item.description,
                    quantity: item.quantity || 1,
                    unit_price: item.unitPrice || 0,
                    tax_amount: item.taxAmount || 0,
                    total: item.totalPrice || 0,
                    type: item.type || '',
                })),
                payments: payments.map((payment) => ({
                    id: payment._id,
                    payment_number: payment.paymentNumber,
                    payment_method_name: payment.method?.name || 'Payment',
                    payment_date: payment.paymentDate || payment.createdAt,
                    amount: payment.amount || 0,
                    reference_number: payment.referenceNumber || '',
                    notes: payment.notes || '',
                })),
            },
        });
    } catch (error) {
        next(error);
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// CREATE / UPDATE / DELETE
// ═══════════════════════════════════════════════════════════════════════════

const createInvoice = async (req, res, next) => {
    try {
        const {
            invoiceType, customerId, salesOrderId, jobCardId, dueDays,
            discountAmount, notes, termsAndConditions, items,
        } = req.body;

        if (!sanitizeId(customerId)) throw new AppError('Customer is required', 400);
        const customer = await Customer.findOne({ _id: customerId, deletedAt: null }).lean();
        if (!customer) throw new AppError('Customer not found', 404);

        const invoiceItems = (Array.isArray(items) ? items : [])
            .filter((item) => item && item.description)
            .map((item) => {
                const quantity = Math.max(1, num(item.quantity, 1));
                const unitPrice = num(item.unitPrice);
                return {
                    description: item.description,
                    quantity,
                    unitPrice,
                    taxAmount: num(item.taxAmount),
                    totalPrice: round2(quantity * unitPrice),
                    type: item.type || invoiceType || 'sales',
                };
            });
        if (!invoiceItems.length) throw new AppError('At least one line item is required', 400);

        const subtotal = round2(invoiceItems.reduce((sum, item) => sum + item.totalPrice, 0));
        const taxAmount = round2(invoiceItems.reduce((sum, item) => sum + item.taxAmount, 0));
        const discount = num(discountAmount);
        const totalAmount = round2(subtotal - discount + taxAmount);

        const invoiceNumber = await nextDocNumber(Invoice, 'invoiceNumber', 'INV');
        const now = new Date();

        const invoice = await Invoice.create({
            invoiceNumber,
            invoiceType: invoiceType || 'sales',
            salesOrder: sanitizeId(salesOrderId),
            jobCard: sanitizeId(jobCardId),
            customer: customer._id,
            status: 'draft',
            invoiceDate: now,
            dueDate: new Date(now.getTime() + Math.max(0, num(dueDays, 30)) * 24 * 60 * 60 * 1000),
            subtotal,
            taxAmount,
            discountAmount: discount,
            totalAmount,
            paidAmount: 0,
            balanceAmount: totalAmount,
            items: invoiceItems,
            notes,
            termsAndConditions,
            createdBy: req.user.id,
        });

        await recordCustomerActivity({
            customerId: customer._id,
            docType: 'invoice',
            docId: invoice._id,
            number: invoiceNumber,
            amount: totalAmount,
            description: `Invoice ${invoiceNumber} (${invoiceType || 'sales'}) created`,
            userId: req.user.id,
            spentDelta: sanitizeId(salesOrderId) ? 0 : totalAmount,
            outstandingDelta: totalAmount,
        });

        logger.info(`Invoice ${invoiceNumber} created by user ${req.user.id}`);
        res.status(201).json({
            success: true,
            data: { id: invoice._id, invoice_number: invoiceNumber, invoiceNumber },
            message: 'Invoice created successfully',
        });
    } catch (error) {
        logger.error('Error creating invoice:', error);
        next(error);
    }
};

const createFromSalesOrder = async (req, res, next) => {
    try {
        const { salesOrderId, dueDays } = req.body;
        if (!sanitizeId(salesOrderId)) throw new AppError('Sales order is required', 400);

        const order = await SalesOrder.findById(salesOrderId);
        if (!order) throw new AppError('Sales order not found', 404);
        if (order.status === 'cancelled') throw new AppError('Cancelled orders cannot be invoiced', 400);

        const { invoice, created } = await createInvoiceForOrder(order, { dueDays, userId: req.user.id });
        if (created) {
            order.status = 'invoiced';
            order.updatedBy = req.user.id;
            await order.save();
        }

        res.status(created ? 201 : 200).json({
            success: true,
            data: { id: invoice._id, invoice_number: invoice.invoiceNumber },
            message: created ? 'Invoice created from sales order' : 'Invoice already exists for this order',
        });
    } catch (error) {
        next(error);
    }
};

const updateInvoice = async (req, res, next) => {
    try {
        const invoice = await Invoice.findById(sanitizeId(req.params.id));
        if (!invoice) throw new AppError('Invoice not found', 404);
        if (invoice.status !== 'draft') throw new AppError('Only draft invoices can be edited', 400);

        const { dueDays, discountAmount, notes, termsAndConditions } = req.body;
        const oldBalance = num(invoice.balanceAmount);
        const oldTotal = num(invoice.totalAmount);

        if (dueDays !== undefined) {
            const base = invoice.invoiceDate || invoice.createdAt || new Date();
            invoice.dueDate = new Date(new Date(base).getTime() + Math.max(0, num(dueDays, 30)) * 24 * 60 * 60 * 1000);
        }
        if (discountAmount !== undefined) invoice.discountAmount = num(discountAmount);
        if (notes !== undefined) invoice.notes = notes;
        if (termsAndConditions !== undefined) invoice.termsAndConditions = termsAndConditions;
        invoice.updatedBy = req.user.id;
        recomputeInvoiceTotals(invoice);
        await invoice.save();

        await recordCustomerActivity({
            customerId: invoice.customer,
            docType: 'invoice',
            docId: invoice._id,
            number: invoice.invoiceNumber,
            amount: invoice.totalAmount,
            description: `Invoice ${invoice.invoiceNumber} updated`,
            userId: req.user.id,
            countDocument: false,
            spentDelta: invoice.salesOrder ? 0 : num(invoice.totalAmount) - oldTotal,
            outstandingDelta: num(invoice.balanceAmount) - oldBalance,
        });

        res.json({ success: true, message: 'Invoice updated successfully' });
    } catch (error) {
        next(error);
    }
};

const deleteInvoice = async (req, res, next) => {
    try {
        const invoice = await Invoice.findById(sanitizeId(req.params.id));
        if (!invoice) throw new AppError('Invoice not found', 404);
        if (invoice.status === 'paid') throw new AppError('Paid invoices cannot be cancelled', 400);
        if (invoice.status === 'cancelled') throw new AppError('Invoice already cancelled', 400);

        const outstandingDelta = -num(invoice.balanceAmount);
        invoice.status = 'cancelled';
        invoice.cancelledAt = new Date();
        invoice.updatedBy = req.user.id;
        await invoice.save();

        // Allow the linked order to be re-invoiced
        if (invoice.salesOrder) {
            await SalesOrder.findOneAndUpdate(
                { _id: invoice.salesOrder, status: 'invoiced' },
                { status: 'confirmed', updatedBy: req.user.id },
            );
        }

        await recordCustomerActivity({
            customerId: invoice.customer,
            docType: 'invoice',
            docId: invoice._id,
            number: invoice.invoiceNumber,
            amount: invoice.totalAmount,
            description: `Invoice ${invoice.invoiceNumber} cancelled`,
            userId: req.user.id,
            countDocument: false,
            spentDelta: invoice.salesOrder ? 0 : -num(invoice.totalAmount),
            outstandingDelta,
        });

        logger.info(`Invoice ${invoice.invoiceNumber} cancelled by user ${req.user.id}`);
        res.json({ success: true, message: 'Invoice cancelled successfully' });
    } catch (error) {
        next(error);
    }
};

const updateInvoiceStatus = async (req, res, next) => {
    try {
        const { status } = req.body;
        const validStatuses = ['draft', 'sent', 'partial', 'paid', 'overdue', 'cancelled'];
        if (!status) throw new AppError('Status is required', 400);
        if (!validStatuses.includes(status)) {
            throw new AppError(`Invalid status. Must be one of: ${validStatuses.join(', ')}`, 400);
        }
        if (status === 'cancelled') return deleteInvoice(req, res, next);

        const invoice = await Invoice.findById(sanitizeId(req.params.id));
        if (!invoice) throw new AppError('Invoice not found', 404);
        if (invoice.status === 'cancelled') throw new AppError('Cancelled invoices cannot change status', 400);

        if (status === 'paid' && num(invoice.balanceAmount) > 0) {
            const settled = num(invoice.balanceAmount);
            invoice.paidAmount = num(invoice.totalAmount);
            invoice.balanceAmount = 0;
            await recordCustomerActivity({
                customerId: invoice.customer,
                docType: 'payment',
                docId: invoice._id,
                number: invoice.invoiceNumber,
                amount: settled,
                description: `Invoice ${invoice.invoiceNumber} marked as paid`,
                userId: req.user.id,
                countDocument: false,
                paidDelta: settled,
                outstandingDelta: -settled,
            });
            if (invoice.salesOrder) {
                const order = await SalesOrder.findById(invoice.salesOrder);
                if (order) {
                    order.paidAmount = num(order.paidAmount) + settled;
                    order.balanceAmount = num(order.totalAmount) - order.paidAmount;
                    await order.save();
                }
            }
        }

        invoice.status = status;
        invoice.updatedBy = req.user.id;
        await invoice.save();

        logger.info(`Invoice ${invoice.invoiceNumber} status updated to ${status}`);
        res.json({ success: true, message: 'Invoice status updated successfully' });
    } catch (error) {
        next(error);
    }
};

const sendInvoice = async (req, res, next) => {
    try {
        const invoice = await Invoice.findById(sanitizeId(req.params.id));
        if (!invoice) throw new AppError('Invoice not found', 404);
        if (invoice.status !== 'draft') throw new AppError('Only draft invoices can be sent', 400);

        invoice.status = 'sent';
        invoice.updatedBy = req.user.id;
        await invoice.save();

        res.json({ success: true, message: 'Invoice sent successfully' });
    } catch (error) {
        next(error);
    }
};

const sendInvoiceEmail = async (req, res, next) => {
    try {
        const invoice = await Invoice.findById(sanitizeId(req.params.id))
            .populate('customer', 'firstName lastName companyName email phone customerCode')
            .lean();
        if (!invoice) throw new AppError('Invoice not found', 404);
        if (!invoice.customer?.email) throw new AppError('The selected customer does not have an email address', 400);

        const result = await sendTemplateEmail({
            usageKey: 'invoice_customer',
            to: invoice.customer.email,
            sentBy: req.user.id,
            context: { customer: invoice.customer, invoice: {
                number: invoice.invoiceNumber,
                date: invoice.invoiceDate || invoice.createdAt,
                dueDate: invoice.dueDate,
                amount: invoice.totalAmount,
                dueAmount: invoice.balanceAmount,
                status: invoice.status,
            } },
        });
        if (result.status !== 'sent') throw new AppError(result.errorMessage || 'Email could not be sent', 502);

        res.json({ success: true, message: `Invoice ${invoice.invoiceNumber} emailed to ${invoice.customer.email}` });
    } catch (error) {
        next(error);
    }
};

const bulkInvoices = async(req,res,next)=>{try{const {ids=[],operation}=req.body;if(!Array.isArray(ids)||!ids.length)throw new AppError('Select at least one invoice',400);if(ids.length>100)throw new AppError('A maximum of 100 invoices is allowed',400);const results=[];for(const id of ids){try{if(operation==='email'){const invoice=await Invoice.findById(sanitizeId(id)).populate('customer','firstName lastName companyName email phone customerCode').lean();if(!invoice?.customer?.email)throw new Error('Customer email is missing');const result=await sendTemplateEmail({usageKey:'invoice_customer',to:invoice.customer.email,sentBy:req.user.id,context:{customer:invoice.customer,invoice:{number:invoice.invoiceNumber,date:invoice.invoiceDate||invoice.createdAt,dueDate:invoice.dueDate,amount:invoice.totalAmount,dueAmount:invoice.balanceAmount,status:invoice.status}}});if(result.status!=='sent')throw new Error(result.errorMessage||'Email failed');results.push({id,success:true,recipient:invoice.customer.email});}else if(operation==='delete'){const invoice=await Invoice.findById(sanitizeId(id));if(!invoice)throw new Error('Invoice not found');if(invoice.status==='paid'||invoice.status==='cancelled')throw new Error(`Invoice is ${invoice.status}`);invoice.status='cancelled';invoice.cancelledAt=new Date();invoice.updatedBy=req.user.id;await invoice.save();if(invoice.salesOrder)await SalesOrder.findOneAndUpdate({_id:invoice.salesOrder,status:'invoiced'},{status:'confirmed',updatedBy:req.user.id});results.push({id,success:true});}else throw new Error('Invalid bulk operation');}catch(error){results.push({id,success:false,error:error.message})}}const succeeded=results.filter(x=>x.success).length;res.json({success:succeeded>0,message:`${succeeded} of ${ids.length} invoices processed`,data:{succeeded,failed:ids.length-succeeded,results}})}catch(e){next(e)}};

// ═══════════════════════════════════════════════════════════════════════════
// ITEMS
// ═══════════════════════════════════════════════════════════════════════════

async function applyItemMutation(req, res, next, mutate, successMessage) {
    try {
        const invoice = await Invoice.findById(sanitizeId(req.params.id));
        if (!invoice) throw new AppError('Invoice not found', 404);
        if (invoice.status !== 'draft') throw new AppError('Only draft invoices can be modified', 400);

        const oldBalance = num(invoice.balanceAmount);
        const oldTotal = num(invoice.totalAmount);
        const payload = mutate(invoice);
        recomputeInvoiceTotals(invoice);
        invoice.updatedBy = req.user.id;
        await invoice.save();

        await recordCustomerActivity({
            customerId: invoice.customer,
            docType: 'invoice',
            docId: invoice._id,
            number: invoice.invoiceNumber,
            amount: invoice.totalAmount,
            description: `Invoice ${invoice.invoiceNumber} items updated`,
            userId: req.user.id,
            countDocument: false,
            spentDelta: invoice.salesOrder ? 0 : num(invoice.totalAmount) - oldTotal,
            outstandingDelta: num(invoice.balanceAmount) - oldBalance,
        });

        res.status(payload?.created ? 201 : 200).json({
            success: true,
            data: payload?.data,
            message: successMessage,
        });
    } catch (error) {
        next(error);
    }
}

const addInvoiceItem = (req, res, next) => applyItemMutation(req, res, next, (invoice) => {
    const { description, quantity, unitPrice, taxAmount } = req.body;
    if (!description || unitPrice === undefined) throw new AppError('Description and unit price are required', 400);
    const qty = Math.max(1, num(quantity, 1));
    invoice.items.push({
        description,
        quantity: qty,
        unitPrice: num(unitPrice),
        taxAmount: num(taxAmount),
        totalPrice: round2(qty * num(unitPrice)),
    });
    const item = invoice.items[invoice.items.length - 1];
    return { created: true, data: { id: item._id } };
}, 'Item added successfully');

const updateInvoiceItem = (req, res, next) => applyItemMutation(req, res, next, (invoice) => {
    const item = invoice.items.id(req.params.itemId);
    if (!item) throw new AppError('Invoice item not found', 404);
    const { description, quantity, unitPrice, taxAmount } = req.body;
    if (description !== undefined) item.description = description;
    if (quantity !== undefined) item.quantity = Math.max(1, num(quantity, 1));
    if (unitPrice !== undefined) item.unitPrice = num(unitPrice);
    if (taxAmount !== undefined) item.taxAmount = num(taxAmount);
    item.totalPrice = round2(num(item.quantity, 1) * num(item.unitPrice));
    return { data: { id: item._id } };
}, 'Item updated successfully');

const removeInvoiceItem = (req, res, next) => applyItemMutation(req, res, next, (invoice) => {
    const item = invoice.items.id(req.params.itemId);
    if (!item) throw new AppError('Invoice item not found', 404);
    item.deleteOne();
    return {};
}, 'Item removed successfully');

// ═══════════════════════════════════════════════════════════════════════════
// PAYMENTS
// ═══════════════════════════════════════════════════════════════════════════

const recordPayment = async (req, res, next) => {
    try {
        const { amount, paymentMethodId, referenceNumber, notes } = req.body;
        const paymentAmount = num(amount);
        if (paymentAmount <= 0) throw new AppError('Payment amount must be greater than zero', 400);

        const invoice = await Invoice.findById(sanitizeId(req.params.id));
        if (!invoice) throw new AppError('Invoice not found', 404);
        if (invoice.status === 'cancelled') throw new AppError('Cannot record payment on a cancelled invoice', 400);
        if (paymentAmount > num(invoice.balanceAmount)) {
            throw new AppError('Payment amount cannot exceed the outstanding balance', 400);
        }

        let method = null;
        if (sanitizeId(paymentMethodId)) {
            method = await PaymentMethod.findById(paymentMethodId).lean();
        }
        if (!method) throw new AppError('Payment method is required', 400);

        const paymentNumber = await nextDocNumber(Payment, 'paymentNumber', 'PAY');
        const payment = await Payment.create({
            paymentNumber,
            invoice: invoice._id,
            customer: invoice.customer,
            methodRef: method._id,
            method: { name: method.name, code: method.code || '', type: method.type || '' },
            amount: paymentAmount,
            paymentDate: new Date(),
            referenceNumber: referenceNumber || '',
            notes: notes || '',
            status: 'completed',
            createdBy: req.user.id,
        });

        invoice.paidAmount = round2(num(invoice.paidAmount) + paymentAmount);
        invoice.balanceAmount = round2(num(invoice.totalAmount) - invoice.paidAmount);
        invoice.status = invoice.balanceAmount <= 0 ? 'paid' : 'partial';
        invoice.updatedBy = req.user.id;
        await invoice.save();

        // Keep the linked sales order payment figures in sync
        if (invoice.salesOrder) {
            const order = await SalesOrder.findById(invoice.salesOrder);
            if (order) {
                order.paidAmount = round2(num(order.paidAmount) + paymentAmount);
                order.balanceAmount = round2(num(order.totalAmount) - order.paidAmount);
                order.updatedBy = req.user.id;
                await order.save();
            }
        }

        await recordCustomerActivity({
            customerId: invoice.customer,
            docType: 'payment',
            docId: payment._id,
            number: paymentNumber,
            amount: paymentAmount,
            description: `Payment ${paymentNumber} (${method.name}) against invoice ${invoice.invoiceNumber}`,
            userId: req.user.id,
            countDocument: false,
            paidDelta: paymentAmount,
            outstandingDelta: -paymentAmount,
        });

        logger.info(`Payment ${paymentNumber} of ${paymentAmount} recorded on invoice ${invoice.invoiceNumber}`);
        res.status(201).json({
            success: true,
            data: { id: payment._id, paymentNumber, invoiceStatus: invoice.status },
            message: 'Payment recorded successfully',
        });
    } catch (error) {
        logger.error('Error recording payment:', error);
        next(error);
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// LOOKUPS / STATS / MISC
// ═══════════════════════════════════════════════════════════════════════════

const getPaymentMethods = async (req, res, next) => {
    try {
        const methods = await PaymentMethod.find({ isActive: true }).sort({ sortOrder: 1, name: 1 }).lean();
        res.json({
            success: true,
            data: methods.map((m) => ({ id: m._id, name: m.name, code: m.code, type: m.type })),
        });
    } catch (error) {
        next(error);
    }
};

const getInvoiceStats = async (req, res, next) => {
    try {
        const [result] = await Invoice.aggregate([
            { $match: { status: { $ne: 'cancelled' } } },
            {
                $group: {
                    _id: null,
                    total: { $sum: 1 },
                    draft: { $sum: { $cond: [{ $eq: ['$status', 'draft'] }, 1, 0] } },
                    sent: { $sum: { $cond: [{ $eq: ['$status', 'sent'] }, 1, 0] } },
                    partial: { $sum: { $cond: [{ $eq: ['$status', 'partial'] }, 1, 0] } },
                    paid: { $sum: { $cond: [{ $eq: ['$status', 'paid'] }, 1, 0] } },
                    overdue: {
                        $sum: {
                            $cond: [
                                { $and: [{ $in: ['$status', ['sent', 'partial']] }, { $lt: ['$dueDate', new Date()] }] },
                                1, 0,
                            ],
                        },
                    },
                    totalValue: { $sum: '$totalAmount' },
                    totalCollected: { $sum: '$paidAmount' },
                    totalOutstanding: { $sum: '$balanceAmount' },
                },
            },
        ]);
        res.json({
            success: true,
            data: result || {
                total: 0, draft: 0, sent: 0, partial: 0, paid: 0, overdue: 0,
                totalValue: 0, totalCollected: 0, totalOutstanding: 0,
            },
        });
    } catch (error) {
        next(error);
    }
};

const getQRCodeData = async (req, res, next) => {
    try {
        const invoice = await Invoice.findById(sanitizeId(req.params.id))
            .populate('customer', 'firstName lastName companyName')
            .lean();
        if (!invoice) throw new AppError('Invoice not found', 404);
        res.json({
            success: true,
            data: {
                invoice_number: invoice.invoiceNumber,
                customer_name: customerName(invoice.customer),
                total_amount: invoice.totalAmount,
                balance_amount: invoice.balanceAmount,
                due_date: invoice.dueDate,
                status: displayStatus(invoice),
            },
        });
    } catch (error) {
        next(error);
    }
};

const getInvoiceHistory = async (req, res, next) => {
    try {
        const invoice = await Invoice.findById(sanitizeId(req.params.id)).lean();
        if (!invoice) throw new AppError('Invoice not found', 404);

        const payments = await Payment.find({ invoice: invoice._id }).sort({ createdAt: 1 }).lean();
        const history = [
            { action: `Invoice ${invoice.invoiceNumber} created`, created_at: invoice.createdAt },
            ...payments.map((p) => ({
                action: `Payment ${p.paymentNumber} of PKR ${Number(p.amount).toLocaleString()} recorded (${p.method?.name || 'Payment'})`,
                created_at: p.createdAt,
            })),
            ...(invoice.cancelledAt ? [{ action: 'Invoice cancelled', created_at: invoice.cancelledAt }] : []),
        ];
        res.json({ success: true, data: history });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getAllInvoices,
    getInvoiceById,
    createInvoice,
    createFromSalesOrder,
    updateInvoice,
    deleteInvoice,
    updateInvoiceStatus,
    sendInvoice,
    sendInvoiceEmail, bulkInvoices,
    addInvoiceItem,
    updateInvoiceItem,
    removeInvoiceItem,
    recordPayment,
    getPaymentMethods,
    getInvoiceStats,
    getQRCodeData,
    getInvoiceHistory,
};
