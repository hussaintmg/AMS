/**
 * Employees (HR) controller
 * Employee create/update uses inline INSERT/UPDATE (not CALL sp_employee_upsert).
 */

const { query } = require('../config/database');
const { AppError } = require('../middleware/errorHandler');
const logger = require('../utils/logger');

const HR_ROLES = ['super_admin', 'admin', 'hr_admin'];

logger.info('[HR] employees.controller loaded — upsert uses INSERT/UPDATE (no CALL sp_employee_upsert)');

const listEmployees = async (req, res, next) => {
    try {
        const { search, department_id, status, page = 1, limit = 50 } = req.query;
        const offset = (Math.max(1, parseInt(page, 10)) - 1) * Math.min(100, Math.max(1, parseInt(limit, 10)));
        const lim = Math.min(100, Math.max(1, parseInt(limit, 10)));

        let sql = 'SELECT * FROM vw_employee_directory WHERE 1=1';
        const params = [];

        if (search) {
            sql += ' AND (full_name LIKE ? OR employee_code LIKE ? OR email LIKE ?)';
            const q = `%${search}%`;
            params.push(q, q, q);
        }
        if (department_id) {
            sql += ' AND department_id = ?';
            params.push(parseInt(department_id, 10));
        }
        if (status === 'active') sql += ' AND is_active = TRUE';
        if (status === 'inactive') sql += ' AND is_active = FALSE';

        sql += ' ORDER BY employee_code DESC LIMIT ? OFFSET ?';
        params.push(lim, offset);

        const rows = await query(sql, params);

        let countSql = 'SELECT COUNT(*) AS total FROM vw_employee_directory e WHERE 1=1';
        const countParams = [];
        if (search) {
            countSql += ' AND (e.full_name LIKE ? OR e.employee_code LIKE ? OR e.email LIKE ?)';
            const q = `%${search}%`;
            countParams.push(q, q, q);
        }
        if (department_id) {
            countSql += ' AND e.department_id = ?';
            countParams.push(parseInt(department_id, 10));
        }
        if (status === 'active') countSql += ' AND e.is_active = TRUE';
        if (status === 'inactive') countSql += ' AND e.is_active = FALSE';
        const [{ total }] = await query(countSql, countParams);

        res.json({
            success: true,
            data: { employees: rows, total: Number(total) || rows.length, page: parseInt(page, 10), limit: lim }
        });
    } catch (e) {
        logger.error('listEmployees', e);
        next(e);
    }
};

const getEmployee = async (req, res, next) => {
    try {
        const rows = await query('SELECT * FROM vw_employee_directory WHERE id = ?', [req.params.id]);
        if (!rows.length) throw new AppError('Employee not found', 404);
        const docs = await query('SELECT * FROM employee_documents WHERE employee_id = ? ORDER BY uploaded_at DESC', [req.params.id]);
        res.json({ success: true, data: { ...rows[0], documents: docs } });
    } catch (e) {
        next(e);
    }
};

const upsertEmployee = async (req, res, next) => {
    try {
        const b = req.body;
        const id = b.id ? parseInt(b.id, 10) : null;

        if (!b.first_name || !b.last_name || !b.department_id || !b.hire_date) {
            throw new AppError('first_name, last_name, department_id, and hire_date are required', 400);
        }

        const userId = b.user_id != null && b.user_id !== '' ? parseInt(b.user_id, 10) : null;
        const departmentId = parseInt(b.department_id, 10);
        const baseSalary =
            b.base_salary != null && b.base_salary !== '' ? parseFloat(b.base_salary) : null;

        let newId;

        if (id && id > 0) {
            const exists = await query('SELECT id FROM employees WHERE id = ? LIMIT 1', [id]);
            if (!exists.length) throw new AppError('Employee not found', 404);

            await query(
                `UPDATE employees SET
                    employee_code = COALESCE(NULLIF(TRIM(?), ''), employee_code),
                    user_id = ?,
                    department_id = ?,
                    first_name = ?,
                    last_name = ?,
                    email = ?,
                    phone = ?,
                    national_id = ?,
                    date_of_birth = ?,
                    gender = IFNULL(?, gender),
                    address = ?,
                    city = ?,
                    country = IFNULL(NULLIF(TRIM(?), ''), country),
                    hire_date = ?,
                    termination_date = ?,
                    employment_status = IFNULL(?, employment_status),
                    job_title = IFNULL(NULLIF(TRIM(?), ''), job_title),
                    base_salary = IFNULL(?, base_salary),
                    bank_name = ?,
                    bank_account = ?,
                    emergency_contact_name = ?,
                    emergency_contact_phone = ?,
                    notes = ?,
                    is_active = IFNULL(?, is_active)
                WHERE id = ?`,
                [
                    b.employee_code || '',
                    userId,
                    departmentId,
                    b.first_name,
                    b.last_name,
                    b.email || null,
                    b.phone || null,
                    b.national_id || null,
                    b.date_of_birth || null,
                    b.gender || null,
                    b.address || null,
                    b.city || null,
                    b.country || null,
                    b.hire_date,
                    b.termination_date || null,
                    b.employment_status || null,
                    b.job_title || null,
                    baseSalary,
                    b.bank_name || null,
                    b.bank_account || null,
                    b.emergency_contact_name || null,
                    b.emergency_contact_phone || null,
                    b.notes || null,
                    b.is_active !== undefined ? !!b.is_active : true,
                    id
                ]
            );
            newId = id;
        } else {
            const year = new Date().getFullYear();
            let code = (b.employee_code && String(b.employee_code).trim()) || null;
            if (!code) {
                const seqRows = await query(
                    `SELECT COALESCE(MAX(CAST(SUBSTRING_INDEX(employee_code, '-', -1) AS UNSIGNED)), 0) + 1 AS next_seq
                     FROM employees WHERE employee_code LIKE ?`,
                    [`EMP-${year}-%`]
                );
                const nextSeq = Number(seqRows[0]?.next_seq) || 1;
                code = `EMP-${year}-${String(nextSeq).padStart(5, '0')}`;
            }

            const ins = await query(
                `INSERT INTO employees (
                    employee_code, user_id, department_id, first_name, last_name, email, phone,
                    national_id, date_of_birth, gender, address, city, country, hire_date, termination_date,
                    employment_status, job_title, base_salary, bank_name, bank_account,
                    emergency_contact_name, emergency_contact_phone, notes, is_active, created_by
                ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
                [
                    code,
                    userId,
                    departmentId,
                    b.first_name,
                    b.last_name,
                    b.email || null,
                    b.phone || null,
                    b.national_id || null,
                    b.date_of_birth || null,
                    (b.gender && String(b.gender).trim()) || 'unspecified',
                    b.address || null,
                    b.city || null,
                    (b.country && String(b.country).trim()) || 'Pakistan',
                    b.hire_date,
                    b.termination_date || null,
                    (b.employment_status && String(b.employment_status).trim()) || 'active',
                    (b.job_title && String(b.job_title).trim()) || 'Staff',
                    baseSalary != null ? baseSalary : 0,
                    b.bank_name || null,
                    b.bank_account || null,
                    b.emergency_contact_name || null,
                    b.emergency_contact_phone || null,
                    b.notes || null,
                    b.is_active !== undefined ? !!b.is_active : true,
                    req.user.id
                ]
            );
            newId = ins && ins.insertId != null ? Number(ins.insertId) : null;
            if (!newId) {
                const lid = await query('SELECT LAST_INSERT_ID() AS id');
                newId = Number(lid[0]?.id) || null;
            }
            if (!newId) throw new AppError('Failed to save employee', 500);
        }

        const saved = await query('SELECT * FROM vw_employee_directory WHERE id = ?', [newId]);
        res.status(id ? 200 : 201).json({ success: true, data: saved[0] || { id: newId } });
    } catch (e) {
        if (e.code === 'ER_DUP_ENTRY') return next(new AppError('Duplicate employee code or user already linked', 400));
        next(e);
    }
};

const deactivateEmployee = async (req, res, next) => {
    try {
        const r = await query('UPDATE employees SET is_active = FALSE, employment_status = ? WHERE id = ?', ['terminated', req.params.id]);
        if (r.affectedRows === 0) throw new AppError('Employee not found', 404);
        res.json({ success: true, message: 'Employee deactivated' });
    } catch (e) {
        next(e);
    }
};

module.exports = { listEmployees, getEmployee, upsertEmployee, deactivateEmployee };
