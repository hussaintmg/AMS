const systemProvider = require('./providers/systemProvider');
const authProvider = require('./providers/authProvider');
const userProvider = require('./providers/userProvider');
const customerProvider = require('./providers/customerProvider');
const leadProvider = require('./providers/leadProvider');
const invoiceProvider = require('./providers/invoiceProvider');
const quotationProvider = require('./providers/quotationProvider');
const bookingProvider = require('./providers/bookingProvider');
const salesOrderProvider = require('./providers/salesOrderProvider');
const vehicleProvider = require('./providers/vehicleProvider');
const serviceProvider = require('./providers/serviceProvider');
const erpProvider = require('./providers/erpProvider');
const companyProvider = require('./providers/companyProvider');
const documentProvider = require('./providers/documentProvider');

const providers = [
  systemProvider,
  authProvider,
  userProvider,
  customerProvider,
  leadProvider,
  invoiceProvider,
  quotationProvider,
  bookingProvider,
  salesOrderProvider,
  vehicleProvider,
  serviceProvider,
  erpProvider,
  companyProvider,
  documentProvider,
];

function getAllVariables() {
  return providers.map(p => ({
    name: p.name,
    label: p.label,
    variables: p.getVariables(),
  }));
}

function getAllVariablesFlat() {
  const all = [];
  providers.forEach(p => {
    const vars = p.getVariables();
    vars.forEach(v => {
      all.push({ ...v, provider: p.name });
    });
  });
  return all;
}

function resolveVariables(context = {}) {
  const resolved = {};
  providers.forEach(p => {
    Object.assign(resolved, p.resolve(null, context));
  });
  return resolved;
}

function validateMappings(mappings = []) {
  const allVars = getAllVariablesFlat();
  const varKeys = new Set(allVars.map(v => v.key));
  const errors = [];
  mappings.forEach((m, i) => {
    if (!varKeys.has(m.sourceVariable)) {
      errors.push({ index: i, templateVariable: m.templateVariable, sourceVariable: m.sourceVariable, message: `Unknown source variable: ${m.sourceVariable}` });
    }
  });
  return errors;
}

function getSafeKeys() {
  const keys = new Set();
  providers.forEach(p => {
    p.getVariables().forEach(v => keys.add(v.key));
  });
  return keys;
}

function registerProvider(provider) {
  if (!provider || !provider.name || !provider.getVariables || !provider.resolve) {
    throw new Error('Invalid provider: must have name, getVariables(), and resolve()');
  }
  providers.push(provider);
}

module.exports = {
  getAllVariables,
  getAllVariablesFlat,
  resolveVariables,
  validateMappings,
  getSafeKeys,
  registerProvider,
};
