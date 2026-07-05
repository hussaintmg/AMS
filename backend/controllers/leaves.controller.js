/**
 * Leaves controller
 */

const { query } = require('../config/database');
const { AppError } = require('../middleware/errorHandler');
const logger = require('../utils/logger');

const listTypes = async (req, res, next) => {
    try {
        const rows = await query('SELECT * FROM leave_types WHERE is_active = TRUE ORDER BY name');
        res.json({ success: true, data: rows });
    } catch (e) {
        next(e);
    }
};

const listBalances = async (req, res, next) => {
    try {
        const { employee_id, year } = req.query;
        if (!employee_id) throw new AppError('employee_id is required', 400);
        const y = year || new Date().getFullYear();
        const rows = await query(
            `SELECT lb.*, lt.name AS leave_type_name, lt.code AS leave_type_code
             FROM leave_balances lb JOIN leave_types lt ON lt.id = lb.leave_type_id
             WHERE lb.employee_id = ? AND lb.year = ?`,
            [employee_id, y]
        );
        res.json({ success: true, data: rows });
    } catch (e) {
        next(e);
    }
};

const listRequests = async (req, res, next) => {
    try {
        const { employee_id, status } = req.query;
        let sql = `
            SELECT lr.*, fn_employee_full_name(lr.employee_id) AS employee_name,
                   e.employee_code, lt.name AS leave_type_name
            FROM leave_requests lr
            JOIN employees e ON e.id = lr.employee_id
            JOIN leave_types lt ON lt.id = lr.leave_type_id
            WHERE 1=1`;
        const p = [];
        if (employee_id) {
            sql += ' AND lr.employee_id = ?';
            p.push(employee_id);
        }
        if (status) {
            sql += ' AND lr.status = ?';
            p.push(status);
        }
        sql += ' ORDER BY lr.created_at DESC';
        const rows = await query(sql, p);
        res.json({ success: true, data: rows });
    } catch (e) {
        next(e);
    }
};

const submitRequest = async (req, res, next) => {
    try {
        const { employee_id, leave_type_id, start_date, end_date, days_requested, reason } = req.body;
        if (!employee_id || !leave_type_id || !start_date || !end_date || days_requested == null) {
            throw new AppError('employee_id, leave_type_id, start_date, end_date, days_requested required', 400);
        }
        await query('SET @leave_req_id = NULL');
        await query('CALL sp_leave_request_submit(?,?,?,?,?,?,@leave_req_id)', [
            parseInt(employee_id, 10),
            parseInt(leave_type_id, 10),
            start_date,
            end_date,
            parseFloat(days_requested),
            reason || null
        ]);
        const out = await query('SELECT @leave_req_id AS id');
        const id = out[0]?.id;
        const rows = await query('SELECT * FROM leave_requests WHERE id = ?', [id]);
        res.status(201).json({ success: true, data: rows[0] });
    } catch (e) {
        logger.error('submitRequest', e);
        if (e.sqlMessage) return next(new AppError(e.sqlMessage, 400));
        next(e);
    }
};

const setRequestStatus = async (req, res, next) => {
    try {
        const { status } = req.body;
        if (!['approved', 'rejected', 'cancelled'].includes(status)) {
            throw new AppError('status must be approved, rejected, or cancelled', 400);
        }
        await query('CALL sp_leave_request_set_status(?,?,?)', [req.params.id, status, req.user.id]);
        const rows = await query('SELECT * FROM leave_requests WHERE id = ?', [req.params.id]);
        res.json({ success: true, data: rows[0] });
    } catch (e) {
        logger.error('setRequestStatus', e);
        if (e.sqlMessage) return next(new AppError(e.sqlMessage, 400));
        next(e);
    }
};

module.exports = { listTypes, listBalances, listRequests, submitRequest, setRequestStatus };
