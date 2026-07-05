const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const leaves = require('../controllers/leaves.controller');

const read = ['super_admin', 'admin', 'hr_admin', 'manager'];
const write = ['super_admin', 'admin', 'hr_admin'];

router.get('/types', authenticate, authorize(...read), leaves.listTypes);
router.get('/balances', authenticate, authorize(...read), leaves.listBalances);
router.get('/requests', authenticate, authorize(...read), leaves.listRequests);
router.post('/requests', authenticate, authorize(...write), leaves.submitRequest);
router.patch('/requests/:id/status', authenticate, authorize(...write), leaves.setRequestStatus);

module.exports = router;
