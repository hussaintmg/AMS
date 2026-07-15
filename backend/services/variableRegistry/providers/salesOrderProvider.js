const salesOrderProvider = {
  name: 'order',
  label: 'Sales Order',
  getVariables: () => [
    { key: 'order.number', label: 'Number', type: 'text', description: 'Sales order number' },
    { key: 'order.date', label: 'Date', type: 'date', description: 'Sales order date' },
    { key: 'order.deliveryDate', label: 'Delivery date', type: 'date', description: 'Expected delivery date' },
    { key: 'order.amount', label: 'Total amount', type: 'text', description: 'Sales order total' },
    { key: 'order.status', label: 'Status', type: 'text', description: 'Sales order status' },
  ],
  resolve: (_, context = {}) => {
    const order = context.order || {};
    const date = (value) => value ? new Date(value).toLocaleDateString() : '';
    return {
      'order.number': order.number || order.orderNumber || '',
      'order.date': date(order.date || order.orderDate || order.createdAt),
      'order.deliveryDate': date(order.deliveryDate || order.expectedDeliveryDate),
      'order.amount': order.amount != null ? String(order.amount) : String(order.totalAmount || ''),
      'order.status': order.status || '',
    };
  },
};

module.exports = salesOrderProvider;
