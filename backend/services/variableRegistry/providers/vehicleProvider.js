const vehicleProvider = {
  name: 'vehicle',
  label: 'Vehicle',
  getVariables: () => [
    { key: 'vehicle.make', label: 'Make', type: 'text', description: 'Vehicle make' },
    { key: 'vehicle.model', label: 'Model', type: 'text', description: 'Vehicle model' },
    { key: 'vehicle.year', label: 'Year', type: 'text', description: 'Vehicle year' },
    { key: 'vehicle.plate', label: 'Plate Number', type: 'text', description: 'Vehicle license plate' },
    { key: 'vehicle.vin', label: 'VIN', type: 'text', description: 'Vehicle VIN/chassis number' },
  ],
  resolve: (vars, context) => {
    const vehicle = context?.vehicle || {};
    return {
      'vehicle.make': vehicle.make || '',
      'vehicle.model': vehicle.model || '',
      'vehicle.year': vehicle.year != null ? String(vehicle.year) : '',
      'vehicle.plate': vehicle.plate || vehicle.plateNumber || '',
      'vehicle.vin': vehicle.vin || vehicle.chassisNumber || '',
    };
  }
};

module.exports = vehicleProvider;
