// Thin alias so `require('../models/CustomInvoice.model')` works where a
// single-model file is expected (reports, PDF lookups).
module.exports = require('./CustomDocument.model').CustomInvoice;
