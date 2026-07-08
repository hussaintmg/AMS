const systemProvider = {
  name: 'system',
  label: 'System',
  getVariables: () => [
    { key: 'system.origin', label: 'Origin URL', type: 'url', description: 'Base URL of the application' },
    { key: 'system.companyName', label: 'Company Name', type: 'text', description: 'Company name from ERP settings' },
    { key: 'system.currentDate', label: 'Current Date', type: 'date', description: 'Current date in system format' },
    { key: 'system.currentYear', label: 'Current Year', type: 'text', description: 'Current year (e.g. 2026)' },
    { key: 'system.currentTime', label: 'Current Time', type: 'text', description: 'Current time in system format' },
  ],
  resolve: (vars, context) => {
    const now = new Date();
    return {
      'system.origin': context?.origin || process.env.APP_URL || '',
      'system.companyName': context?.companyName || process.env.COMPANY_NAME || '',
      'system.currentDate': now.toLocaleDateString(),
      'system.currentYear': String(now.getFullYear()),
      'system.currentTime': now.toLocaleTimeString(),
    };
  }
};

module.exports = systemProvider;
