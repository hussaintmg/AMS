const archiver = require('archiver');
const { PassThrough } = require('stream');
const { PdfTemplate, PdfUsage, PdfVariable, Quotation, Booking, SalesOrder, Invoice } = require('../models');
const { renderPdf } = require('../services/pdfRenderer.service');

const TYPES = {
  quotation: { label: 'Quotation', Model: Quotation, number: 'quotationNumber' },
  booking: { label: 'Booking', Model: Booking, number: 'bookingNumber' },
  order: { label: 'Sales Order', Model: SalesOrder, number: 'orderNumber' },
  invoice: { label: 'Invoice', Model: Invoice, number: 'invoiceNumber' }
};
const userId = (req) => req.user?.id || req.user?._id;
const defaultPage = () => ({
  config: { format: 'A4', width: 794, height: 1123 },
  elements: [
    { id: 'title', type: 'text', text: '{{document.title}}', css: [{ property: 'left', value: '48px' }, { property: 'top', value: '48px' }, { property: 'width', value: '698px' }, { property: 'font-size', value: '28px' }, { property: 'font-weight', value: 'bold' }, { property: 'color', value: '#0f172a' }] },
    { id: 'number', type: 'text', text: 'Reference: {{document.number}}', css: [{ property: 'left', value: '48px' }, { property: 'top', value: '95px' }, { property: 'width', value: '400px' }, { property: 'font-size', value: '14px' }] },
    { id: 'customer', type: 'text', text: 'Customer: {{customer.fullName}}', css: [{ property: 'left', value: '48px' }, { property: 'top', value: '145px' }, { property: 'width', value: '500px' }, { property: 'font-size', value: '16px' }] },
    { id: 'total', type: 'text', text: 'Total: {{document.totalAmount}}', css: [{ property: 'left', value: '48px' }, { property: 'top', value: '200px' }, { property: 'width', value: '400px' }, { property: 'font-size', value: '18px' }, { property: 'font-weight', value: 'bold' }] }
  ]
});

async function ensureUsages() {
  await Promise.all(Object.entries(TYPES).map(([documentType, value]) => PdfUsage.updateOne(
    { documentType }, { $setOnInsert: { documentType, label: value.label } }, { upsert: true }
  )));
}

function publicTemplate(template) {
  const value = template?.toObject ? template.toObject() : template;
  return value ? { ...value, id: String(value._id) } : value;
}

exports.listTemplates = async (req, res, next) => {
  try {
    const filter = req.query.documentType ? { documentType: req.query.documentType } : {};
    const templates = await PdfTemplate.find(filter).sort({ updatedAt: -1 }).lean();
    res.json({ success: true, data: { templates: templates.map(publicTemplate) } });
  } catch (error) { next(error); }
};
exports.getTemplate = async (req, res, next) => {
  try {
    const template = await PdfTemplate.findById(req.params.id).lean();
    if (!template) return res.status(404).json({ success: false, message: 'PDF template not found' });
    res.json({ success: true, data: { template: publicTemplate(template) } });
  } catch (error) { next(error); }
};
exports.createTemplate = async (req, res, next) => {
  try {
    const { name, documentType, description = '' } = req.body;
    if (!name || !TYPES[documentType]) return res.status(400).json({ success: false, message: 'Name and valid document type are required' });
    const template = await PdfTemplate.create({ name, documentType, description, status: 'draft', designData: { pages: [defaultPage()] }, createdBy: userId(req), updatedBy: userId(req) });
    res.status(201).json({ success: true, message: 'PDF template created', data: { template: publicTemplate(template) } });
  } catch (error) { next(error); }
};
exports.updateTemplate = async (req, res, next) => {
  try {
    const allowed = ['name', 'description', 'status', 'designData'];
    const updates = {}; allowed.forEach((key) => { if (req.body[key] !== undefined) updates[key] = req.body[key]; });
    updates.updatedBy = userId(req);
    const template = await PdfTemplate.findByIdAndUpdate(req.params.id, { $set: updates }, { new: true, runValidators: true });
    if (!template) return res.status(404).json({ success: false, message: 'PDF template not found' });
    res.json({ success: true, message: 'PDF template saved', data: { template: publicTemplate(template) } });
  } catch (error) { next(error); }
};
exports.deleteTemplate = async (req, res, next) => {
  try {
    if (await PdfUsage.exists({ template: req.params.id })) return res.status(409).json({ success: false, message: 'Template is assigned to a usage' });
    await PdfTemplate.findByIdAndDelete(req.params.id); res.json({ success: true, message: 'PDF template deleted' });
  } catch (error) { next(error); }
};
exports.listUsages = async (_req, res, next) => {
  try { await ensureUsages(); const usages = await PdfUsage.find().populate('template', 'name status documentType').sort({ documentType: 1 }).lean(); res.json({ success: true, data: { usages } }); }
  catch (error) { next(error); }
};
exports.assignUsage = async (req, res, next) => {
  try {
    const template = await PdfTemplate.findOne({ _id: req.body.templateId, documentType: req.params.documentType, status: 'active' });
    if (!template) return res.status(400).json({ success: false, message: 'Select an active template for this document type' });
    const usage = await PdfUsage.findOneAndUpdate({ documentType: req.params.documentType }, { $set: { label: TYPES[req.params.documentType].label, template: template._id, updatedBy: userId(req) } }, { upsert: true, new: true }).populate('template', 'name status documentType');
    res.json({ success: true, message: 'PDF usage assigned', data: { usage } });
  } catch (error) { next(error); }
};
exports.variables = async (req, res) => {
  const type = req.query.documentType || 'quotation';
  const common = ['document.title', 'document.number', 'document.status', 'document.totalAmount', 'document.taxAmount', 'document.discountAmount', 'document.createdAt', 'customer.fullName', 'customer.firstName', 'customer.lastName', 'customer.email', 'customer.phone'];
  const extra = type === 'invoice' ? ['document.invoiceDate', 'document.dueDate', 'document.subtotal', 'document.paidAmount', 'document.balanceAmount'] : type === 'booking' ? ['document.bookingDate', 'document.deliveryDate', 'document.bookingAmount', 'document.priority'] : type === 'order' ? ['document.orderDate', 'document.deliveryDate', 'document.subtotal', 'document.paidAmount', 'document.balanceAmount'] : ['document.validUntil', 'document.vehiclePrice', 'document.validityDays'];
  const builtIns = [...common, ...extra].map((key) => ({ key, reference: `{{${key}}}`, category: key.split('.')[0], label: key }));
  const custom = await PdfVariable.find({ documentType: type }).sort({ key: 1 }).lean();
  res.json({ success: true, data: { variables: [...builtIns, ...custom.map((v) => ({ ...v, reference: `{{${v.key}}}` }))] } });
};
exports.createVariable = async (req,res,next) => { try { const {key,label,category='custom',documentType}=req.body; if(!key||!TYPES[documentType]) return res.status(400).json({success:false,message:'Key and document type are required'}); const variable=await PdfVariable.create({key:key.replace(/^{{|}}$/g,'').trim(),label,category,documentType}); res.status(201).json({success:true,data:{variable}}); } catch(e){next(e);} };
exports.bulkVariables = async (req,res,next) => { try { const {documentType,variables=[]}=req.body; if(!TYPES[documentType]||!Array.isArray(variables)) return res.status(400).json({success:false,message:'Invalid import data'}); let count=0; for(const v of variables){const key=String(v.key||v.name||'').replace(/^{{|}}$/g,'').trim(); if(key){await PdfVariable.updateOne({documentType,key},{$set:{key,label:v.label||v.name||key,category:v.category||'custom',documentType}},{upsert:true});count++;}} res.json({success:true,data:{count}}); } catch(e){next(e);} };

async function loadRecord(type, id) {
  const config = TYPES[type]; if (!config) throw Object.assign(new Error('Invalid document type'), { statusCode: 400 });
  const record = await config.Model.findById(id).populate('customer').populate('vehicle').lean();
  if (!record) throw Object.assign(new Error(`${config.label} not found`), { statusCode: 404 });
  const customer = record.customer || {};
  return { raw: record, data: { document: { ...record, title: config.label, number: record[config.number] }, customer: { ...customer, fullName: [customer.firstName, customer.lastName].filter(Boolean).join(' ') || customer.name || '' }, vehicle: record.vehicle || {} }, name: record[config.number] || id };
}
async function activeTemplate(type) {
  await ensureUsages(); const usage = await PdfUsage.findOne({ documentType: type }).populate('template').lean();
  if (!usage?.template || usage.template.status !== 'active') throw Object.assign(new Error(`No active PDF template assigned for ${TYPES[type]?.label || type}`), { statusCode: 404 });
  return usage.template;
}
exports.downloadOne = async (req, res, next) => {
  try {
    const template = await activeTemplate(req.params.documentType); const record = await loadRecord(req.params.documentType, req.params.id);
    const buffer = await renderPdf(template.designData?.pages || [], record.data, record.name);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${record.name}.pdf"`, 'Content-Length': buffer.length }).send(buffer);
  } catch (error) { next(error); }
};
exports.downloadBulk = async (req, res, next) => {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids : []; if (!ids.length) return res.status(400).json({ success: false, message: 'ids array is required' });
    const template = await activeTemplate(req.params.documentType); const output = new PassThrough(); const chunks = [];
    output.on('data', (chunk) => chunks.push(chunk)); const completed = new Promise((resolve, reject) => { output.on('end', resolve); output.on('error', reject); });
    const archive = archiver('zip', { zlib: { level: 6 } }); archive.pipe(output);
    for (const id of ids) { const record = await loadRecord(req.params.documentType, id); archive.append(await renderPdf(template.designData?.pages || [], record.data, record.name), { name: `${record.name}.pdf` }); }
    await archive.finalize(); await completed; const buffer = Buffer.concat(chunks);
    res.set({ 'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename="${req.params.documentType}-documents.zip"`, 'Content-Length': buffer.length }).send(buffer);
  } catch (error) { next(error); }
};
