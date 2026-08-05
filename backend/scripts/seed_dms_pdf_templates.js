/**
 * Dealer-Pro style PDF templates — the bordered, sectioned layout of the DMS
 * "SALES TAX INVOICE" the dealership already knows, applied to all four sales
 * documents. Vehicles and parts print in their own sections via the
 * `{{#each vehicleItems}}` / `{{#each partItems}}` variables, so a mixed
 * document reads like the source: vehicle block first, then the parts table.
 *
 * Idempotent — matched by (documentType, name) and overwritten.
 *
 *   node scripts/seed_dms_pdf_templates.js          # create/refresh
 *   node scripts/seed_dms_pdf_templates.js --assign # ...and make active
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '..', '.env'), override: false });

const mongoose = require('mongoose');
const { PdfTemplate, PdfUsage } = require('../models');

const ASSIGN = process.argv.includes('--assign');

const CSS = `
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #1e293b; margin: 0; padding: 26px 30px; font-size: 11px; }
  .dms-head { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 6px; }
  .dms-head-left { width: 24%; font-size: 10px; color: #64748b; }
  .dms-head-center { width: 52%; text-align: center; }
  .dms-head-center h1 { margin: 0 0 2px; font-size: 20px; letter-spacing: 0.5px; color: #0f172a; }
  .dms-head-center div { font-size: 10.5px; font-weight: bold; color: #334155; line-height: 1.5; }
  .dms-head-right { width: 24%; text-align: right; font-size: 11px; line-height: 1.7; color: #334155; }
  .dms-title { text-align: center; font-size: 16px; font-weight: bold; letter-spacing: 1px; color: #0f172a; margin: 10px 0 12px; }
  table.grid { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
  table.grid th, table.grid td { border: 1px solid #cbd5e1; padding: 5px 8px; font-size: 10.5px; text-align: left; vertical-align: top; }
  table.grid th { background: #f1f5f9; font-weight: bold; color: #334155; }
  .grid .section-title { background: #e2e8f0; text-align: center; font-weight: bold; font-size: 11px; letter-spacing: 0.5px; }
  .grid .num { text-align: right; }
  .grid .total-row td { font-weight: bold; background: #f8fafc; }
  .billed td { font-size: 10.5px; }
  .billed .k { color: #475569; font-weight: bold; white-space: nowrap; }
  .note-words { display: flex; gap: 12px; margin-bottom: 12px; }
  .note { flex: 1.4; border: 1px solid #cbd5e1; padding: 8px 10px; font-size: 9.5px; color: #475569; font-weight: bold; }
  .words { flex: 1; border: 1px solid #cbd5e1; padding: 8px 10px; font-size: 10px; }
  .words strong { display: block; margin-bottom: 4px; }
  .words .val { text-decoration: underline; font-weight: bold; }
  .bottom { display: flex; gap: 16px; align-items: flex-start; }
  .remarks { flex: 1.2; font-size: 10.5px; }
  .remarks h4 { margin: 0 0 4px; font-size: 11.5px; color: #0f172a; }
  .remarks p { margin: 0 0 10px; color: #475569; white-space: pre-wrap; }
  .summary { flex: 1; border: 1px solid #cbd5e1; border-collapse: collapse; }
  .summary th { border: 1px solid #cbd5e1; background: #f1f5f9; text-align: center; padding: 6px; font-size: 11px; letter-spacing: 1px; }
  .summary td { border: 1px solid #cbd5e1; padding: 5px 9px; font-size: 10.5px; }
  .summary .num { text-align: right; }
  .summary .net td { font-weight: bold; font-size: 12px; background: #f8fafc; }
`;

/** Centered letterhead with the document number block on the right. */
const head = (numberLabel, dateToken) => `
<div class="dms-head">
  <div class="dms-head-left">&nbsp;</div>
  <div class="dms-head-center">
    <h1>{{company.name}}</h1>
    {{#if company.phone}}<div>Tel: {{company.phone}}</div>{{/if}}
    {{#if company.address}}<div>Address: {{company.address}}</div>{{/if}}
    {{#if company.ntn}}<div>NTN Number: {{company.ntn}}</div>{{/if}}
  </div>
  <div class="dms-head-right">
    <div>${numberLabel} : <strong>{{document.number}}</strong></div>
    <div>Date : ${dateToken}</div>
    <div>Status : {{document.status}}</div>
  </div>
</div>`;

/** The three-column "Billed To" grid from the DMS layout. */
const billedTo = (col3) => `
<table class="grid billed">
  <tr>
    <td style="width:44%"><span class="k">Billed To :</span></td>
    <td style="width:28%"><span class="k">Prepared By :</span> {{generator.fullName}}</td>
    <td style="width:28%">${col3[0]}</td>
  </tr>
  <tr>
    <td><span class="k">Customer :</span> {{customer.fullName}}</td>
    <td><span class="k">Contact # :</span> {{customer.phone}}</td>
    <td>${col3[1]}</td>
  </tr>
  <tr>
    <td><span class="k">Address :</span> {{customer.address}} {{customer.city}}</td>
    <td><span class="k">Email :</span> {{customer.email}}</td>
    <td>${col3[2]}</td>
  </tr>
  <tr>
    <td><span class="k">Company :</span> {{customer.companyName}}</td>
    <td><span class="k">Customer # :</span> {{customer.customerCode}}</td>
    <td>${col3[3]}</td>
  </tr>
</table>`;

/** Vehicle lines: their own bordered section, hidden when the document has none. */
const vehiclesSection = `
{{#if vehicleItems.count}}
<table class="grid">
  <tr><td class="section-title" colspan="6">Vehicles</td></tr>
  <tr>
    <th style="width:30px">#</th>
    <th>Vehicle</th>
    <th style="width:150px">Chassis No.</th>
    <th class="num" style="width:40px">Qty</th>
    <th class="num" style="width:100px">Unit Price</th>
    <th class="num" style="width:110px">Amount</th>
  </tr>
  {{#each vehicleItems}}
  <tr>
    <td>{{@number}}</td>
    <td>{{this.description}}</td>
    <td>{{this.code}}</td>
    <td class="num">{{this.quantity}}</td>
    <td class="num">{{this.unitPriceText}}</td>
    <td class="num">{{this.totalPriceText}}</td>
  </tr>
  {{/each}}
  <tr class="total-row"><td colspan="5" class="num">Total Vehicles Rs. :</td><td class="num">{{vehicleItems.subtotalText}}</td></tr>
</table>
{{/if}}`;

/** Part lines: the "Spare Parts & Lubricants" table of the DMS invoice. */
const partsSection = `
{{#if partItems.count}}
<table class="grid">
  <tr><td class="section-title" colspan="7">Spare Parts &amp; Lubricants</td></tr>
  <tr>
    <th style="width:110px">Part #</th>
    <th>Part Name</th>
    <th class="num" style="width:40px">Qty</th>
    <th class="num" style="width:95px">Unit Price</th>
    <th class="num" style="width:85px">Discount</th>
    <th class="num" style="width:85px">Tax</th>
    <th class="num" style="width:105px">Total</th>
  </tr>
  {{#each partItems}}
  <tr>
    <td>{{this.code}}</td>
    <td>{{this.name}}</td>
    <td class="num">{{this.quantity}}</td>
    <td class="num">{{this.unitPriceText}}</td>
    <td class="num">{{this.discountAmountText}}</td>
    <td class="num">{{this.taxAmountText}}</td>
    <td class="num">{{this.totalPriceText}}</td>
  </tr>
  {{/each}}
  <tr class="total-row"><td colspan="6" class="num">Total Spare Parts Rs. :</td><td class="num">{{partItems.subtotalText}}</td></tr>
</table>
{{/if}}`;

/** Amount-in-words beside the standing tax note. */
const wordsBlock = (note) => `
<div class="note-words">
  <div class="note">${note}</div>
  <div class="words">
    <strong>Total amount in words:</strong>
    <span class="val">{{document.totalInWords}}</span>
  </div>
</div>`;

/** The SUMMARY box in the bottom-right corner. */
const summary = (rows) => `
<div class="bottom">
  <div class="remarks">
    {{#if document.notes}}<h4>Notes</h4><p>{{document.notes}}</p>{{/if}}
    {{#if document.termsAndConditions}}<h4>Terms &amp; Conditions</h4><p>{{document.termsAndConditions}}</p>{{/if}}
  </div>
  <table class="summary">
    <tr><th colspan="2">SUMMARY</th></tr>
    {{#if vehicleItems.count}}<tr><td>Total Vehicles</td><td class="num">{{vehicleItems.subtotalText}}</td></tr>{{/if}}
    {{#if partItems.count}}<tr><td>Total Parts</td><td class="num">{{partItems.subtotalText}}</td></tr>{{/if}}
    ${rows}
  </table>
</div>`;

const TEMPLATES = {
  quotation: {
    name: 'DMS Quotation',
    description: 'Dealer-Pro style quotation with separate vehicle and parts sections.',
    html: `${head('Quotation #', '{{document.date}}')}
<div class="dms-title">QUOTATION</div>
${billedTo([
    '<span class="k">Valid Until :</span> {{document.validUntil}}',
    '<span class="k">Validity :</span> {{document.validityDays}} days',
    '<span class="k">Quotation Date :</span> {{document.date}}',
    '&nbsp;',
  ])}
${vehiclesSection}
${partsSection}
${wordsBlock('This is a quotation, not an invoice. Prices hold until the validity date shown. Stock is neither reserved nor consumed by this document.')}
${summary(`
    {{#if document.discountAmount}}<tr><td>Less; Discount</td><td class="num">{{document.discountAmount}}</td></tr>{{/if}}
    {{#if document.taxAmount}}<tr><td>Add; Tax</td><td class="num">{{document.taxAmount}}</td></tr>{{/if}}
    {{#if document.additionalCharges}}<tr><td>Add; Other Charges</td><td class="num">{{document.additionalCharges}}</td></tr>{{/if}}
    <tr class="net"><td>Net Amount</td><td class="num">{{document.totalAmount}}</td></tr>`)}`,
  },

  booking: {
    name: 'DMS Booking',
    description: 'Dealer-Pro style booking confirmation with vehicle/parts sections.',
    html: `${head('Booking #', '{{document.bookingDate}}')}
<div class="dms-title">BOOKING CONFIRMATION</div>
${billedTo([
    '<span class="k">Booking Date :</span> {{document.bookingDate}}',
    '<span class="k">Expected Delivery :</span> {{document.deliveryDate}}',
    '<span class="k">Priority :</span> {{document.priority}}',
    '&nbsp;',
  ])}
${vehiclesSection}
${partsSection}
${wordsBlock('Reserved units are held against this booking. Stock leaves the shelf only when the invoice is raised.')}
${summary(`
    <tr><td>Total Amount</td><td class="num">{{document.totalAmount}}</td></tr>
    <tr><td>Deposit Received</td><td class="num">{{document.bookingAmount}}</td></tr>
    <tr class="net"><td>Balance</td><td class="num">{{document.balanceAmount}}</td></tr>`)}`,
  },

  order: {
    name: 'DMS Sales Order',
    description: 'Dealer-Pro style sales order with vehicle/parts sections.',
    html: `${head('Order #', '{{document.orderDate}}')}
<div class="dms-title">SALES ORDER</div>
${billedTo([
    '<span class="k">Order Date :</span> {{document.orderDate}}',
    '<span class="k">Delivery :</span> {{document.deliveryDate}}',
    '<span class="k">Payment Mode :</span> {{document.paymentMode}}',
    '<span class="k">Sale Person :</span> {{document.salePerson}}',
  ])}
${vehiclesSection}
${partsSection}
${wordsBlock('Goods are billed on the invoice raised against this order. Please quote the order number in all correspondence.')}
${summary(`
    {{#if document.discountAmount}}<tr><td>Less; Discount</td><td class="num">{{document.discountAmount}}</td></tr>{{/if}}
    {{#if document.taxAmount}}<tr><td>Add; Tax</td><td class="num">{{document.taxAmount}}</td></tr>{{/if}}
    <tr><td>Gross Amount</td><td class="num">{{document.totalAmount}}</td></tr>
    <tr><td>Paid</td><td class="num">{{document.paidAmount}}</td></tr>
    <tr class="net"><td>Balance</td><td class="num">{{document.balanceAmount}}</td></tr>`)}`,
  },

  invoice: {
    name: 'DMS Sales Tax Invoice',
    description: 'Dealer-Pro style tax invoice with vehicle/parts sections and amount in words.',
    html: `${head('Invoice #', '{{document.invoiceDate}}')}
<div class="dms-title">SALES TAX INVOICE</div>
${billedTo([
    '<span class="k">Invoice Date :</span> {{document.invoiceDate}}',
    '<span class="k">Due Date :</span> {{document.dueDate}}',
    '<span class="k">Sale Person :</span> {{document.salePerson}}',
    '&nbsp;',
  ])}
${vehiclesSection}
${partsSection}
${wordsBlock('Goods leave stock against this invoice. Sales tax, where applicable, is charged on the retail price exclusive of sales tax.')}
${summary(`
    {{#if document.discountAmount}}<tr><td>Less; Discount</td><td class="num">{{document.discountAmount}}</td></tr>{{/if}}
    {{#if document.taxAmount}}<tr><td>Add; Sales Tax</td><td class="num">{{document.taxAmount}}</td></tr>{{/if}}
    <tr><td>Gross Amount</td><td class="num">{{document.totalAmount}}</td></tr>
    <tr><td>Paid</td><td class="num">{{document.paidAmount}}</td></tr>
    {{#if document.changeDue}}<tr><td>Change Returned</td><td class="num">{{document.changeDue}}</td></tr>{{/if}}
    <tr class="net"><td>Net Balance</td><td class="num">{{document.balanceAmount}}</td></tr>`)}`,
  },
};

(async () => {
  await mongoose.connect(
    process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/amserp',
    { serverSelectionTimeoutMS: 5000, dbName: process.env.MONGO_DB_NAME || undefined },
  );

  for (const [documentType, template] of Object.entries(TEMPLATES)) {
    const saved = await PdfTemplate.findOneAndUpdate(
      { documentType, name: template.name },
      {
        $set: {
          documentType,
          name: template.name,
          description: template.description,
          status: 'active',
          mode: 'html',
          html: template.html,
          css: CSS,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    console.log(`saved ${documentType}: ${saved.name} (${saved._id})`);
    if (ASSIGN) {
      await PdfUsage.findOneAndUpdate(
        { documentType },
        { $set: { documentType, label: template.name, template: saved._id } },
        { upsert: true },
      );
      console.log(`  assigned as active ${documentType} template`);
    }
  }

  await mongoose.disconnect();
})().catch((error) => { console.error(error); process.exit(1); });
