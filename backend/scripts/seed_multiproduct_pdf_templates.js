/**
 * HTML-mode PDF templates that print EVERY product on a document.
 *
 * The designer-mode templates place elements at fixed coordinates, so they can
 * only ever show one item. These templates use the `{{#each items}}` block
 * (services/templateLoops.cjs) to repeat a table row per line item, which is
 * what a quotation/booking/order/invoice carrying several vehicles and parts
 * needs.
 *
 * Idempotent — matched by (documentType, name) and overwritten. Assigning them
 * is deliberate and opt-in:
 *
 *   node scripts/seed_multiproduct_pdf_templates.js          # create/refresh
 *   node scripts/seed_multiproduct_pdf_templates.js --assign # ...and make active
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '..', '.env'), override: false });

const mongoose = require('mongoose');
const { PdfTemplate, PdfUsage } = require('../models');

const ASSIGN = process.argv.includes('--assign');

const SHARED_CSS = `
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #0f172a; margin: 0; padding: 34px 38px; font-size: 12px; }
  h1 { font-size: 26px; margin: 0 0 2px; letter-spacing: 0.5px; }
  .head { display: flex; justify-content: space-between; align-items: flex-start;
          border-bottom: 3px solid #0f172a; padding-bottom: 14px; margin-bottom: 18px; }
  .company { font-size: 16px; font-weight: bold; }
  .muted { color: #64748b; font-size: 11px; }
  .meta { text-align: right; font-size: 11px; line-height: 1.7; }
  .panels { display: flex; gap: 18px; margin-bottom: 18px; }
  .panel { flex: 1; border: 1px solid #e2e8f0; border-radius: 6px; padding: 11px 13px; }
  .panel h3 { margin: 0 0 6px; font-size: 11px; text-transform: uppercase;
              letter-spacing: 1px; color: #64748b; }
  table { width: 100%; border-collapse: collapse; }
  .items th { background: #0f172a; color: #fff; padding: 8px; font-size: 11px; text-align: left; }
  .items td { padding: 8px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
  .items tr:nth-child(even) td { background: #f8fafc; }
  .right { text-align: right; } .center { text-align: center; }
  .totals { margin-top: 14px; margin-left: auto; width: 300px; }
  .totals td { padding: 5px 8px; }
  .totals .label { color: #475569; }
  .totals .grand { font-size: 16px; font-weight: bold; border-top: 2px solid #0f172a; }
  .terms { margin-top: 20px; border-top: 1px solid #e2e8f0; padding-top: 12px;
           font-size: 11px; color: #475569; white-space: pre-wrap; }
  .foot { margin-top: 26px; display: flex; justify-content: space-between;
          font-size: 11px; color: #64748b; }
  .chip { display: inline-block; font-size: 9px; font-weight: bold; text-transform: uppercase;
          letter-spacing: 0.5px; padding: 1px 6px; border-radius: 3px;
          background: #e2e8f0; color: #334155; }
`;

/**
 * The products table. `{{#each items}}` repeats the row per line item, so a
 * document with one vehicle and four parts prints five rows.
 */
const ITEMS_TABLE = `
<table class="items">
  <thead>
    <tr>
      <th style="width:30px">#</th>
      <th>Description</th>
      <th class="center" style="width:64px">Type</th>
      <th class="right" style="width:46px">Qty</th>
      <th class="right" style="width:104px">Unit Price</th>
      <th class="right" style="width:116px">Amount</th>
    </tr>
  </thead>
  <tbody>
    {{#each items}}
    <tr>
      <td>{{this.number}}</td>
      <td>
        <strong>{{this.description}}</strong>
        {{#if this.code}}<br><span class="muted">{{this.code}}</span>{{/if}}
      </td>
      <td class="center"><span class="chip">{{this.type}}</span></td>
      <td class="right">{{this.quantity}}</td>
      <td class="right">{{this.unitPriceText}}</td>
      <td class="right">{{this.totalPriceText}}</td>
    </tr>
    {{/each}}
  </tbody>
</table>`;

const headBlock = (title) => `
<div class="head">
  <div>
    <h1>${title}</h1>
    <div class="company">{{company.name}}</div>
  </div>
  <div class="meta">
    <div><strong>{{document.number}}</strong></div>
    <div>Date: {{document.date}}</div>
    <div>Status: {{document.status}}</div>
  </div>
</div>`;

const partiesBlock = (extraTitle, extraRows) => `
<div class="panels">
  <div class="panel">
    <h3>Customer</h3>
    <div><strong>{{customer.fullName}}</strong></div>
    {{#if customer.customerCode}}<div class="muted">{{customer.customerCode}}</div>{{/if}}
    {{#if customer.phone}}<div>{{customer.phone}}</div>{{/if}}
    {{#if customer.email}}<div>{{customer.email}}</div>{{/if}}
    {{#if customer.address}}<div class="muted">{{customer.address}}</div>{{/if}}
  </div>
  <div class="panel">
    <h3>${extraTitle}</h3>
    ${extraRows}
    <div class="muted">{{item.count}} product(s)</div>
  </div>
</div>`;

const totalsBlock = (rows) => `
<table class="totals">
  ${rows}
</table>`;

const footBlock = (note) => `
${'{{#if document.termsAndConditions}}'}<div class="terms"><strong>Terms &amp; Conditions</strong>
{{document.termsAndConditions}}</div>${'{{/if}}'}
${'{{#if document.notes}}'}<div class="terms"><strong>Notes</strong>
{{document.notes}}</div>${'{{/if}}'}
<div class="foot">
  <div>${note}</div>
  <div>{{document.number}}</div>
</div>`;

const TEMPLATES = {
  quotation: {
    name: 'Multi-Product Quotation',
    description: 'Prints every quoted vehicle and part with a per-product table.',
    html: `${headBlock('QUOTATION')}
${partiesBlock('Quotation', `
    <div>Valid until: <strong>{{document.validUntil}}</strong></div>
    <div>Validity: {{document.validityDays}} days</div>
    <div class="muted">Prepared by {{generator.fullName}}</div>`)}
${ITEMS_TABLE}
${totalsBlock(`
  <tr><td class="right label">Subtotal</td><td class="right">{{document.vehiclePrice}}</td></tr>
  {{#if document.discountAmount}}<tr><td class="right label">Discount</td><td class="right">- {{document.discountAmount}}</td></tr>{{/if}}
  {{#if document.taxAmount}}<tr><td class="right label">Tax</td><td class="right">{{document.taxAmount}}</td></tr>{{/if}}
  {{#if document.additionalCharges}}<tr><td class="right label">Additional charges</td><td class="right">{{document.additionalCharges}}</td></tr>{{/if}}
  <tr><td class="right label">Total</td><td class="right grand">{{document.totalAmount}}</td></tr>`)}
${footBlock('This quotation is not an invoice. Prices hold until the validity date shown above.')}`,
  },

  booking: {
    name: 'Multi-Product Booking Confirmation',
    description: 'Confirms every booked vehicle and part, with deposit and balance.',
    html: `${headBlock('BOOKING CONFIRMATION')}
${partiesBlock('Booking', `
    <div>Booking date: <strong>{{document.bookingDate}}</strong></div>
    {{#if document.deliveryDate}}<div>Expected delivery: {{document.deliveryDate}}</div>{{/if}}
    <div class="muted">Priority: {{document.priority}}</div>`)}
${ITEMS_TABLE}
${totalsBlock(`
  <tr><td class="right label">Total</td><td class="right">{{document.totalAmount}}</td></tr>
  <tr><td class="right label">Deposit received</td><td class="right">{{document.bookingAmount}}</td></tr>
  <tr><td class="right label">Balance</td><td class="right grand">{{document.balanceAmount}}</td></tr>`)}
${footBlock('Reserved units are held against this booking. Stock is released only when the invoice is raised.')}`,
  },

  order: {
    name: 'Multi-Product Sales Order',
    description: 'Sales order listing every vehicle and part sold on the order.',
    html: `${headBlock('SALES ORDER')}
${partiesBlock('Order', `
    <div>Order date: <strong>{{document.orderDate}}</strong></div>
    {{#if document.deliveryDate}}<div>Delivery: {{document.deliveryDate}}</div>{{/if}}
    {{#if document.salePerson}}<div class="muted">Sale person: {{document.salePerson}}</div>{{/if}}`)}
${ITEMS_TABLE}
${totalsBlock(`
  <tr><td class="right label">Subtotal</td><td class="right">{{document.subtotal}}</td></tr>
  {{#if document.discountAmount}}<tr><td class="right label">Discount</td><td class="right">- {{document.discountAmount}}</td></tr>{{/if}}
  {{#if document.taxAmount}}<tr><td class="right label">Tax</td><td class="right">{{document.taxAmount}}</td></tr>{{/if}}
  <tr><td class="right label">Total</td><td class="right">{{document.totalAmount}}</td></tr>
  <tr><td class="right label">Paid</td><td class="right">{{document.paidAmount}}</td></tr>
  <tr><td class="right label">Balance</td><td class="right grand">{{document.balanceAmount}}</td></tr>`)}
${footBlock('Thank you for your business.')}`,
  },

  invoice: {
    name: 'Multi-Product Tax Invoice',
    description: 'Tax invoice itemising every vehicle and part, plus change returned.',
    html: `${headBlock('TAX INVOICE')}
${partiesBlock('Invoice', `
    <div>Invoice date: <strong>{{document.invoiceDate}}</strong></div>
    {{#if document.dueDate}}<div>Due: {{document.dueDate}}</div>{{/if}}
    {{#if document.salePerson}}<div class="muted">Sale person: {{document.salePerson}}</div>{{/if}}`)}
${ITEMS_TABLE}
${totalsBlock(`
  <tr><td class="right label">Subtotal</td><td class="right">{{document.subtotal}}</td></tr>
  {{#if document.discountAmount}}<tr><td class="right label">Discount</td><td class="right">- {{document.discountAmount}}</td></tr>{{/if}}
  {{#if document.taxAmount}}<tr><td class="right label">Tax</td><td class="right">{{document.taxAmount}}</td></tr>{{/if}}
  <tr><td class="right label">Total</td><td class="right grand">{{document.totalAmount}}</td></tr>
  <tr><td class="right label">Paid</td><td class="right">{{document.paidAmount}}</td></tr>
  {{#if document.amountTendered}}<tr><td class="right label">Cash tendered</td><td class="right">{{document.amountTendered}}</td></tr>{{/if}}
  {{#if document.changeDue}}<tr><td class="right label">Change returned</td><td class="right">{{document.changeDue}}</td></tr>{{/if}}
  <tr><td class="right label">Balance</td><td class="right">{{document.balanceAmount}}</td></tr>`)}
${footBlock('Goods leave stock against this invoice.')}`,
  },
};

(async () => {
  await mongoose.connect(
    process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/amserp',
    { serverSelectionTimeoutMS: 5000 },
  );

  for (const [documentType, template] of Object.entries(TEMPLATES)) {
    const saved = await PdfTemplate.findOneAndUpdate(
      { documentType, name: template.name },
      {
        $set: {
          mode: 'html',
          html: template.html,
          css: SHARED_CSS,
          status: 'active',
          description: template.description,
          designData: { pages: [{ config: { format: 'A4', width: 794, height: 1123 }, elements: [] }] },
        },
      },
      { returnDocument: 'after', upsert: true },
    );
    const rows = (template.html.match(/\{\{#each/g) || []).length;
    console.log(`✓ ${template.name} (${documentType}) — ${rows} product loop(s), ${template.html.length} chars`);

    if (ASSIGN) {
      await PdfUsage.updateOne(
        { documentType },
        { $set: { template: saved._id, label: template.name } },
        { upsert: true },
      );
      console.log(`  → assigned as the active ${documentType} template`);
    }
  }

  if (!ASSIGN) {
    console.log('\nTemplates created but NOT assigned. Re-run with --assign to make them active,');
    console.log('or pick them in PDF Management → Usages.');
  }

  await mongoose.disconnect();
  console.log('\nSeed complete.\n');
})().catch((error) => { console.error('SEED_FAIL', error); process.exit(1); });
