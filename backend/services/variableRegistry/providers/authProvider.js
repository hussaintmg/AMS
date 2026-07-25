const authProvider = {
  name: 'auth',
  label: 'Authentication',
  getVariables: () => [
    { key: 'auth.customerLoginLink', label: 'Customer Login Link', type: 'url', description: 'URL for customer login' },
    { key: 'auth.resetPasswordLink', label: 'Reset Password Link', type: 'url', description: 'URL to reset password' },
    { key: 'auth.resetCode', label: 'Reset Code', type: 'text', description: 'Password reset verification code' },
    { key: 'auth.loginLink', label: 'Login Link', type: 'url', description: 'General login URL' },
  ],
  resolve: (vars, context) => {
    const origin = context?.origin || process.env.APP_URL || '';
    const auth = context?.auth || {};
    return {
      'auth.customerLoginLink': auth.customerLoginLink || context?.customerLoginLink || `${origin}/login`,
      'auth.resetPasswordLink': auth.resetPasswordLink || context?.resetPasswordLink || `${origin}/reset-password`,
      'auth.resetCode': auth.resetCode || context?.resetCode || '',
      'auth.loginLink': auth.loginLink || context?.loginLink || `${origin}/login`,
    };
  }
};

module.exports = authProvider;
