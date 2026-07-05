const express = require('express');
const router = express.Router();
const multer = require('multer');
const { authenticate, authorize } = require('../middleware/auth');
const uploaderController = require('../controllers/uploader.controller');

// Configure multer for memory storage (we don't need to save the file locally, just process it)
const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB file limit
    fileFilter: (req, file, cb) => {
        const allowedMimetypes = [
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // xlsx
            'text/csv', // csv
            'application/csv'
        ];

        if (allowedMimetypes.includes(file.mimetype) || file.originalname.endsWith('.xlsx') || file.originalname.endsWith('.csv')) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Only XLSX and CSV are allowed.'), false);
        }
    }
});

/**
 * @swagger
 * /api/uploader/order-form:
 *   post:
 *     summary: Upload and process Order Form Excel/CSV files
 *     tags: [Uploader]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Successfully processed upload
 *       400:
 *         description: Bad Request / Invalid File
 */
router.post('/order-form',
    authenticate,
    authorize('super_admin', 'admin', 'manager'),
    upload.single('file'),
    uploaderController.uploadOrderForm
);

module.exports = router;
