const invoiceProvider = {
  name: 'invoice',
  label: 'Invoice',
  getVariables: () => [
    { key: 'invoice.number', label: 'Number', type: 'text', description: 'Invoice number' },
    { key: 'invoice.date', label: 'Date', type: 'date', description: 'Invoice date' },
    { key: 'invoice.dueDate', label: 'Due Date', type: 'date', description: 'Invoice due date' },
    { key: 'invoice.amount', label: 'Amount', type: 'text', description: 'Invoice total amount' },
    { key: 'invoice.status', label: 'Status', type: 'text', description: 'Invoice status' },
    { key: 'invoice.paidAmount', label: 'Paid Amount', type: 'text', description: 'Amount paid' },
    { key: 'invoice.dueAmount', label: 'Due Amount', type: 'text', description: 'Outstanding balance' },
  ],
  resolve: (vars, context) => {
    const invoice = context?.invoice || {};
    return {
      'invoice.number': invoice.number || invoice.invoiceNumber || '',
      'invoice.date': invoice.date ? new Date(invoice.date).toLocaleDateString() : '',
      'invoice.dueDate': invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString() : '',
      'invoice.amount': invoice.amount != null ? String(invoice.amount) : '',
      'invoice.status': invoice.status || '',
      'invoice.paidAmount': invoice.paidAmount != null ? String(invoice.paidAmount) : '',
      'invoice.dueAmount': invoice.dueAmount != null ? String(invoice.dueAmount) : '',
    };
  }
};

module.exports = invoiceProvider;
