const erpProvider = {
  name: 'erp',
  label: 'ERP',
  getVariables: () => [
    { key: 'erp.companyName', label: 'Company Name', type: 'text', description: 'ERP company name' },
    { key: 'erp.companyAddress', label: 'Company Address', type: 'text', description: 'ERP company address' },
    { key: 'erp.companyPhone', label: 'Company Phone', type: 'text', description: 'ERP company phone' },
    { key: 'erp.companyEmail', label: 'Company Email', type: 'email', description: 'ERP company email' },
    { key: 'erp.companyWebsite', label: 'Company Website', type: 'url', description: 'ERP company website' },
  ],
  resolve: (vars, context) => {
    const erp = context?.erp || {};
    return {
      'erp.companyName': erp.companyName || process.env.COMPANY_NAME || '',
      'erp.companyAddress': erp.companyAddress || '',
      'erp.companyPhone': erp.companyPhone || '',
      'erp.companyEmail': erp.companyEmail || '',
      'erp.companyWebsite': erp.companyWebsite || '',
    };
  }
};

module.exports = erpProvider;
