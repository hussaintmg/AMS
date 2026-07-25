const customerProvider = {
  name: 'customer',
  label: 'Customer',
  getVariables: () => [
    { key: 'customer.firstName', label: 'First Name', type: 'text', description: 'Customer first name' },
    { key: 'customer.lastName', label: 'Last Name', type: 'text', description: 'Customer last name' },
    { key: 'customer.fullName', label: 'Full Name', type: 'text', description: 'Customer full name' },
    { key: 'customer.email', label: 'Email', type: 'email', description: 'Customer email address' },
    { key: 'customer.phone', label: 'Phone', type: 'text', description: 'Customer phone number' },
    { key: 'customer.company', label: 'Company', type: 'text', description: 'Customer company name' },
  ],
  resolve: (vars, context) => {
    const customer = context?.customer || {};
    return {
      'customer.firstName': customer.firstName || '',
      'customer.lastName': customer.lastName || '',
      'customer.fullName': [customer.firstName, customer.lastName].filter(Boolean).join(' ') || '',
      'customer.email': customer.email || '',
      'customer.phone': customer.phone || '',
      'customer.company': customer.company || customer.companyName || '',
    };
  }
};

module.exports = customerProvider;
