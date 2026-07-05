import React from 'react';
import '../../styles/corp-doc.css';

export function formatPKR(value) {
    const n = parseFloat(value);
    if (Number.isNaN(n)) return '—';
    return `PKR ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function customerLabelById(customerId, customers) {
    if (!customerId || !customers?.length) return '—';
    const c = customers.find((x) => String(x.id) === String(customerId));
    if (!c) return '—';
    return `${c.first_name || ''} ${c.last_name || ''}`.trim() || '—';
}

export function saleTypeQuotationLabel(saleType) {
    const m = {
        vehicle_inventory: 'Vehicle (inventory)',
        vehicle_branding: 'Vehicle (branding)',
        parts: 'Parts & accessories'
    };
    return m[saleType] || saleType || '—';
}

export function resolveQuotationLineItem(formData, selectedItem, { vehicles, vehicleVariants, parts }) {
    if (selectedItem?.item_name) return selectedItem.item_name;
    if (selectedItem?.vehicle_full_name) return selectedItem.vehicle_full_name;
    if (formData.saleType === 'parts') {
        const p = parts.find((x) => String(x.id) === String(formData.partId));
        if (!p) return '—';
        return `${p.name || p.part_name} (${p.part_number}) × ${formData.partQuantity || '1'}`;
    }
    if (formData.saleType === 'vehicle_branding') {
        const vv = vehicleVariants.find((x) => String(x.id) === String(formData.vehicleVariantId));
        if (!vv) return '—';
        return `${(vv.make_name || vv.make || '').toString()} ${(vv.model_name || vv.model || '').toString()} ${(vv.name || vv.variant_name || '').toString()}`.trim();
    }
    const v = vehicles.find((x) => String(x.variant_id || x.id) === String(formData.vehicleVariantId));
    if (!v) return '—';
    return `${v.make_name} ${v.model_name} ${v.variant_name} (${v.color})`;
}

export function resolveBookingVehicleLine(formData, selectedItem, vehicles) {
    if (selectedItem?.item_name) return selectedItem.item_name;
    if (selectedItem?.vehicle_full_name) return selectedItem.vehicle_full_name;
    const v = vehicles.find((x) => String(x.variant_id || x.id) === String(formData.vehicleVariantId));
    if (!v) return '—';
    return `${v.make_name} ${v.model_name} ${v.variant_name} (${v.color})`;
}

export function resolveOrderItemLine(formData, selectedItem, vehicles, parts) {
    if (selectedItem?.item_name) return selectedItem.item_name;
    if (formData.saleType === 'parts') {
        const p = parts.find((x) => String(x.id) === String(formData.partId));
        if (!p) return '—';
        return `${p.name || p.part_name} (${p.part_number}) × ${formData.partQuantity || '1'}`;
    }
    const v = vehicles.find((x) => String(x.id) === String(formData.vehicleId));
    if (!v) return '—';
    return `${v.vin} · ${v.make_name} ${v.model_name} ${v.variant_name} (${v.year}) · ${v.color_name || v.color || ''}`.trim();
}

export function priorityLabel(p) {
    const m = { low: 'Low', normal: 'Normal', high: 'High' };
    return m[p] || p || '—';
}

export function CorpDocTitleBar({ documentTitle, reference }) {
    return (
        <div className="corp-doc__titlebar">
            <h1 className="corp-doc__doctitle">{documentTitle}</h1>
            {reference && <div className="corp-doc__ref">{reference}</div>}
        </div>
    );
}

export function CorpDocSection({ title, children }) {
    return (
        <section className="corp-doc-section">
            <h2 className="corp-doc-section__title">{title}</h2>
            {children}
        </section>
    );
}

export function CorpDocKvTable({ rows }) {
    const list = (rows || []).filter((r) => r && r.label);
    if (!list.length) return null;
    return (
        <table className="corp-doc-table">
            <tbody>
                {list.map((r) => (
                    <tr key={r.label}>
                        <td>{r.label}</td>
                        <td>{r.value === undefined || r.value === '' || r.value === null ? '—' : r.value}</td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
}

export function CorpDocFinancialTable({ rows, totalLabel, totalValue, balanceLabel, balanceValue }) {
    return (
        <table className="corp-doc-table corp-doc-table--financial">
            <tbody>
                {(rows || []).map((r) => (
                    <tr key={r.label}>
                        <td>{r.label}</td>
                        <td>{r.value}</td>
                    </tr>
                ))}
                {totalLabel && (
                    <tr className="corp-doc-table__total">
                        <td>{totalLabel}</td>
                        <td>{totalValue}</td>
                    </tr>
                )}
                {balanceLabel && (
                    <tr className="corp-doc-table__balance">
                        <td>{balanceLabel}</td>
                        <td>{balanceValue}</td>
                    </tr>
                )}
            </tbody>
        </table>
    );
}

export function CorpDocNotes({ title = 'Notes', text }) {
    if (!text || !String(text).trim()) return null;
    return (
        <div className="corp-doc-notes">
            <div className="corp-doc-notes__label">{title}</div>
            <p className="corp-doc-notes__body">{text}</p>
        </div>
    );
}
