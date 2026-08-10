const express = require('express');
const router = express.Router();
const { authenticate, authorizeAction } = require('../middleware/auth');
const { fieldMask } = require('../utils/fieldPermissions');
const leaves = require('../controllers/leaves.controller');

// Withhold the columns this role may not read, whatever the endpoint returns.
router.use(fieldMask('leaves'));

router.get('/stats', authenticate, authorizeAction('leaves', 'view'), leaves.getStats);
router.get('/', authenticate, authorizeAction('leaves', 'view'), leaves.listLeaves);
router.patch('/bulk/deactivate', authenticate, authorizeAction('leaves', 'edit'), leaves.bulkDeactivateLeaves);
router.delete('/bulk', authenticate, authorizeAction('leaves', 'delete'), leaves.bulkDeleteLeaves);
router.get('/:id', authenticate, authorizeAction('leaves', 'view'), leaves.getLeave);
router.post('/', authenticate, authorizeAction('leaves', 'create'), leaves.createLeave);
router.put('/:id', authenticate, authorizeAction('leaves', 'edit'), leaves.updateLeave);
router.patch('/:id/status', authenticate, authorizeAction('leaves', 'edit'), leaves.approveRejectLeave);
router.delete('/:id', authenticate, authorizeAction('leaves', 'delete'), leaves.deleteLeave);

module.exports = router;
