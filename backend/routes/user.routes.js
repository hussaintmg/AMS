/**
 * User Routes
 * Created by LOGIXINVENTOR (PVT) Ltd.
 * www.logixinventor.com | AMS
 */

const express = require('express');
const router = express.Router();
const { query } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');

// Legacy compatibility endpoint used by older dashboard builds
router.get('/active', authenticate, async (req, res, next) => {
    try {
        const users = await query(
            `SELECT id, CONCAT(first_name, ' ', last_name) AS name, email
             FROM users
             WHERE is_active = TRUE
             ORDER BY first_name, last_name`
        );
        res.json({ success: true, data: users });
    } catch (error) { next(error); }
});

router.get('/', authenticate, authorize('super_admin'), async (req, res, next) => {
    try {
        const users = await query(
            `SELECT u.id, u.uuid, u.email, u.first_name, u.last_name, u.phone, 
             r.name as role, u.is_active, u.last_login, u.created_at
             FROM users u JOIN roles r ON u.role_id = r.id ORDER BY u.created_at DESC`
        );
        res.json({ success: true, data: users });
    } catch (error) { next(error); }
});

router.get('/roles/list', authenticate, async (req, res, next) => {
    try {
        const roles = await query('SELECT id, name, description FROM roles WHERE is_active = TRUE');
        res.json({ success: true, data: roles });
    } catch (error) { next(error); }
});

router.get('/:id', authenticate, async (req, res, next) => {
    try {
        const users = await query(
            `SELECT u.id, u.uuid, u.email, u.first_name, u.last_name, u.phone, 
             r.name as role, u.is_active, u.created_at
             FROM users u JOIN roles r ON u.role_id = r.id WHERE u.id = ?`,
            [req.params.id]
        );
        if (users.length === 0) return res.status(404).json({ success: false, message: 'User not found' });
        res.json({ success: true, data: users[0] });
    } catch (error) { next(error); }
});

module.exports = router;
