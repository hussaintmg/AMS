/**
 * Lead Master Data Routes - CRUD for Sources, Statuses, Priorities, Cities
 * Created by LOGIXINVENTOR (PVT) Ltd.
 * info@logixinventor.com +92 333 3836851
 * www.logixinventor.com | AMS
 */

const express = require('express');
const router = express.Router();
const { query } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const { AppError } = require('../middleware/errorHandler');

/**
 * @swagger
 * /api/lead-master/stats:
 *   get:
 *     summary: Get lead master data statistics
 *     tags: [Lead Master Data]
 *     security:
 *       - bearerAuth: []
 */
router.get('/stats', authenticate, async (req, res, next) => {
    try {
        const stats = {
            sources: { total: 0, active: 0 },
            statuses: { total: 0, active: 0 },
            priorities: { total: 0, active: 0 },
            cities: { total: 0, active: 0 }
        };

        const [sourcesResult] = await query('SELECT COUNT(*) as total, SUM(is_active) as active FROM lead_sources');
        stats.sources = { total: sourcesResult.total, active: sourcesResult.active || 0 };

        const [statusesResult] = await query('SELECT COUNT(*) as total, SUM(is_active) as active FROM lead_statuses');
        stats.statuses = { total: statusesResult.total, active: statusesResult.active || 0 };

        const [prioritiesResult] = await query('SELECT COUNT(*) as total, SUM(is_active) as active FROM lead_priorities');
        stats.priorities = { total: prioritiesResult.total, active: prioritiesResult.active || 0 };

        const [citiesResult] = await query('SELECT COUNT(*) as total, SUM(is_active) as active FROM lead_cities');
        stats.cities = { total: citiesResult.total, active: citiesResult.active || 0 };

        res.json({ success: true, data: stats });
    } catch (error) {
        next(error);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// SOURCES CRUD
// ═══════════════════════════════════════════════════════════════════════════

/**
 * @swagger
 * /api/lead-master/sources:
 *   get:
 *     summary: Get all lead sources
 *     tags: [Lead Master Data]
 */
router.get('/sources', authenticate, async (req, res, next) => {
    try {
        const activeOnly = req.query.active === 'true';
        let sql = `
            SELECT ls.*, 
                   (SELECT COUNT(*) FROM leads l WHERE l.source_id = ls.id) AS lead_count
            FROM lead_sources ls
        `;
        if (activeOnly) sql += ' WHERE ls.is_active = 1';
        sql += ' ORDER BY ls.name';

        const results = await query(sql);
        res.json({ success: true, data: results });
    } catch (error) {
        next(error);
    }
});

router.post('/sources', authenticate, async (req, res, next) => {
    try {
        const { name, description } = req.body;
        if (!name) throw new AppError('Name is required', 400);

        const result = await query(
            'INSERT INTO lead_sources (name, description, is_active) VALUES (?, ?, 1)',
            [name, description || '']
        );
        res.status(201).json({ success: true, data: { id: result.insertId }, message: 'Source created successfully' });
    } catch (error) {
        next(error);
    }
});

router.put('/sources/:id', authenticate, async (req, res, next) => {
    try {
        const { name, description, is_active } = req.body;
        await query(
            'UPDATE lead_sources SET name = ?, description = ?, is_active = ? WHERE id = ?',
            [name, description, is_active ? 1 : 0, req.params.id]
        );
        res.json({ success: true, message: 'Source updated successfully' });
    } catch (error) {
        next(error);
    }
});

router.delete('/sources/:id', authenticate, async (req, res, next) => {
    try {
        const [countResult] = await query('SELECT COUNT(*) as count FROM leads WHERE source_id = ?', [req.params.id]);
        if (countResult.count > 0) {
            throw new AppError('Cannot delete: Source has associated leads', 400);
        }
        await query('DELETE FROM lead_sources WHERE id = ?', [req.params.id]);
        res.json({ success: true, message: 'Source deleted successfully' });
    } catch (error) {
        next(error);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// STATUSES CRUD
// ═══════════════════════════════════════════════════════════════════════════

router.get('/statuses', authenticate, async (req, res, next) => {
    try {
        const activeOnly = req.query.active === 'true';
        let sql = `
            SELECT ls.*, 
                   (SELECT COUNT(*) FROM leads l WHERE l.status = ls.name) AS lead_count
            FROM lead_statuses ls
        `;
        if (activeOnly) sql += ' WHERE ls.is_active = 1';
        sql += ' ORDER BY ls.sort_order, ls.name';

        const results = await query(sql);
        res.json({ success: true, data: results });
    } catch (error) {
        next(error);
    }
});

router.post('/statuses', authenticate, async (req, res, next) => {
    try {
        const { name, display_name, color, sort_order } = req.body;
        if (!name) throw new AppError('Name is required', 400);

        const result = await query(
            'INSERT INTO lead_statuses (name, display_name, color, sort_order, is_active) VALUES (?, ?, ?, ?, 1)',
            [name, display_name || name, color || 'gray', sort_order || 0]
        );
        res.status(201).json({ success: true, data: { id: result.insertId }, message: 'Status created successfully' });
    } catch (error) {
        next(error);
    }
});

router.put('/statuses/:id', authenticate, async (req, res, next) => {
    try {
        const { name, display_name, color, sort_order, is_active } = req.body;
        await query(
            'UPDATE lead_statuses SET name = ?, display_name = ?, color = ?, sort_order = ?, is_active = ? WHERE id = ?',
            [name, display_name, color, sort_order, is_active ? 1 : 0, req.params.id]
        );
        res.json({ success: true, message: 'Status updated successfully' });
    } catch (error) {
        next(error);
    }
});

router.delete('/statuses/:id', authenticate, async (req, res, next) => {
    try {
        const [status] = await query('SELECT name FROM lead_statuses WHERE id = ?', [req.params.id]);
        if (status) {
            const [countResult] = await query('SELECT COUNT(*) as count FROM leads WHERE status = ?', [status.name]);
            if (countResult.count > 0) {
                throw new AppError('Cannot delete: Status has associated leads', 400);
            }
        }
        await query('DELETE FROM lead_statuses WHERE id = ?', [req.params.id]);
        res.json({ success: true, message: 'Status deleted successfully' });
    } catch (error) {
        next(error);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// PRIORITIES CRUD
// ═══════════════════════════════════════════════════════════════════════════

router.get('/priorities', authenticate, async (req, res, next) => {
    try {
        const activeOnly = req.query.active === 'true';
        let sql = `
            SELECT lp.*, 
                   (SELECT COUNT(*) FROM leads l WHERE l.priority = lp.name) AS lead_count
            FROM lead_priorities lp
        `;
        if (activeOnly) sql += ' WHERE lp.is_active = 1';
        sql += ' ORDER BY lp.sort_order, lp.name';

        const results = await query(sql);
        res.json({ success: true, data: results });
    } catch (error) {
        next(error);
    }
});

router.post('/priorities', authenticate, async (req, res, next) => {
    try {
        const { name, display_name, color, sort_order } = req.body;
        if (!name) throw new AppError('Name is required', 400);

        const result = await query(
            'INSERT INTO lead_priorities (name, display_name, color, sort_order, is_active) VALUES (?, ?, ?, ?, 1)',
            [name, display_name || name, color || 'gray', sort_order || 0]
        );
        res.status(201).json({ success: true, data: { id: result.insertId }, message: 'Priority created successfully' });
    } catch (error) {
        next(error);
    }
});

router.put('/priorities/:id', authenticate, async (req, res, next) => {
    try {
        const { name, display_name, color, sort_order, is_active } = req.body;
        await query(
            'UPDATE lead_priorities SET name = ?, display_name = ?, color = ?, sort_order = ?, is_active = ? WHERE id = ?',
            [name, display_name, color, sort_order, is_active ? 1 : 0, req.params.id]
        );
        res.json({ success: true, message: 'Priority updated successfully' });
    } catch (error) {
        next(error);
    }
});

router.delete('/priorities/:id', authenticate, async (req, res, next) => {
    try {
        const [priority] = await query('SELECT name FROM lead_priorities WHERE id = ?', [req.params.id]);
        if (priority) {
            const [countResult] = await query('SELECT COUNT(*) as count FROM leads WHERE priority = ?', [priority.name]);
            if (countResult.count > 0) {
                throw new AppError('Cannot delete: Priority has associated leads', 400);
            }
        }
        await query('DELETE FROM lead_priorities WHERE id = ?', [req.params.id]);
        res.json({ success: true, message: 'Priority deleted successfully' });
    } catch (error) {
        next(error);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// CITIES CRUD
// ═══════════════════════════════════════════════════════════════════════════

router.get('/cities', authenticate, async (req, res, next) => {
    try {
        const activeOnly = req.query.active === 'true';
        let sql = `
            SELECT lc.*, 
                   (SELECT COUNT(*) FROM leads l WHERE l.city = lc.name) AS lead_count
            FROM lead_cities lc
        `;
        if (activeOnly) sql += ' WHERE lc.is_active = 1';
        sql += ' ORDER BY lc.name';

        const results = await query(sql);
        res.json({ success: true, data: results });
    } catch (error) {
        next(error);
    }
});

router.post('/cities', authenticate, async (req, res, next) => {
    try {
        const { name, state, country } = req.body;
        if (!name) throw new AppError('Name is required', 400);

        const result = await query(
            'INSERT INTO lead_cities (name, state, country, is_active) VALUES (?, ?, ?, 1)',
            [name, state || '', country || 'Pakistan']
        );
        res.status(201).json({ success: true, data: { id: result.insertId }, message: 'City created successfully' });
    } catch (error) {
        next(error);
    }
});

router.put('/cities/:id', authenticate, async (req, res, next) => {
    try {
        const { name, state, country, is_active } = req.body;
        await query(
            'UPDATE lead_cities SET name = ?, state = ?, country = ?, is_active = ? WHERE id = ?',
            [name, state, country, is_active ? 1 : 0, req.params.id]
        );
        res.json({ success: true, message: 'City updated successfully' });
    } catch (error) {
        next(error);
    }
});

router.delete('/cities/:id', authenticate, async (req, res, next) => {
    try {
        const [city] = await query('SELECT name FROM lead_cities WHERE id = ?', [req.params.id]);
        if (city) {
            const [countResult] = await query('SELECT COUNT(*) as count FROM leads WHERE city = ?', [city.name]);
            if (countResult.count > 0) {
                throw new AppError('Cannot delete: City has associated leads', 400);
            }
        }
        await query('DELETE FROM lead_cities WHERE id = ?', [req.params.id]);
        res.json({ success: true, message: 'City deleted successfully' });
    } catch (error) {
        next(error);
    }
});

module.exports = router;
