const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const expenses = require('../controllers/expenses.controller');

const fin = ['super_admin', 'admin', 'accountant', 'hr_admin'];

router.get('/categories', authenticate, authorize(...fin), expenses.listCategories);
router.post('/categories', authenticate, authorize('super_admin', 'admin', 'accountant'), expenses.createCategory);
router.patch('/categories/:id', authenticate, authorize('super_admin', 'admin', 'accountant'), expenses.updateCategory);

router.get('/stats', authenticate, authorize(...fin), expenses.getStats);
router.get('/', authenticate, authorize(...fin), expenses.listExpenses);
router.get('/:id', authenticate, authorize(...fin), expenses.getExpense);
router.post('/', authenticate, authorize(...fin), expenses.createExpense);
router.put('/:id', authenticate, authorize(...fin), expenses.updateExpense);
router.patch('/:id/status', authenticate, authorize('super_admin', 'admin', 'accountant'), expenses.toggleExpenseStatus);
router.post('/:id/post', authenticate, authorize('super_admin', 'admin', 'accountant'), expenses.postExpense);
router.delete('/:id', authenticate, authorize(...fin), expenses.deleteExpense);

module.exports = router;
