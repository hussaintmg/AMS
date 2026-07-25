const bookingProvider = {
  name: 'booking',
  label: 'Booking',
  getVariables: () => [
    { key: 'booking.number', label: 'Number', type: 'text', description: 'Booking number' },
    { key: 'booking.date', label: 'Date', type: 'date', description: 'Booking date' },
    { key: 'booking.deliveryDate', label: 'Expected delivery date', type: 'date', description: 'Expected delivery date' },
    { key: 'booking.amount', label: 'Booking amount', type: 'text', description: 'Booking amount' },
    { key: 'booking.totalAmount', label: 'Total amount', type: 'text', description: 'Booking total amount' },
    { key: 'booking.status', label: 'Status', type: 'text', description: 'Booking status' },
  ],
  resolve: (_, context = {}) => {
    const booking = context.booking || {};
    const date = (value) => value ? new Date(value).toLocaleDateString('en-GB') : '';
    const currency = (v) => (v == null || v === '' ? '' : `PKR ${Number(v).toLocaleString('en-PK')}`);
    return {
      'booking.number': booking.number || booking.bookingNumber || '',
      'booking.date': date(booking.date || booking.bookingDate || booking.createdAt),
      'booking.deliveryDate': date(booking.deliveryDate || booking.expectedDeliveryDate),
      'booking.amount': currency(booking.amount != null ? booking.amount : booking.bookingAmount),
      'booking.totalAmount': currency(booking.totalAmount),
      'booking.status': booking.status || '',
    };
  },
};

module.exports = bookingProvider;
