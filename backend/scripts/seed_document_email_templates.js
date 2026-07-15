/* Idempotent seed: document templates, usages and variables for email delivery. */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const { connectMongo, disconnectMongo } = require('../config/mongodb');
const { EmailTemplate, EmailUsage, EmailVariable } = require('../models');

const commonVariables = [
  ['Customer full name', 'customer_full_name', 'customer.fullName', 'Customer', 'Customer name'],
  ['Customer email', 'customer_email', 'customer.email', 'Customer', 'Customer email address'],
  ['Quotation number', 'quotation_number', 'quotation.number', 'Quotation', 'Quotation number'],
  ['Quotation date', 'quotation_date', 'quotation.date', 'Quotation', 'Quotation date'],
  ['Quotation validity', 'quotation_valid_until', 'quotation.validUntil', 'Quotation', 'Quotation valid-until date'],
  ['Quotation amount', 'quotation_amount', 'quotation.amount', 'Quotation', 'Quotation total amount'],
  ['Booking number', 'booking_number', 'booking.number', 'Booking', 'Booking number'],
  ['Booking date', 'booking_date', 'booking.date', 'Booking', 'Booking date'],
  ['Booking delivery date', 'booking_delivery_date', 'booking.deliveryDate', 'Booking', 'Expected delivery date'],
  ['Booking amount', 'booking_amount', 'booking.amount', 'Booking', 'Booking amount'],
  ['Sales order number', 'sales_order_number', 'order.number', 'Sales Order', 'Sales order number'],
  ['Sales order date', 'sales_order_date', 'order.date', 'Sales Order', 'Sales order date'],
  ['Sales order delivery date', 'sales_order_delivery_date', 'order.deliveryDate', 'Sales Order', 'Expected delivery date'],
  ['Sales order amount', 'sales_order_amount', 'order.amount', 'Sales Order', 'Sales order total amount'],
  ['Invoice number', 'invoice_number', 'invoice.number', 'Invoice', 'Invoice number'],
  ['Invoice date', 'invoice_date', 'invoice.date', 'Invoice', 'Invoice date'],
  ['Invoice due date', 'invoice_due_date', 'invoice.dueDate', 'Invoice', 'Invoice due date'],
  ['Invoice amount', 'invoice_amount', 'invoice.amount', 'Invoice', 'Invoice total amount'],
  ['Invoice due amount', 'invoice_due_amount', 'invoice.dueAmount', 'Invoice', 'Outstanding invoice amount'],
];

const definitions = [
  ['quotation_customer', 'Quotation for Customer', 'Your quotation {{quotation.number}}', '<h2>Hello {{customer.fullName}}</h2><p>Your quotation <strong>{{quotation.number}}</strong> is ready.</p><p>Date: {{quotation.date}}<br/>Valid until: {{quotation.validUntil}}<br/>Total: {{quotation.amount}}</p>', ['customer.fullName','quotation.number','quotation.date','quotation.validUntil','quotation.amount']],
  ['booking_customer', 'Booking Confirmation', 'Booking confirmed: {{booking.number}}', '<h2>Hello {{customer.fullName}}</h2><p>Your booking <strong>{{booking.number}}</strong> has been received.</p><p>Booking date: {{booking.date}}<br/>Expected delivery: {{booking.deliveryDate}}<br/>Booking amount: {{booking.amount}}</p>', ['customer.fullName','booking.number','booking.date','booking.deliveryDate','booking.amount']],
  ['sales_order_customer', 'Sales Order for Customer', 'Sales order {{order.number}}', '<h2>Hello {{customer.fullName}}</h2><p>Your sales order <strong>{{order.number}}</strong> is ready.</p><p>Order date: {{order.date}}<br/>Expected delivery: {{order.deliveryDate}}<br/>Total: {{order.amount}}<br/>Status: {{order.status}}</p>', ['customer.fullName','order.number','order.date','order.deliveryDate','order.amount','order.status']],
  ['invoice_customer', 'Invoice for Customer', 'Invoice {{invoice.number}}', '<h2>Hello {{customer.fullName}}</h2><p>Your invoice <strong>{{invoice.number}}</strong> is ready.</p><p>Invoice date: {{invoice.date}}<br/>Due date: {{invoice.dueDate}}<br/>Total: {{invoice.amount}}<br/>Outstanding: {{invoice.dueAmount}}</p>', ['customer.fullName','invoice.number','invoice.date','invoice.dueDate','invoice.amount','invoice.dueAmount']],
];

(async () => {
  await connectMongo();
  for (const [name, key, reference, category, description] of commonVariables) {
    await EmailVariable.findOneAndUpdate({ key }, { $set: { name, key, reference, category, description, isActive: true, isDeleted: false } }, { upsert: true, new: true, setDefaultsOnInsert: true });
  }
  for (const [key, templateName, subject, html, variables] of definitions) {
    const template = await EmailTemplate.findOneAndUpdate(
      { templateName },
      { $set: { subject, html, plainText: html.replace(/<[^>]+>/g, ' '), description: `System ${key} email`, tags: ['system', key], isActive: true, status: 'published', isDeleted: false } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    await EmailUsage.findOneAndUpdate(
      { key },
      { $set: { key, name: templateName, description: `Send ${key.replace('_', ' ')} email`, template: template._id, variableMappings: variables.map(v => ({ templateVariable: v, sourceVariable: v })), isActive: true, isDeleted: false } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
  }
  console.log('Document email templates, usages and variables are ready.');
  await disconnectMongo();
})().catch(async (error) => { console.error(error); await disconnectMongo(); process.exitCode = 1; });
