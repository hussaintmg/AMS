/**
 * Seeds/refreshes the built-in "Professional" PDF templates for each document
 * type with a polished, variable-driven design, plus a draft "All Variables
 * Test" template that exercises every variable and element kind.
 *
 * Idempotent: matches templates by (documentType, name) and overwrites their
 * designData. Run with:  node scripts/seedPdfTemplates.cjs
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const { PdfTemplate, PdfUsage } = require('../models');
const { variableCatalog } = require('../services/pdfData.service');

const uid = () => Math.random().toString(36).slice(2, 10);
const css = (obj) => Object.entries(obj).map(([property, value]) => ({ property, value: String(value) }));

// Element helpers ----------------------------------------------------------
const T = (text, style) => ({ id: uid(), type: 'text', text, css: css(style) });
const RECT = (style) => ({ id: uid(), type: 'rectangle', css: css(style) });
const LINE = (style) => ({ id: uid(), type: 'line', css: css(style) });
const QR = (value, style) => ({ id: uid(), type: 'qr', qrValue: value, css: css(style) });

const NAVY = '#0f172a';
const ACCENT = '#2563eb';
const MUTED = '#64748b';
const LIGHT = '#f1f5f9';

// Shared header used by every professional template.
function header(title, accent = ACCENT) {
  return [
    RECT({ left: '0px', top: '0px', width: '794px', height: '104px', 'background-color': NAVY }),
    RECT({ left: '0px', top: '104px', width: '794px', height: '5px', 'background-color': accent }),
    T('{{company.name}}', { left: '48px', top: '30px', width: '430px', 'font-size': '24px', 'font-weight': 'bold', color: '#ffffff', 'font-family': 'Georgia, serif' }),
    T(title, { left: '48px', top: '66px', width: '430px', 'font-size': '13px', 'font-weight': '600', color: '#93c5fd', 'letter-spacing': '2px' }),
    QR('{{document.number}}', { left: '676px', top: '22px', width: '62px', height: '62px' }),
    T('{{document.number}}', { left: '430px', top: '30px', width: '232px', 'font-size': '13px', 'font-weight': 'bold', color: '#ffffff', 'text-align': 'right' }),
    T('Date: {{document.date}}', { left: '430px', top: '54px', width: '232px', 'font-size': '11px', color: '#cbd5e1', 'text-align': 'right' }),
    T('Status: {{document.status}}', { left: '430px', top: '72px', width: '232px', 'font-size': '11px', color: '#cbd5e1', 'text-align': 'right' }),
  ];
}

// Customer "Bill To" block (starts at top=132).
function billTo() {
  return [
    T('BILL TO', { left: '48px', top: '132px', width: '300px', 'font-size': '10px', 'font-weight': 'bold', color: MUTED, 'letter-spacing': '1px' }),
    T('{{customer.fullName}}', { left: '48px', top: '150px', width: '360px', 'font-size': '15px', 'font-weight': '700', color: NAVY }),
    T('{{customer.companyName}}', { left: '48px', top: '173px', width: '360px', 'font-size': '12px', color: '#334155' }),
    T('{{customer.address}}, {{customer.city}}', { left: '48px', top: '191px', width: '360px', 'font-size': '11px', color: '#475569' }),
    T('{{customer.phone}}  •  {{customer.email}}', { left: '48px', top: '209px', width: '400px', 'font-size': '11px', color: '#475569' }),
    T('Customer #: {{customer.customerCode}}', { left: '48px', top: '227px', width: '360px', 'font-size': '11px', color: '#475569' }),
  ];
}

// A right-aligned amount summary card. rows = [[label, token], ...]; last row is emphasised total.
function summaryCard(top, rows, totalRow) {
  const cardX = 452, cardW = 294, rowH = 26;
  const els = [
    RECT({ left: `${cardX}px`, top: `${top}px`, width: `${cardW}px`, height: `${rows.length * rowH + 44}px`, 'background-color': LIGHT, border: '1px solid #e2e8f0', 'border-radius': '10px' }),
  ];
  rows.forEach(([label, token], i) => {
    const y = top + 14 + i * rowH;
    els.push(T(label, { left: `${cardX + 18}px`, top: `${y}px`, width: '150px', 'font-size': '11px', color: MUTED }));
    els.push(T(token, { left: `${cardX + 120}px`, top: `${y}px`, width: `${cardW - 138}px`, 'font-size': '11px', 'font-weight': '600', color: '#334155', 'text-align': 'right' }));
  });
  const ty = top + 14 + rows.length * rowH + 4;
  els.push(LINE({ left: `${cardX + 16}px`, top: `${ty}px`, width: `${cardW - 32}px`, height: '1px', 'background-color': '#cbd5e1' }));
  els.push(T(totalRow[0], { left: `${cardX + 18}px`, top: `${ty + 8}px`, width: '120px', 'font-size': '13px', 'font-weight': 'bold', color: NAVY }));
  els.push(T(totalRow[1], { left: `${cardX + 120}px`, top: `${ty + 6}px`, width: `${cardW - 138}px`, 'font-size': '14px', 'font-weight': 'bold', color: ACCENT, 'text-align': 'right' }));
  return els;
}

// Item / vehicle detail block on the left (top=280).
function detailBlock(rows) {
  const els = [
    T('DETAILS', { left: '48px', top: '280px', width: '300px', 'font-size': '10px', 'font-weight': 'bold', color: MUTED, 'letter-spacing': '1px' }),
    LINE({ left: '48px', top: '298px', width: '360px', height: '1px', 'background-color': '#e2e8f0' }),
  ];
  rows.forEach(([label, token], i) => {
    const y = 310 + i * 24;
    els.push(T(label, { left: '48px', top: `${y}px`, width: '120px', 'font-size': '11px', color: MUTED }));
    els.push(T(token, { left: '168px', top: `${y}px`, width: '240px', 'font-size': '11px', 'font-weight': '600', color: '#334155' }));
  });
  return els;
}

function footer() {
  return [
    LINE({ left: '48px', top: '1000px', width: '698px', height: '1px', 'background-color': '#e2e8f0' }),
    T('Prepared by {{generator.fullName}}', { left: '48px', top: '1014px', width: '400px', 'font-size': '11px', color: MUTED }),
    T('{{generator.email}}', { left: '48px', top: '1032px', width: '400px', 'font-size': '11px', color: MUTED }),
    T('This is a computer-generated document.', { left: '346px', top: '1032px', width: '400px', 'font-size': '10px', color: '#94a3b8', 'text-align': 'right' }),
    T('{{document.notes}}', { left: '48px', top: '1058px', width: '698px', 'font-size': '10px', color: '#94a3b8', 'font-style': 'italic' }),
  ];
}

const page = (elements) => ({
  config: { format: 'A4', width: 794, height: 1123, backgroundColor: '#ffffff' },
  backgroundImage: '', bgSize: 'cover', bgPosition: 'center center', elements,
});

// Per-type designs ---------------------------------------------------------
const DESIGNS = {
  quotation: () => page([
    ...header('QUOTATION', '#2563eb'),
    ...billTo(),
    ...detailBlock([
      ['Item', '{{item.name}}'],
      ['Vehicle', '{{vehicle.name}}'],
      ['Valid until', '{{document.validUntil}}'],
      ['Validity', '{{document.validityDays}} days'],
    ]),
    ...summaryCard(280, [
      ['Vehicle price', '{{document.vehiclePrice}}'],
      ['Discount', '{{document.discountAmount}}'],
      ['Tax', '{{document.taxAmount}}'],
      ['Additional', '{{document.additionalCharges}}'],
    ], ['TOTAL', '{{document.totalAmount}}']),
    ...footer(),
  ]),
  booking: () => page([
    ...header('BOOKING CONFIRMATION', '#7c3aed'),
    ...billTo(),
    ...detailBlock([
      ['Item', '{{item.name}}'],
      ['Vehicle', '{{vehicle.name}}'],
      ['Booking date', '{{document.bookingDate}}'],
      ['Delivery date', '{{document.deliveryDate}}'],
      ['Priority', '{{document.priority}}'],
    ]),
    ...summaryCard(280, [
      ['Booking amount', '{{document.bookingAmount}}'],
      ['Tax', '{{document.taxAmount}}'],
    ], ['TOTAL', '{{document.totalAmount}}']),
    ...footer(),
  ]),
  order: () => page([
    ...header('SALES ORDER', '#0891b2'),
    ...billTo(),
    ...detailBlock([
      ['Item', '{{item.name}}'],
      ['Vehicle', '{{vehicle.name}}'],
      ['Order date', '{{document.orderDate}}'],
      ['Payment mode', '{{document.paymentMode}}'],
    ]),
    ...summaryCard(280, [
      ['Subtotal', '{{document.subtotal}}'],
      ['Discount', '{{document.discountAmount}}'],
      ['Tax', '{{document.taxAmount}}'],
      ['Paid', '{{document.paidAmount}}'],
      ['Balance', '{{document.balanceAmount}}'],
    ], ['TOTAL', '{{document.totalAmount}}']),
    ...footer(),
  ]),
  invoice: () => page([
    ...header('TAX INVOICE', '#dc2626'),
    ...billTo(),
    ...detailBlock([
      ['Item', '{{item.name}}'],
      ['Invoice date', '{{document.invoiceDate}}'],
      ['Due date', '{{document.dueDate}}'],
    ]),
    ...summaryCard(280, [
      ['Subtotal', '{{document.subtotal}}'],
      ['Discount', '{{document.discountAmount}}'],
      ['Tax', '{{document.taxAmount}}'],
      ['Paid', '{{document.paidAmount}}'],
      ['Balance due', '{{document.balanceAmount}}'],
    ], ['TOTAL', '{{document.totalAmount}}']),
    ...footer(),
  ]),
};

// "All variables" test template ------------------------------------------
function allVarsDesign(type) {
  const vars = variableCatalog(type);
  const els = [
    RECT({ left: '0px', top: '0px', width: '794px', height: '92px', 'background-color': NAVY }),
    T('ALL VARIABLES TEST — {{document.title}}', { left: '40px', top: '30px', width: '520px', 'font-size': '22px', 'font-weight': 'bold', color: '#ffffff', 'font-family': 'Georgia, serif' }),
    QR('REF:{{document.number}}', { left: '676px', top: '16px', width: '60px', height: '60px' }),
    LINE({ left: '40px', top: '112px', width: '714px', height: '2px', 'background-color': '#f59e0b' }),
    T('Every variable + shapes, line, QR, image and CSS. Generated {{document.date}}.', { left: '40px', top: '124px', width: '714px', 'font-size': '11px', color: MUTED, 'font-style': 'italic' }),
  ];
  vars.forEach((v, i) => {
    els.push(T(`${v.label}: {{${v.key}}}`, {
      left: `${40 + (i % 2) * 372}px`, top: `${162 + Math.floor(i / 2) * 24}px`,
      width: '360px', 'font-size': '10.5px', color: i % 2 ? '#334155' : NAVY,
    }));
  });
  const boxTop = 162 + Math.ceil(vars.length / 2) * 24 + 12;
  els.push(RECT({ left: '40px', top: `${boxTop}px`, width: '714px', height: '58px', 'background-color': LIGHT, border: '1px solid #cbd5e1', 'border-radius': '8px' }));
  els.push(T('Prepared by {{generator.fullName}}  —  TOTAL {{document.totalAmount}}', { left: '58px', top: `${boxTop + 20}px`, width: '680px', 'font-size': '13px', 'font-weight': '600', color: NAVY }));
  return page(els);
}

(async () => {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/amserp', { serverSelectionTimeoutMS: 5000 });

  const names = { quotation: 'Professional Quotation', booking: 'Professional Booking Confirmation', order: 'Professional Sales Order', invoice: 'Professional Tax Invoice' };

  for (const [type, name] of Object.entries(names)) {
    const designData = { pages: [DESIGNS[type]()] };
    const res = await PdfTemplate.findOneAndUpdate(
      { documentType: type, name },
      { $set: { designData, mode: 'designer', status: 'active', description: `Auto-generated ${name.toLowerCase()} layout.` } },
      { new: true, upsert: true },
    );
    const els = res.designData.pages[0].elements.length;
    console.log(`✓ ${name} (${type}) — ${els} elements`);
    // Ensure it is the assigned usage.
    await PdfUsage.updateOne({ documentType: type }, { $set: { template: res._id, label: res.name } }, { upsert: true });
  }

  // All-variables test template (draft, not assigned) for quotation.
  const test = await PdfTemplate.findOneAndUpdate(
    { documentType: 'quotation', name: 'All Variables Test' },
    { $set: { designData: { pages: [allVarsDesign('quotation')] }, mode: 'designer', status: 'draft', description: 'Temporary template exercising every variable, CSS, shapes, line and QR.' } },
    { new: true, upsert: true },
  );
  console.log(`✓ All Variables Test (quotation) — ${test.designData.pages[0].elements.length} elements [draft]`);

  await mongoose.disconnect();
  console.log('\nSeed complete.');
})().catch((e) => { console.error('SEED_FAIL', e); process.exit(1); });
