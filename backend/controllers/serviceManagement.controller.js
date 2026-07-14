/**
 * Service Management Controller
 * Comprehensive CRUD operations for Appointments and Job Cards
 * Created by LOGIXINVENTOR (PVT) Ltd.
 * info@logixinventor.com +92 333 3836851
 * www.logixinventor.com | AMS
 * Date: 2026-01-08
 *
 * Compatibility note: `service_advisor_id` / `technician_id` columns removed from
 * service_appointments and job_cards INSERTs/UPDATEs because current DB schema
 * uses `created_by` instead. See PROJECT_MEMORY.md for details.
 */

const { query } = require('../config/database');
const { AppError } = require('../middleware/errorHandler');
const logger = require('../utils/logger');

// ═══════════════════════════════════════════════════════════════════════════
// APPOINTMENTS CONTROLLER
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get all appointments with filters and pagination
 */
const getAllAppointments = async (req, res, next) => {
    try {
        const { status, dateFrom, dateTo, customerId, search, page = 1, limit = 20 } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);

        const sql = `
            SELECT * FROM vw_appointments_list
            WHERE (? IS NULL OR status = ?)
            AND (? IS NULL OR appointment_date >= ?)
            AND (? IS NULL OR appointment_date <= ?)
            AND (? IS NULL OR customer_id = ?)
            AND (? IS NULL OR 
                 appointment_number LIKE CONCAT('%', ?, '%') OR
                 customer_name LIKE CONCAT('%', ?, '%') OR
                 customer_phone LIKE CONCAT('%', ?, '%') OR
                 customer_vehicle_number LIKE CONCAT('%', ?, '%'))
            ORDER BY appointment_date DESC, appointment_time DESC
            LIMIT ? OFFSET ?
        `;

        const countSql = `
            SELECT COUNT(*) as total FROM vw_appointments_list
            WHERE (? IS NULL OR status = ?)
            AND (? IS NULL OR appointment_date >= ?)
            AND (? IS NULL OR appointment_date <= ?)
            AND (? IS NULL OR customer_id = ?)
            AND (? IS NULL OR 
                 appointment_number LIKE CONCAT('%', ?, '%') OR
                 customer_name LIKE CONCAT('%', ?, '%') OR
                 customer_phone LIKE CONCAT('%', ?, '%') OR
                 customer_vehicle_number LIKE CONCAT('%', ?, '%'))
        `;

        const params = [
            status || null, status || null,
            dateFrom || null, dateFrom || null,
            dateTo || null, dateTo || null,
            customerId || null, customerId || null,
            search || null, search || null, search || null, search || null, search || null,
            parseInt(limit), offset
        ];

        const countParams = [
            status || null, status || null,
            dateFrom || null, dateFrom || null,
            dateTo || null, dateTo || null,
            customerId || null, customerId || null,
            search || null, search || null, search || null, search || null, search || null
        ];

        const [appointments, countResult] = await Promise.all([
            query(sql, params),
            query(countSql, countParams)
        ]);

        const total = countResult && countResult[0] ? countResult[0].total : 0;

        res.json({
            success: true,
            data: appointments || [],
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: total,
                totalPages: Math.ceil(total / parseInt(limit))
            }
        });
    } catch (error) {
        logger.error('ServiceManagement error:', error);
        next(error);
    }
};

/**
 * Get appointment by ID
 */
const getAppointmentById = async (req, res, next) => {
    try {
        const { id } = req.params;
        const appointments = await query('SELECT * FROM vw_appointments_list WHERE id = ?', [id]);

        if (appointments.length === 0) {
            throw new AppError('Appointment not found', 404);
        }

        res.json({ success: true, data: appointments[0] });
    } catch (error) {
        logger.error('ServiceManagement error:', error);
        next(error);
    }
};

/**
 * Create new appointment
 */
const createAppointment = async (req, res, next) => {
    try {
        const {
            customerId, vehicleId, vehicleNumber, vehicleMake, vehicleModel,
            vehicleYear, vehicleVin, serviceTypeId, appointmentDate, appointmentTime,
            estimatedDuration, customerConcerns, notes, serviceAdvisorId
        } = req.body;

        // Validation
        if (!customerId || !appointmentDate || !appointmentTime) {
            throw new AppError('Customer, appointment date and time are required', 400);
        }

        // Generate appointment number
        const [{ next_num }] = await query('SELECT COALESCE(MAX(id), 0) + 1 AS next_num FROM service_appointments');
        const appointmentNumber = `APT${String(next_num).padStart(6, '0')}`;

        const result = await query(`
            INSERT INTO service_appointments (
                appointment_number, customer_id, vehicle_id, customer_vehicle_number,
                customer_vehicle_make, customer_vehicle_model, customer_vehicle_year,
                customer_vehicle_vin, service_type_id, appointment_date, appointment_time,
                estimated_duration, customer_concerns, notes, created_by
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            appointmentNumber, customerId, vehicleId || null, vehicleNumber,
            vehicleMake, vehicleModel, vehicleYear || null, vehicleVin || null,
            serviceTypeId || null, appointmentDate, appointmentTime,
            estimatedDuration || null, customerConcerns || null, notes || null,
            req.user.id
        ]);

        const [newAppointment] = await query('SELECT * FROM vw_appointments_list WHERE id = ?', [result.insertId]);

        res.status(201).json({
            success: true,
            message: 'Appointment created successfully',
            data: newAppointment
        });
    } catch (error) {
        logger.error('ServiceManagement error:', error);
        next(error);
    }
};

/**
 * Update appointment
 */
const updateAppointment = async (req, res, next) => {
    try {
        const { id } = req.params;
        const {
            customerId, vehicleId, vehicleNumber, vehicleMake, vehicleModel,
            vehicleYear, vehicleVin, serviceTypeId, appointmentDate, appointmentTime,
            estimatedDuration, customerConcerns, notes, serviceAdvisorId
        } = req.body;

        // Check if appointment exists
        const [existing] = await query('SELECT id, status FROM service_appointments WHERE id = ?', [id]);
        if (!existing) {
            throw new AppError('Appointment not found', 404);
        }

        await query(`
            UPDATE service_appointments SET
                customer_id = COALESCE(?, customer_id),
                vehicle_id = ?,
                customer_vehicle_number = COALESCE(?, customer_vehicle_number),
                customer_vehicle_make = COALESCE(?, customer_vehicle_make),
                customer_vehicle_model = COALESCE(?, customer_vehicle_model),
                customer_vehicle_year = ?,
                customer_vehicle_vin = ?,
                service_type_id = ?,
                appointment_date = COALESCE(?, appointment_date),
                appointment_time = COALESCE(?, appointment_time),
                estimated_duration = ?,
                customer_concerns = ?,
                notes = ?,
                updated_at = NOW()
            WHERE id = ?
        `, [
            customerId, vehicleId || null, vehicleNumber, vehicleMake, vehicleModel,
            vehicleYear || null, vehicleVin || null, serviceTypeId || null,
            appointmentDate, appointmentTime, estimatedDuration || null,
            customerConcerns || null, notes || null, id
        ]);

        const [updatedAppointment] = await query('SELECT * FROM vw_appointments_list WHERE id = ?', [id]);

        res.json({
            success: true,
            message: 'Appointment updated successfully',
            data: updatedAppointment
        });
    } catch (error) {
        logger.error('ServiceManagement error:', error);
        next(error);
    }
};

/**
 * Update appointment status
 */
const updateAppointmentStatus = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        const validStatuses = ['scheduled', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show'];
        if (!validStatuses.includes(status)) {
            throw new AppError(`Invalid status. Must be one of: ${validStatuses.join(', ')}`, 400);
        }

        await query('UPDATE service_appointments SET status = ?, updated_at = NOW() WHERE id = ?', [status, id]);

        const [updatedAppointment] = await query('SELECT * FROM vw_appointments_list WHERE id = ?', [id]);

        res.json({
            success: true,
            message: 'Appointment status updated',
            data: updatedAppointment
        });
    } catch (error) {
        logger.error('ServiceManagement error:', error);
        next(error);
    }
};

/**
 * Delete (cancel) appointment
 */
const deleteAppointment = async (req, res, next) => {
    try {
        const { id } = req.params;

        const result = await query(
            'UPDATE service_appointments SET status = ?, updated_at = NOW() WHERE id = ?',
            ['cancelled', id]
        );

        if (result.affectedRows === 0) {
            throw new AppError('Appointment not found', 404);
        }

        res.json({ success: true, message: 'Appointment cancelled successfully' });
    } catch (error) {
        logger.error('ServiceManagement error:', error);
        next(error);
    }
};

/**
 * Get appointment statistics
 */
const getAppointmentStats = async (req, res, next) => {
    try {
        const [stats] = await query(`
            SELECT 
                COUNT(*) AS total,
                SUM(CASE WHEN status = 'scheduled' THEN 1 ELSE 0 END) AS scheduled,
                SUM(CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END) AS confirmed,
                SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) AS in_progress,
                SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed,
                SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled,
                SUM(CASE WHEN status = 'no_show' THEN 1 ELSE 0 END) AS no_show,
                SUM(CASE WHEN DATE(appointment_date) = CURDATE() THEN 1 ELSE 0 END) AS today,
                SUM(CASE WHEN appointment_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 7 DAY) THEN 1 ELSE 0 END) AS this_week
            FROM service_appointments
        `);

        res.json({ success: true, data: stats });
    } catch (error) {
        logger.error('ServiceManagement error:', error);
        next(error);
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// JOB CARDS CONTROLLER
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get all job cards with filters and pagination
 */
const getAllJobCards = async (req, res, next) => {
    try {
        const { status, dateFrom, dateTo, customerId, technicianId, search, page = 1, limit = 20 } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);

        const sql = `
            SELECT * FROM vw_job_cards_list
            WHERE (? IS NULL OR status = ?)
            AND (? IS NULL OR DATE(received_date) >= ?)
            AND (? IS NULL OR DATE(received_date) <= ?)
            AND (? IS NULL OR customer_id = ?)
            AND (? IS NULL OR 
                 job_card_number LIKE CONCAT('%', ?, '%') OR
                 customer_name LIKE CONCAT('%', ?, '%') OR
                 customer_phone LIKE CONCAT('%', ?, '%') OR
                 customer_vehicle_number LIKE CONCAT('%', ?, '%'))
            ORDER BY received_date DESC
            LIMIT ? OFFSET ?
        `;

        const countSql = `
            SELECT COUNT(*) as total FROM vw_job_cards_list
            WHERE (? IS NULL OR status = ?)
            AND (? IS NULL OR DATE(received_date) >= ?)
            AND (? IS NULL OR DATE(received_date) <= ?)
            AND (? IS NULL OR customer_id = ?)
            AND (? IS NULL OR 
                 job_card_number LIKE CONCAT('%', ?, '%') OR
                 customer_name LIKE CONCAT('%', ?, '%') OR
                 customer_phone LIKE CONCAT('%', ?, '%') OR
                 customer_vehicle_number LIKE CONCAT('%', ?, '%'))
        `;

        const params = [
            status || null, status || null,
            dateFrom || null, dateFrom || null,
            dateTo || null, dateTo || null,
            customerId || null, customerId || null,
            search || null, search || null, search || null, search || null, search || null,
            parseInt(limit), offset
        ];

        const countParams = [
            status || null, status || null,
            dateFrom || null, dateFrom || null,
            dateTo || null, dateTo || null,
            customerId || null, customerId || null,
            search || null, search || null, search || null, search || null, search || null
        ];

        const [jobCards, countResult] = await Promise.all([
            query(sql, params),
            query(countSql, countParams)
        ]);

        const total = countResult && countResult[0] ? countResult[0].total : 0;

        res.json({
            success: true,
            data: jobCards || [],
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: total,
                totalPages: Math.ceil(total / parseInt(limit))
            }
        });
    } catch (error) {
        logger.error('ServiceManagement error:', error);
        next(error);
    }
};

/**
 * Get job card by ID with services and parts
 */
const getJobCardById = async (req, res, next) => {
    try {
        const { id } = req.params;

        const [jobCard, services, parts] = await Promise.all([
            query('SELECT * FROM vw_job_cards_list WHERE id = ?', [id]),
            query(`
                SELECT jcs.*, st.name AS service_type_name,
                       NULL AS technician_name
                FROM job_card_services jcs
                LEFT JOIN service_types st ON jcs.service_type_id = st.id
                WHERE jcs.job_card_id = ?
                ORDER BY jcs.id
            `, [id]),
            query(`
                SELECT jcp.*, p.part_code, p.name AS part_name, p.current_stock
                FROM job_card_parts jcp
                LEFT JOIN parts p ON jcp.part_id = p.id
                WHERE jcp.job_card_id = ?
                ORDER BY jcp.id
            `, [id])
        ]);

        if (jobCard.length === 0) {
            throw new AppError('Job card not found', 404);
        }

        res.json({
            success: true,
            data: {
                ...jobCard[0],
                services,
                parts
            }
        });
    } catch (error) {
        logger.error('ServiceManagement error:', error);
        next(error);
    }
};

/**
 * Create new job card
 */
const createJobCard = async (req, res, next) => {
    try {
        const {
            appointmentId, customerId, vehicleId, vehicleNumber, vehicleMake,
            vehicleModel, vehicleVin, odometerReading, fuelLevel, promisedDate,
            customerRemarks, discount, taxAmount
        } = req.body;

        // Validation
        if (!customerId) {
            throw new AppError('Customer is required', 400);
        }

        // Generate job card number
        const [{ next_num }] = await query('SELECT COALESCE(MAX(id), 0) + 1 AS next_num FROM job_cards');
        const jobCardNumber = `JC${String(next_num).padStart(6, '0')}`;

        const result = await query(`
            INSERT INTO job_cards (
                job_card_number, appointment_id, customer_id, vehicle_id,
                customer_vehicle_number, customer_vehicle_make, customer_vehicle_model,
                customer_vehicle_vin, odometer_reading, fuel_level, received_date,
                promised_date, customer_remarks, discount, tax_amount, created_by
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?, ?, ?, ?, ?)
        `, [
            jobCardNumber, appointmentId || null, customerId, vehicleId || null,
            vehicleNumber, vehicleMake, vehicleModel, vehicleVin || null,
            odometerReading || null, fuelLevel || null,
            promisedDate || null, customerRemarks || null,
            discount || 0, taxAmount || 0,
            req.user.id
        ]);

        // Update appointment status if linked
        if (appointmentId) {
            await query(
                'UPDATE service_appointments SET status = ?, updated_at = NOW() WHERE id = ?',
                ['in_progress', appointmentId]
            );
        }

        const [newJobCard] = await query('SELECT * FROM vw_job_cards_list WHERE id = ?', [result.insertId]);

        res.status(201).json({
            success: true,
            message: 'Job card created successfully',
            data: newJobCard
        });
    } catch (error) {
        logger.error('ServiceManagement error:', error);
        next(error);
    }
};

/**
 * Update job card
 */
const updateJobCard = async (req, res, next) => {
    try {
        const { id } = req.params;
        const {
            customerId, vehicleId, vehicleNumber, vehicleMake, vehicleModel,
            vehicleVin, odometerReading, fuelLevel, promisedDate, customerRemarks,
            technicianRemarks, serviceAdvisorId, technicianId, discount, taxAmount
        } = req.body;

        // Check if job card exists
        const [existing] = await query('SELECT id FROM job_cards WHERE id = ?', [id]);
        if (!existing) {
            throw new AppError('Job card not found', 404);
        }

        await query(`
            UPDATE job_cards SET
                customer_id = COALESCE(?, customer_id),
                vehicle_id = ?,
                customer_vehicle_number = COALESCE(?, customer_vehicle_number),
                customer_vehicle_make = COALESCE(?, customer_vehicle_make),
                customer_vehicle_model = COALESCE(?, customer_vehicle_model),
                customer_vehicle_vin = ?,
                odometer_reading = ?,
                fuel_level = ?,
                promised_date = ?,
                customer_remarks = ?,
                technician_remarks = ?,
                discount = COALESCE(?, discount),
                tax_amount = COALESCE(?, tax_amount),
                updated_at = NOW()
            WHERE id = ?
        `, [
            customerId, vehicleId || null, vehicleNumber, vehicleMake, vehicleModel,
            vehicleVin || null, odometerReading || null, fuelLevel || null,
            promisedDate || null, customerRemarks || null, technicianRemarks || null,
            discount, taxAmount, id
        ]);

        // Recalculate totals
        await recalculateJobCardTotals(id);

        const [updatedJobCard] = await query('SELECT * FROM vw_job_cards_list WHERE id = ?', [id]);

        res.json({
            success: true,
            message: 'Job card updated successfully',
            data: updatedJobCard
        });
    } catch (error) {
        logger.error('ServiceManagement error:', error);
        next(error);
    }
};

/**
 * Update job card status
 */
const updateJobCardStatus = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        const validStatuses = ['open', 'in_progress', 'on_hold', 'completed', 'delivered', 'cancelled'];
        if (!validStatuses.includes(status)) {
            throw new AppError(`Invalid status. Must be one of: ${validStatuses.join(', ')}`, 400);
        }

        const updateFields = status === 'completed'
            ? 'status = ?, actual_completion_date = NOW(), updated_at = NOW()'
            : 'status = ?, updated_at = NOW()';

        await query(`UPDATE job_cards SET ${updateFields} WHERE id = ?`, [status, id]);

        const [updatedJobCard] = await query('SELECT * FROM vw_job_cards_list WHERE id = ?', [id]);

        res.json({
            success: true,
            message: 'Job card status updated',
            data: updatedJobCard
        });
    } catch (error) {
        logger.error('ServiceManagement error:', error);
        next(error);
    }
};

/**
 * Complete job card
 */
const completeJobCard = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { technicianRemarks } = req.body;

        // Recalculate totals first
        await recalculateJobCardTotals(id);

        // Update status and remarks
        await query(`
            UPDATE job_cards SET
                status = 'completed',
                actual_completion_date = NOW(),
                technician_remarks = COALESCE(?, technician_remarks),
                updated_at = NOW()
            WHERE id = ?
        `, [technicianRemarks || null, id]);

        // Update linked appointment if exists
        await query(`
            UPDATE service_appointments sa
            INNER JOIN job_cards jc ON sa.id = jc.appointment_id
            SET sa.status = 'completed', sa.updated_at = NOW()
            WHERE jc.id = ? AND jc.appointment_id IS NOT NULL
        `, [id]);

        const [completedJobCard] = await query('SELECT * FROM vw_job_cards_list WHERE id = ?', [id]);

        res.json({
            success: true,
            message: 'Job card completed successfully',
            data: completedJobCard
        });
    } catch (error) {
        logger.error('ServiceManagement error:', error);
        next(error);
    }
};

/**
 * Delete (cancel) job card
 */
const deleteJobCard = async (req, res, next) => {
    try {
        const { id } = req.params;

        const result = await query(
            'UPDATE job_cards SET status = ?, updated_at = NOW() WHERE id = ?',
            ['cancelled', id]
        );

        if (result.affectedRows === 0) {
            throw new AppError('Job card not found', 404);
        }

        res.json({ success: true, message: 'Job card cancelled successfully' });
    } catch (error) {
        logger.error('ServiceManagement error:', error);
        next(error);
    }
};

/**
 * Get job card statistics
 */
const getJobCardStats = async (req, res, next) => {
    try {
        const [stats] = await query(`
            SELECT 
                COUNT(*) AS total,
                SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) AS open,
                SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) AS in_progress,
                SUM(CASE WHEN status = 'on_hold' THEN 1 ELSE 0 END) AS on_hold,
                SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed,
                SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) AS delivered,
                SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled,
                COALESCE(SUM(CASE WHEN status IN ('completed', 'delivered') THEN total_amount ELSE 0 END), 0) AS total_revenue,
                COALESCE(SUM(CASE WHEN status IN ('completed', 'delivered') AND DATE(actual_completion_date) = CURDATE() THEN total_amount ELSE 0 END), 0) AS revenue_today,
                COALESCE(AVG(CASE WHEN status IN ('completed', 'delivered') THEN total_amount ELSE NULL END), 0) AS avg_job_value
            FROM job_cards
        `);

        res.json({ success: true, data: stats });
    } catch (error) {
        logger.error('ServiceManagement error:', error);
        next(error);
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// JOB CARD SERVICES CONTROLLER
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Add service to job card
 */
const addJobCardService = async (req, res, next) => {
    try {
        const { id: jobCardId } = req.params;
        const { serviceTypeId, description, hours, rate, technicianId } = req.body;

        if (!description || !rate) {
            throw new AppError('Description and rate are required', 400);
        }

        const total = (parseFloat(hours) || 1) * parseFloat(rate);

        const result = await query(`
            INSERT INTO job_card_services (job_card_id, service_type_id, description, labor_hours, rate, amount)
            VALUES (?, ?, ?, ?, ?, ?)
        `, [jobCardId, serviceTypeId || null, description, hours || null, rate, total]);

        // Recalculate job card totals
        await recalculateJobCardTotals(jobCardId);

        const [newService] = await query(`
            SELECT jcs.*, st.name AS service_type_name
            FROM job_card_services jcs
            LEFT JOIN service_types st ON jcs.service_type_id = st.id
            WHERE jcs.id = ?
        `, [result.insertId]);

        res.status(201).json({
            success: true,
            message: 'Service added to job card',
            data: newService
        });
    } catch (error) {
        logger.error('ServiceManagement error:', error);
        next(error);
    }
};

/**
 * Update job card service
 */
const updateJobCardService = async (req, res, next) => {
    try {
        const { id: jobCardId, serviceId } = req.params;
        const { serviceTypeId, description, hours, rate, technicianId, status } = req.body;

        const total = (parseFloat(hours) || 1) * parseFloat(rate);

        await query(`
            UPDATE job_card_services SET
                service_type_id = ?,
                description = ?,
                labor_hours = ?,
                rate = ?,
                amount = ?,
                status = COALESCE(?, status)
            WHERE id = ? AND job_card_id = ?
        `, [serviceTypeId || null, description, hours || null, rate, total, status, serviceId, jobCardId]);

        // Recalculate job card totals
        await recalculateJobCardTotals(jobCardId);

        const [updatedService] = await query(`
            SELECT jcs.*, st.name AS service_type_name
            FROM job_card_services jcs
            LEFT JOIN service_types st ON jcs.service_type_id = st.id
            WHERE jcs.id = ?
        `, [serviceId]);

        res.json({
            success: true,
            message: 'Service updated',
            data: updatedService
        });
    } catch (error) {
        logger.error('ServiceManagement error:', error);
        next(error);
    }
};

/**
 * Delete job card service
 */
const deleteJobCardService = async (req, res, next) => {
    try {
        const { id: jobCardId, serviceId } = req.params;

        await query('DELETE FROM job_card_services WHERE id = ? AND job_card_id = ?', [serviceId, jobCardId]);

        // Recalculate job card totals
        await recalculateJobCardTotals(jobCardId);

        res.json({ success: true, message: 'Service removed from job card' });
    } catch (error) {
        logger.error('ServiceManagement error:', error);
        next(error);
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// JOB CARD PARTS CONTROLLER
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Add part to job card
 */
const addJobCardPart = async (req, res, next) => {
    try {
        const { id: jobCardId } = req.params;
        const { partId, quantity, unitPrice, isWarranty } = req.body;

        if (!partId || !quantity || !unitPrice) {
            throw new AppError('Part, quantity, and unit price are required', 400);
        }

        // Check stock
        const [part] = await query('SELECT current_stock, name FROM parts WHERE id = ?', [partId]);
        if (!part) {
            throw new AppError('Part not found', 404);
        }
        if (part.current_stock < quantity) {
            throw new AppError(`Insufficient stock for ${part.name}. Available: ${part.current_stock}`, 400);
        }

        const total = parseInt(quantity) * parseFloat(unitPrice);

        const result = await query(`
            INSERT INTO job_card_parts (job_card_id, part_id, quantity, unit_price, total, is_warranty)
            VALUES (?, ?, ?, ?, ?, ?)
        `, [jobCardId, partId, quantity, unitPrice, total, isWarranty || false]);

        // Deduct stock
        await query('UPDATE parts SET current_stock = current_stock - ? WHERE id = ?', [quantity, partId]);

        // Recalculate job card totals
        await recalculateJobCardTotals(jobCardId);

        const [newPart] = await query(`
            SELECT jcp.*, p.part_code, p.name AS part_name, p.current_stock
            FROM job_card_parts jcp
            LEFT JOIN parts p ON jcp.part_id = p.id
            WHERE jcp.id = ?
        `, [result.insertId]);

        res.status(201).json({
            success: true,
            message: 'Part added to job card',
            data: newPart
        });
    } catch (error) {
        logger.error('ServiceManagement error:', error);
        next(error);
    }
};

/**
 * Update job card part
 */
const updateJobCardPart = async (req, res, next) => {
    try {
        const { id: jobCardId, partId: partRecordId } = req.params;
        const { quantity, unitPrice, isWarranty } = req.body;

        // Get existing values
        const [existing] = await query(
            'SELECT part_id, quantity FROM job_card_parts WHERE id = ?',
            [partRecordId]
        );
        if (!existing) {
            throw new AppError('Part record not found', 404);
        }

        const total = parseInt(quantity) * parseFloat(unitPrice);
        const stockDiff = existing.quantity - parseInt(quantity);

        await query(`
            UPDATE job_card_parts SET
                quantity = ?,
                unit_price = ?,
                total = ?,
                is_warranty = COALESCE(?, is_warranty)
            WHERE id = ?
        `, [quantity, unitPrice, total, isWarranty, partRecordId]);

        // Adjust stock
        await query('UPDATE parts SET current_stock = current_stock + ? WHERE id = ?', [stockDiff, existing.part_id]);

        // Recalculate job card totals
        await recalculateJobCardTotals(jobCardId);

        const [updatedPart] = await query(`
            SELECT jcp.*, p.part_code, p.name AS part_name, p.current_stock
            FROM job_card_parts jcp
            LEFT JOIN parts p ON jcp.part_id = p.id
            WHERE jcp.id = ?
        `, [partRecordId]);

        res.json({
            success: true,
            message: 'Part updated',
            data: updatedPart
        });
    } catch (error) {
        logger.error('ServiceManagement error:', error);
        next(error);
    }
};

/**
 * Delete job card part
 */
const deleteJobCardPart = async (req, res, next) => {
    try {
        const { id: jobCardId, partId: partRecordId } = req.params;

        // Get existing values to return stock
        const [existing] = await query(
            'SELECT part_id, quantity FROM job_card_parts WHERE id = ?',
            [partRecordId]
        );

        if (existing) {
            // Return stock
            await query('UPDATE parts SET current_stock = current_stock + ? WHERE id = ?',
                [existing.quantity, existing.part_id]);
        }

        await query('DELETE FROM job_card_parts WHERE id = ? AND job_card_id = ?', [partRecordId, jobCardId]);

        // Recalculate job card totals
        await recalculateJobCardTotals(jobCardId);

        res.json({ success: true, message: 'Part removed from job card' });
    } catch (error) {
        logger.error('ServiceManagement error:', error);
        next(error);
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// LOOKUP ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get service types
 */
const getServiceTypes = async (req, res, next) => {
    try {
        const types = await query('SELECT * FROM service_types WHERE is_active = TRUE ORDER BY name');
        res.json({ success: true, data: types });
    } catch (error) {
        logger.error('ServiceManagement error:', error);
        next(error);
    }
};

/**
 * Get technicians
 */
const getTechnicians = async (req, res, next) => {
    try {
        const technicians = await query(`
            SELECT u.id, CONCAT(u.first_name, ' ', u.last_name) AS name, r.name AS role
            FROM users u
            INNER JOIN roles r ON u.role_id = r.id
            WHERE r.name IN ('technician', 'service_advisor', 'service_manager')
            AND u.is_active = TRUE
            ORDER BY u.first_name
        `);
        res.json({ success: true, data: technicians });
    } catch (error) {
        logger.error('ServiceManagement error:', error);
        next(error);
    }
};

/**
 * Get service advisors
 */
const getAdvisors = async (req, res, next) => {
    try {
        const advisors = await query(`
            SELECT u.id, CONCAT(u.first_name, ' ', u.last_name) AS name
            FROM users u
            INNER JOIN roles r ON u.role_id = r.id
            WHERE r.name IN ('service_advisor', 'service_manager', 'super_admin')
            AND u.is_active = TRUE
            ORDER BY u.first_name
        `);
        res.json({ success: true, data: advisors });
    } catch (error) {
        logger.error('ServiceManagement error:', error);
        next(error);
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Recalculate job card totals
 */
const recalculateJobCardTotals = async (jobCardId) => {
    const [[laborTotal]] = await query(
        'SELECT COALESCE(SUM(total), 0) AS total FROM job_card_services WHERE job_card_id = ?',
        [jobCardId]
    );
    const [[partsTotal]] = await query(
        'SELECT COALESCE(SUM(total), 0) AS total FROM job_card_parts WHERE job_card_id = ? AND is_warranty = FALSE',
        [jobCardId]
    );
    const [[jobCard]] = await query(
        'SELECT COALESCE(discount, 0) AS discount, COALESCE(tax_amount, 0) AS tax_amount FROM job_cards WHERE id = ?',
        [jobCardId]
    );

    const grandTotal = parseFloat(laborTotal.total) + parseFloat(partsTotal.total)
        - parseFloat(jobCard.discount) + parseFloat(jobCard.tax_amount);

        await query(`
            UPDATE job_cards SET
                labor_total = ?,
                parts_total = ?,
                total_amount = ?,
                updated_at = NOW()
            WHERE id = ?
        `, [laborTotal.total, partsTotal.total, grandTotal, jobCardId]);
};

module.exports = {
    // Appointments
    getAllAppointments,
    getAppointmentById,
    createAppointment,
    updateAppointment,
    updateAppointmentStatus,
    deleteAppointment,
    getAppointmentStats,
    // Job Cards
    getAllJobCards,
    getJobCardById,
    createJobCard,
    updateJobCard,
    updateJobCardStatus,
    completeJobCard,
    deleteJobCard,
    getJobCardStats,
    // Job Card Services
    addJobCardService,
    updateJobCardService,
    deleteJobCardService,
    // Job Card Parts
    addJobCardPart,
    updateJobCardPart,
    deleteJobCardPart,
    // Lookups
    getServiceTypes,
    getTechnicians,
    getAdvisors
};
