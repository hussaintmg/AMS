import React from 'react';

/**
 * Letterhead block for printed sales documents (quotation, booking, order).
 * Data comes from ERP Settings → Companies (active company).
 */
function CorporatePrintHeader({ company, documentType }) {
    if (!company) {
        return (
            <div className="corporate-print-letterhead">
                {documentType && <div className="corporate-print-letterhead__doc-type">{documentType}</div>}
                <div className="corporate-print-letterhead__name">AMS — Auto Management System</div>
                <div className="corporate-print-letterhead__muted">Configure company details in ERP Settings → Companies for letterhead.</div>
            </div>
        );
    }

    const addrParts = [
        company.address,
        [company.city, company.state].filter(Boolean).join(', '),
        [company.postal_code, company.country].filter(Boolean).join(' ')
    ].filter(Boolean);

    const contactLine = [company.phone, company.email, company.website].filter(Boolean).join(' · ');

    return (
        <div className="corporate-print-letterhead">
            {documentType && <div className="corporate-print-letterhead__doc-type">{documentType}</div>}
            <div className="corporate-print-letterhead__row">
                <div>
                    <div className="corporate-print-letterhead__name">{company.company_name}</div>
                    {company.legal_name && company.legal_name !== company.company_name && (
                        <div className="corporate-print-letterhead__legal">{company.legal_name}</div>
                    )}
                    {company.company_code && (
                        <div className="corporate-print-letterhead__code">Company code: {company.company_code}</div>
                    )}
                </div>
            </div>
            {addrParts.length > 0 && (
                <div className="corporate-print-letterhead__address">{addrParts.join(' · ')}</div>
            )}
            {contactLine && <div className="corporate-print-letterhead__contact">{contactLine}</div>}
            <div className="corporate-print-letterhead__ids">
                {company.tax_id && <span>NTN / Tax ID: {company.tax_id}</span>}
                {company.registration_number && (
                    <span>{company.tax_id ? ' · ' : ''}Registration: {company.registration_number}</span>
                )}
            </div>
        </div>
    );
}

export function SalesDocumentMeta({ rows }) {
    if (!rows?.length) return null;
    return (
        <div className="sales-print-meta">
            {rows.map((r) => (
                <div key={r.label} className="sales-print-meta__row">
                    <span className="sales-print-meta__label">{r.label}</span>
                    <span className="sales-print-meta__value">{r.value ?? '—'}</span>
                </div>
            ))}
        </div>
    );
}

export default CorporatePrintHeader;
