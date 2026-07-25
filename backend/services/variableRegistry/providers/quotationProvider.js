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
    const currency = (v) => (v == null || v === '' ? '' : `PKR ${Number(v).toLocaleString('en-PK')}`);
    const date = (v) => (v ? new Date(v).toLocaleDateString('en-GB') : '');
    const amount = quotation.amount != null ? quotation.amount : quotation.totalAmount;
    return {
      'quotation.number': quotation.number || quotation.quotationNumber || '',
      'quotation.date': date(quotation.date || quotation.quotationDate || quotation.createdAt),
      'quotation.validUntil': date(quotation.validUntil),
      'quotation.amount': currency(amount),
      'quotation.status': quotation.status || '',
    };
  }
};

module.exports = quotationProvider;
