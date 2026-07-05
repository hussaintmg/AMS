/**
 * Report Routes
 * Created by LOGIXINVENTOR (PVT) Ltd.
 * www.logixinventor.com | AMS
 */

const express = require('express');
const router = express.Router();
const { query } = require('../config/database');
const { authenticate } = require('../middleware/auth');

router.get('/sales-performance', authenticate, async (req, res, next) => {
    try {
        const { startDate, endDate } = req.query;
        const data = await query(`SELECT * FROM vw_sales_performance`);
        res.json({ success: true, data });
    } catch (error) { next(error); }
});

router.get('/inventory-health', authenticate, async (req, res, next) => {
    try {
        const data = await query(`SELECT * FROM vw_inventory_health`);
        res.json({ success: true, data });
    } catch (error) { next(error); }
});

router.get('/pending-deliveries', authenticate, async (req, res, next) => {
    try {
        const data = await query(`SELECT * FROM vw_pending_deliveries`);
        res.json({ success: true, data });
    } catch (error) { next(error); }
});

router.get('/customer-receivables', authenticate, async (req, res, next) => {
    try {
        const data = await query(`SELECT * FROM vw_customer_receivables`);
        res.json({ success: true, data });
    } catch (error) { next(error); }
});

router.get('/lead-statistics', authenticate, async (req, res, next) => {
    try {
        const data = await query(`SELECT * FROM vw_lead_statistics`);
        res.json({ success: true, data });
    } catch (error) { next(error); }
});

router.get('/service-analytics', authenticate, async (req, res, next) => {
    try {
        const data = await query(`SELECT * FROM vw_service_analytics`);
        res.json({ success: true, data });
    } catch (error) { next(error); }
});

router.get('/low-stock-parts', authenticate, async (req, res, next) => {
    try {
        const data = await query(`SELECT * FROM vw_low_stock_parts`);
        res.json({ success: true, data });
    } catch (error) { next(error); }
});

module.exports = router;
