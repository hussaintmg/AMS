/**
 * Bulk import routes — CSV / XLSX templates and uploads.
 * One POST route per page; all imports run server-side with insertMany.
 */

const express = require('express');
const multer = require('multer');
const router = express.Router();
const { authenticate, authorizeAction } = require('../middleware/auth');
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

router.post('/leads', authorizeAction('leads', 'create'), uploadSingle('file'), bulkImportController.importLeads);

router.post('/customers', authorizeAction('customers', 'create'), uploadSingle('file'), bulkImportController.importCustomers);

router.post('/vehicles', authorizeAction('vehicles', 'create'), uploadSingle('file'), bulkImportController.importVehicles);

router.post('/parts', authorizeAction('parts', 'create'), uploadSingle('file'), bulkImportController.importParts);

// The page list is given explicitly so this does not inherit the barcode
// scanner's "create" alias — raising one order at the counter is a long way
// from importing a spreadsheet of them.
router.post(
    '/sales-orders',
    authorizeAction(['sales_orders'], 'create'),
    uploadSingle('file'),
    bulkImportController.importSalesOrders
);

router.post(
    '/employees',
    authorizeAction('employees', 'create'),
    uploadSingle('file'),
    bulkImportController.importEmployees
);

module.exports = router;
