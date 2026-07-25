const companyProvider = {
  name: 'company',
  label: 'Company',
  getVariables: () => [
    { key: 'company.name', label: 'Company Name', type: 'text', description: 'Company name' },
    { key: 'company.phone', label: 'Company Phone', type: 'text', description: 'Company phone number' },
    { key: 'company.email', label: 'Company Email', type: 'email', description: 'Company email address' },
    { key: 'company.website', label: 'Company Website', type: 'url', description: 'Company website' },
    { key: 'company.address', label: 'Company Address', type: 'text', description: 'Company address' },
  ],
  // context.company is injected centrally by the renderer (from the active
  // Company / branding settings), so every email resolves these consistently.
  resolve: (_, context = {}) => {
    const c = context.company || {};
    return {
      'company.name': c.name || '',
      'company.phone': c.phone || '',
      'company.email': c.email || '',
      'company.website': c.website || '',
      'company.address': c.address || '',
    };
  },
};

module.exports = companyProvider;
