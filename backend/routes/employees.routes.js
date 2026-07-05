const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const employees = require('../controllers/employees.controller');

const roles = ['super_admin', 'admin', 'hr_admin'];

router.get('/', authenticate, authorize(...roles), employees.listEmployees);
router.get('/:id', authenticate, authorize(...roles), employees.getEmployee);
router.post('/', authenticate, authorize(...roles), employees.upsertEmployee);
router.put('/:id', authenticate, authorize(...roles), (req, res, next) => {
    req.body = { ...req.body, id: parseInt(req.params.id, 10) };
    employees.upsertEmployee(req, res, next);
});
router.delete('/:id', authenticate, authorize('super_admin', 'admin', 'hr_admin'), employees.deactivateEmployee);

module.exports = router;
