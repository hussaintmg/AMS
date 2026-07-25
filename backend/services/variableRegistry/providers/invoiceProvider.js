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
    const currency = (v) => (v == null || v === '' ? '' : `PKR ${Number(v).toLocaleString('en-PK')}`);
    const date = (v) => (v ? new Date(v).toLocaleDateString('en-GB') : '');
    const amount = invoice.amount != null ? invoice.amount : invoice.totalAmount;
    const due = invoice.dueAmount != null ? invoice.dueAmount : invoice.balanceAmount;
    return {
      'invoice.number': invoice.number || invoice.invoiceNumber || '',
      'invoice.date': date(invoice.date || invoice.invoiceDate || invoice.createdAt),
      'invoice.dueDate': date(invoice.dueDate),
      'invoice.amount': currency(amount),
      'invoice.status': invoice.status || '',
      'invoice.paidAmount': currency(invoice.paidAmount),
      'invoice.dueAmount': currency(due),
    };
  }
};

module.exports = invoiceProvider;
