import {
    formatPKR,
    customerLabelById,
    saleTypeQuotationLabel,
    resolveQuotationLineItem,
    resolveBookingVehicleLine,
    resolveOrderItemLine,
    priorityLabel
} from '../components/sales/CorporateDocumentView';

/** Escape text embedded inside HTML templates */
export function escHtml(s) {
    if (s == null || s === '') return '';
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

export function mapCompanyForTemplate(c) {
    if (!c) {
        return {
            company_name: '',
            company_code: '',
            legal_name: '',
            email: '',
            phone: '',
            website: '',
            address: '',
            city: '',
            state: '',
            country: '',
            postal_code: '',
            tax_id: '',
            registration_number: '',
            address_line: '',
            contact_line: ''
        };
    }
    const address_line = [
        c.address,
        [c.city, c.state].filter(Boolean).join(', '),
        [c.postal_code, c.country].filter(Boolean).join(' ')
    ].filter(Boolean).join(' · ');
    const contact_line = [c.phone, c.email, c.website].filter(Boolean).join(' · ');
    return {
        company_name: c.company_name || '',
        company_code: c.company_code || '',
        legal_name: c.legal_name || '',
        email: c.email || '',
        phone: c.phone || '',
        website: c.website || '',
        address: c.address || '',
        city: c.city || '',
        state: c.state || '',
        country: c.country || '',
        postal_code: c.postal_code || '',
        tax_id: c.tax_id || '',
        registration_number: c.registration_number || '',
        address_line,
        contact_line
    };
}

export function interpolateDocumentTemplate(html, context) {
    if (!html) return '';
    return html.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, path) => {
        const parts = path.split('.');
        let cur = context;
        for (const p of parts) {
            if (cur == null) return '—';
            cur = cur[p];
        }
        if (cur == null || cur === '') return '—';
        return String(cur);
    });
}

export function calculateOrderGrandTotalFromForm(formData) {
    const price = parseFloat(formData.vehiclePrice) || 0;
    const accessories = parseFloat(formData.accessoriesTotal) || 0;
    const discount = parseFloat(formData.discountAmount) || 0;
    const tax = parseFloat(formData.taxAmount) || 0;
    const registration = parseFloat(formData.registrationCharges) || 0;
    const insurance = parseFloat(formData.insuranceCharges) || 0;
    const other = parseFloat(formData.otherCharges) || 0;
    const exchange = parseFloat(formData.exchangeValue) || 0;
    return price + accessories - discount + tax + registration + insurance + other - exchange;
}

export function buildQuotationTemplateContext({
    companyInfo, selectedItem, formData, customers, vehicles, vehicleVariants, parts
}) {
    const company = mapCompanyForTemplate(companyInfo);
    const desc = resolveQuotationLineItem(formData, selectedItem, { vehicles, vehicleVariants, parts });
    const base = parseFloat(formData.vehiclePrice) || 0;
    const disc = parseFloat(formData.discountAmount) || 0;
    const tax = parseFloat(formData.taxAmount) || 0;
    const add = parseFloat(formData.additionalCharges) || 0;
    const computed = base - disc + tax + add;
    const totalNum = selectedItem?.total_amount != null && !Number.isNaN(Number(selectedItem.total_amount))
        ? Number(selectedItem.total_amount)
        : computed;
    const doc = {
        quotation_number: selectedItem?.quotation_number || '—',
        issue_date: selectedItem?.created_at ? new Date(selectedItem.created_at).toLocaleString() : '—',
        status: selectedItem?.status ? String(selectedItem.status).toUpperCase() : '—',
        printed_at: new Date().toLocaleString(),
        customer_name: escHtml(selectedItem?.customer_name || customerLabelById(formData.customerId, customers)),
        validity: formData.validityDays ? `${formData.validityDays} days` : '—',
        sale_type_label: escHtml(saleTypeQuotationLabel(formData.saleType)),
        base_price: formatPKR(base),
        discount: formatPKR(disc),
        tax: formatPKR(tax),
        additional_charges: formatPKR(add),
        total: formatPKR(totalNum),
        notes: escHtml(formData.notes || ''),
        terms: escHtml(formData.termsAndConditions || ''),
        items_rows: `<tr><td>1</td><td>${escHtml(desc)}</td><td>${escHtml(saleTypeQuotationLabel(formData.saleType))}</td></tr>`
    };
    return { company, doc };
}

export function buildBookingTemplateContext({
    companyInfo, selectedItem, formData, customers, vehicles
}) {
    const company = mapCompanyForTemplate(companyInfo);
    const doc = {
        booking_number: selectedItem?.booking_number || '—',
        printed_at: new Date().toLocaleString(),
        customer_name: escHtml(selectedItem?.customer_name || customerLabelById(formData.customerId, customers)),
        vehicle_line: escHtml(resolveBookingVehicleLine(formData, selectedItem, vehicles)),
        booking_amount: formatPKR(formData.bookingAmount),
        total_amount: formatPKR(formData.totalAmount),
        expected_delivery: formData.expectedDeliveryDate
            ? new Date(`${formData.expectedDeliveryDate}T12:00:00`).toLocaleDateString(undefined, { dateStyle: 'long' })
            : '—',
        priority: escHtml(priorityLabel(formData.priority)),
        status: selectedItem?.status ? String(selectedItem.status).toUpperCase() : '—',
        notes: escHtml(formData.notes || '')
    };
    return { company, doc };
}

export function buildOrderTemplateContext({
    companyInfo, selectedItem, formData, customers, vehicles, parts
}) {
    const company = mapCompanyForTemplate(companyInfo);
    const grand = calculateOrderGrandTotalFromForm(formData);
    const paid = parseFloat(formData.paidAmount) || 0;
    const desc = resolveOrderItemLine(formData, selectedItem, vehicles, parts);
    const priceRows = [];
    const pushRow = (label, val) => {
        priceRows.push(`<tr><td>${escHtml(label)}</td><td style="text-align:right;">${escHtml(val)}</td></tr>`);
    };
    if (formData.saleType === 'vehicle') {
        pushRow('Vehicle price', formatPKR(formData.vehiclePrice));
    } else {
        pushRow('Line total', formatPKR(formData.vehiclePrice));
    }
    pushRow('Accessories', formatPKR(formData.accessoriesTotal));
    pushRow('Discount', formatPKR(formData.discountAmount));
    pushRow('Tax / levies', formatPKR(formData.taxAmount));
    pushRow('Registration', formatPKR(formData.registrationCharges));
    pushRow('Insurance', formatPKR(formData.insuranceCharges));
    pushRow('Other charges', formatPKR(formData.otherCharges));
    if (parseFloat(formData.exchangeValue) > 0) {
        pushRow('Trade-in (deducted)', `− ${formatPKR(formData.exchangeValue)}`);
    }
    const doc = {
        order_number: selectedItem?.order_number || '—',
        invoice_number: selectedItem?.invoice_number || '—',
        printed_at: new Date().toLocaleString(),
        customer_name: escHtml(selectedItem?.customer_name || customerLabelById(formData.customerId, customers)),
        sale_type_label: formData.saleType === 'parts' ? 'Parts & accessories' : 'Vehicle sale',
        description: escHtml(desc),
        expected_delivery: formData.expectedDeliveryDate
            ? new Date(`${formData.expectedDeliveryDate}T12:00:00`).toLocaleDateString(undefined, { dateStyle: 'long' })
            : '—',
        payment_mode: escHtml(formData.paymentMode || ''),
        status: selectedItem?.status ? String(selectedItem.status).toUpperCase() : '—',
        price_rows: priceRows.join(''),
        grand_total: formatPKR(grand),
        paid_amount: formatPKR(paid),
        balance_due: formatPKR(grand - paid),
        notes: escHtml(formData.notes || '')
    };
    return { company, doc };
}

export function buildInvoiceTemplateContext({ companyInfo, invoiceDetails }) {
    const company = mapCompanyForTemplate(companyInfo);
    const inv = invoiceDetails || {};
    const itemsRows = (inv.items || []).map((item, i) => (
        `<tr>
            <td>${escHtml(item.description)}</td>
            <td style="text-align:right;">${escHtml(String(item.quantity ?? ''))}</td>
            <td style="text-align:right;">PKR ${Number(item.unit_price || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
            <td style="text-align:right;">PKR ${Number(item.tax_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
            <td style="text-align:right;">PKR ${Number(item.total || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        </tr>`
    )).join('');
    const paymentsRows = (inv.payments || []).length
        ? (inv.payments || []).map((p) => (
            `<tr><td>${escHtml(p.payment_method_name || 'Payment')}</td><td>${escHtml(new Date(p.payment_date).toLocaleDateString())}</td><td style="text-align:right;">PKR ${Number(p.amount || 0).toLocaleString()}</td></tr>`
        )).join('')
        : '<tr><td colspan="3">—</td></tr>';
    const doc = {
        letterhead_name: escHtml(inv.company_name || company.company_name || '—'),
        letterhead_address: escHtml(inv.company_address || company.address_line || ''),
        letterhead_contact: escHtml([inv.company_phone || company.phone, inv.company_email || company.email].filter(Boolean).join(' · ')),
        letterhead_ntn: escHtml(inv.company_ntn || company.tax_id || '—'),
        invoice_number: escHtml(inv.invoice_number || '—'),
        status: inv.status ? String(inv.status).toUpperCase() : '—',
        customer_name: escHtml(inv.customer_name || '—'),
        customer_address: escHtml(inv.customer_address || ''),
        customer_phone: escHtml(inv.customer_phone || ''),
        customer_email: escHtml(inv.customer_email || ''),
        invoice_date: inv.invoice_date ? new Date(inv.invoice_date).toLocaleDateString() : '—',
        due_date: inv.due_date ? new Date(inv.due_date).toLocaleDateString() : '—',
        order_number: escHtml(inv.order_number || '—'),
        items_rows: itemsRows || '<tr><td colspan="5">—</td></tr>',
        subtotal: `PKR ${Number(inv.subtotal || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        discount: inv.discount_amount > 0
            ? `− PKR ${Number(inv.discount_amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
            : 'PKR 0.00',
        tax: `PKR ${Number(inv.tax_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        total: `PKR ${Number(inv.total_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        balance: `PKR ${Number(inv.balance_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        notes: escHtml(inv.notes || ''),
        terms: escHtml(inv.terms_and_conditions || ''),
        payments_rows: paymentsRows
    };
    return { company, doc };
}

export function renderSalesTemplate(kind, templateHtml, ctx) {
    if (!templateHtml?.trim()) return '';
    let data = { company: {}, doc: {} };
    if (kind === 'quotation') data = buildQuotationTemplateContext(ctx);
    else if (kind === 'booking') data = buildBookingTemplateContext(ctx);
    else if (kind === 'order') data = buildOrderTemplateContext(ctx);
    else if (kind === 'invoice') data = buildInvoiceTemplateContext(ctx);
    return interpolateDocumentTemplate(templateHtml, data);
}
