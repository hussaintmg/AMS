/**
 * Service Management Controller (MongoDB)
 * Comprehensive CRUD operations for Appointments and Job Cards.
 * Every document is linked to the selected customer and written back to
 * the customer's document (salesSummary + salesHistory). Completing a job
 * card automatically prepares its service invoice.
 * Maintained by Hussain Developer
 * hussaintmerng@gmail.com | +92 319 1634446
 * AMS ERP
 */

const mongoose = require('mongoose');
const { AppError } = require('../middleware/errorHandler');
const logger = require('../utils/logger');
const ServiceAppointment = require('../models/ServiceAppointment.model');
const JobCard = require('../models/JobCard.model');
const ServiceType = require('../models/ServiceType.model');
const ServicePackage = require('../models/ServicePackage.model');
const Part = require('../models/Part.model');
const Customer = require('../models/Customer.model');
const User = require('../models/User.model');
const Role = require('../models/Role.model');
const SystemSetting = require('../models/SystemSetting.model');
const { nextDocNumber } = require('../utils/docNumber');
const { recordCustomerActivity } = require('../utils/customerSync');
const { createInvoiceForJobCard } = require('../utils/invoiceFactory');

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

async function findCustomerIdsBySearch(search) {
    const regex = new RegExp(escapeRegex(search), 'i');
    const customers = await Customer.find({
        $or: [{ firstName: regex }, { lastName: regex }, { companyName: regex }, { phone: regex }, { customerCode: regex }],
    }).select('_id').limit(500).lean();
    return customers.map((c) => c._id);
}

async function requireCustomer(customerId) {
    if (!sanitizeId(customerId)) throw new AppError('Customer is required', 400);
    const customer = await Customer.findOne({ _id: customerId, deletedAt: null }).lean();
    if (!customer) throw new AppError('Customer not found', 404);
    return customer;
}

const vehicleSnapshotFromBody = (body, current = {}) => ({
    number: body.vehicleNumber !== undefined ? String(body.vehicleNumber || '').trim() : (current.number || ''),
    make: body.vehicleMake !== undefined ? String(body.vehicleMake || '').trim() : (current.make || ''),
    model: body.vehicleModel !== undefined ? String(body.vehicleModel || '').trim() : (current.model || ''),
    variant: body.vehicleVariant !== undefined ? String(body.vehicleVariant || '').trim() : (current.variant || ''),
    year: body.vehicleYear !== undefined ? (num(body.vehicleYear, null) || null) : (current.year || null),
    vin: body.vehicleVin !== undefined ? String(body.vehicleVin || '').trim() : (current.vin || ''),
});

// ═══════════════════════════════════════════════════════════════════════════
// APPOINTMENTS
// ═══════════════════════════════════════════════════════════════════════════

const mapAppointment = (a) => ({
    id: a._id,
    appointment_number: a.appointmentNumber,
    customer_id: a.customer?._id || a.customer || null,
    customer_name: customerName(a.customer),
    customer_phone: a.customer?.phone || '',
    vehicle_id: a.vehicle || null,
    customer_vehicle_number: a.customerVehicle?.number || '',
    customer_vehicle_make: a.customerVehicle?.make || '',
    customer_vehicle_model: a.customerVehicle?.model || '',
    customer_vehicle_variant: a.customerVehicle?.variant || '',
    customer_vehicle_year: a.customerVehicle?.year || '',
    customer_vehicle_vin: a.customerVehicle?.vin || '',
    service_type_id: a.serviceTypeRef || null,
    service_type_name: a.serviceType?.name || '',
    service_advisor_id: a.serviceAdvisor || null,
    appointment_date: a.appointmentDate || null,
    appointment_time: a.appointmentTime || '',
    estimated_duration: a.estimatedDuration || '',
    customer_concerns: a.customerConcerns || '',
    notes: a.notes || '',
    status: a.status || 'scheduled',
    created_at: a.createdAt,
    updated_at: a.updatedAt,
});

const getAllAppointments = async (req, res, next) => {
    try {
        const { status, dateFrom, dateTo, customerId, search, page = 1, limit = 20 } = req.query;

        const filter = {};
        if (status) filter.status = status;
        if (sanitizeId(customerId)) filter.customer = customerId;
        if (dateFrom || dateTo) {
            filter.appointmentDate = {};
            if (dateFrom) filter.appointmentDate.$gte = new Date(dateFrom);
            if (dateTo) {
                const end = new Date(dateTo);
                end.setHours(23, 59, 59, 999);
                filter.appointmentDate.$lte = end;
            }
        }
        if (search) {
            const regex = new RegExp(escapeRegex(search), 'i');
            const customerIds = await findCustomerIdsBySearch(search);
            filter.$or = [
                { appointmentNumber: regex },
                { 'customerVehicle.number': regex },
                { 'customerVehicle.make': regex },
                { 'customerVehicle.model': regex },
                { 'serviceType.name': regex },
                ...(customerIds.length ? [{ customer: { $in: customerIds } }] : []),
            ];
        }

        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 20));

        const [appointments, total] = await Promise.all([
            ServiceAppointment.find(filter)
                .populate('customer', 'firstName lastName companyName phone customerCode')
                .sort({ appointmentDate: -1, createdAt: -1 })
                .skip((pageNum - 1) * limitNum)
                .limit(limitNum)
                .lean(),
            ServiceAppointment.countDocuments(filter),
        ]);

        res.json({
            success: true,
            data: appointments.map(mapAppointment),
            pagination: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum) },
        });
    } catch (error) {
        logger.error('Error fetching appointments:', error);
        next(error);
    }
};

const getAppointmentById = async (req, res, next) => {
    try {
        const appointment = await ServiceAppointment.findById(req.params.id)
            .populate('customer', 'firstName lastName companyName phone customerCode')
            .lean();
        if (!appointment) throw new AppError('Appointment not found', 404);
        res.json({ success: true, data: mapAppointment(appointment) });
    } catch (error) {
        next(error);
    }
};

async function resolveServiceType(serviceTypeId) {
    if (!sanitizeId(serviceTypeId)) return { ref: null, snapshot: {} };
    const type = await ServiceType.findById(serviceTypeId).lean();
    if (!type) return { ref: null, snapshot: {} };
    return {
        ref: type._id,
        snapshot: { name: type.name, code: type.code || '', description: type.description || '', basePrice: type.basePrice || 0 },
    };
}

const createAppointment = async (req, res, next) => {
    try {
        const {
            customerId, vehicleId, serviceTypeId, appointmentDate, appointmentTime,
            estimatedDuration, customerConcerns, notes, serviceAdvisorId,
        } = req.body;

        if (!appointmentDate || !appointmentTime) {
            throw new AppError('Customer, date, and time are required', 400);
        }

        const customer = await requireCustomer(customerId);
        const serviceType = await resolveServiceType(serviceTypeId);
        const appointmentNumber = await nextDocNumber(ServiceAppointment, 'appointmentNumber', 'APT');

        const appointment = await ServiceAppointment.create({
            appointmentNumber,
            customer: customer._id,
            vehicle: sanitizeId(vehicleId),
            customerVehicle: vehicleSnapshotFromBody(req.body),
            serviceTypeRef: serviceType.ref,
            serviceType: serviceType.snapshot,
            serviceAdvisor: sanitizeId(serviceAdvisorId),
            appointmentDate: new Date(appointmentDate),
            appointmentTime: appointmentTime || '',
            estimatedDuration: num(estimatedDuration, null) || null,
            customerConcerns: customerConcerns || '',
            status: 'scheduled',
            notes: notes || '',
            createdBy: req.user.id,
        });

        await recordCustomerActivity({
            customerId: customer._id,
            docType: 'service_appointment',
            docId: appointment._id,
            number: appointmentNumber,
            amount: serviceType.snapshot.basePrice || 0,
            description: `Service appointment ${appointmentNumber}${serviceType.snapshot.name ? ` — ${serviceType.snapshot.name}` : ''} on ${appointmentDate} ${appointmentTime}`,
            userId: req.user.id,
        });

        logger.info(`Appointment ${appointmentNumber} created by user ${req.user.id}`);
        res.status(201).json({ success: true, data: mapAppointment({ ...appointment.toObject(), customer }), message: 'Appointment created successfully' });
    } catch (error) {
        logger.error('Error creating appointment:', error);
        next(error);
    }
};

const updateAppointment = async (req, res, next) => {
    try {
        const appointment = await ServiceAppointment.findById(req.params.id);
        if (!appointment) throw new AppError('Appointment not found', 404);
        if (['completed', 'cancelled', 'no_show'].includes(appointment.status)) {
            throw new AppError(`Appointment is ${appointment.status} and cannot be edited`, 400);
        }

        const {
            customerId, vehicleId, serviceTypeId, appointmentDate, appointmentTime,
            estimatedDuration, customerConcerns, notes, serviceAdvisorId, status,
        } = req.body;

        if (sanitizeId(customerId)) {
            const customer = await requireCustomer(customerId);
            appointment.customer = customer._id;
        }
        if (serviceTypeId !== undefined) {
            const serviceType = await resolveServiceType(serviceTypeId);
            appointment.serviceTypeRef = serviceType.ref;
            appointment.serviceType = serviceType.snapshot;
        }

        appointment.customerVehicle = vehicleSnapshotFromBody(req.body, appointment.customerVehicle || {});
        if (vehicleId !== undefined) appointment.vehicle = sanitizeId(vehicleId);
        if (appointmentDate) appointment.appointmentDate = new Date(appointmentDate);
        if (appointmentTime !== undefined) appointment.appointmentTime = appointmentTime;
        if (estimatedDuration !== undefined) appointment.estimatedDuration = num(estimatedDuration, null) || null;
        if (customerConcerns !== undefined) appointment.customerConcerns = customerConcerns;
        if (notes !== undefined) appointment.notes = notes;
        if (serviceAdvisorId !== undefined) appointment.serviceAdvisor = sanitizeId(serviceAdvisorId);
        if (status) appointment.status = status;
        appointment.updatedBy = req.user.id;
        await appointment.save();

        res.json({ success: true, message: 'Appointment updated successfully' });
    } catch (error) {
        next(error);
    }
};

const updateAppointmentStatus = async (req, res, next) => {
    try {
        const { status } = req.body;
        const validStatuses = ['scheduled', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show'];
        if (!status || !validStatuses.includes(status)) {
            throw new AppError(`Invalid status. Must be one of: ${validStatuses.join(', ')}`, 400);
        }

        const appointment = await ServiceAppointment.findByIdAndUpdate(
            req.params.id,
            { status, updatedBy: req.user.id, ...(status === 'cancelled' ? { cancelledAt: new Date() } : {}) },
            { new: true },
        );
        if (!appointment) throw new AppError('Appointment not found', 404);

        res.json({ success: true, message: 'Status updated successfully' });
    } catch (error) {
        next(error);
    }
};

const deleteAppointment = async (req, res, next) => {
    try {
        const appointment = await ServiceAppointment.findById(req.params.id);
        if (!appointment) throw new AppError('Appointment not found', 404);

        appointment.status = 'cancelled';
        appointment.cancelledAt = new Date();
        appointment.updatedBy = req.user.id;
        await appointment.save();

        res.json({ success: true, message: 'Appointment cancelled successfully' });
    } catch (error) {
        next(error);
    }
};

const getAppointmentStats = async (req, res, next) => {
    try {
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date();
        endOfDay.setHours(23, 59, 59, 999);

        const [result, today] = await Promise.all([
            ServiceAppointment.aggregate([
                {
                    $group: {
                        _id: null,
                        total: { $sum: 1 },
                        scheduled: { $sum: { $cond: [{ $eq: ['$status', 'scheduled'] }, 1, 0] } },
                        confirmed: { $sum: { $cond: [{ $eq: ['$status', 'confirmed'] }, 1, 0] } },
                        in_progress: { $sum: { $cond: [{ $eq: ['$status', 'in_progress'] }, 1, 0] } },
                        completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
                    },
                },
            ]),
            ServiceAppointment.countDocuments({ appointmentDate: { $gte: startOfDay, $lte: endOfDay } }),
        ]);

        res.json({
            success: true,
            data: { ...(result[0] || { total: 0, scheduled: 0, confirmed: 0, in_progress: 0, completed: 0 }), today },
        });
    } catch (error) {
        next(error);
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// JOB CARDS
// ═══════════════════════════════════════════════════════════════════════════

const mapJobCardService = (s) => ({
    id: s._id,
    service_type_id: s.serviceType || null,
    labor_rate_id: s.laborRate || null,
    technician_id: s.technician || null,
    description: s.description || '',
    hours: s.hours || 0,
    rate: s.rate || 0,
    total: s.total || 0,
    status: s.status || 'pending',
});

const mapJobCardPart = (p) => ({
    id: p._id,
    part_id: p.part || null,
    part_number: p.partCode || '',
    part_name: p.name || '',
    quantity: p.quantity || 1,
    unit_price: p.unitPrice || 0,
    total: p.totalPrice || 0,
    is_warranty: !!p.isWarranty,
});

const mapJobCard = (jc, { detailed = false } = {}) => ({
    id: jc._id,
    job_card_number: jc.jobCardNumber,
    appointment_id: jc.appointment || null,
    customer_id: jc.customer?._id || jc.customer || null,
    customer_name: customerName(jc.customer),
    customer_phone: jc.customer?.phone || '',
    vehicle_id: jc.vehicle || null,
    customer_vehicle_number: jc.customerVehicle?.number || '',
    customer_vehicle_make: jc.customerVehicle?.make || '',
    customer_vehicle_model: jc.customerVehicle?.model || '',
    customer_vehicle_year: jc.customerVehicle?.year || '',
    customer_vehicle_vin: jc.customerVehicle?.vin || '',
    service_advisor_id: jc.serviceAdvisor || null,
    technician_id: jc.technician || null,
    warranty_type_id: jc.warrantyType || null,
    service_package_id: jc.servicePackage?._id || jc.servicePackage || null,
    service_package_name: jc.servicePackage?.packageName || '',
    status: jc.status || 'open',
    odometer_reading: jc.odometer || '',
    fuel_level: jc.fuelLevel || '',
    promised_date: jc.promisedDate || null,
    customer_remarks: jc.customerRemarks || jc.complaint || '',
    technician_remarks: jc.technicianRemarks || '',
    labor_total: jc.laborTotal || 0,
    parts_total: jc.partsTotal || 0,
    discount: jc.discount || 0,
    tax_amount: jc.taxAmount || 0,
    grand_total: jc.grandTotal || 0,
    received_date: jc.receivedDate || jc.createdAt,
    invoice_id: jc.invoice || null,
    invoice_number: jc.invoice?.invoiceNumber || '',
    created_at: jc.createdAt,
    updated_at: jc.updatedAt,
    ...(detailed ? {
        services: (jc.services || []).map(mapJobCardService),
        parts: (jc.parts || []).map(mapJobCardPart),
    } : {}),
});

const recomputeJobCardTotals = (jobCard) => {
    const laborTotal = (jobCard.services || []).reduce((sum, s) => sum + num(s.total), 0);
    const partsTotal = (jobCard.parts || []).filter((p) => !p.isWarranty).reduce((sum, p) => sum + num(p.totalPrice), 0);
    jobCard.laborTotal = laborTotal;
    jobCard.partsTotal = partsTotal;
    jobCard.grandTotal = laborTotal + partsTotal - num(jobCard.discount) + num(jobCard.taxAmount);
    jobCard.totalAmount = jobCard.grandTotal;
};

const getAllJobCards = async (req, res, next) => {
    try {
        const { status, dateFrom, dateTo, customerId, technicianId, search, page = 1, limit = 20 } = req.query;

        const filter = {};
        if (status) filter.status = status;
        if (sanitizeId(customerId)) filter.customer = customerId;
        if (sanitizeId(technicianId)) filter.technician = technicianId;
        if (dateFrom || dateTo) {
            filter.createdAt = {};
            if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
            if (dateTo) {
                const end = new Date(dateTo);
                end.setHours(23, 59, 59, 999);
                filter.createdAt.$lte = end;
            }
        }
        if (search) {
            const regex = new RegExp(escapeRegex(search), 'i');
            const customerIds = await findCustomerIdsBySearch(search);
            filter.$or = [
                { jobCardNumber: regex },
                { 'customerVehicle.number': regex },
                { 'customerVehicle.make': regex },
                { 'customerVehicle.model': regex },
                ...(customerIds.length ? [{ customer: { $in: customerIds } }] : []),
            ];
        }

        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 20));

        const [jobCards, total] = await Promise.all([
            JobCard.find(filter)
                .populate('customer', 'firstName lastName companyName phone customerCode')
                .populate('invoice', 'invoiceNumber status totalAmount')
                .populate('servicePackage', 'packageName price')
                .sort({ createdAt: -1 })
                .skip((pageNum - 1) * limitNum)
                .limit(limitNum)
                .lean(),
            JobCard.countDocuments(filter),
        ]);

        res.json({
            success: true,
            data: jobCards.map((jc) => mapJobCard(jc)),
            pagination: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum) },
        });
    } catch (error) {
        logger.error('Error fetching job cards:', error);
        next(error);
    }
};

const getJobCardById = async (req, res, next) => {
    try {
        const jobCard = await JobCard.findById(req.params.id)
            .populate('customer', 'firstName lastName companyName phone customerCode')
            .populate('invoice', 'invoiceNumber status totalAmount')
            .populate('servicePackage', 'packageName price')
            .lean();
        if (!jobCard) throw new AppError('Job card not found', 404);
        res.json({ success: true, data: mapJobCard(jobCard, { detailed: true }) });
    } catch (error) {
        next(error);
    }
};

const createJobCard = async (req, res, next) => {
    try {
        const {
            appointmentId, customerId, vehicleId, odometerReading, fuelLevel, promisedDate,
            customerRemarks, technicianRemarks, serviceAdvisorId, technicianId,
            discount, taxAmount, warrantyTypeId, servicePackageId,
        } = req.body;

        const customer = await requireCustomer(customerId);
        const jobCardNumber = await nextDocNumber(JobCard, 'jobCardNumber', 'JC');
        let servicePackage = null;
        if (sanitizeId(servicePackageId)) {
            servicePackage = await ServicePackage.findOne({ _id: servicePackageId, isActive: true }).lean();
            if (!servicePackage) throw new AppError('Selected service package is not available', 400);
        }

        // Package lines are snapshots.  This lets packages remain reusable
        // master data while preserving the price and scope agreed on this job.
        const packageServices = servicePackage
            ? (servicePackage.services?.length
                ? servicePackage.services.map((item) => ({
                    description: item.name || servicePackage.packageName,
                    hours: 0,
                    rate: num(item.price),
                    total: num(item.price) * Math.max(1, num(item.quantity, 1)),
                    status: 'pending',
                }))
                : [{ description: servicePackage.packageName, hours: 0, rate: num(servicePackage.price), total: num(servicePackage.price), status: 'pending' }])
            : [];

        const jobCard = await JobCard.create({
            jobCardNumber,
            appointment: sanitizeId(appointmentId),
            customer: customer._id,
            vehicle: sanitizeId(vehicleId),
            customerVehicle: vehicleSnapshotFromBody(req.body),
            serviceAdvisor: sanitizeId(serviceAdvisorId),
            technician: sanitizeId(technicianId),
            warrantyType: sanitizeId(warrantyTypeId),
            servicePackage: servicePackage?._id || null,
            services: packageServices,
            status: 'open',
            odometer: num(odometerReading, null) || null,
            fuelLevel: fuelLevel || '',
            promisedDate: promisedDate ? new Date(promisedDate) : null,
            customerRemarks: customerRemarks || '',
            complaint: customerRemarks || '',
            technicianRemarks: technicianRemarks || '',
            discount: num(discount),
            taxAmount: num(taxAmount),
            receivedDate: new Date(),
            createdBy: req.user.id,
        });

        // Cross-model: link the appointment to its job card
        if (sanitizeId(appointmentId)) {
            await ServiceAppointment.findOneAndUpdate(
                { _id: appointmentId, status: { $in: ['scheduled', 'confirmed'] } },
                { status: 'in_progress', updatedBy: req.user.id },
            );
        }

        await recordCustomerActivity({
            customerId: customer._id,
            docType: 'job_card',
            docId: jobCard._id,
            number: jobCardNumber,
            description: `Job card ${jobCardNumber} opened${jobCard.customerVehicle?.number ? ` for vehicle ${jobCard.customerVehicle.number}` : ''}`,
            userId: req.user.id,
        });

        logger.info(`Job card ${jobCardNumber} created by user ${req.user.id}`);
        res.status(201).json({
            success: true,
            data: mapJobCard({ ...jobCard.toObject(), customer }, { detailed: true }),
            message: 'Job card created successfully',
        });
    } catch (error) {
        logger.error('Error creating job card:', error);
        next(error);
    }
};

const updateJobCard = async (req, res, next) => {
    try {
        const jobCard = await JobCard.findById(req.params.id);
        if (!jobCard) throw new AppError('Job card not found', 404);
        if (['delivered', 'cancelled'].includes(jobCard.status)) {
            throw new AppError(`Job card is ${jobCard.status} and cannot be edited`, 400);
        }

        const {
            customerId, vehicleId, odometerReading, fuelLevel, promisedDate,
            customerRemarks, technicianRemarks, serviceAdvisorId, technicianId,
            discount, taxAmount, warrantyTypeId, servicePackageId, status,
        } = req.body;

        if (sanitizeId(customerId)) {
            const customer = await requireCustomer(customerId);
            jobCard.customer = customer._id;
        }

        jobCard.customerVehicle = vehicleSnapshotFromBody(req.body, jobCard.customerVehicle || {});
        if (vehicleId !== undefined) jobCard.vehicle = sanitizeId(vehicleId);
        if (odometerReading !== undefined) jobCard.odometer = num(odometerReading, null) || null;
        if (fuelLevel !== undefined) jobCard.fuelLevel = fuelLevel;
        if (promisedDate !== undefined) jobCard.promisedDate = promisedDate ? new Date(promisedDate) : null;
        if (customerRemarks !== undefined) { jobCard.customerRemarks = customerRemarks; jobCard.complaint = customerRemarks; }
        if (technicianRemarks !== undefined) jobCard.technicianRemarks = technicianRemarks;
        if (serviceAdvisorId !== undefined) jobCard.serviceAdvisor = sanitizeId(serviceAdvisorId);
        if (technicianId !== undefined) jobCard.technician = sanitizeId(technicianId);
        if (warrantyTypeId !== undefined) jobCard.warrantyType = sanitizeId(warrantyTypeId);
        if (servicePackageId !== undefined) {
            const packageId = sanitizeId(servicePackageId);
            if (packageId && !await ServicePackage.exists({ _id: packageId, isActive: true })) {
                throw new AppError('Selected service package is not available', 400);
            }
            jobCard.servicePackage = packageId;
        }
        if (discount !== undefined) jobCard.discount = num(discount);
        if (taxAmount !== undefined) jobCard.taxAmount = num(taxAmount);
        if (status) jobCard.status = status;
        jobCard.updatedBy = req.user.id;
        recomputeJobCardTotals(jobCard);
        await jobCard.save();

        res.json({ success: true, message: 'Job card updated successfully' });
    } catch (error) {
        next(error);
    }
};

const updateJobCardStatus = async (req, res, next) => {
    try {
        const { status } = req.body;
        const validStatuses = ['open', 'in_progress', 'on_hold', 'completed', 'delivered', 'cancelled'];
        if (!status || !validStatuses.includes(status)) {
            throw new AppError(`Invalid status. Must be one of: ${validStatuses.join(', ')}`, 400);
        }
        if (status === 'completed') {
            const jobCard = await JobCard.findOne({ appointment: req.params.id });
            if (!jobCard) throw new AppError('Create a job card before completing this service', 400);
            req.params.id = jobCard._id;
            return completeJobCard(req, res, next);
        }
        if (status === 'cancelled') return deleteJobCard(req, res, next);

        const jobCard = await JobCard.findByIdAndUpdate(
            req.params.id,
            { status, updatedBy: req.user.id, ...(status === 'delivered' ? { deliveredAt: new Date() } : {}) },
            { new: true },
        );
        if (!jobCard) throw new AppError('Job card not found', 404);

        res.json({ success: true, message: 'Status updated successfully' });
    } catch (error) {
        next(error);
    }
};

const completeJobCard = async (req, res, next) => {
    try {
        const { technicianRemarks } = req.body || {};
        const jobCard = await JobCard.findById(req.params.id);
        if (!jobCard) throw new AppError('Job card not found', 404);
        if (['cancelled', 'delivered'].includes(jobCard.status)) {
            throw new AppError(`Job card is ${jobCard.status} and cannot be completed`, 400);
        }

        if (technicianRemarks) jobCard.technicianRemarks = technicianRemarks;
        recomputeJobCardTotals(jobCard);
        jobCard.status = 'completed';
        jobCard.completedAt = new Date();
        jobCard.updatedBy = req.user.id;
        await jobCard.save();

        // Cross-model: customer document + automatic service invoice
        await recordCustomerActivity({
            customerId: jobCard.customer,
            docType: 'job_card',
            docId: jobCard._id,
            number: jobCard.jobCardNumber,
            amount: jobCard.grandTotal,
            description: `Job card ${jobCard.jobCardNumber} completed — PKR ${Number(jobCard.grandTotal).toLocaleString()}`,
            userId: req.user.id,
            countDocument: false,
            spentDelta: num(jobCard.grandTotal),
        });

        let invoiceNumber = null;
        try {
            const { invoice } = await createInvoiceForJobCard(jobCard, { userId: req.user.id });
            jobCard.invoice = invoice._id;
            invoiceNumber = invoice.invoiceNumber;
            await jobCard.save();
        } catch (invoiceError) {
            logger.error(`Auto-invoice failed for job card ${jobCard.jobCardNumber}:`, invoiceError);
        }

        // Close the linked appointment
        if (jobCard.appointment) {
            await ServiceAppointment.findOneAndUpdate(
                { _id: jobCard.appointment, status: { $nin: ['cancelled', 'no_show'] } },
                { status: 'completed', updatedBy: req.user.id },
            );
        }

        logger.info(`Job card ${jobCard.jobCardNumber} completed by user ${req.user.id}`);
        res.json({
            success: true,
            data: { invoiceNumber },
            message: invoiceNumber ? `Job card completed — invoice ${invoiceNumber} generated` : 'Job card completed',
        });
    } catch (error) {
        logger.error('Error completing job card:', error);
        next(error);
    }
};

const deleteJobCard = async (req, res, next) => {
    try {
        const jobCard = await JobCard.findById(req.params.id);
        if (!jobCard) throw new AppError('Job card not found', 404);
        if (jobCard.status === 'delivered') throw new AppError('Delivered job cards cannot be cancelled', 400);

        // Restore part stock for parts that were reserved on this job card
        for (const part of jobCard.parts || []) {
            if (part.part) {
                await Part.findByIdAndUpdate(part.part, { $inc: { currentStock: num(part.quantity, 1) } });
            }
        }

        jobCard.status = 'cancelled';
        jobCard.cancelledAt = new Date();
        jobCard.updatedBy = req.user.id;
        await jobCard.save();

        res.json({ success: true, message: 'Job card cancelled successfully' });
    } catch (error) {
        next(error);
    }
};

const getJobCardStats = async (req, res, next) => {
    try {
        const [result] = await JobCard.aggregate([
            { $match: { status: { $ne: 'cancelled' } } },
            {
                $group: {
                    _id: null,
                    total: { $sum: 1 },
                    open: { $sum: { $cond: [{ $eq: ['$status', 'open'] }, 1, 0] } },
                    in_progress: { $sum: { $cond: [{ $eq: ['$status', 'in_progress'] }, 1, 0] } },
                    completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
                    delivered: { $sum: { $cond: [{ $eq: ['$status', 'delivered'] }, 1, 0] } },
                    totalRevenue: { $sum: '$grandTotal' },
                },
            },
        ]);
        res.json({
            success: true,
            data: result || { total: 0, open: 0, in_progress: 0, completed: 0, delivered: 0, totalRevenue: 0 },
        });
    } catch (error) {
        next(error);
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// JOB CARD SERVICES
// ═══════════════════════════════════════════════════════════════════════════

async function loadEditableJobCard(id) {
    const jobCard = await JobCard.findById(id);
    if (!jobCard) throw new AppError('Job card not found', 404);
    if (['completed', 'delivered', 'cancelled'].includes(jobCard.status)) {
        throw new AppError(`Job card is ${jobCard.status} and cannot be modified`, 400);
    }
    return jobCard;
}

const addJobCardService = async (req, res, next) => {
    try {
        const { serviceTypeId, laborRateId, description, hours, rate, technicianId } = req.body;
        if (!description || rate === undefined || rate === '') {
            throw new AppError('Description and rate are required', 400);
        }

        const jobCard = await loadEditableJobCard(req.params.id);
        const serviceHours = num(hours);
        const serviceRate = num(rate);
        jobCard.services.push({
            serviceType: sanitizeId(serviceTypeId),
            laborRate: sanitizeId(laborRateId),
            technician: sanitizeId(technicianId),
            description,
            hours: serviceHours,
            rate: serviceRate,
            total: serviceHours > 0 ? serviceHours * serviceRate : serviceRate,
            status: 'pending',
        });
        recomputeJobCardTotals(jobCard);
        jobCard.updatedBy = req.user.id;
        await jobCard.save();

        const added = jobCard.services[jobCard.services.length - 1];
        res.status(201).json({ success: true, data: mapJobCardService(added), message: 'Service added successfully' });
    } catch (error) {
        next(error);
    }
};

const updateJobCardService = async (req, res, next) => {
    try {
        const jobCard = await loadEditableJobCard(req.params.id);
        const service = jobCard.services.id(req.params.serviceId);
        if (!service) throw new AppError('Service not found', 404);

        const { serviceTypeId, laborRateId, description, hours, rate, technicianId, status } = req.body;
        if (serviceTypeId !== undefined) service.serviceType = sanitizeId(serviceTypeId);
        if (laborRateId !== undefined) service.laborRate = sanitizeId(laborRateId);
        if (technicianId !== undefined) service.technician = sanitizeId(technicianId);
        if (description !== undefined) service.description = description;
        if (hours !== undefined) service.hours = num(hours);
        if (rate !== undefined) service.rate = num(rate);
        if (status !== undefined) service.status = status;
        service.total = num(service.hours) > 0 ? num(service.hours) * num(service.rate) : num(service.rate);

        recomputeJobCardTotals(jobCard);
        jobCard.updatedBy = req.user.id;
        await jobCard.save();

        res.json({ success: true, message: 'Service updated successfully' });
    } catch (error) {
        next(error);
    }
};

const deleteJobCardService = async (req, res, next) => {
    try {
        const jobCard = await loadEditableJobCard(req.params.id);
        const service = jobCard.services.id(req.params.serviceId);
        if (!service) throw new AppError('Service not found', 404);

        service.deleteOne();
        recomputeJobCardTotals(jobCard);
        jobCard.updatedBy = req.user.id;
        await jobCard.save();

        res.json({ success: true, message: 'Service removed successfully' });
    } catch (error) {
        next(error);
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// JOB CARD PARTS
// ═══════════════════════════════════════════════════════════════════════════

const addJobCardPart = async (req, res, next) => {
    try {
        const { partId, quantity, unitPrice, isWarranty } = req.body;
        if (!sanitizeId(partId) || !num(quantity)) {
            throw new AppError('Part and quantity are required', 400);
        }

        const jobCard = await loadEditableJobCard(req.params.id);
        const part = await Part.findById(partId);
        if (!part) throw new AppError('Part not found', 404);

        const qty = Math.max(1, num(quantity, 1));
        if (num(part.currentStock) < qty) {
            throw new AppError(`Insufficient stock. Available: ${part.currentStock}`, 400);
        }

        const price = unitPrice !== undefined && unitPrice !== '' ? num(unitPrice) : num(part.sellingPrice);
        jobCard.parts.push({
            part: part._id,
            partCode: part.partCode || part.sku || '',
            name: part.name || '',
            quantity: qty,
            unitPrice: price,
            totalPrice: qty * price,
            isWarranty: !!isWarranty,
        });
        recomputeJobCardTotals(jobCard);
        jobCard.updatedBy = req.user.id;
        await jobCard.save();

        // Cross-model: reserve stock
        await Part.findByIdAndUpdate(part._id, { $inc: { currentStock: -qty } });

        const added = jobCard.parts[jobCard.parts.length - 1];
        res.status(201).json({ success: true, data: mapJobCardPart(added), message: 'Part added successfully' });
    } catch (error) {
        next(error);
    }
};

const updateJobCardPart = async (req, res, next) => {
    try {
        const jobCard = await loadEditableJobCard(req.params.id);
        const partLine = jobCard.parts.id(req.params.partId);
        if (!partLine) throw new AppError('Part not found on job card', 404);

        const { quantity, unitPrice, isWarranty } = req.body;
        const oldQty = num(partLine.quantity, 1);

        if (quantity !== undefined) partLine.quantity = Math.max(1, num(quantity, 1));
        if (unitPrice !== undefined) partLine.unitPrice = num(unitPrice);
        if (isWarranty !== undefined) partLine.isWarranty = !!isWarranty;
        partLine.totalPrice = num(partLine.quantity, 1) * num(partLine.unitPrice);

        recomputeJobCardTotals(jobCard);
        jobCard.updatedBy = req.user.id;
        await jobCard.save();

        // Cross-model: adjust reserved stock by the quantity change
        const qtyDelta = num(partLine.quantity, 1) - oldQty;
        if (qtyDelta !== 0 && partLine.part) {
            await Part.findByIdAndUpdate(partLine.part, { $inc: { currentStock: -qtyDelta } });
        }

        res.json({ success: true, message: 'Part updated successfully' });
    } catch (error) {
        next(error);
    }
};

const deleteJobCardPart = async (req, res, next) => {
    try {
        const jobCard = await loadEditableJobCard(req.params.id);
        const partLine = jobCard.parts.id(req.params.partId);
        if (!partLine) throw new AppError('Part not found on job card', 404);

        const restoreQty = num(partLine.quantity, 1);
        const partRef = partLine.part;
        partLine.deleteOne();
        recomputeJobCardTotals(jobCard);
        jobCard.updatedBy = req.user.id;
        await jobCard.save();

        // Cross-model: release reserved stock
        if (partRef) {
            await Part.findByIdAndUpdate(partRef, { $inc: { currentStock: restoreQty } });
        }

        res.json({ success: true, message: 'Part removed successfully' });
    } catch (error) {
        next(error);
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// LOOKUPS
// ═══════════════════════════════════════════════════════════════════════════

const getServiceTypes = async (req, res, next) => {
    try {
        const types = await ServiceType.find({ isActive: true }).sort({ name: 1 }).lean();
        res.json({
            success: true,
            data: types.map((t) => ({
                id: t._id,
                name: t.name,
                code: t.code || '',
                base_price: t.basePrice || 0,
                estimated_hours: t.estimatedHours || 0,
            })),
        });
    } catch (error) {
        next(error);
    }
};

async function getUsersByRolePattern(pattern) {
    const roles = await Role.find({ name: { $regex: pattern, $options: 'i' } }).select('_id').lean();
    if (!roles.length) return [];
    const users = await User.find({ role: { $in: roles.map((r) => r._id) }, isActive: true })
        .select('firstName lastName email')
        .sort({ firstName: 1 })
        .lean();
    return users.map((u) => ({ id: u._id, name: [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email }));
}

const getTechnicians = async (req, res, next) => {
    try {
        const technicians = await getUsersByRolePattern('technician');
        res.json({ success: true, data: technicians });
    } catch (error) {
        next(error);
    }
};

const getAdvisors = async (req, res, next) => {
    try {
        // Prefer the roles chosen under Server Management → Role Usage. Fall back
        // to matching on role name so existing installs keep working until an
        // admin configures the list.
        const setting = await SystemSetting.findOne({ key: 'service_advisor_roles' }).lean();
        const configuredRoleIds = Array.isArray(setting?.value) ? setting.value : [];

        if (configuredRoleIds.length) {
            const users = await User.find({ role: { $in: configuredRoleIds }, isActive: true })
                .select('firstName lastName email')
                .sort({ firstName: 1 })
                .lean();
            const advisors = users.map((u) => ({
                id: u._id,
                name: [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email,
            }));
            return res.json({ success: true, data: advisors });
        }

        const advisors = await getUsersByRolePattern('service_(advisor|manager)|advisor');
        res.json({ success: true, data: advisors });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    // Appointments
    getAllAppointments, getAppointmentById, createAppointment, updateAppointment,
    updateAppointmentStatus, deleteAppointment, getAppointmentStats,
    // Job Cards
    getAllJobCards, getJobCardById, createJobCard, updateJobCard,
    updateJobCardStatus, completeJobCard, deleteJobCard, getJobCardStats,
    // Job Card Services
    addJobCardService, updateJobCardService, deleteJobCardService,
    // Job Card Parts
    addJobCardPart, updateJobCardPart, deleteJobCardPart,
    // Lookups
    getServiceTypes, getTechnicians, getAdvisors,
};
