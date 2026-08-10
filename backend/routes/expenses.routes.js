const express = require('express');
const router = express.Router();
const { authenticate, authorizeAction } = require('../middleware/auth');
const { fieldMask } = require('../utils/fieldPermissions');
const expenses = require('../controllers/expenses.controller');

// Withhold the columns this role may not read, whatever the endpoint returns.
// Mounted below the category routes' own paths as well; a category carries none
// of the catalog's keys, so it passes through untouched.
router.use(fieldMask('expenses'));

router.get('/categories', authenticate, authorizeAction('expenses', 'view'), expenses.listCategories);
router.post('/categories', authenticate, authorizeAction('expenses', 'create'), expenses.createCategory);
router.patch('/categories/:id', authenticate, authorizeAction('expenses', 'edit'), expenses.updateCategory);

router.get('/stats', authenticate, authorizeAction('expenses', 'view'), expenses.getStats);
router.get('/', authenticate, authorizeAction('expenses', 'view'), expenses.listExpenses);
router.patch('/bulk/deactivate', authenticate, authorizeAction('expenses', 'edit'), expenses.bulkDeactivateExpenses);
router.delete('/bulk', authenticate, authorizeAction('expenses', 'delete'), expenses.bulkDeleteExpenses);
router.get('/:id', authenticate, authorizeAction('expenses', 'view'), expenses.getExpense);
router.post('/', authenticate, authorizeAction('expenses', 'create'), expenses.createExpense);
router.put('/:id', authenticate, authorizeAction('expenses', 'edit'), expenses.updateExpense);
router.patch('/:id/status', authenticate, authorizeAction('expenses', 'edit'), expenses.toggleExpenseStatus);
router.post('/:id/post', authenticate, authorizeAction('expenses', 'edit'), expenses.postExpense);
router.delete('/:id', authenticate, authorizeAction('expenses', 'delete'), expenses.deleteExpense);

module.exports = router;
