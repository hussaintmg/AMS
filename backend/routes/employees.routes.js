const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const employees = require('../controllers/employees.controller');

const roles = ['super_admin', 'admin', 'hr_admin'];

router.get('/stats', authenticate, authorize(...roles), employees.getStats);
router.get('/', authenticate, authorize(...roles), employees.listEmployees);
router.get('/:id', authenticate, authorize(...roles), employees.getEmployee);
router.post('/', authenticate, authorize(...roles), employees.createEmployee);
router.put('/:id', authenticate, authorize(...roles), employees.updateEmployee);
router.patch('/:id/toggle', authenticate, authorize(...roles), employees.toggleEmployeeStatus);
router.delete('/:id', authenticate, authorize(...roles), employees.deleteEmployee);

module.exports = router;
