const express = require('express');
const router = express.Router();
const { fieldMask } = require('../utils/fieldPermissions');

// Withhold the columns this role may not read, whatever the endpoint returns.
router.use(fieldMask('employees'));
const { authenticate, authorizeAction } = require('../middleware/auth');
const employees = require('../controllers/employees.controller');

router.get('/stats', authenticate, authorizeAction('employees', 'view'), employees.getStats);
router.get('/', authenticate, authorizeAction('employees', 'view'), employees.listEmployees);
router.patch('/bulk/deactivate', authenticate, authorizeAction('employees', 'edit'), employees.bulkDeactivateEmployees);
router.delete('/bulk', authenticate, authorizeAction('employees', 'delete'), employees.bulkDeleteEmployees);
router.get('/:id', authenticate, authorizeAction('employees', 'view'), employees.getEmployee);
router.post('/', authenticate, authorizeAction('employees', 'create'), employees.createEmployee);
router.put('/:id', authenticate, authorizeAction('employees', 'edit'), employees.updateEmployee);
router.patch('/:id/toggle', authenticate, authorizeAction('employees', 'edit'), employees.toggleEmployeeStatus);
router.delete('/:id', authenticate, authorizeAction('employees', 'delete'), employees.deleteEmployee);

module.exports = router;
