/**
 * ERP Settings Models (MongoDB)
 * Company, Branch, Currency, TaxConfig, DocumentTemplate
 *
 * Replaces the legacy MySQL tables (companies, company_branches, currencies,
 * tax_configurations, document_templates) that the MySQL stub could no longer serve.
 *
 * Maintained by Hussain Developer
 * hussaintmerng@gmail.com | +92 319 1634446
 * AMS ERP
 */

const mongoose = require('mongoose');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const optionalEmail = {
  validator: (v) => !v || EMAIL_RE.test(v),
  message: 'Invalid email address',
};

// ── Company ────────────────────────────────────────────────────────────────
const companySchema = new mongoose.Schema({
  companyCode: { type: String, trim: true, unique: true, index: true },
  companyName: { type: String, required: [true, 'Company name is required'], trim: true },
  legalName: { type: String, trim: true, default: '' },
  registrationNumber: { type: String, trim: true, default: '' },
  taxId: { type: String, trim: true, default: '' },
  email: { type: String, trim: true, lowercase: true, default: '', validate: optionalEmail },
  phone: { type: String, trim: true, default: '' },
  fax: { type: String, trim: true, default: '' },
  website: { type: String, trim: true, default: '' },
  address: { type: String, default: '' },
  city: { type: String, trim: true, default: '' },
  state: { type: String, trim: true, default: '' },
  country: { type: String, trim: true, default: 'Pakistan' },
  postalCode: { type: String, trim: true, default: '' },
  currencyCode: { type: String, trim: true, uppercase: true, default: 'PKR' },
  fiscalYearStart: { type: String, trim: true, default: '' },
  timezone: { type: String, trim: true, default: 'Asia/Karachi' },
  isActive: { type: Boolean, default: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });

companySchema.index({ companyName: 1 });
companySchema.index({ isActive: 1 });

// ── Branch ─────────────────────────────────────────────────────────────────
const BRANCH_TYPES = ['head_office', 'regional', 'showroom', 'workshop', 'warehouse'];

const branchSchema = new mongoose.Schema({
  branchCode: { type: String, trim: true, unique: true, index: true },
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: [true, 'Company is required'],
    index: true,
  },
  branchName: { type: String, required: [true, 'Branch name is required'], trim: true },
  branchType: {
    type: String,
    enum: { values: BRANCH_TYPES, message: 'Invalid branch type' },
    default: 'regional',
  },
  managerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  email: { type: String, trim: true, lowercase: true, default: '', validate: optionalEmail },
  phone: { type: String, trim: true, default: '' },
  fax: { type: String, trim: true, default: '' },
  address: { type: String, default: '' },
  city: { type: String, trim: true, default: '' },
  state: { type: String, trim: true, default: '' },
  country: { type: String, trim: true, default: 'Pakistan' },
  postalCode: { type: String, trim: true, default: '' },
  latitude: { type: Number, default: null },
  longitude: { type: Number, default: null },
  openingHours: { type: String, default: '' },
  isActive: { type: Boolean, default: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });

branchSchema.index({ branchName: 1 });
branchSchema.index({ isActive: 1 });

// ── Currency ───────────────────────────────────────────────────────────────
const currencySchema = new mongoose.Schema({
  code: {
    type: String,
    required: [true, 'Currency code is required'],
    trim: true,
    uppercase: true,
    unique: true,
    index: true,
  },
  name: { type: String, required: [true, 'Currency name is required'], trim: true },
  symbol: { type: String, required: [true, 'Currency symbol is required'], trim: true },
  exchangeRate: {
    type: Number,
    default: 1,
    min: [0, 'Exchange rate cannot be negative'],
  },
  decimalPlaces: {
    type: Number,
    default: 2,
    min: [0, 'Decimal places cannot be negative'],
    max: [6, 'Decimal places cannot exceed 6'],
  },
  isDefault: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });

currencySchema.index({ isDefault: -1 });

// ── Tax configuration ──────────────────────────────────────────────────────
const taxConfigSchema = new mongoose.Schema({
  taxName: { type: String, required: [true, 'Tax name is required'], trim: true },
  taxCode: {
    type: String,
    required: [true, 'Tax code is required'],
    trim: true,
    uppercase: true,
    unique: true,
    index: true,
  },
  taxRate: {
    type: Number,
    required: [true, 'Tax rate is required'],
    min: [0, 'Tax rate cannot be negative'],
    max: [100, 'Tax rate cannot exceed 100'],
  },
  taxType: { type: String, trim: true, default: 'sales' },
  description: { type: String, default: '' },
  isCompound: { type: Boolean, default: false },
  appliesTo: { type: String, trim: true, default: 'all' },
  isActive: { type: Boolean, default: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });

taxConfigSchema.index({ taxType: 1 });

// ── Document template ──────────────────────────────────────────────────────
const DOCUMENT_TEMPLATE_TYPES = ['quotation', 'booking', 'order', 'invoice'];

const documentTemplateSchema = new mongoose.Schema({
  documentType: {
    type: String,
    required: [true, 'Document type is required'],
    enum: { values: DOCUMENT_TEMPLATE_TYPES, message: 'Invalid document type' },
    index: true,
  },
  name: { type: String, required: [true, 'Name is required'], trim: true },
  htmlContent: { type: String, required: [true, 'htmlContent is required'] },
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', default: null },
  isDefault: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });

documentTemplateSchema.index({ documentType: 1, companyId: 1, isDefault: -1 });

const Company = mongoose.model('Company', companySchema);
const Branch = mongoose.model('Branch', branchSchema);
const Currency = mongoose.model('Currency', currencySchema);
const TaxConfig = mongoose.model('TaxConfig', taxConfigSchema);
const DocumentTemplate = mongoose.model('DocumentTemplate', documentTemplateSchema);

module.exports = {
  Company,
  Branch,
  Currency,
  TaxConfig,
  DocumentTemplate,
  BRANCH_TYPES,
  DOCUMENT_TEMPLATE_TYPES,
};
