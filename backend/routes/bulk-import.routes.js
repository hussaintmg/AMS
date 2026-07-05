/**
 * Bulk import routes — CSV / XLSX templates and uploads.
 */

const express = require('express');
const multer = require('multer');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const bulkImportController = require('../controllers/bulkImport.controller');

const storage = multer.memoryStorage();
const upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const ok =
            file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
            file.mimetype === 'text/csv' ||
            file.mimetype === 'application/csv' ||
            file.mimetype === 'application/vnd.ms-excel' ||
            file.originalname.toLowerCase().endsWith('.xlsx') ||
            file.originalname.toLowerCase().endsWith('.csv');
        if (ok) cb(null, true);
        else cb(new Error('Only .csv and .xlsx files are allowed.'));
    }
});

function uploadSingle(field) {
    return (req, res, next) => {
        upload.single(field)(req, res, (err) => {
            if (!err) return next();
            if (err instanceof multer.MulterError) {
                if (err.code === 'LIMIT_FILE_SIZE') {
                    return res.status(400).json({
                        success: false,
                        message: 'File too large. Maximum size is 10 MB.'
                    });
                }
                return res.status(400).json({ success: false, message: err.message });
            }
            return res.status(400).json({ success: false, message: err.message || 'Upload failed' });
        });
    };
}

router.use(authenticate);

/** Any authenticated user may download templates (instructions + column layout). */
router.get('/template/:type', bulkImportController.downloadTemplate);

router.post(
    '/leads',
    authorize(
        'super_admin',
        'admin',
        'manager',
        'sales_manager',
        'sales_executive',
        'service_manager',
        'service_advisor'
    ),
    uploadSingle('file'),
    bulkImportController.importLeads
);

router.post(
    '/vehicle-brands',
    authorize('super_admin', 'admin', 'inventory_manager'),
    uploadSingle('file'),
    bulkImportController.importVehicleBrands
);

router.post(
    '/vehicles',
    authorize('super_admin', 'admin', 'inventory_manager', 'manager', 'sales_manager'),
    uploadSingle('file'),
    bulkImportController.importVehicles
);

router.post(
    '/sales-orders',
    authorize('super_admin', 'admin', 'sales_manager'),
    uploadSingle('file'),
    bulkImportController.importSalesOrders
);

module.exports = router;
