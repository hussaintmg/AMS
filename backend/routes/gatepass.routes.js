/**
 * Gate passes — /api/gatepasses.
 *
 * Pages: `gatepass_in` (entries), `gatepass_out` (exits + GRN), and
 * `gatepass_verify` — the guard's screen, which may look a pass up and
 * confirm it and nothing else. Reads accept any of the three pages; writes
 * are guarded on the direction of the pass — from the body on create, from
 * the record otherwise (`loadDirection` reads it into `req.gatePassDirection`
 * and `whenDirection` dispatches, so every guard below is a static line the
 * route audit can read).
 */
const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const router = express.Router();
const { authenticate, authorizeAction } = require('../middleware/auth');
const controller = require('../controllers/gatepass.controller');
const GatePass = require('../models/GatePass.model');

const uploadDir = path.join(__dirname, '..', 'uploads', 'gatepass');
fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname)}`),
  }),
  fileFilter: (_req, file, cb) => {
    if (!/^(image\/|application\/pdf)/.test(file.mimetype)) return cb(new Error('Only images and PDFs may be attached'));
    return cb(null, true);
  },
  limits: { fileSize: 8 * 1024 * 1024 },
});

/** Any of the gate-pass pages grants a read. */
const canView = [authenticate, authorizeAction(['gatepass_in', 'gatepass_out', 'gatepass_verify'], 'view')];

/** The pass's direction, from the body (create) or the record (everything else). */
const loadDirection = async (req, res, next) => {
  try {
    if (req.body?.direction) { req.gatePassDirection = req.body.direction === 'out' ? 'out' : 'in'; return next(); }
    if (req.params.id) {
      const pass = await GatePass.findById(req.params.id).select('direction').lean();
      req.gatePassDirection = pass?.direction || 'in';
    }
    return next();
  } catch (error) { return next(error); }
};
const whenDirection = (direction) => (req, res, next) => ((req.gatePassDirection || 'in') === direction ? next() : next('route'));

router.get('/summary', canView, controller.summary);
router.get('/open-entries', canView, controller.openEntries);
router.get('/grns', canView, controller.listGrns);
router.get('/grns/:grnId', canView, controller.getGrn);
router.get('/lookup/:number', canView, controller.lookup);
router.get('/', canView, controller.list);
router.get('/:id', canView, controller.getOne);
router.get('/:id/barcode.svg', canView, controller.barcodeSvg);

// ── Gate pass IN ──────────────────────────────────────────────────────────
router.post('/', authenticate, loadDirection, whenDirection('in'), authorizeAction('gatepass_in', 'create'), controller.create);
router.put('/:id', authenticate, loadDirection, whenDirection('in'), authorizeAction('gatepass_in', 'edit'), controller.update);
router.delete('/:id', authenticate, loadDirection, whenDirection('in'), authorizeAction('gatepass_in', 'delete'), controller.remove);
router.post('/:id/issue', authenticate, loadDirection, whenDirection('in'), authorizeAction('gatepass_in', 'edit'), controller.issue);
router.post('/:id/close', authenticate, loadDirection, whenDirection('in'), authorizeAction('gatepass_in', 'edit'), controller.close);
router.post('/:id/attachments', authenticate, loadDirection, whenDirection('in'), authorizeAction('gatepass_in', 'edit'), upload.array('files', 10), controller.addAttachments);
router.delete('/:id/attachments/:fileId', authenticate, loadDirection, whenDirection('in'), authorizeAction('gatepass_in', 'edit'), controller.removeAttachment);

// ── Gate pass OUT ─────────────────────────────────────────────────────────
router.post('/', authenticate, loadDirection, whenDirection('out'), authorizeAction('gatepass_out', 'create'), controller.create);
router.put('/:id', authenticate, loadDirection, whenDirection('out'), authorizeAction('gatepass_out', 'edit'), controller.update);
router.delete('/:id', authenticate, loadDirection, whenDirection('out'), authorizeAction('gatepass_out', 'delete'), controller.remove);
router.post('/:id/issue', authenticate, loadDirection, whenDirection('out'), authorizeAction('gatepass_out', 'edit'), controller.issue);
router.post('/:id/close', authenticate, loadDirection, whenDirection('out'), authorizeAction('gatepass_out', 'edit'), controller.close);
router.post('/:id/attachments', authenticate, loadDirection, whenDirection('out'), authorizeAction('gatepass_out', 'edit'), upload.array('files', 10), controller.addAttachments);
router.delete('/:id/attachments/:fileId', authenticate, loadDirection, whenDirection('out'), authorizeAction('gatepass_out', 'edit'), controller.removeAttachment);
// A GRN goes out with the truck: the OUT page's grant.
router.post('/:id/grn', authenticate, authorizeAction('gatepass_out', 'generateGrn'), controller.createGrn);

// ── The guard's action: its own grant on the verify page ──────────────────
router.post('/:id/verify', authenticate, authorizeAction(['gatepass_verify', 'gatepass_out'], 'verify'), controller.verify);

module.exports = router;
