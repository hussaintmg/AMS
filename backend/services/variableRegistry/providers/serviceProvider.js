const serviceProvider = {
  name: 'service',
  label: 'Service',
  getVariables: () => [
    { key: 'service.appointmentDate', label: 'Appointment Date', type: 'date', description: 'Service appointment date' },
    { key: 'service.serviceType', label: 'Service Type', type: 'text', description: 'Type of service' },
    { key: 'service.status', label: 'Status', type: 'text', description: 'Service status' },
    { key: 'service.notes', label: 'Notes', type: 'text', description: 'Service notes' },
  ],
  resolve: (vars, context) => {
    const service = context?.service || {};
    return {
      'service.appointmentDate': service.appointmentDate ? new Date(service.appointmentDate).toLocaleDateString() : '',
      'service.serviceType': service.serviceType || '',
      'service.status': service.status || '',
      'service.notes': service.notes || '',
    };
  }
};

module.exports = serviceProvider;
