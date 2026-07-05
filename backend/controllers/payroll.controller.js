/**
 * Payroll controller
 */

const { query } = require('../config/database');
const { AppError } = require('../middleware/errorHandler');
const logger = require('../utils/logger');

const listPeriods = async (req, res, next) => {
    try {
        const rows = await query(
            'SELECT pp.*, (SELECT COUNT(*) FROM payroll_lines pl WHERE pl.payroll_period_id = pp.id) AS line_count FROM payroll_periods pp ORDER BY pp.period_start DESC'
        );
        res.json({ success: true, data: rows });
    } catch (e) {
        next(e);
    }
};

const createPeriod = async (req, res, next) => {
    try {
        const { label, period_start, period_end } = req.body;
        if (!label || !period_start || !period_end) throw new AppError('label, period_start, period_end required', 400);
        const r = await query(
            'INSERT INTO payroll_periods (label, period_start, period_end, status, created_by) VALUES (?,?,?,?,?)',
            [label, period_start, period_end, 'draft', req.user.id]
        );
        const rows = await query('SELECT * FROM payroll_periods WHERE id = ?', [r.insertId]);
        res.status(201).json({ success: true, data: rows[0] });
    } catch (e) {
        next(e);
    }
};

const getPeriodLines = async (req, res, next) => {
    try {
        const pid = req.params.id;
        const lines = await query(
            `SELECT pl.*, fn_employee_full_name(pl.employee_id) AS employee_name, e.employee_code
             FROM payroll_lines pl JOIN employees e ON e.id = pl.employee_id WHERE pl.payroll_period_id = ? ORDER BY e.employee_code`,
            [pid]
        );
        const periods = await query('SELECT * FROM payroll_periods WHERE id = ?', [pid]);
        if (!periods.length) throw new AppError('Period not found', 404);
        res.json({ success: true, data: { period: periods[0], lines } });
    } catch (e) {
        next(e);
    }
};

const generateLines = async (req, res, next) => {
    try {
        const pid = parseInt(req.params.id, 10);
        const periods = await query('SELECT status FROM payroll_periods WHERE id = ?', [pid]);
        if (!periods.length) throw new AppError('Period not found', 404);
        if (periods[0].status !== 'draft') throw new AppError('Can only generate lines for draft periods', 400);

        const emps = await query(
            `SELECT id, base_salary FROM employees WHERE is_active = TRUE AND employment_status IN ('active','probation','on_leave')`
        );
        for (const e of emps) {
            const gross = parseFloat(e.base_salary) || 0;
            const deductions = 0;
            const net = gross - deductions;
            await query(
                `INSERT IGNORE INTO payroll_lines (payroll_period_id, employee_id, gross_amount, deductions, net_amount) VALUES (?,?,?,?,?)`,
                [pid, e.id, gross, deductions, net]
            );
        }
        const lines = await query('SELECT * FROM payroll_lines WHERE payroll_period_id = ?', [pid]);
        res.json({ success: true, data: { count: lines.length, lines } });
    } catch (e) {
        next(e);
    }
};

const lockPeriod = async (req, res, next) => {
    try {
        const pid = req.params.id;
        const r = await query("UPDATE payroll_periods SET status = 'locked' WHERE id = ? AND status = 'draft'", [pid]);
        if (r.affectedRows === 0) throw new AppError('Period not found or not in draft', 400);
        res.json({ success: true, message: 'Period locked' });
    } catch (e) {
        next(e);
    }
};

const postPeriod = async (req, res, next) => {
    try {
        const pid = parseInt(req.params.id, 10);
        const [p] = await query('SELECT status FROM payroll_periods WHERE id = ?', [pid]);
        if (!p) throw new AppError('Period not found', 404);
        if (p.status !== 'locked') {
            throw new AppError('Payroll period must be locked before posting', 400);
        }
        await query('CALL sp_payroll_post_period(?, ?)', [pid, req.user.id]);
        const rows = await query('SELECT * FROM payroll_periods WHERE id = ?', [pid]);
        res.json({ success: true, data: rows[0] });
    } catch (e) {
        logger.error('postPeriod', e);
        if (e.sqlMessage) return next(new AppError(e.sqlMessage, 400));
        next(e);
    }
};

const updateLine = async (req, res, next) => {
    try {
        const { gross_amount, deductions, notes } = req.body;
        const lineId = req.params.lineId;
        const [line] = await query(
            'SELECT pl.*, pp.status AS period_status FROM payroll_lines pl JOIN payroll_periods pp ON pp.id = pl.payroll_period_id WHERE pl.id = ?',
            [lineId]
        );
        if (!line) throw new AppError('Line not found', 404);
        if (line.period_status !== 'draft') throw new AppError('Only draft period lines can be edited', 400);
        const gross = gross_amount != null ? parseFloat(gross_amount) : line.gross_amount;
        const ded = deductions != null ? parseFloat(deductions) : line.deductions;
        const net = gross - ded;
        await query(
            'UPDATE payroll_lines SET gross_amount = ?, deductions = ?, net_amount = ?, notes = ? WHERE id = ?',
            [gross, ded, net, notes != null ? notes : line.notes, lineId]
        );
        const updated = await query('SELECT * FROM payroll_lines WHERE id = ?', [lineId]);
        res.json({ success: true, data: updated[0] });
    } catch (e) {
        next(e);
    }
};

module.exports = {
    listPeriods,
    createPeriod,
    getPeriodLines,
    generateLines,
    lockPeriod,
    postPeriod,
    updateLine
};
