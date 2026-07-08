const quotationProvider = {
  name: 'quotation',
  label: 'Quotation',
  getVariables: () => [
    { key: 'quotation.number', label: 'Number', type: 'text', description: 'Quotation number' },
    { key: 'quotation.date', label: 'Date', type: 'date', description: 'Quotation date' },
    { key: 'quotation.validUntil', label: 'Valid Until', type: 'date', description: 'Quotation validity date' },
    { key: 'quotation.amount', label: 'Amount', type: 'text', description: 'Quotation total amount' },
    { key: 'quotation.status', label: 'Status', type: 'text', description: 'Quotation status' },
  ],
  resolve: (vars, context) => {
    const quotation = context?.quotation || {};
    return {
      'quotation.number': quotation.number || quotation.quotationNumber || '',
      'quotation.date': quotation.date ? new Date(quotation.date).toLocaleDateString() : '',
      'quotation.validUntil': quotation.validUntil ? new Date(quotation.validUntil).toLocaleDateString() : '',
      'quotation.amount': quotation.amount != null ? String(quotation.amount) : '',
      'quotation.status': quotation.status || '',
    };
  }
};

module.exports = quotationProvider;
