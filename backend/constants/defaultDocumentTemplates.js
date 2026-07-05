/**
 * Factory HTML for sales document printing. Placeholders: {{company.*}} and {{doc.*}}.
 * Lists: {{doc.items_rows}} (raw HTML <tr>...</tr>), {{doc.payments_rows}} for invoices.
 * Seeded when document_templates is empty.
 */

const sharedPrintCss = `
<style>
  .ams-doc { font-family: Inter, system-ui, -apple-system, Segoe UI, sans-serif; color: #111827; font-size: 11pt; line-height: 1.45; max-width: 800px; margin: 0 auto; }
  .ams-doc h1 { font-size: 22pt; margin: 0; letter-spacing: 0.06em; color: #1e3a5f; }
  .ams-doc .muted { color: #6b7280; font-size: 9pt; }
  .ams-doc .bar { border-bottom: 2px solid #1e3a5f; margin: 10px 0 16px; }
  .ams-doc table.data { width: 100%; border-collapse: collapse; margin: 12px 0; }
  .ams-doc table.data th, .ams-doc table.data td { border: 1px solid #e5e7eb; padding: 8px 10px; text-align: left; }
  .ams-doc table.data th { background: #f3f4f6; font-size: 9pt; text-transform: uppercase; letter-spacing: 0.04em; color: #4b5563; }
  .ams-doc .tot { width: 280px; margin-left: auto; margin-top: 12px; }
  .ams-doc .tot td { border: none; padding: 4px 0; }
  .ams-doc .tot .sum { font-weight: 700; font-size: 12pt; color: #1e40af; }
  .ams-doc .grid2 { display: table; width: 100%; margin: 14px 0; }
  .ams-doc .grid2 > div { display: table-cell; width: 50%; vertical-align: top; padding-right: 12px; }
  .ams-doc .label { font-size: 8pt; text-transform: uppercase; letter-spacing: 0.08em; color: #9ca3af; margin-bottom: 4px; }
</style>
`;

const quotation = `
${sharedPrintCss}
<div class="ams-doc">
  <div style="display:flex;justify-content:space-between;align-items:flex-start;">
    <div>
      <div class="label">From</div>
      <strong style="font-size:13pt;">{{company.company_name}}</strong>
      <div class="muted">{{company.address_line}}</div>
      <div class="muted">{{company.contact_line}}</div>
      <div class="muted">Code: {{company.company_code}} · NTN: {{company.tax_id}}</div>
    </div>
    <div style="text-align:right;">
      <h1>QUOTATION</h1>
      <div><strong>{{doc.quotation_number}}</strong></div>
      <div class="muted">Printed {{doc.printed_at}}</div>
    </div>
  </div>
  <div class="bar"></div>
  <div class="grid2">
    <div>
      <div class="label">Customer</div>
      <div><strong>{{doc.customer_name}}</strong></div>
    </div>
    <div>
      <div class="label">Meta</div>
      <div class="muted">Issue: {{doc.issue_date}}</div>
      <div class="muted">Status: {{doc.status}}</div>
      <div class="muted">Validity: {{doc.validity}}</div>
    </div>
  </div>
  <div class="label">Line</div>
  <table class="data">
    <thead><tr><th>#</th><th>Description</th><th>Sale type</th></tr></thead>
    <tbody>{{doc.items_rows}}</tbody>
  </table>
  <table class="tot">
    <tr><td>Base price</td><td style="text-align:right;">{{doc.base_price}}</td></tr>
    <tr><td>Discount</td><td style="text-align:right;">{{doc.discount}}</td></tr>
    <tr><td>Tax / levies</td><td style="text-align:right;">{{doc.tax}}</td></tr>
    <tr><td>Additional charges</td><td style="text-align:right;">{{doc.additional_charges}}</td></tr>
    <tr><td class="sum">Total</td><td style="text-align:right;" class="sum">{{doc.total}}</td></tr>
  </table>
  <div style="margin-top:18px;">
    <div class="label">Notes</div>
    <div>{{doc.notes}}</div>
  </div>
  <div style="margin-top:12px;">
    <div class="label">Terms &amp; conditions</div>
    <div class="muted" style="white-space:pre-wrap;">{{doc.terms}}</div>
  </div>
</div>
`;

const booking = `
${sharedPrintCss}
<div class="ams-doc">
  <div style="display:flex;justify-content:space-between;">
    <div>
      <div class="label">Dealer</div>
      <strong style="font-size:13pt;">{{company.company_name}}</strong>
      <div class="muted">{{company.address_line}}</div>
      <div class="muted">{{company.contact_line}}</div>
    </div>
    <div style="text-align:right;">
      <h1>BOOKING</h1>
      <div><strong>{{doc.booking_number}}</strong></div>
      <div class="muted">Printed {{doc.printed_at}}</div>
    </div>
  </div>
  <div class="bar"></div>
  <table class="data">
    <tbody>
      <tr><th>Customer</th><td>{{doc.customer_name}}</td></tr>
      <tr><th>Vehicle</th><td>{{doc.vehicle_line}}</td></tr>
      <tr><th>Booking deposit</th><td>{{doc.booking_amount}}</td></tr>
      <tr><th>Order value (est.)</th><td>{{doc.total_amount}}</td></tr>
      <tr><th>Expected delivery</th><td>{{doc.expected_delivery}}</td></tr>
      <tr><th>Priority</th><td>{{doc.priority}}</td></tr>
      <tr><th>Status</th><td>{{doc.status}}</td></tr>
    </tbody>
  </table>
  <div class="label">Notes</div>
  <div style="white-space:pre-wrap;">{{doc.notes}}</div>
</div>
`;

const order = `
${sharedPrintCss}
<div class="ams-doc">
  <div style="display:flex;justify-content:space-between;">
    <div>
      <div class="label">Seller</div>
      <strong style="font-size:13pt;">{{company.company_name}}</strong>
      <div class="muted">{{company.address_line}}</div>
      <div class="muted">{{company.contact_line}}</div>
      <div class="muted">Reg: {{company.registration_number}} · NTN: {{company.tax_id}}</div>
    </div>
    <div style="text-align:right;">
      <h1>SALES ORDER</h1>
      <div><strong>{{doc.order_number}}</strong></div>
      <div class="muted">Invoice ref: {{doc.invoice_number}}</div>
      <div class="muted">Printed {{doc.printed_at}}</div>
    </div>
  </div>
  <div class="bar"></div>
  <table class="data">
    <tbody>
      <tr><th>Customer</th><td>{{doc.customer_name}}</td></tr>
      <tr><th>Sale type</th><td>{{doc.sale_type_label}}</td></tr>
      <tr><th>Description</th><td>{{doc.description}}</td></tr>
      <tr><th>Expected delivery</th><td>{{doc.expected_delivery}}</td></tr>
      <tr><th>Payment mode</th><td>{{doc.payment_mode}}</td></tr>
      <tr><th>Status</th><td>{{doc.status}}</td></tr>
    </tbody>
  </table>
  <div class="label">Pricing</div>
  <table class="data"><thead><tr><th>Item</th><th style="text-align:right;">Amount</th></tr></thead>
    <tbody>{{doc.price_rows}}</tbody>
  </table>
  <table class="tot">
    <tr><td>Grand total</td><td style="text-align:right;" class="sum">{{doc.grand_total}}</td></tr>
    <tr><td>Collected to date</td><td style="text-align:right;">{{doc.paid_amount}}</td></tr>
    <tr><td>Balance due</td><td style="text-align:right;font-weight:600;color:#b91c1c;">{{doc.balance_due}}</td></tr>
  </table>
  <div class="label" style="margin-top:14px;">Notes</div>
  <div style="white-space:pre-wrap;">{{doc.notes}}</div>
</div>
`;

const invoice = `
${sharedPrintCss}
<div class="ams-doc">
  <div style="display:flex;justify-content:space-between;align-items:flex-start;">
    <div>
      <strong style="font-size:14pt;">{{doc.letterhead_name}}</strong>
      <div class="muted">{{doc.letterhead_address}}</div>
      <div class="muted">{{doc.letterhead_contact}}</div>
      <div class="muted">NTN: {{doc.letterhead_ntn}}</div>
    </div>
    <div style="text-align:right;">
      <h1>INVOICE</h1>
      <div style="font-size:13pt;font-weight:600;"># {{doc.invoice_number}}</div>
      <div class="muted">Status: {{doc.status}}</div>
    </div>
  </div>
  <div class="bar"></div>
  <div class="grid2">
    <div>
      <div class="label">Bill to</div>
      <strong>{{doc.customer_name}}</strong>
      <div class="muted" style="white-space:pre-wrap;">{{doc.customer_address}}</div>
      <div class="muted">{{doc.customer_phone}} · {{doc.customer_email}}</div>
    </div>
    <div style="text-align:right;">
      <div class="muted">Invoice date: <strong style="color:#111">{{doc.invoice_date}}</strong></div>
      <div class="muted">Due date: <strong style="color:#111">{{doc.due_date}}</strong></div>
      <div class="muted">Reference: {{doc.order_number}}</div>
    </div>
  </div>
  <table class="data">
    <thead><tr><th>Description</th><th style="text-align:right;">Qty</th><th style="text-align:right;">Price</th><th style="text-align:right;">Tax</th><th style="text-align:right;">Amount</th></tr></thead>
    <tbody>{{doc.items_rows}}</tbody>
  </table>
  <table class="tot">
    <tr><td>Subtotal</td><td style="text-align:right;">{{doc.subtotal}}</td></tr>
    <tr><td>Discount</td><td style="text-align:right;">{{doc.discount}}</td></tr>
    <tr><td>Tax</td><td style="text-align:right;">{{doc.tax}}</td></tr>
    <tr><td class="sum">Total</td><td style="text-align:right;" class="sum">{{doc.total}}</td></tr>
    <tr><td>Amount due</td><td style="text-align:right;font-weight:700;color:#b91c1c;">{{doc.balance}}</td></tr>
  </table>
  <div class="grid2" style="margin-top:18px;">
    <div>
      <div class="label">Notes</div>
      <div class="muted" style="white-space:pre-wrap;">{{doc.notes}}</div>
      <div class="label" style="margin-top:10px;">Terms</div>
      <div class="muted" style="white-space:pre-wrap;font-size:9pt;">{{doc.terms}}</div>
    </div>
    <div>
      <div class="label">Payments</div>
      <table class="data"><tbody>{{doc.payments_rows}}</tbody></table>
    </div>
  </div>
</div>
`;

module.exports = {
    quotation: quotation.trim(),
    booking: booking.trim(),
    order: order.trim(),
    invoice: invoice.trim()
};
