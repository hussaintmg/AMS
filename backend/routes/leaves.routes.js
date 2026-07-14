const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const leaves = require('../controllers/leaves.controller');

const read = ['super_admin', 'admin', 'hr_admin', 'manager'];
const write = ['super_admin', 'admin', 'hr_admin'];

router.get('/stats', authenticate, authorize(...read), leaves.getStats);
router.get('/', authenticate, authorize(...read), leaves.listLeaves);
router.get('/:id', authenticate, authorize(...read), leaves.getLeave);
router.post('/', authenticate, authorize(...write), leaves.createLeave);
router.put('/:id', authenticate, authorize(...write), leaves.updateLeave);
router.patch('/:id/status', authenticate, authorize(...write), leaves.approveRejectLeave);
router.delete('/:id', authenticate, authorize(...write), leaves.deleteLeave);

module.exports = router;
