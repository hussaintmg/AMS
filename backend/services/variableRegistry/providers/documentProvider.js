// Generic document variables so a single body template works for any sales
// document (invoice / quotation / booking / order). context.document is derived
// and pre-formatted centrally by emailContext, so we pass values through as-is.
const documentProvider = {
  name: 'document',
  label: 'Document',
  getVariables: () => [
    { key: 'document.number', label: 'Number', type: 'text', description: 'Document number' },
    { key: 'document.date', label: 'Date', type: 'date', description: 'Document date' },
    { key: 'document.totalAmount', label: 'Total Amount', type: 'text', description: 'Document total amount' },
    { key: 'document.balanceAmount', label: 'Balance / Amount Due', type: 'text', description: 'Outstanding balance' },
    { key: 'document.status', label: 'Status', type: 'text', description: 'Document status' },
  ],
  resolve: (_, context = {}) => {
    const d = context.document || {};
    return {
      'document.number': d.number || '',
      'document.date': d.date || '',
      'document.totalAmount': d.totalAmount || '',
      'document.balanceAmount': d.balanceAmount || '',
      'document.status': d.status || '',
    };
  },
};

module.exports = documentProvider;
