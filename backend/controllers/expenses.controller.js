/**
 * Expenses & categories controller
 */

const { query } = require('../config/database');
const { AppError } = require('../middleware/errorHandler');
const logger = require('../utils/logger');

const listAccounts = async (req, res, next) => {
    try {
        const rows = await query(
            `SELECT id, account_code, account_name, account_type FROM chart_of_accounts
             WHERE account_type = 'expense' AND is_active = TRUE ORDER BY account_code`
        );
        res.json({ success: true, data: rows });
    } catch (e) {
        next(e);
    }
};

const listCategories = async (req, res, next) => {
    try {
        const rows = await query(
            `SELECT ec.*, coa.account_code, coa.account_name FROM expense_categories ec
             JOIN chart_of_accounts coa ON coa.id = ec.account_id WHERE ec.is_active = TRUE ORDER BY ec.category_group, ec.name`
        );
        res.json({ success: true, data: rows });
    } catch (e) {
        next(e);
    }
};

const createCategory = async (req, res, next) => {
    try {
        const { name, code, category_group, account_id } = req.body;
        if (!name || !code || !category_group || !account_id) {
            throw new AppError('name, code, category_group, account_id required', 400);
        }
        const r = await query(
            'INSERT INTO expense_categories (name, code, category_group, account_id) VALUES (?,?,?,?)',
            [name, code.toUpperCase(), category_group, parseInt(account_id, 10)]
        );
        const rows = await query('SELECT * FROM expense_categories WHERE id = ?', [r.insertId]);
        res.status(201).json({ success: true, data: rows[0] });
    } catch (e) {
        if (e.code === 'ER_DUP_ENTRY') return next(new AppError('Category code already exists', 400));
        next(e);
    }
};

const updateCategory = async (req, res, next) => {
    try {
        const { name, category_group, account_id, is_active } = req.body;
        await query(
            'UPDATE expense_categories SET name = COALESCE(?, name), category_group = COALESCE(?, category_group), account_id = COALESCE(?, account_id), is_active = COALESCE(?, is_active) WHERE id = ?',
            [name || null, category_group || null, account_id != null ? parseInt(account_id, 10) : null, is_active, req.params.id]
        );
        const rows = await query('SELECT * FROM expense_categories WHERE id = ?', [req.params.id]);
        if (!rows.length) throw new AppError('Category not found', 404);
        res.json({ success: true, data: rows[0] });
    } catch (e) {
        next(e);
    }
};

const listExpenses = async (req, res, next) => {
    try {
        const { status, category_group, from, to, page = 1, limit = 50 } = req.query;
        const lim = Math.min(100, Math.max(1, parseInt(limit, 10)));
        const offset = (Math.max(1, parseInt(page, 10)) - 1) * lim;

        let sql = `
            SELECT e.*, ec.name AS category_name, ec.category_group,
                   fn_employee_full_name(e.employee_id) AS employee_payee_name
            FROM expenses e
            JOIN expense_categories ec ON ec.id = e.category_id
            WHERE 1=1`;
        const p = [];
        if (status) {
            sql += ' AND e.status = ?';
            p.push(status);
        }
        if (category_group) {
            sql += ' AND ec.category_group = ?';
            p.push(category_group);
        }
        if (from) {
            sql += ' AND e.expense_date >= ?';
            p.push(from);
        }
        if (to) {
            sql += ' AND e.expense_date <= ?';
            p.push(to);
        }
        sql += ' ORDER BY e.expense_date DESC, e.id DESC LIMIT ? OFFSET ?';
        p.push(lim, offset);
        const rows = await query(sql, p);

        let csql = `
            SELECT COUNT(*) AS total FROM expenses e JOIN expense_categories ec ON ec.id = e.category_id WHERE 1=1`;
        const cp = [];
        if (status) {
            csql += ' AND e.status = ?';
            cp.push(status);
        }
        if (category_group) {
            csql += ' AND ec.category_group = ?';
            cp.push(category_group);
        }
        if (from) {
            csql += ' AND e.expense_date >= ?';
            cp.push(from);
        }
        if (to) {
            csql += ' AND e.expense_date <= ?';
            cp.push(to);
        }
        const [{ total }] = await query(csql, cp);

        res.json({ success: true, data: { expenses: rows, total: Number(total), page: parseInt(page, 10), limit: lim } });
    } catch (e) {
        next(e);
    }
};

const createExpense = async (req, res, next) => {
    try {
        const b = req.body;
        if (!b.category_id || b.amount == null || !b.expense_date) {
            throw new AppError('category_id, amount, expense_date required', 400);
        }
        const r = await query(
            `INSERT INTO expenses (expense_number, category_id, amount, expense_date, description, vendor_name, payment_method_id, employee_id, status, created_by)
             VALUES (NULL,?,?,?,?,?,?,?,?,?)`,
            [
                parseInt(b.category_id, 10),
                parseFloat(b.amount),
                b.expense_date,
                b.description || null,
                b.vendor_name || null,
                b.payment_method_id || null,
                b.employee_id || null,
                b.status || 'draft',
                req.user.id
            ]
        );
        const rows = await query('SELECT * FROM expenses WHERE id = ?', [r.insertId]);
        res.status(201).json({ success: true, data: rows[0] });
    } catch (e) {
        next(e);
    }
};

const updateExpense = async (req, res, next) => {
    try {
        const b = req.body;
        const [ex] = await query('SELECT status, ledger_transaction_id FROM expenses WHERE id = ?', [req.params.id]);
        if (!ex) throw new AppError('Expense not found', 404);
        if (ex.ledger_transaction_id) throw new AppError('Posted expenses cannot be edited', 400);

        await query(
            `UPDATE expenses SET category_id = COALESCE(?, category_id), amount = COALESCE(?, amount),
             expense_date = COALESCE(?, expense_date), description = COALESCE(?, description),
             vendor_name = COALESCE(?, vendor_name), payment_method_id = ?, employee_id = ?,
             status = COALESCE(?, status) WHERE id = ?`,
            [
                b.category_id != null ? parseInt(b.category_id, 10) : null,
                b.amount != null ? parseFloat(b.amount) : null,
                b.expense_date || null,
                b.description !== undefined ? b.description : null,
                b.vendor_name !== undefined ? b.vendor_name : null,
                b.payment_method_id !== undefined ? b.payment_method_id : null,
                b.employee_id !== undefined ? b.employee_id : null,
                b.status || null,
                req.params.id
            ]
        );
        const rows = await query('SELECT * FROM expenses WHERE id = ?', [req.params.id]);
        res.json({ success: true, data: rows[0] });
    } catch (e) {
        next(e);
    }
};

const postExpense = async (req, res, next) => {
    try {
        await query('SET @ft_id = NULL');
        await query('CALL sp_post_expense_to_ledger(?, ?, @ft_id)', [parseInt(req.params.id, 10), req.user.id]);
        const out = await query('SELECT @ft_id AS ft_id');
        const rows = await query('SELECT * FROM expenses WHERE id = ?', [req.params.id]);
        res.json({ success: true, data: { expense: rows[0], financial_transaction_id: out[0]?.ft_id } });
    } catch (e) {
        logger.error('postExpense', e);
        if (e.sqlMessage) return next(new AppError(e.sqlMessage, 400));
        next(e);
    }
};

module.exports = {
    listAccounts,
    listCategories,
    createCategory,
    updateCategory,
    listExpenses,
    createExpense,
    updateExpense,
    postExpense
};
