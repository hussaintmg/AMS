const userProvider = {
  name: 'user',
  label: 'User',
  getVariables: () => [
    { key: 'user.firstName', label: 'First Name', type: 'text', description: 'User first name' },
    { key: 'user.lastName', label: 'Last Name', type: 'text', description: 'User last name' },
    { key: 'user.fullName', label: 'Full Name', type: 'text', description: 'User full name' },
    { key: 'user.email', label: 'Email', type: 'email', description: 'User email address' },
    { key: 'user.phone', label: 'Phone', type: 'text', description: 'User phone number' },
  ],
  resolve: (vars, context) => {
    const user = context?.user || {};
    return {
      'user.firstName': user.firstName || '',
      'user.lastName': user.lastName || '',
      'user.fullName': [user.firstName, user.lastName].filter(Boolean).join(' ') || '',
      'user.email': user.email || '',
      'user.phone': user.phone || '',
    };
  }
};

module.exports = userProvider;
