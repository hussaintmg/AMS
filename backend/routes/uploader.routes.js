const express = require('express');
const multer = require('multer');
const path = require('path');
const uploaderController = require('../controllers/uploader.controller');
const { authenticate, authorizeAction, authorizeAny } = require('../middleware/auth');
const { FILE_DEFINITIONS, MAX_FILE_SIZE } = require('../services/imports/spreadsheetMapper');

const router = express.Router();
const storage = multer.memoryStorage();

// A dealer can hand over several workbooks per report type (e.g. one Dispatch
// Report per month), so every slot accepts a batch of files.
const MAX_FILES_PER_TYPE = 25;
const MAX_FILES_PER_BATCH = MAX_FILES_PER_TYPE * Object.keys(FILE_DEFINITIONS).length;

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE, files: MAX_FILES_PER_BATCH },
  fileFilter: (_req, file, callback) => {
    const extension = path.extname(file.originalname || '').toLowerCase();
    if (!['.xlsx', '.csv'].includes(extension)) {
      const error = new multer.MulterError('LIMIT_UNEXPECTED_FILE', file.fieldname);
      error.message = 'Only .xlsx and .csv files are supported.';
      return callback(error);
    }
    return callback(null, true);
  },
});

const batchFields = Object.values(FILE_DEFINITIONS).map((definition) => ({
  name: definition.fieldName,
  maxCount: MAX_FILES_PER_TYPE,
}));

function handleMulter(middleware) {
  return (req, res, next) => middleware(req, res, (error) => {
    if (!error) return next();
    if (!(error instanceof multer.MulterError)) return next(error);
    const errorType = error.code === 'LIMIT_FILE_SIZE'
      ? 'FILE_TOO_LARGE'
      : error.code === 'LIMIT_FILE_COUNT'
        ? 'TOO_MANY_FILES'
        : error.code === 'LIMIT_UNEXPECTED_FILE'
          ? 'DUPLICATE_OR_UNSUPPORTED_FILE'
          : error.code;
    return res.status(400).json({
      success: false,
      status: 'validation_failed',
      message: error.message,
      errors: [{
        fileType: error.field || '',
        errorType,
        message: error.message,
      }],
    });
  });
}

/**
 * The pages behind the three slots. Importing one report is one grant, so a
 * dealer's order clerk can be allowed to load Order Intake without also being
 * able to load Dispatch.
 */
const IMPORT_PERMISSIONS = [...new Set(Object.values(FILE_DEFINITIONS).map((definition) => definition.permission))];

/**
 * Judge each slot the caller actually filled, and only those: an empty request
 * has nothing to authorise and is refused by the controller as a bad request.
 */
function authorizeSelectedImports(req, res, next) {
  const definitions = Object.values(FILE_DEFINITIONS).filter((definition) => (req.files?.[definition.fieldName] || []).length);
  let index = 0;
  const authorizeNext = (error) => {
    if (error) return next(error);
    if (index >= definitions.length) return next();
    const definition = definitions[index];
    index += 1;
    return authorizeAction(definition.permission, 'create')(req, res, authorizeNext);
  };
  return authorizeNext();
}

/**
 * POST /api/uploader/batch
 * Multipart fields: orderIntake, orderSales, dispatch — each accepts up to
 * MAX_FILES_PER_TYPE workbooks. Files run grouped in Intake → Sales → Dispatch
 * order and share one batch context, so rows repeated across files of the same
 * type resolve to a single record.
 */
router.post(
  '/batch',
  authenticate,
  handleMulter(upload.fields(batchFields)),
  authorizeSelectedImports,
  uploaderController.uploadBatch,
);


/**
 * POST /api/uploader/detect
 * Names the report a workbook is, so the screen can drop it in the right slot.
 * It writes nothing, but it reads the dealer's spreadsheet and answers with what
 * is in it, and it exists only to serve the import screen — so it asks for the
 * same grant as importing something: any one of the three upload rights.
 */
router.post(
  '/detect',
  authenticate,
  authorizeAny(...IMPORT_PERMISSIONS.map((page) => authorizeAction(page, 'create'))),
  handleMulter(upload.single('file')),
  uploaderController.detectFileType,
);

module.exports = router;
