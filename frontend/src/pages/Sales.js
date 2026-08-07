/**
 * Sales Management Page
 * Professional Corporate UI for Quotations, Bookings, Sales Orders and Invoices
 * Maintained by Hussain Developer
 * hussaintmerng@gmail.com | +92 319 1634446
 * AMS ERP
 * Date: 2026-01-09
 */

import React, { useState, useEffect, useCallback } from 'react';
import SearchableSelect from '../components/SearchableSelect';
import { Routes, Route, useNavigate, useSearchParams } from 'react-router-dom';
import { salesAPI, invoiceAPI, partsSalesAPI, partsInvoiceAPI, customerAPI, vehicleAPI, partsAPI, serviceMasterAPI, paymentMethodsAPI, erpSettingsAPI, reportsAPI, adminAPI, pdfManagementAPI } from '../services/api';
import toast from 'react-hot-toast';
import LineItemsEditor from '../components/sales/LineItemsEditor';
import ActionButtons from '../components/ActionButtons';
import ConfirmModal from '../components/ConfirmModal';
import CustomerQuickCreate from '../components/customers/CustomerQuickCreate';
import { useAuth } from '../context/AuthContext';
import { Send, DollarSign, FileText, Truck, Eye, Pencil, Trash2, Upload, X, Download, Mail, CheckCircle, ScanLine, UserRound } from 'lucide-react';
import BulkUploadModal from '../components/BulkUploadModal';
import ServerPagination from '../components/ServerPagination';

import SalesFilterBar from '../components/sales/SalesFilterBar';
import SalesDrawer from '../components/sales/SalesDrawer';
import CorporatePrintHeader, { SalesDocumentMeta } from '../components/sales/CorporatePrintHeader';
import {
    CorpDocTitleBar,
    CorpDocSection,
    CorpDocKvTable,
    CorpDocFinancialTable,
    CorpDocNotes,
    formatPKR,
    customerLabelById,
    saleTypeQuotationLabel,
    resolveQuotationLineItem,
    resolveBookingVehicleLine,
    resolveOrderItemLine,
    priorityLabel
} from '../components/sales/CorporateDocumentView';
import { printSalesModal } from '../utils/printSalesModal';
import { renderSalesTemplate } from '../utils/documentTemplateRender';
import { useSalesHtmlTemplate } from '../hooks/useSalesHtmlTemplate';
import { useSalesDocumentPrintHtml } from '../hooks/useSalesDocumentPrintHtml';
import useErpDocumentSettings from '../hooks/useErpDocumentSettings';
import RenderedHtmlDocumentTemplate from '../components/sales/RenderedHtmlDocumentTemplate';
import ProductCell from '../components/sales/ProductCell';
import '../styles/sales-print.css';
import '../styles/userManagement.css';
import { getRoleJob, canRoleDo } from '../utils/roleJobs';

const policyAllows = (user, resource, action, legacy) => getRoleJob(user, resource) ? canRoleDo(user, resource, action) : legacy;

// ═══════════════════════════════════════════════════════════════════════════
// VEHICLE vs PARTS
// ═══════════════════════════════════════════════════════════════════════════
//
// These screens serve both sides of the business. The category comes from the
// URL (/vehicles/… or /parts/…) and decides three things: which API namespace
// every call goes to, what the product picker will accept, and which of the
// vehicle-only extras are shown at all.
//
// The parts documents are younger than the vehicle ones and do not yet have
// bulk actions, document email, printed estimates, dispatch or delivery. Rather
// than render buttons that would 404, each capability is declared here and the
// UI asks before drawing.

const CATEGORY = {
    vehicle: {
        key: 'vehicle',
        label: 'Vehicle',
        basePath: '/vehicle-sales',
        sales: salesAPI,
        invoices: invoiceAPI,
        can: {
            bulk: true, email: true, estimate: true, deliver: true, pdf: true,
            allocate: true, generateInvoice: true, editOrder: true, editInvoice: true,
        },
    },
    parts: {
        key: 'parts',
        label: 'Parts',
        basePath: '/parts-sales',
        sales: partsSalesAPI,
        invoices: partsInvoiceAPI,
        // Email, PDF and estimates deliberately run on the vehicle documents'
        // own templates — one template per document type, shared by both sides.
        // Only the genuinely vehicle-shaped steps stay off: a parts order is
        // invoiced the moment it is created (that is what moves stock), so
        // there is nothing to invoice later, nothing to edit afterwards, and no
        // dispatch or delivery stage.
        can: {
            bulk: true, email: true, estimate: true, pdf: true,
            deliver: false, allocate: false, generateInvoice: false,
            editOrder: false, editInvoice: false,
        },
    },
};

const categoryConfig = (category) => CATEGORY[category] || CATEGORY.vehicle;

/**
 * Only this side's product lines. Documents created before the vehicle/parts
 * split can carry both kinds; a parts line has no business showing on a
 * vehicle screen (or the other way round), in the listings or in an edit form.
 */
const categoryLines = (items, categoryKey) =>
    (Array.isArray(items) ? items : []).filter((line) =>
        categoryKey === 'parts'
            ? (line.item_type || line.itemType) === 'part'
            : (line.item_type || line.itemType) !== 'part');

/**
 * Customer picker with a walk-in switch.
 *
 * A walk-in sale still books against one shared "Walk-in Customer" record so
 * the ledger and outstanding balances keep working, and the name/phone typed
 * here ride on the document itself — which is what gets printed. The customer
 * dropdown is hidden while walk-in is on so the two cannot disagree.
 */
function CustomerField({ formData, onChange, customers, onCustomerCreated, required = true }) {
    const walkIn = formData.walkIn === true;
    // handleChange in each screen reads event.target, so the toggle is reported
    // in the same shape a real checkbox would send.
    const setWalkIn = (checked) =>
        onChange({ target: { name: 'walkIn', value: checked, type: 'checkbox', checked } });

    return (
        <>
            <label className="form-label-add">
                <span>{walkIn ? 'Walk-in customer' : 'Customer *'}</span>
                <span className="walkin-toggle">
                    <label>
                        <input type="checkbox" checked={walkIn} onChange={(e) => setWalkIn(e.target.checked)} />
                        <UserRound size={13} /> Walk-in
                    </label>
                    {!walkIn && <CustomerQuickCreate onCreated={onCustomerCreated} />}
                </span>
            </label>
            {walkIn ? (
                <div className="form-row walkin-fields">
                    <input
                        type="text"
                        name="walkInName"
                        value={formData.walkInName || ''}
                        onChange={onChange}
                        placeholder="Buyer's name (optional)"
                    />
                    <input
                        type="text"
                        name="walkInPhone"
                        value={formData.walkInPhone || ''}
                        onChange={onChange}
                        placeholder="Phone (optional)"
                    />
                </div>
            ) : (
                <SearchableSelect name="customerId" value={formData.customerId} onChange={onChange} required={required}>
                    <option value="">Select Customer</option>
                    {customers.map((c) => <option key={c.id} value={c.id}>{customerOptionLabel(c)}</option>)}
                </SearchableSelect>
            )}
        </>
    );
}

/**
 * "Scan" button that hands the counter screen the document the user is already
 * looking at, so a scan started from Quotations creates a quotation.
 */
function ScanLink({ config, doc }) {
    return (
        <a
            className="btn btn-secondary"
            href={`${config.basePath}/barcode-scan?doc=${doc}`}
            title={`Scan ${config.label.toLowerCase()} barcodes into a new ${doc}`}
        >
            <ScanLine size={16} /> Scan
        </a>
    );
}

// Debounce hook
function useDebounce(value, delay) {
    const [debouncedValue, setDebouncedValue] = useState(value);
    useEffect(() => {
        const handler = setTimeout(() => { setDebouncedValue(value); }, delay);
        return () => clearTimeout(handler);
    }, [value, delay]);
    return debouncedValue;
}

// Status Collections are the Mongo-backed options system used by the rest of
// the ERP.  Keep a legacy fallback only until an administrator has configured
// the relevant Sales collection.
function useSalesStatusOptions(collectionKey, fallback) {
    const [options, setOptions] = useState(fallback);
    useEffect(() => {
        let active = true;
        adminAPI.getStatusesByTable(collectionKey)
            .then((res) => {
                const statuses = res.data?.data?.statuses || [];
                if (!active || !statuses.length) return;
                setOptions(statuses.map((item) => ({
                    value: item.status_code || item.value || item.name,
                    label: item.status_name || item.label || item.display_name || item.name,
                })).filter((item) => item.value && item.label));
            })
            .catch(() => { /* the fallback remains available */ });
        return () => { active = false; };
    }, [collectionKey]);
    return options;
}

/** Print open sales document modal via isolated iframe (reliable in Chrome). */
function runSalesPrint() {
    printSalesModal();
}

async function downloadSalesPdf(documentType, id, filename) {
    try {
        const response = await pdfManagementAPI.download(documentType, id);
        const url = URL.createObjectURL(response.data);
        const link = document.createElement('a'); link.href = url; link.download = `${filename || documentType}.pdf`;
        document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
    } catch (error) {
        // The request asks for a blob, so a server error arrives as a Blob too —
        // read it back to surface the real message instead of a generic one.
        let message = error.response?.data?.message;
        if (!message && error.response?.data instanceof Blob) {
            try { message = JSON.parse(await error.response.data.text())?.message; } catch { /* not JSON */ }
        }
        toast.error(message || 'PDF download failed');
    }
}

async function downloadSalesPdfBulk(documentType, rows) {
    if (!rows.length) return toast.error('No records to download');
    try {
        const response = await pdfManagementAPI.downloadBulk(documentType, rows.map((row) => row.id));
        const url = URL.createObjectURL(response.data); const link = document.createElement('a');
        link.href = url; link.download = `${documentType}-documents.zip`; document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
    } catch (error) { toast.error(error.response?.data?.message || 'Bulk PDF download failed'); }
}

function BulkSalesActions({type,config,selectedRows,onClear,onRefresh,canEmail,canPdf,canDelete}){
 const [busy,setBusy]=useState('');if(!selectedRows.length)return null;const ids=selectedRows.map(row=>row.id);
 // Bulk PDF goes through pdfManagementAPI, which resolves an id against both
 // the vehicle and the parts collection and renders it with the same template.
 const run=async operation=>{if(operation==='delete'&&!window.confirm(`Cancel/delete ${ids.length} selected records?`))return;setBusy(operation);try{const apiCall=type==='quotation'?config.sales.bulkQuotations:type==='booking'?config.sales.bulkBookings:type==='order'?config.sales.bulkOrders:config.invoices.bulk;const res=await apiCall(operation,ids);toast.success(res.data?.message||'Bulk action completed');onClear();if(operation==='delete')await onRefresh();}catch(e){toast.error(e.response?.data?.message||'Bulk action failed')}finally{setBusy('')}};
 return <div className="sales-bulk-toolbar"><strong>{ids.length} selected</strong>{canEmail&&<button disabled={!!busy} onClick={()=>run('email')}><Send size={16}/>{busy==='email'?'Sending...':'Send email'}</button>}{canPdf&&<button disabled={!!busy} onClick={()=>downloadSalesPdfBulk(type,selectedRows)}><Download size={16}/>Download PDFs</button>}{canDelete&&<button className="danger" disabled={!!busy} onClick={()=>run('delete')}><Trash2 size={16}/>{busy==='delete'?'Deleting...':'Delete'}</button>}<button onClick={onClear}><X size={16}/>Deselect</button></div>
}

/** Active company from ERP Settings for printed letterhead on quotations / bookings / orders */
function useCompanyLetterhead() {
    const [companyInfo, setCompanyInfo] = useState(null);
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await erpSettingsAPI.getCompanies({ active: true });
                const list = res.data?.data || [];
                if (!cancelled && list.length > 0) setCompanyInfo(list[0]);
            } catch (err) {
                console.error('Company letterhead fetch failed:', err);
            }
        })();
        return () => { cancelled = true; };
    }, []);
    return companyInfo;
}

function customerOptionLabel(customer) {
    if (!customer) return '';
    const customerNo = customer.customer_number ? `${customer.customer_number} - ` : '';
    const name = `${customer.first_name || ''} ${customer.last_name || ''}`.trim();
    const phone = customer.phone ? ` - ${customer.phone}` : '';
    return `${customerNo}${name}${phone}`.trim();
}

async function fetchAllCustomersForDropdown() {
    // Prefer dedicated non-paginated endpoint for form dropdown stability.
    const allCustomersRes = await customerAPI.getAllForDropdown();
    const allCustomers = allCustomersRes?.data?.data || [];

    // Keep stable unique customer entries by id.
    const seen = new Set();
    return allCustomers.filter((customer) => {
        if (!customer?.id || seen.has(customer.id)) return false;
        seen.add(customer.id);
        return true;
    });
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN SALES COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

function Sales({ section, category = 'vehicle' }) {
    const sections = {
        quotations: <Quotations category={category} />,
        booking: <Bookings category={category} />,
        orders: <SalesOrders category={category} />,
        invoices: <Invoices category={category} />
    };
    return (
        <div className="sales-page-root">
            {section ? sections[section] : <Routes>
                <Route path="quotations" element={<Quotations category={category} />} />
                <Route path="bookings" element={<Bookings category={category} />} />
                <Route path="orders" element={<SalesOrders category={category} />} />
                <Route path="invoices" element={<Invoices category={category} />} />
                <Route path="*" element={<Quotations category={category} />} />
            </Routes>}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// QUOTATIONS COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

function Quotations({ category = 'vehicle' }) {
    const config = categoryConfig(category);
    const docApi = config.sales;
    const isParts = config.key === 'parts';
    const { user } = useAuth();
    const companyInfo = useCompanyLetterhead();
    const { currency, salesTax, taxAmount: calculateConfiguredTax } = useErpDocumentSettings();
    const [searchParams] = useSearchParams();
    const urlSearch = searchParams.get('search') || '';
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [modalMode, setModalMode] = useState('create');
    const [selectedItem, setSelectedItem] = useState(null);
    const [selectedIds,setSelectedIds]=useState([]);
    const [sendingEmail, setSendingEmail] = useState(null);
    // What the printed / downloaded quotation looks like. The ERP-Settings HTML
    // template below is only reached if the server document cannot be built.
    const { documentHtml, documentLoading } = useSalesDocumentPrintHtml(
        'quotation',
        selectedItem?.id,
        showModal && modalMode === 'view'
    );
    const { templateHtml, templateLoading } = useSalesHtmlTemplate(
        'quotation',
        companyInfo?.id,
        showModal && modalMode === 'view'
    );
    const viewLoading = documentLoading || templateLoading;

    // Dropdowns
    const [customers, setCustomers] = useState([]);
    const [vehicles, setVehicles] = useState([]);
    const [vehicleVariants, setVehicleVariants] = useState([]);
    const [parts, setParts] = useState([]);
    const [paymentMethods, setPaymentMethods] = useState([]);

    // A quotation may quote any mix of vehicles and parts; lineItems is the
    // source of truth and vehiclePrice below is only the derived subtotal.
    const [lineItems, setLineItems] = useState([]);
    const [formData, setFormData] = useState({
        customerId: '', walkIn: false, walkInName: '', walkInPhone: '', vehiclePrice: '', discountAmount: '0',
        taxAmount: '0', additionalCharges: '0', validityDays: '7', notes: '', termsAndConditions: ''
    });

    // Filters & Pagination
    const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 });
    const [filters, setFilters] = useState({
        search: urlSearch, status: '', customerId: '',
        dateFrom: '', dateTo: '',
        sortBy: 'created_at', sortOrder: 'desc'
    });
    const debouncedSearch = useDebounce(filters.search, 300);

    const canCreate = policyAllows(user, 'quotations', 'create', ['super_admin','admin','sales_manager','sales_executive'].includes(user?.role));
    const canEdit = policyAllows(user, 'quotations', 'edit', ['super_admin','admin','sales_manager'].includes(user?.role));
    const canDelete = policyAllows(user, 'quotations', 'delete', canEdit);
    // Parts documents have no email templates or PDF templates of their own yet,
    // so those actions are declared unavailable rather than rendered and failing.
    const canSendEmail = config.can.email && policyAllows(user, 'quotations', 'sendEmail', canCreate);
    const canDownloadPdf = config.can.pdf && policyAllows(user, 'quotations', 'downloadPdf', true);
    const canEstimate = config.can.estimate && canDownloadPdf;

    // Detail drawer
    const [drawerItem, setDrawerItem] = useState(null);
    const [drawerLoading, setDrawerLoading] = useState(false);
    const [savingStatus, setSavingStatus] = useState(false);

    const loadDrawer = useCallback(async (id) => {
        setDrawerLoading(true);
        try {
            const res = await docApi.getQuotation(id);
            setDrawerItem(res.data?.data || null);
        } catch (error) {
            toast.error('Failed to load quotation details');
            setDrawerItem(null);
        } finally {
            setDrawerLoading(false);
        }
    }, []);

    const openDrawer = (row) => { setDrawerItem({ id: row.id }); loadDrawer(row.id); };

    const handleDrawerStatus = async (status) => {
        if (!drawerItem?.id) return;
        setSavingStatus(true);
        try {
            await docApi.updateQuotationStatus(drawerItem.id, status);
            toast.success('Status updated');
            await Promise.all([loadDrawer(drawerItem.id), fetchData()]);
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to update status');
        } finally {
            setSavingStatus(false);
        }
    };

    // Status options for Quotations
    const statusOptions = useSalesStatusOptions('quotations', [
        { label: 'Draft', value: 'draft' },
        { label: 'Sent', value: 'sent' },
        { label: 'Pending', value: 'pending' },
        { label: 'Accepted', value: 'accepted' },
        { label: 'Rejected', value: 'rejected' },
        { label: 'Converted', value: 'converted' },
        { label: 'Expired', value: 'expired' }
    ]);

    const fetchData = useCallback(async () => {
        try {
            setLoading(true);
            const params = {
                ...filters,
                search: debouncedSearch,
                page: pagination.page,
                limit: pagination.limit
            };
            // Remove empty
            Object.keys(params).forEach(k => (params[k] === '' || params[k] === null) && delete params[k]);

            const res = await docApi.getQuotations(params); // Passed params
            setData(res.data?.data || []);
            setPagination(prev => ({
                ...prev,
                total: res.data?.pagination?.total || 0,
                totalPages: res.data?.pagination?.totalPages || 0
            }));
        } catch (error) {
            console.error('Error fetching quotations:', error);
            setData([]);
        } finally {
            setLoading(false);
        }
    }, [debouncedSearch, filters.status, filters.customerId, filters.dateFrom, filters.dateTo, filters.sortBy, filters.sortOrder, pagination.page, pagination.limit]);

    const fetchDropdowns = useCallback(async () => {
        try {
            const results = await Promise.allSettled([
                fetchAllCustomersForDropdown(),
                vehicleAPI.getAll({ limit: 200 }),
                vehicleAPI.getVariants(),
                partsAPI.getAll({ limit: 200 }),
                paymentMethodsAPI.getAll({ status: 'active' })
            ]);

            setCustomers(results[0].status === 'fulfilled' ? results[0].value || [] : []);
            setVehicles(results[1].status === 'fulfilled' && results[1].value?.data?.data?.vehicles ? results[1].value?.data?.data?.vehicles : []);
            const variants = results[2].status === 'fulfilled' ? (results[2].value?.data?.data || []) : [];
            setVehicleVariants(variants);
            setParts(results[3].status === 'fulfilled' && results[3].value?.data?.data?.parts ? results[3].value.data.data.parts : []);
            setPaymentMethods(results[4].status === 'fulfilled' ? results[4].value?.data?.data || [] : []);
        } catch (error) {
            console.error('Error fetching dropdowns:', error);
        }
    }, []);

    useEffect(() => { fetchDropdowns(); }, [fetchDropdowns]);
    useEffect(() => { fetchData(); }, [fetchData]);
    useEffect(() => { if (searchParams.get('action') === 'create') openModal('create'); }, []);

    // Rule 2 — refresh dropdown and auto-select the customer created inline
    const handleCustomerCreated = useCallback(async (created) => {
        try { setCustomers(await fetchAllCustomersForDropdown()); } catch (_) { /* dropdown refresh best-effort */ }
        const newId = created?._id || created?.id;
        if (newId) setFormData(prev => ({ ...prev, customerId: String(newId) }));
    }, []);

    const handleFilterChange = (key, value) => {
        setFilters(prev => ({ ...prev, [key]: value }));
        if (key !== 'sortBy' && key !== 'sortOrder') setPagination(prev => ({ ...prev, page: 1 }));
    };

    const clearFilters = () => {
        setFilters({ search: '', status: '', customerId: '', dateFrom: '', dateTo: '', sortBy: 'created_at', sortOrder: 'desc' });
        setPagination(prev => ({ ...prev, page: 1 }));
    };

    const openModal = (mode, item = null) => {
        setModalMode(mode);
        setSelectedItem(item);
        if (item) {
            setLineItems(categoryLines(item.line_items, config.key).map((line, index) => ({
                key: `saved-${index}`,
                itemType: line.item_type === 'part' ? 'part' : 'vehicle',
                vehicleId: line.vehicle_id || '',
                vehicleVariantId: line.vehicle_variant_id || '',
                partId: line.part_id || '',
                quantity: line.quantity || 1,
                unitPrice: line.unit_price ?? '',
                discountAmount: line.discount_amount || 0,
                taxAmount: line.tax_amount || 0,
                description: line.description || '',
            })));
            setFormData({
                customerId: item.customer_id || '',
                walkIn: item.walk_in === true,
                walkInName: item.walk_in_name || '',
                walkInPhone: item.walk_in_phone || '',
                vehiclePrice: item.vehicle_price || '',
                discountAmount: item.discount_amount || '0',
                taxAmount: item.tax_amount || '0',
                additionalCharges: item.additional_charges || '0',
                validityDays: item.validity_days || '7',
                notes: item.notes || '',
                termsAndConditions: item.terms_and_conditions || ''
            });
        } else {
            setLineItems([]);
            setFormData({
                customerId: '', walkIn: false, walkInName: '', walkInPhone: '', vehiclePrice: '', discountAmount: '0',
                taxAmount: '0', additionalCharges: '0', validityDays: '7', notes: '', termsAndConditions: ''
            });
        }
        setShowModal(true);
    };

    const closeModal = () => { setShowModal(false); setSelectedItem(null); };

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData({ ...formData, [name]: value });
    };

    // Document subtotal always follows the products; nobody retypes it.
    const lineSubtotal = lineItems.reduce(
        (sum, line) => sum + (Number(line.unitPrice) || 0) * (Number(line.quantity) || 1),
        0,
    );

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            if (!lineItems.length) {
                toast.error(isParts ? 'Add at least one part' : 'Add at least one vehicle');
                return;
            }
            const missing = lineItems.find((line) => (line.itemType === 'part' ? !line.partId : (!line.vehicleId && !line.vehicleVariantId)));
            if (missing) {
                toast.error('Every product line needs a product selected');
                return;
            }
            const baseAmount = Math.max(0, lineSubtotal - Number(formData.discountAmount || 0));
            const payload = {
                ...formData,
                vehiclePrice: lineSubtotal,
                lineItems: lineItems.map((line) => ({
                    itemType: line.itemType,
                    vehicleId: line.vehicleId || undefined,
                    vehicleVariantId: line.vehicleVariantId || undefined,
                    partId: line.partId || undefined,
                    quantity: Number(line.quantity) || 1,
                    unitPrice: Number(line.unitPrice) || 0,
                    discountAmount: Number(line.discountAmount) || 0,
                    taxAmount: Number(line.taxAmount) || 0,
                    description: line.description || undefined,
                })),
                taxAmount: Number(formData.taxAmount) > 0 || !salesTax
                    ? Number(formData.taxAmount || 0)
                    : calculateConfiguredTax(baseAmount, salesTax)
            };
            if (modalMode === 'create') {
                await docApi.createQuotation(payload);
                toast.success('Quotation created successfully');
            } else if (modalMode === 'edit') {
                await docApi.updateQuotation(selectedItem.id, payload);
                toast.success('Quotation updated successfully');
            }
            closeModal();
            fetchData();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Operation failed');
        }
    };

    const [confirmModal, setConfirmModal] = useState({ isOpen: false, title: '', message: '', onConfirm: null });
    const [conversionForm, setConversionForm] = useState(null);
    const [converting, setConverting] = useState(false);

    const handleDeleteClick = (id) => {
        setConfirmModal({
            isOpen: true,
            title: 'Delete Quotation',
            message: 'Are you sure you want to delete this quotation?',
            type: 'danger',
            onConfirm: () => handleDelete(id)
        });
    };

    const handleDelete = async (id) => {
        try {
            await docApi.deleteQuotation(id);
            toast.success('Quotation deleted');
            setConfirmModal({ isOpen: false });
            fetchData();
        } catch (error) {
            toast.error('Failed to delete quotation');
        }
    };

    const canApprove = policyAllows(user, 'quotations', 'approve', ['super_admin','admin','sales_manager'].includes(user?.role));
    const [approvingId, setApprovingId] = useState(null);
    const [estimateId, setEstimateId] = useState(null);

    /** Approve (or reject) — an unapproved quotation cannot become a booking. */
    const handleApprove = async (item, decision = 'approved') => {
        setApprovingId(item.id);
        try {
            await docApi.approveQuotation(item.id, decision);
            toast.success(`Quotation ${decision}`);
            fetchData();
        } catch (error) {
            toast.error(error.response?.data?.message || `Could not ${decision === 'approved' ? 'approve' : 'reject'} the quotation`);
        } finally {
            setApprovingId(null);
        }
    };

    /** Estimate PDF: every product on the quotation, in one document. */
    const handleDownloadEstimate = async (item) => {
        setEstimateId(item.id);
        try {
            const res = await docApi.downloadEstimate(item.id);
            const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
            const link = document.createElement('a');
            link.href = url;
            link.download = `Estimate-${item.quotation_number}.pdf`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
            toast.success('Estimate downloaded');
        } catch (error) {
            toast.error(error.response?.data?.message || 'Could not build the estimate');
        } finally {
            setEstimateId(null);
        }
    };

    /** Email the estimate with the PDF attached and every product itemised. */
    const handleEmailEstimate = async (item) => {
        setEstimateId(item.id);
        try {
            const res = await docApi.emailEstimate(item.id);
            toast.success(res?.data?.message || 'Estimate emailed');
            fetchData();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Could not email the estimate');
        } finally {
            setEstimateId(null);
        }
    };

    const handleConvertClick = (item) => {
        if (isParts) {
            // Parts convert straight to an invoice. The approved quotation is
            // the price the customer agreed to, so nothing is re-priced here —
            // the modal only asks how the counter was paid.
            setConversionForm({ item, paymentMethodId: '', paidAmount: '' });
            return;
        }
        setConversionForm({
            item,
            vehicleId: '',
            bookingAmount: String(Number(item.total_amount || 0) * 0.1),
            expectedDeliveryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        });
    };

    const handleConvertConfirm = async (event) => {
        event.preventDefault();
        if (!conversionForm?.item) return;
        if (!isParts && !conversionForm.vehicleId) {
            toast.error('Select the actual inventory Vehicle for this Booking.');
            return;
        }
        if (isParts && !conversionForm.paymentMethodId) {
            toast.error('Select how this sale was paid.');
            return;
        }
        setConverting(true);
        try {
            if (isParts) {
                const res = await docApi.convertQuotation(conversionForm.item.id, {
                    paymentMethodId: conversionForm.paymentMethodId,
                    paidAmount: Number(conversionForm.paidAmount) || 0,
                });
                toast.success(`Invoice ${res?.data?.data?.invoiceNumber || ''} created — stock updated`);
            } else {
                await docApi.convertQuotation(conversionForm.item.id, {
                    vehicleId: conversionForm.vehicleId || undefined,
                    bookingAmount: Number(conversionForm.bookingAmount),
                    expectedDeliveryDate: conversionForm.expectedDeliveryDate,
                });
                toast.success('Converted to Booking');
            }
            setConversionForm(null);
            fetchData();
            fetchDropdowns();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Conversion failed');
        } finally {
            setConverting(false);
        }
    };

    const handleSendEmail = async (item) => {
        setSendingEmail(item.id);
        try {
            await docApi.sendQuotationEmail(item.id);
            toast.success(`Quotation emailed to ${item.customer_name}`);
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to email quotation');
        } finally {
            setSendingEmail(null);
        }
    };

    const getStatusBadge = (status) => {
        const colors = { draft: 'secondary', sent: 'info', accepted: 'success', rejected: 'danger', converted: 'primary', expired: 'warning' };
        return <span className={`badge badge-${colors[status] || 'secondary'}`}>{status.toUpperCase()}</span>;
    };

    if (loading) return <div className="spinner"></div>;

    return (
        <div className="card sales-page">
            <ConfirmModal {...confirmModal} loading={sendingEmail} onCancel={() => setConfirmModal({ ...confirmModal, isOpen: false })} />
            {conversionForm && isParts && (() => {
                // Nothing on the quotation is editable here: it was approved at
                // these prices, so the invoice bills exactly that. The lines are
                // shown for confirmation only.
                const partLines = (conversionForm.item.line_items || []).filter((line) => line.part_id);
                const convTotal = Number(conversionForm.item.total_amount) || partLines.reduce(
                    (sum, line) => sum + (Number(line.unit_price) || 0) * (Number(line.quantity) || 1),
                    0,
                );
                return (
                    <Modal title={`Convert ${conversionForm.item.quotation_number} to Invoice`} onClose={() => !converting && setConversionForm(null)}>
                        <form onSubmit={handleConvertConfirm}>
                            <p className="text-muted" style={{ marginTop: 0 }}>
                                The approved prices carry over as they are. Creating the invoice takes the stock off the shelf.
                            </p>
                            <table className="data-table" style={{ marginBottom: '1rem' }}>
                                <thead>
                                    <tr>
                                        <th>Part</th>
                                        <th style={{ textAlign: 'right' }}>Qty</th>
                                        <th style={{ textAlign: 'right' }}>Unit price</th>
                                        <th style={{ textAlign: 'right' }}>Amount</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {partLines.map((line) => (
                                        <tr key={line.part_id}>
                                            <td>{line.name || line.description || 'Part'}</td>
                                            <td style={{ textAlign: 'right' }}>{line.quantity}</td>
                                            <td style={{ textAlign: 'right' }}>{formatPKR(line.unit_price)}</td>
                                            <td style={{ textAlign: 'right' }}>
                                                {formatPKR((Number(line.unit_price) || 0) * (Number(line.quantity) || 1))}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            <div className="form-row">
                                <div className="form-group">
                                    <label>Payment method *</label>
                                    <SearchableSelect
                                        name="paymentMethodId"
                                        value={conversionForm.paymentMethodId}
                                        onChange={(event) => setConversionForm((prev) => ({ ...prev, paymentMethodId: event.target.value }))}
                                        required
                                    >
                                        <option value="">How was this paid?</option>
                                        {paymentMethods.map((method) => (
                                            <option key={method.id} value={String(method.id)}>{method.name}</option>
                                        ))}
                                    </SearchableSelect>
                                </div>
                                <div className="form-group">
                                    <label>Amount received</label>
                                    <input
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        value={conversionForm.paidAmount}
                                        onChange={(event) => setConversionForm((prev) => ({ ...prev, paidAmount: event.target.value }))}
                                        placeholder="What the customer paid now"
                                    />
                                </div>
                            </div>
                            <div className="form-group">
                                <label>Total</label>
                                <input type="text" value={formatPKR(convTotal)} readOnly />
                            </div>
                            <div className="modal-actions">
                                <button type="button" className="btn btn-secondary" onClick={() => setConversionForm(null)} disabled={converting}>Cancel</button>
                                <button type="submit" className="btn btn-primary" disabled={converting}>{converting ? 'Converting...' : 'Create Invoice'}</button>
                            </div>
                        </form>
                    </Modal>
                );
            })()}
            {conversionForm && !isParts && (
                <Modal title={`Convert ${conversionForm.item.quotation_number} to Booking`} onClose={() => !converting && setConversionForm(null)}>
                    <form onSubmit={handleConvertConfirm}>
                        <div className="form-group">
                            <label>Actual inventory Vehicle *</label>
                            <SearchableSelect
                                name="vehicleId"
                                value={conversionForm.vehicleId}
                                onChange={(event) => setConversionForm((prev) => ({ ...prev, vehicleId: event.target.value }))}
                                required
                            >
                                <option value="">Select available Vehicle</option>
                                {vehicles
                                    .filter((vehicle) => ['available', 'at_yard', 'in_stock', 'ready'].includes(String(vehicle.status || '').toLowerCase()))
                                    .map((vehicle) => (
                                        <option key={vehicle.id || vehicle._id} value={vehicle.id || vehicle._id}>
                                            {vehicle.make_name} {vehicle.model_name} {vehicle.variant_name} ({vehicle.color_name || vehicle.color}) — {vehicle.chassis_number || vehicle.vin || vehicle.vehicle_code}
                                        </option>
                                    ))}
                            </SearchableSelect>
                        </div>
                        <div className="form-row">
                            <div className="form-group">
                                <label>Booking Amount *</label>
                                <input
                                    type="number"
                                    min="0.01"
                                    step="0.01"
                                    value={conversionForm.bookingAmount}
                                    onChange={(event) => setConversionForm((prev) => ({ ...prev, bookingAmount: event.target.value }))}
                                    required
                                />
                            </div>
                            <div className="form-group">
                                <label>Expected Delivery</label>
                                <input
                                    type="date"
                                    value={conversionForm.expectedDeliveryDate}
                                    onChange={(event) => setConversionForm((prev) => ({ ...prev, expectedDeliveryDate: event.target.value }))}
                                />
                            </div>
                        </div>
                        <div className="modal-actions">
                            <button type="button" className="btn btn-secondary" onClick={() => setConversionForm(null)} disabled={converting}>Cancel</button>
                            <button type="submit" className="btn btn-primary" disabled={converting}>{converting ? 'Converting...' : 'Convert'}</button>
                        </div>
                    </form>
                </Modal>
            )}
            <div className="card-header d-flex justify-content-between align-items-center">
                <h3>{config.label} Quotations</h3>
                <div className="sales-header-actions">
                    <ScanLink config={config} doc="quotation" />
                    {canCreate && <button className="btn btn-primary" onClick={() => openModal('create')}>+ New Quotation</button>}
                </div>
            </div>

            <SalesFilterBar
                filters={filters}
                onFilterChange={handleFilterChange}
                onClear={clearFilters}
                onRefresh={fetchData}
                loading={loading}
                statusOptions={statusOptions}
                customers={customers}
            />
            {config.can.bulk && <BulkSalesActions type="quotation" config={config} selectedRows={data.filter(x=>selectedIds.includes(x.id))} onClear={()=>setSelectedIds([])} onRefresh={fetchData} canEmail={canSendEmail} canPdf={canDownloadPdf} canDelete={canDelete}/>}

            <div className="desktop-table">
                <table className="data-table">
                    <thead>
                        <tr>
                            <th className="sales-select-cell"><input type="checkbox" aria-label="Select all quotations" checked={data.length>0&&data.every(x=>selectedIds.includes(x.id))} onChange={e=>setSelectedIds(e.target.checked?data.map(x=>x.id):[])}/></th><th>Quote #</th>
                            <th>Date</th>
                            <th>Customer</th>
                            <th>{config.key === 'parts' ? 'Parts' : 'Vehicles'}</th>
                            <th>Total</th>
                            <th>Status</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.map(q => (
                            <tr key={q.id} onClick={() => openDrawer(q)} style={{ cursor: 'pointer' }} className={selectedIds.includes(q.id)?'selected-row':''}>
                                <td className="sales-select-cell" onClick={e=>e.stopPropagation()}><input type="checkbox" checked={selectedIds.includes(q.id)} onChange={e=>setSelectedIds(ids=>e.target.checked?[...new Set([...ids,q.id])]:ids.filter(id=>id!==q.id))}/></td>
                                <td><strong>{q.quotation_number}</strong></td>
                                <td>{new Date(q.created_at).toLocaleDateString()}</td>
                                <td>{q.customer_name}</td>
                                <td><ProductCell items={categoryLines(q.line_items, config.key)} fallback={q.item_name || q.vehicle_full_name || 'Parts/Services'} /></td>
                                <td>PKR {Number(q.total_amount).toLocaleString()}</td>
                                <td>{getStatusBadge(q.status)}</td>
                                <td onClick={e=>e.stopPropagation()}>
                                    <ActionButtons
                                        showView={true}
                                        onView={() => openModal('view', q)}
                                        onEdit={canEdit && q.status === 'draft' ? () => openModal('edit', q) : null}
                                        onDelete={canDelete && q.status === 'draft' ? () => handleDeleteClick(q.id) : null}
                                        customActions={[
                                            ...(canDownloadPdf ? [{ icon: <Download size={18} />, title: 'Download PDF', onClick: () => downloadSalesPdf('quotation', q.id, q.quotation_number), className: 'btn-info' }] : []),
                                            ...(canSendEmail ? [{ icon: <Send size={18} className="action-icon" />, title: 'Send quotation email', onClick: () => handleSendEmail(q), className: 'btn-info', disabled: sendingEmail === q.id, loading: sendingEmail === q.id }] : []),
                                            ...(canEstimate ? [{ icon: <FileText size={18} />, title: 'Estimate PDF (all products)', onClick: () => handleDownloadEstimate(q), className: 'btn-info', disabled: estimateId === q.id, loading: estimateId === q.id }] : []),
                                            ...(canEstimate ? [{ icon: <Mail size={18} />, title: 'Email estimate to customer', onClick: () => handleEmailEstimate(q), className: 'btn-info', disabled: estimateId === q.id, loading: estimateId === q.id }] : []),
                                            ...(canApprove && q.approval_status !== 'approved' && !['converted', 'cancelled'].includes(q.status) ? [{ icon: <CheckCircle size={18} />, title: 'Approve quotation', onClick: () => handleApprove(q, 'approved'), className: 'btn-success', disabled: approvingId === q.id, loading: approvingId === q.id }] : []),
                                            ...(q.approval_status === 'approved' && q.status !== 'converted' ? [{ icon: <span className="material-icons">shopping_cart</span>, title: isParts ? 'Convert to invoice' : 'Convert to booking', onClick: () => handleConvertClick(q), className: 'btn-success' }] : [])
                                        ]}
                                    />
                                </td>
                            </tr>
                        ))}
                        {data.length === 0 && <tr><td colSpan="7" className="text-center p-4">No quotations found</td></tr>}
                    </tbody>
                </table>
            </div>
            {data.length > 0 && (
                <div className="mobile-cards-view">
                    <div className="mobile-cards-container">
                        {data.map(q => (
                            <div key={q.id} className="data-card">
                                <div className="data-card-top">
                                    <input className="sales-mobile-select" type="checkbox" checked={selectedIds.includes(q.id)} onChange={e=>setSelectedIds(ids=>e.target.checked?[...new Set([...ids,q.id])]:ids.filter(id=>id!==q.id))}/><div className="data-card-avatar avatar-amber">Q</div>
                                    <div className="data-card-info">
                                        <span className="data-card-title">{q.quotation_number}</span>
                                        <span className="data-card-subtitle">{q.customer_name}</span>
                                    </div>
                                    {getStatusBadge(q.status)}
                                </div>
                                <div className="data-card-body">
                                    <div className="data-card-row"><span className="row-icon">📦</span><span className="row-label">{config.key === 'parts' ? 'Parts' : 'Vehicles'}</span><span className="row-value"><ProductCell items={categoryLines(q.line_items, config.key)} fallback={q.item_name || q.vehicle_full_name || 'Parts/Services'} /></span></div>
                                    <div className="data-card-row"><span className="row-icon">💰</span><span className="row-label">Total</span><span className="row-value">PKR {Number(q.total_amount).toLocaleString()}</span></div>
                                    <div className="data-card-row"><span className="row-icon">📅</span><span className="row-label">Date</span><span className="row-value">{new Date(q.created_at).toLocaleDateString()}</span></div>
                                </div>
                                <div className="data-card-footer">
                                    <ActionButtons
                                        showView={true}
                                        onView={() => openModal('view', q)}
                                        onEdit={canEdit && q.status === 'draft' ? () => openModal('edit', q) : null}
                                        onDelete={canEdit && q.status === 'draft' ? () => handleDeleteClick(q.id) : null}
                                        customActions={[
                                            ...(canDownloadPdf ? [{ icon: <Download size={18} />, title: 'Download PDF', onClick: () => downloadSalesPdf('quotation', q.id, q.quotation_number), className: 'btn-info' }] : []),
                                            ...(canSendEmail ? [{ icon: <Send size={18} className="action-icon" />, title: 'Send quotation email', onClick: () => handleSendEmail(q), className: 'btn-info', disabled: sendingEmail === q.id, loading: sendingEmail === q.id }] : []),
                                            ...(canEstimate ? [{ icon: <FileText size={18} />, title: 'Estimate PDF (all products)', onClick: () => handleDownloadEstimate(q), className: 'btn-info', disabled: estimateId === q.id, loading: estimateId === q.id }] : []),
                                            ...(canEstimate ? [{ icon: <Mail size={18} />, title: 'Email estimate to customer', onClick: () => handleEmailEstimate(q), className: 'btn-info', disabled: estimateId === q.id, loading: estimateId === q.id }] : []),
                                            ...(canApprove && q.approval_status !== 'approved' && !['converted', 'cancelled'].includes(q.status) ? [{ icon: <CheckCircle size={18} />, title: 'Approve quotation', onClick: () => handleApprove(q, 'approved'), className: 'btn-success', disabled: approvingId === q.id, loading: approvingId === q.id }] : []),
                                            ...(q.approval_status === 'approved' && q.status !== 'converted' ? [{ icon: <span className="material-icons">shopping_cart</span>, title: isParts ? 'Convert to invoice' : 'Convert to booking', onClick: () => handleConvertClick(q), className: 'btn-success' }] : [])
                                        ]}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <ServerPagination
                page={pagination.page}
                totalPages={pagination.totalPages || 1}
                total={pagination.total}
                limit={pagination.limit}
                onPageChange={(page) => setPagination(prev => ({ ...prev, page }))}
                onPageSizeChange={(limit) => setPagination(prev => ({ ...prev, page: 1, limit }))}
                loading={loading}
            />

            {showModal && (
                <Modal
                    title={modalMode === 'view' ? `Quotation ${selectedItem?.quotation_number || ''}` : `${modalMode === 'create' ? 'Create' : 'Edit'} Quotation`}
                    onClose={closeModal}
                    size="large"
                    overlayClassName={modalMode === 'view' ? 'sales-print-modal' : undefined}
                >
                    {modalMode === 'view' ? (
                        <>
                            {viewLoading ? (
                                <div className="spinner" />
                            ) : documentHtml ? (
                                <RenderedHtmlDocumentTemplate htmlString={documentHtml} />
                            ) : templateHtml ? (
                                <RenderedHtmlDocumentTemplate
                                    htmlString={renderSalesTemplate('quotation', templateHtml, {
                                        companyInfo, selectedItem, formData, customers, vehicles, vehicleVariants, parts
                                    })}
                                />
                            ) : (
                                <div className="corp-doc">
                                    <CorporatePrintHeader company={companyInfo} />
                                    <CorpDocTitleBar documentTitle="Quotation" reference={selectedItem?.quotation_number} />
                                    <SalesDocumentMeta
                                        rows={[
                                            { label: 'Issue date', value: selectedItem?.created_at ? new Date(selectedItem.created_at).toLocaleString() : '—' },
                                            { label: 'Status', value: selectedItem?.status ? String(selectedItem.status).toUpperCase() : '—' },
                                            { label: 'Printed', value: new Date().toLocaleString() }
                                        ]}
                                    />
                                    <CorpDocSection title="Client & product">
                                        <CorpDocKvTable
                                            rows={[
                                                { label: 'Customer', value: selectedItem?.customer_name || customerLabelById(formData.customerId, customers) },
                                                { label: 'Sale category', value: saleTypeQuotationLabel(formData.saleType) },
                                                { label: 'Description', value: resolveQuotationLineItem(formData, selectedItem, { vehicles, vehicleVariants, parts }) }
                                            ]}
                                        />
                                    </CorpDocSection>
                                    <CorpDocSection title="Commercial terms">
                                        <CorpDocKvTable
                                            rows={[
                                                { label: 'Base price', value: formatPKR(formData.vehiclePrice) },
                                                { label: 'Discount', value: formatPKR(formData.discountAmount) },
                                                { label: 'Tax / levies', value: formatPKR(formData.taxAmount) },
                                                { label: 'Additional charges', value: formatPKR(formData.additionalCharges) },
                                                { label: 'Validity', value: formData.validityDays ? `${formData.validityDays} days` : '—' }
                                            ]}
                                        />
                                    </CorpDocSection>
                                    <CorpDocNotes text={formData.notes} />
                                    {formData.termsAndConditions?.trim() ? (
                                        <CorpDocNotes title="Terms & conditions" text={formData.termsAndConditions} />
                                    ) : null}
                                </div>
                            )}
                            <div className="modal-actions">
                                <button type="button" className="btn btn-secondary" onClick={closeModal}>Close</button>
                                <button type="button" className="btn btn-primary" onClick={runSalesPrint} disabled={viewLoading}>Print</button>
                            </div>
                        </>
                    ) : (
                        <form onSubmit={handleSubmit}>
                            <div className="form-group">
                                <CustomerField
                                    formData={formData}
                                    onChange={handleChange}
                                    customers={customers}
                                    onCustomerCreated={handleCustomerCreated}
                                />
                            </div>
                            <LineItemsEditor
                                value={lineItems}
                                onChange={setLineItems}
                                vehicles={vehicles}
                                parts={parts}
                                variants={vehicleVariants}
                                currencyCode={currency.code}
                                category={config.key}
                            />

                            <div className="form-row">
                                <div className="form-group">
                                    <label>Subtotal ({currency.code})</label>
                                    <input type="number" value={lineSubtotal} readOnly title="Sum of every product line" />
                                </div>
                                <div className="form-group">
                                    <label>Discount</label>
                                    <input type="number" name="discountAmount" value={formData.discountAmount} onChange={handleChange} />
                                </div>
                            </div>
                            <div className="form-row">
                                <div className="form-group">
                                    <label>Tax {salesTax ? `(${salesTax.tax_name} ${salesTax.tax_rate}%)` : ''}</label>
                                    <input type="number" name="taxAmount" value={formData.taxAmount} onChange={handleChange} />
                                </div>
                                <div className="form-group">
                                    <label>Validity (Days)</label>
                                    <input type="number" name="validityDays" value={formData.validityDays} onChange={handleChange} />
                                </div>
                            </div>
                            <div className="form-group">
                                <label>Notes</label>
                                <textarea name="notes" value={formData.notes} onChange={handleChange} rows="2" />
                            </div>
                            <div className="modal-actions">
                                <button type="button" className="btn btn-secondary" onClick={closeModal}>Cancel</button>
                                <button type="submit" className="btn btn-primary">{modalMode === 'create' ? 'Create' : 'Update'}</button>
                            </div>
                        </form>
                    )}
                </Modal>
            )}

            <SalesDrawer
                isOpen={Boolean(drawerItem)}
                loading={drawerLoading}
                onClose={() => setDrawerItem(null)}
                title={`Quotation ${drawerItem?.quotation_number || ''}`}
                subtitle={drawerItem?.customer_name}
                fields={[
                    { label: 'Date', value: drawerItem?.created_at ? new Date(drawerItem.created_at).toLocaleDateString('en-GB') : '-' },
                    { label: 'Customer', value: drawerItem?.customer_name },
                    { label: 'Item', value: drawerItem?.item_name || drawerItem?.vehicle_full_name || drawerItem?.chassis_number || drawerItem?.engine_number || '—' },
                    { label: 'Total', value: drawerItem?.total_amount != null ? `PKR ${Number(drawerItem.total_amount).toLocaleString()}` : '-' },
                    { label: 'Valid Until', value: drawerItem?.valid_until ? new Date(drawerItem.valid_until).toLocaleDateString('en-GB') : '-' },
                    { label: 'Notes', value: drawerItem?.notes, full: true },
                ]}
                items={drawerItem?.items || []}
                statusOptions={statusOptions}
                status={drawerItem?.status}
                onStatusChange={handleDrawerStatus}
                savingStatus={savingStatus}
                canEditStatus={canEdit}
            />
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// BOOKINGS COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

function Bookings({ category = 'vehicle' }) {
    const config = categoryConfig(category);
    const docApi = config.sales;
    const isParts = config.key === 'parts';
    const { user } = useAuth();
    const companyInfo = useCompanyLetterhead();
    const { currency, salesTax, taxAmount: calculateConfiguredTax } = useErpDocumentSettings();
    const [searchParams] = useSearchParams();
    const urlSearch = searchParams.get('search') || '';
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [modalMode, setModalMode] = useState('create');
    const [selectedItem, setSelectedItem] = useState(null);
    const [selectedIds,setSelectedIds]=useState([]);
    const [sendingEmail, setSendingEmail] = useState(null);
    const { documentHtml, documentLoading } = useSalesDocumentPrintHtml(
        'booking',
        selectedItem?.id,
        showModal && modalMode === 'view'
    );
    const { templateHtml, templateLoading } = useSalesHtmlTemplate(
        'booking',
        companyInfo?.id,
        showModal && modalMode === 'view'
    );
    const viewLoading = documentLoading || templateLoading;
    const [customers, setCustomers] = useState([]);
    const [vehicles, setVehicles] = useState([]);
    const [parts, setParts] = useState([]);
    const [paymentMethods, setPaymentMethods] = useState([]);

    // A booking can reserve several vehicles and order several parts at once.
    const [bookingLines, setBookingLines] = useState([]);
    const [formData, setFormData] = useState({
        customerId: '', walkIn: false, walkInName: '', walkInPhone: '', bookingAmount: '',
        totalAmount: '', taxAmount: '0', expectedDeliveryDate: '', priority: 'normal', notes: ''
    });

    // Filters & Pagination
    const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 });
    const [filters, setFilters] = useState({
        search: urlSearch, status: '', customerId: '', priority: '',
        dateFrom: '', dateTo: '',
        sortBy: 'created_at', sortOrder: 'desc'
    });
    const debouncedSearch = useDebounce(filters.search, 300);

    const canAction = policyAllows(user, 'bookings', 'edit', ['super_admin','admin','sales_manager'].includes(user?.role));
    const canDelete = policyAllows(user, 'bookings', 'delete', ['super_admin','sales_manager'].includes(user?.role));

    // Detail drawer
    const [drawerItem, setDrawerItem] = useState(null);
    const [drawerLoading, setDrawerLoading] = useState(false);
    const [savingStatus, setSavingStatus] = useState(false);

    const loadDrawer = useCallback(async (id) => {
        setDrawerLoading(true);
        try {
            const res = await docApi.getBooking(id);
            setDrawerItem(res.data?.data || null);
        } catch (error) {
            toast.error('Failed to load booking details');
            setDrawerItem(null);
        } finally {
            setDrawerLoading(false);
        }
    }, []);

    const openDrawer = (row) => { setDrawerItem({ id: row.id }); loadDrawer(row.id); };

    const handleDrawerStatus = async (status) => {
        if (!drawerItem?.id) return;
        setSavingStatus(true);
        try {
            await docApi.updateBooking(drawerItem.id, { status });
            toast.success('Status updated');
            await Promise.all([loadDrawer(drawerItem.id), fetchData()]);
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to update status');
        } finally {
            setSavingStatus(false);
        }
    };
    const canCreate = policyAllows(user, 'bookings', 'create', canAction);
    const canSendEmail = config.can.email && policyAllows(user, 'bookings', 'sendEmail', ['super_admin','admin','sales_manager','sales_executive'].includes(user?.role));
    const canDownloadPdf = config.can.pdf && policyAllows(user, 'bookings', 'downloadPdf', true);

    const statusOptions = useSalesStatusOptions('bookings', [
        { label: 'Pending', value: 'pending' },
        { label: 'Confirmed', value: 'confirmed' },
        { label: 'Scheduled', value: 'scheduled' },
        { label: 'In Progress', value: 'in_progress' },
        { label: 'Cancelled', value: 'cancelled' },
        { label: 'Completed', value: 'completed' }
    ]);

    const fetchData = useCallback(async () => {
        try {
            setLoading(true);
            const params = {
                ...filters,
                search: debouncedSearch,
                page: pagination.page,
                limit: pagination.limit
            };
            Object.keys(params).forEach(k => (params[k] === '' || params[k] === null) && delete params[k]);

            const res = await docApi.getBookings(params);
            setData(res.data?.data || []);
            setPagination(prev => ({
                ...prev,
                total: res.data?.pagination?.total || 0,
                totalPages: res.data?.pagination?.totalPages || 0
            }));
        } catch (error) {
            console.error('Error fetching bookings:', error);
            setData([]);
        } finally {
            setLoading(false);
        }
    }, [debouncedSearch, filters.status, filters.customerId, filters.priority, filters.dateFrom, filters.dateTo, filters.sortBy, filters.sortOrder, pagination.page, pagination.limit]);

    const fetchDropdowns = useCallback(async () => {
        try {
            const results = await Promise.allSettled([
                fetchAllCustomersForDropdown(),
                vehicleAPI.getAll({ limit: 200 }),
                partsAPI.getAll({ limit: 500 }),
                paymentMethodsAPI.getAll({ status: 'active' })
            ]);
            setCustomers(results[0].status === 'fulfilled' ? results[0].value || [] : []);
            setVehicles(results[1].status === 'fulfilled' && results[1].value?.data?.data?.vehicles ? results[1].value?.data?.data?.vehicles : []);
            setParts(results[2].status === 'fulfilled' ? results[2].value?.data?.data?.parts || [] : []);
            setPaymentMethods(results[3].status === 'fulfilled' ? results[3].value?.data?.data || [] : []);
        } catch (error) {
            console.error('Error fetching dropdowns:', error);
        }
    }, []);

    useEffect(() => { fetchDropdowns(); }, [fetchDropdowns]);
    useEffect(() => { fetchData(); }, [fetchData]);
    useEffect(() => { if (searchParams.get('action') === 'create') openModal('create'); }, []);

    // Rule 2 — refresh dropdown and auto-select the customer created inline
    const handleCustomerCreated = useCallback(async (created) => {
        try { setCustomers(await fetchAllCustomersForDropdown()); } catch (_) { /* dropdown refresh best-effort */ }
        const newId = created?._id || created?.id;
        if (newId) setFormData(prev => ({ ...prev, customerId: String(newId) }));
    }, []);

    const handleFilterChange = (key, value) => {
        setFilters(prev => ({ ...prev, [key]: value }));
        if (key !== 'sortBy' && key !== 'sortOrder') setPagination(prev => ({ ...prev, page: 1 }));
    };

    const clearFilters = () => {
        setFilters({ search: '', status: '', customerId: '', priority: '', dateFrom: '', dateTo: '', sortBy: 'created_at', sortOrder: 'desc' });
        setPagination(prev => ({ ...prev, page: 1 }));
    };

    const openModal = (mode, item = null) => {
        setModalMode(mode);
        setSelectedItem(item);
        if (item) {
            setBookingLines(categoryLines(item.line_items, config.key).map((line, index) => ({
                key: `saved-${index}`,
                itemType: line.item_type === 'part' ? 'part' : 'vehicle',
                vehicleId: line.vehicle_id || '',
                partId: line.part_id || '',
                quantity: line.quantity || 1,
                unitPrice: line.unit_price ?? '',
                discountAmount: line.discount_amount || 0,
                taxAmount: line.tax_amount || 0,
                description: line.description || '',
            })));
            setFormData({
                customerId: item.customer_id || '',
                walkIn: item.walk_in === true,
                walkInName: item.walk_in_name || '',
                walkInPhone: item.walk_in_phone || '',
                bookingAmount: item.booking_amount || '',
                totalAmount: item.total_amount || '',
                taxAmount: item.tax_amount || '0',
                expectedDeliveryDate: item.expected_delivery_date ? item.expected_delivery_date.split('T')[0] : '',
                priority: item.priority || 'normal',
                notes: item.notes || ''
            });
        } else {
            setBookingLines([]);
            setFormData({
                customerId: '', walkIn: false, walkInName: '', walkInPhone: '', bookingAmount: '',
                totalAmount: '', taxAmount: '0', expectedDeliveryDate: '', priority: 'normal', notes: ''
            });
        }
        setShowModal(true);
    };

    const closeModal = () => { setShowModal(false); setSelectedItem(null); };

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            if (!bookingLines.length) {
                toast.error(isParts ? 'Add at least one part' : 'Add at least one vehicle');
                return;
            }
            const missing = bookingLines.find((line) => (line.itemType === 'part' ? !line.partId : !line.vehicleId));
            if (missing) {
                toast.error('Every product line needs a product selected');
                return;
            }
            const lineTotal = bookingLines.reduce(
                (sum, line) => sum + (Number(line.unitPrice) || 0) * (Number(line.quantity) || 1)
                    - (Number(line.discountAmount) || 0) + (Number(line.taxAmount) || 0),
                0,
            );
            const baseAmount = Number(formData.totalAmount || 0) || lineTotal;
            const payload = {
                ...formData,
                totalAmount: baseAmount,
                lineItems: bookingLines.map((line) => ({
                    itemType: line.itemType,
                    vehicleId: line.vehicleId || undefined,
                    partId: line.partId || undefined,
                    quantity: Number(line.quantity) || 1,
                    unitPrice: Number(line.unitPrice) || 0,
                    discountAmount: Number(line.discountAmount) || 0,
                    taxAmount: Number(line.taxAmount) || 0,
                    description: line.description || undefined,
                })),
                taxAmount: Number(formData.taxAmount) > 0 || !salesTax
                    ? Number(formData.taxAmount || 0)
                    : calculateConfiguredTax(baseAmount, salesTax)
            };
            if (modalMode === 'create') {
                await docApi.createBooking(payload);
                toast.success('Booking created');
            } else if (modalMode === 'edit') {
                await docApi.updateBooking(selectedItem.id, payload);
                toast.success('Booking updated');
            }
            closeModal();
            fetchData();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Operation failed');
        }
    };

    // Allocate Vehicle Modal Logic could go here...

    const handleSendEmail = async (item) => {
        setSendingEmail(item.id);
        try {
            await docApi.sendBookingEmail(item.id);
            toast.success(`Booking emailed to ${item.customer_name}`);
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to email booking');
        } finally {
            setSendingEmail(null);
        }
    };

    // Converting a booking raises its invoice, so the counter is asked how the
    // balance was settled rather than just being asked to confirm.
    const [convertingId, setConvertingId] = useState(null);
    const [conversionForm, setConversionForm] = useState(null);

    const handleConvertClick = (item) => {
        const outstanding = Math.max(0, (Number(item.total_amount) || 0) - (Number(item.booking_amount) || 0));
        setConversionForm({
            item,
            paymentMethodId: '',
            paidAmount: outstanding ? String(outstanding) : '',
        });
    };

    const handleConvertConfirm = async (event) => {
        event.preventDefault();
        if (!conversionForm?.item) return;
        if (!conversionForm.paymentMethodId) {
            toast.error('Select how this sale was paid.');
            return;
        }
        const item = conversionForm.item;
        setConvertingId(item.id);
        try {
            const res = await docApi.convertBooking(item.id, {
                paymentMethodId: conversionForm.paymentMethodId,
                paidAmount: Number(conversionForm.paidAmount) || 0,
            });
            toast.success(`Booking converted to order ${res.data?.data?.orderNumber || ''}`);
            setConversionForm(null);
            fetchData();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to convert booking');
        } finally {
            setConvertingId(null);
        }
    };

    const getStatusBadge = (status) => {
        const colors = { pending: 'warning', confirmed: 'info', processing: 'primary', ready: 'success', cancelled: 'danger' };
        return <span className={`badge badge-${colors[status] || 'secondary'}`}>{status.toUpperCase()}</span>;
    };

    if (loading) return <div className="spinner"></div>;

    return (
        <div className="card sales-page">
            {conversionForm && (
                <Modal
                    title={`Convert ${conversionForm.item.booking_number} to Sales Order`}
                    onClose={() => convertingId === null && setConversionForm(null)}
                >
                    <form onSubmit={handleConvertConfirm}>
                        <p className="text-muted" style={{ marginTop: 0 }}>
                            The booking's products and prices carry over as they are. This raises the invoice,
                            which is what takes the stock off the shelf.
                        </p>
                        <div className="form-row">
                            <div className="form-group">
                                <label>Order value</label>
                                <input type="text" value={formatPKR(conversionForm.item.total_amount)} readOnly />
                            </div>
                            <div className="form-group">
                                <label>Already paid (deposit)</label>
                                <input type="text" value={formatPKR(conversionForm.item.booking_amount)} readOnly />
                            </div>
                        </div>
                        <div className="form-row">
                            <div className="form-group">
                                <label>Payment method *</label>
                                <SearchableSelect
                                    name="paymentMethodId"
                                    value={conversionForm.paymentMethodId}
                                    onChange={(event) => setConversionForm((prev) => ({ ...prev, paymentMethodId: event.target.value }))}
                                    required
                                >
                                    <option value="">How was this paid?</option>
                                    {paymentMethods.map((method) => (
                                        <option key={method.id} value={String(method.id)}>{method.name}</option>
                                    ))}
                                </SearchableSelect>
                            </div>
                            <div className="form-group">
                                <label>Amount received now</label>
                                <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={conversionForm.paidAmount}
                                    onChange={(event) => setConversionForm((prev) => ({ ...prev, paidAmount: event.target.value }))}
                                    placeholder="Balance collected at handover"
                                />
                            </div>
                        </div>
                        <div className="modal-actions">
                            <button type="button" className="btn btn-secondary" onClick={() => setConversionForm(null)} disabled={convertingId !== null}>Cancel</button>
                            <button type="submit" className="btn btn-primary" disabled={convertingId !== null}>
                                {convertingId !== null ? 'Converting...' : 'Create Sales Order'}
                            </button>
                        </div>
                    </form>
                </Modal>
            )}
            <div className="card-header d-flex justify-content-between align-items-center">
                <h3>{config.label} Bookings</h3>
                <div className="sales-header-actions">
                    <ScanLink config={config} doc="booking" />
                    {canCreate && <button className="btn btn-primary" onClick={() => openModal('create')}>+ New Booking</button>}
                </div>
            </div>

            <SalesFilterBar
                filters={filters}
                onFilterChange={handleFilterChange}
                onClear={clearFilters}
                onRefresh={fetchData}
                loading={loading}
                statusOptions={statusOptions}
                customers={customers}
                customFilters={
                    <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label">Priority</label>
                        <SearchableSelect
                            className="form-select"
                            value={filters.priority}
                            onChange={(e) => handleFilterChange('priority', e.target.value)}
                        >
                            <option value="">All Priorities</option>
                            <option value="low">Low</option>
                            <option value="normal">Normal</option>
                            <option value="high">High</option>
                        </SearchableSelect>
                    </div>
                }
            />

            <div className="desktop-table">
                {config.can.bulk && <BulkSalesActions type="booking" config={config} selectedRows={data.filter(x=>selectedIds.includes(x.id))} onClear={()=>setSelectedIds([])} onRefresh={fetchData} canEmail={canSendEmail} canPdf={canDownloadPdf} canDelete={canDelete}/>}
                <table className="data-table">
                    <thead>
                        <tr>
                            <th className="sales-select-cell"><input type="checkbox" aria-label="Select all bookings" checked={data.length>0&&data.every(x=>selectedIds.includes(x.id))} onChange={e=>setSelectedIds(e.target.checked?data.map(x=>x.id):[])}/></th><th>Booking #</th>
                            <th>Customer</th>
                            <th>{config.key === 'parts' ? 'Parts' : 'Vehicles'}</th>
                            <th>Amount Paid</th>
                            <th>Expected Date</th>
                            <th>Status</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.map(b => (
                            <tr key={b.id} onClick={() => openDrawer(b)} style={{ cursor: 'pointer' }} className={selectedIds.includes(b.id)?'selected-row':''}>
                                <td className="sales-select-cell" onClick={e=>e.stopPropagation()}><input type="checkbox" checked={selectedIds.includes(b.id)} onChange={e=>setSelectedIds(ids=>e.target.checked?[...new Set([...ids,b.id])]:ids.filter(id=>id!==b.id))}/></td>
                                <td>
                                    <strong>{b.booking_number}</strong>
                                    {b.external_order_number && <div className="text-muted small">{b.external_order_number}</div>}
                                </td>
                                <td>
                                    {b.customer_name}
                                    {b.sale_person && <div className="text-muted small">{b.sale_person}</div>}
                                </td>
                                <td><ProductCell items={categoryLines(b.line_items, config.key)} fallback={b.item_name || b.vehicle_full_name || 'Parts/Services'} /></td>
                                <td>PKR {Number(b.booking_amount).toLocaleString()}</td>
                                <td>{b.expected_delivery_date ? new Date(b.expected_delivery_date).toLocaleDateString() : '-'}</td>
                                <td>{getStatusBadge(b.status)}</td>
                                <td onClick={e=>e.stopPropagation()}>
                                    <ActionButtons
                                        showView={true}
                                        onView={() => openModal('view', b)}
                                        onEdit={canAction && !['cancelled', 'completed'].includes(b.status) ? () => openModal('edit', b) : null}
                                        customActions={[
                                            ...(canAction && !['cancelled', 'completed', 'converted'].includes(b.status) ? [{ icon: <Truck size={18}/>, title: 'Convert to Sales Order', onClick: () => handleConvertClick(b), className: 'btn-success', disabled: convertingId === b.id, loading: convertingId === b.id }] : []),
                                            ...(canDownloadPdf ? [{ icon: <Download size={18}/>, title: 'Download PDF', onClick: () => downloadSalesPdf('booking', b.id, b.booking_number), className: 'btn-info' }] : []),
                                            ...(canSendEmail ? [{ icon: <Send size={18} className="action-icon" />, title: 'Send booking email', onClick: () => handleSendEmail(b), className: 'btn-info', disabled: sendingEmail === b.id, loading: sendingEmail === b.id }] : [])
                                        ]}
                                    />
                                </td>
                            </tr>
                        ))}
                        {data.length === 0 && <tr><td colSpan="7" className="text-center p-4">No bookings found</td></tr>}
                    </tbody>
                </table>
            </div>
            {data.length > 0 && (
                <div className="mobile-cards-view">
                    <div className="mobile-cards-container">
                        {data.map(b => (
                            <div key={b.id} className="data-card">
                                <div className="data-card-top">
                                    <input className="sales-mobile-select" type="checkbox" checked={selectedIds.includes(b.id)} onChange={e=>setSelectedIds(ids=>e.target.checked?[...new Set([...ids,b.id])]:ids.filter(id=>id!==b.id))}/><div className="data-card-avatar avatar-purple">B</div>
                                    <div className="data-card-info">
                                        <span className="data-card-title">{b.booking_number}</span>
                                        <span className="data-card-subtitle">{b.customer_name}</span>
                                    </div>
                                    {getStatusBadge(b.status)}
                                </div>
                                <div className="data-card-body">
                                    <div className="data-card-row"><span className="row-icon">🚗</span><span className="row-label">{config.key === 'parts' ? 'Parts' : 'Vehicles'}</span><span className="row-value"><ProductCell items={categoryLines(b.line_items, config.key)} fallback={b.item_name || b.vehicle_full_name || 'Parts/Services'} /></span></div>
                                    <div className="data-card-row"><span className="row-icon">💰</span><span className="row-label">Paid</span><span className="row-value">PKR {Number(b.booking_amount).toLocaleString()}</span></div>
                                    <div className="data-card-row"><span className="row-icon">📅</span><span className="row-label">Expected</span><span className="row-value">{b.expected_delivery_date ? new Date(b.expected_delivery_date).toLocaleDateString() : '-'}</span></div>
                                </div>
                                <div className="data-card-footer">
                                    <ActionButtons
                                        showView={true}
                                        onView={() => openModal('view', b)}
                                        onEdit={canAction && !['cancelled', 'completed'].includes(b.status) ? () => openModal('edit', b) : null}
                                        customActions={[
                                            ...(canDownloadPdf ? [{ icon: <Download size={18}/>, title: 'Download PDF', onClick: () => downloadSalesPdf('booking', b.id, b.booking_number), className: 'btn-info' }] : []),
                                            ...(canAction && !['cancelled', 'completed', 'converted'].includes(b.status) ? [{ icon: <Truck size={18}/>, title: 'Convert to Sales Order', onClick: () => handleConvertClick(b), className: 'btn-success', disabled: convertingId === b.id, loading: convertingId === b.id }] : []),
                                            ...(canSendEmail ? [{ icon: <Send size={18} className="action-icon" />, title: 'Send booking email', onClick: () => handleSendEmail(b), className: 'btn-info', disabled: sendingEmail === b.id, loading: sendingEmail === b.id }] : [])
                                        ]}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <ServerPagination
                page={pagination.page}
                totalPages={pagination.totalPages || 1}
                total={pagination.total}
                limit={pagination.limit}
                onPageChange={(page) => setPagination(prev => ({ ...prev, page }))}
                onPageSizeChange={(limit) => setPagination(prev => ({ ...prev, page: 1, limit }))}
                loading={loading}
            />

            {
                showModal && (
                    <Modal
                        title={modalMode === 'view' ? `Booking ${selectedItem?.booking_number || ''}` : `${modalMode === 'create' ? 'Create' : 'Edit'} Booking`}
                        onClose={closeModal}
                        size="large"
                        overlayClassName={modalMode === 'view' ? 'sales-print-modal' : undefined}
                    >
                        {modalMode === 'view' ? (
                            <>
                                {viewLoading ? (
                                    <div className="spinner" />
                                ) : documentHtml ? (
                                    <RenderedHtmlDocumentTemplate htmlString={documentHtml} />
                                ) : templateHtml ? (
                                    <RenderedHtmlDocumentTemplate
                                        htmlString={renderSalesTemplate('booking', templateHtml, {
                                            companyInfo, selectedItem, formData, customers, vehicles
                                        })}
                                    />
                                ) : (
                                    <div className="corp-doc">
                                        <CorporatePrintHeader company={companyInfo} />
                                        <CorpDocTitleBar documentTitle="Vehicle booking" reference={selectedItem?.booking_number} />
                                        <SalesDocumentMeta
                                            rows={[
                                                { label: 'Created', value: selectedItem?.created_at ? new Date(selectedItem.created_at).toLocaleString() : '—' },
                                                { label: 'Status', value: selectedItem?.status ? String(selectedItem.status).toUpperCase() : '—' },
                                                { label: 'Printed', value: new Date().toLocaleString() }
                                            ]}
                                        />
                                        <CorpDocSection title="Reservation details">
                                            <CorpDocKvTable
                                                rows={[
                                                    { label: 'Customer', value: selectedItem?.customer_name || customerLabelById(formData.customerId, customers) },
                                                    { label: 'Vehicle', value: resolveBookingVehicleLine(formData, selectedItem, vehicles) },
                                                    { label: 'Booking deposit', value: formatPKR(formData.bookingAmount) },
                                                    { label: 'Order value (est.)', value: formatPKR(formData.totalAmount) },
                                                    {
                                                        label: 'Expected delivery',
                                                        value: formData.expectedDeliveryDate
                                                            ? new Date(`${formData.expectedDeliveryDate}T12:00:00`).toLocaleDateString(undefined, { dateStyle: 'long' })
                                                            : '—'
                                                    },
                                                    { label: 'Priority', value: priorityLabel(formData.priority) }
                                                ]}
                                            />
                                        </CorpDocSection>
                                        <CorpDocNotes text={formData.notes} />
                                    </div>
                                )}
                                <div className="modal-actions">
                                    <button type="button" className="btn btn-secondary" onClick={closeModal}>Close</button>
                                    <button type="button" className="btn btn-primary" onClick={runSalesPrint} disabled={viewLoading}>Print</button>
                                </div>
                            </>
                        ) : (
                            <form onSubmit={handleSubmit}>
                                <div className="form-group">
                                    <CustomerField
                                        formData={formData}
                                        onChange={handleChange}
                                        customers={customers}
                                        onCustomerCreated={handleCustomerCreated}
                                    />
                                </div>
                                {/* A booking reserves real inventory units, so vehicle
                                    lines must be actual vehicles, not catalogue models. */}
                                <LineItemsEditor
                                    value={bookingLines}
                                    onChange={setBookingLines}
                                    vehicles={vehicles.filter((vehicle) => (
                                        bookingLines.some((line) => String(line.vehicleId) === String(vehicle.id))
                                        || ['available', 'at_yard', 'in_stock', 'ready'].includes(String(vehicle.status || '').toLowerCase())
                                    ))}
                                    parts={parts}
                                    currencyCode={currency.code}
                                    requireInventoryVehicle
                                    category={config.key}
                                />
                                <div className="form-row">
                                    <div className="form-group">
                                        <label>Booking Amount ({currency.code}) *</label>
                                        <input type="number" name="bookingAmount" value={formData.bookingAmount} onChange={handleChange} required />
                                    </div>
                                    <div className="form-group">
                                        <label>Total Amount ({currency.code})</label>
                                        <input type="number" name="totalAmount" value={formData.totalAmount} onChange={handleChange} />
                                    </div>
                                </div>
                                <div className="form-group">
                                    <label>Tax Amount {salesTax ? `(${salesTax.tax_name} ${salesTax.tax_rate}%)` : ''}</label>
                                    <input type="number" name="taxAmount" value={formData.taxAmount} onChange={handleChange} min="0" />
                                </div>
                                <div className="form-row">
                                    <div className="form-group">
                                        <label>Expected Delivery</label>
                                        <input type="date" name="expectedDeliveryDate" value={formData.expectedDeliveryDate} onChange={handleChange} />
                                    </div>
                                    <div className="form-group">
                                        <label>Priority</label>
                                        <SearchableSelect name="priority" value={formData.priority} onChange={handleChange}>
                                            <option value="low">Low</option>
                                            <option value="normal">Normal</option>
                                            <option value="high">High</option>
                                        </SearchableSelect>
                                    </div>
                                </div>
                                <div className="form-group">
                                    <label>Notes</label>
                                    <textarea name="notes" value={formData.notes} onChange={handleChange} rows="2" />
                                </div>
                                <div className="modal-actions">
                                    <button type="button" className="btn btn-secondary" onClick={closeModal}>Cancel</button>
                                    <button type="submit" className="btn btn-primary">{modalMode === 'create' ? 'Create' : 'Update'}</button>
                                </div>
                            </form>
                        )}
                    </Modal>
                )
            }

            <SalesDrawer
                isOpen={Boolean(drawerItem)}
                loading={drawerLoading}
                onClose={() => setDrawerItem(null)}
                title={`Booking ${drawerItem?.booking_number || ''}`}
                subtitle={drawerItem?.customer_name}
                fields={[
                    { label: 'Customer', value: drawerItem?.customer_name },
                    { label: 'External Order', value: drawerItem?.external_order_number },
                    { label: 'Sales Order', value: drawerItem?.sales_order_number },
                    { label: 'Salesman', value: drawerItem?.sale_person },
                    { label: 'Item', value: drawerItem?.item_name || drawerItem?.vehicle_full_name || drawerItem?.chassis_number || drawerItem?.engine_number || '—' },
                    { label: 'Booking Amount', value: drawerItem?.booking_amount != null ? `PKR ${Number(drawerItem.booking_amount).toLocaleString()}` : '-' },
                    { label: 'Expected Delivery', value: drawerItem?.expected_delivery_date ? new Date(drawerItem.expected_delivery_date).toLocaleDateString('en-GB') : '-' },
                    { label: 'Notes', value: drawerItem?.notes, full: true },
                ]}
                items={drawerItem?.items || []}
                statusOptions={statusOptions}
                status={drawerItem?.status}
                onStatusChange={handleDrawerStatus}
                savingStatus={savingStatus}
                canEditStatus={canAction}
            />
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// SALES ORDERS COMPONENT - FULL CRUD
// ═══════════════════════════════════════════════════════════════════════════

function SalesOrders({ category = 'vehicle' }) {
    const config = categoryConfig(category);
    const docApi = config.sales;
    const invApi = config.invoices;
    const isParts = config.key === 'parts';
    const { user } = useAuth();
    const companyInfo = useCompanyLetterhead();
    const { currency, salesTax, taxAmount: calculateConfiguredTax } = useErpDocumentSettings();
    const [searchParams] = useSearchParams();
    const urlSearch = searchParams.get('search') || '';
    const navigate = useNavigate();
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [modalMode, setModalMode] = useState('create');
    const [selectedItem, setSelectedItem] = useState(null);
    const [selectedIds,setSelectedIds]=useState([]);
    const [sendingEmail, setSendingEmail] = useState(null);
    const { documentHtml, documentLoading } = useSalesDocumentPrintHtml(
        'order',
        selectedItem?.id,
        showModal && modalMode === 'view'
    );
    const { templateHtml, templateLoading } = useSalesHtmlTemplate(
        'order',
        companyInfo?.id,
        showModal && modalMode === 'view'
    );
    const viewLoading = documentLoading || templateLoading;
    const [confirmModal, setConfirmModal] = useState({ isOpen: false, title: '', message: '', onConfirm: null });
    const [showBulkUpload, setShowBulkUpload] = useState(false);

    // Dropdowns
    const [customers, setCustomers] = useState([]);
    const [vehicles, setVehicles] = useState([]);
    const [parts, setParts] = useState([]);
    const [paymentMethods, setPaymentMethods] = useState([]);

    // A sales order may sell any mix of vehicles and parts in one document.
    const [orderLines, setOrderLines] = useState([]);
    const [formData, setFormData] = useState({
        customerId: '', walkIn: false, walkInName: '', walkInPhone: '',
        vehiclePrice: '', accessoriesTotal: '0',
        discountAmount: '0', taxAmount: '0', registrationCharges: '0', insuranceCharges: '0',
        otherCharges: '0', paidAmount: '0', paymentMode: '', financeCompany: '',
        financeAmount: '', exchangeVehicleDetails: '', exchangeValue: '0',
        expectedDeliveryDate: '', notes: ''
    });

    const canCreate = policyAllows(user, 'sales_orders', 'create', ['super_admin','admin','sales_manager'].includes(user?.role));
    // A parts order raises its invoice on the spot — that is what moves stock —
    // so there is nothing to invoice later and nothing to edit afterwards.
    // Dispatch and delivery are a vehicle concern only.
    const canEdit = config.can.editOrder && policyAllows(user, 'sales_orders', 'edit', ['super_admin','sales_manager'].includes(user?.role));
    const canDelete = policyAllows(user, 'sales_orders', 'delete', user?.role === 'super_admin');
    const canDeliverOrInvoice = config.can.deliver
        && ['super_admin', 'admin', 'sales_manager', 'accountant'].includes(user?.role);
    const canEditInvoice = config.can.editInvoice;
    const canSendEmail = config.can.email && policyAllows(user, 'sales_orders', 'sendEmail', ['super_admin','admin','sales_manager','sales_executive'].includes(user?.role));
    const canDownloadPdf = config.can.pdf && policyAllows(user, 'sales_orders', 'downloadPdf', true);

    // Detail drawer
    const [drawerItem, setDrawerItem] = useState(null);
    const [drawerLoading, setDrawerLoading] = useState(false);
    const [savingStatus, setSavingStatus] = useState(false);

    const loadDrawer = useCallback(async (id) => {
        setDrawerLoading(true);
        try {
            const res = await docApi.getOrder(id);
            setDrawerItem(res.data?.data || null);
        } catch (error) {
            toast.error('Failed to load order details');
            setDrawerItem(null);
        } finally {
            setDrawerLoading(false);
        }
    }, []);

    const openDrawer = (row) => { setDrawerItem({ id: row.id }); loadDrawer(row.id); };

    const handleDrawerStatus = async (status) => {
        if (!drawerItem?.id) return;
        setSavingStatus(true);
        try {
            await docApi.updateOrderStatus(drawerItem.id, status);
            toast.success('Status updated');
            await Promise.all([loadDrawer(drawerItem.id), fetchData()]);
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to update status');
        } finally {
            setSavingStatus(false);
        }
    };

    // Filters & Pagination
    const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 });
    const [filters, setFilters] = useState({
        search: urlSearch, status: '', customerId: '',
        dateFrom: '', dateTo: '',
        sortBy: 'created_at', sortOrder: 'desc'
    });
    const debouncedSearch = useDebounce(filters.search, 300);

    const statusOptions = useSalesStatusOptions('sales_orders', [
        { label: 'Pending', value: 'pending' },
        { label: 'Confirmed', value: 'confirmed' },
        { label: 'Invoiced', value: 'invoiced' },
        { label: 'Delivered', value: 'delivered' },
        { label: 'Cancelled', value: 'cancelled' }
    ]);

    const fetchData = useCallback(async () => {
        try {
            setLoading(true);
            const params = {
                ...filters,
                search: debouncedSearch,
                page: pagination.page,
                limit: pagination.limit
            };
            Object.keys(params).forEach(k => (params[k] === '' || params[k] === null) && delete params[k]);

            const res = await docApi.getOrdersWithInvoices(params); // Using new endpoint that supports invoices info
            setData(res.data?.data || []);
            setPagination(prev => ({
                ...prev,
                total: res.data?.pagination?.total || 0,
                totalPages: res.data?.pagination?.totalPages || 0
            }));
        } catch (error) {
            console.error('Error fetching orders:', error);
            setData([]);
        } finally {
            setLoading(false);
        }
    }, [debouncedSearch, filters.status, filters.customerId, filters.dateFrom, filters.dateTo, filters.sortBy, filters.sortOrder, pagination.page, pagination.limit]);

    const fetchDropdowns = useCallback(async () => {
        try {
            const results = await Promise.allSettled([
                fetchAllCustomersForDropdown(),
                vehicleAPI.getAll({ limit: 500 }),
                partsAPI.getAll({ limit: 200 }),
                paymentMethodsAPI.getAll({ status: 'active' })
            ]);
            setCustomers(results[0].status === 'fulfilled' ? results[0].value || [] : []);

            // Only show sale-eligible vehicles in the direct order dropdown
            const vehicleData = results[1].status === 'fulfilled' ? results[1].value?.data?.data?.vehicles || [] : [];
            setVehicles(vehicleData.filter(v => ['at_yard', 'in_transit'].includes(v.status)));

            setParts(results[2].status === 'fulfilled' ? results[2].value?.data?.data?.parts || [] : []);
            setPaymentMethods(results[3].status === 'fulfilled' ? results[3].value?.data?.data || [] : []);
        } catch (error) {
            console.error('Error fetching dropdowns:', error);
        }
    }, []);

    useEffect(() => { fetchDropdowns(); }, [fetchDropdowns]);
    useEffect(() => { fetchData(); }, [fetchData]);
    useEffect(() => { if (searchParams.get('action') === 'create') openModal('create'); }, []);

    const handleFilterChange = (key, value) => {
        setFilters(prev => ({ ...prev, [key]: value }));
        if (key !== 'sortBy' && key !== 'sortOrder') setPagination(prev => ({ ...prev, page: 1 }));
    };

    const clearFilters = () => {
        setFilters({ search: '', status: '', customerId: '', dateFrom: '', dateTo: '', sortBy: 'created_at', sortOrder: 'desc' });
        setPagination(prev => ({ ...prev, page: 1 }));
    };

    const openModal = (mode, item = null) => {
        setModalMode(mode);
        setSelectedItem(item);
        if (item) {
            setOrderLines(categoryLines(item.line_items, config.key).map((line, index) => ({
                key: `saved-${index}`,
                itemType: line.item_type === 'part' ? 'part' : 'vehicle',
                vehicleId: line.vehicle_id || '',
                partId: line.part_id || '',
                quantity: line.quantity || 1,
                unitPrice: line.unit_price ?? '',
                discountAmount: line.discount_amount || 0,
                taxAmount: line.tax_amount || 0,
                description: line.description || '',
            })));
            setFormData({
                customerId: item.customer_id || '',
                walkIn: item.walk_in === true,
                walkInName: item.walk_in_name || '',
                walkInPhone: item.walk_in_phone || '',
                vehiclePrice: item.vehicle_price || '',
                accessoriesTotal: item.accessories_total || '0',
                discountAmount: item.discount_amount || '0',
                taxAmount: item.tax_amount || '0',
                registrationCharges: item.registration_charges || '0',
                insuranceCharges: item.insurance_charges || '0',
                otherCharges: item.other_charges || '0',
                paidAmount: item.paid_amount || '0',
                paymentMode: item.payment_mode || '',
                financeCompany: item.finance_company || '',
                financeAmount: item.finance_amount || '',
                exchangeVehicleDetails: item.exchange_vehicle_details || '',
                exchangeValue: item.exchange_value || '0',
                expectedDeliveryDate: item.expected_delivery_date ? item.expected_delivery_date.split('T')[0] : '',
                notes: item.notes || ''
            });
        } else {
            setOrderLines([]);
            setFormData({
                customerId: '', walkIn: false, walkInName: '', walkInPhone: '',
                vehiclePrice: '', accessoriesTotal: '0',
                discountAmount: '0', taxAmount: '0', registrationCharges: '0', insuranceCharges: '0',
                otherCharges: '0', paidAmount: '0', paymentMode: '', financeCompany: '',
                financeAmount: '', exchangeVehicleDetails: '', exchangeValue: '0',
                expectedDeliveryDate: '', notes: ''
            });
        }
        setShowModal(true);
    };

    const closeModal = () => { setShowModal(false); setSelectedItem(null); };

    // Rule 2 — refresh dropdown and auto-select the customer created inline
    const handleCustomerCreated = useCallback(async (created) => {
        try { setCustomers(await fetchAllCustomersForDropdown()); } catch (_) { /* dropdown refresh best-effort */ }
        const newId = created?._id || created?.id;
        if (newId) setFormData(prev => ({ ...prev, customerId: String(newId) }));
    }, []);

    const handleChange = (e) => {
        const { name, value } = e.target;

        setFormData({ ...formData, [name]: value });
    };

    // Products drive the order subtotal; the editor keeps prices in step.
    const orderSubtotal = orderLines.reduce(
        (sum, line) => sum + (Number(line.unitPrice) || 0) * (Number(line.quantity) || 1)
            - (Number(line.discountAmount) || 0) + (Number(line.taxAmount) || 0),
        0,
    );
    // Handing over more than the total is allowed at the counter — the surplus
    // is change to return, shown here and recorded on the invoice.
    const orderGrandTotal = orderSubtotal
        + Number(formData.accessoriesTotal || 0) + Number(formData.registrationCharges || 0)
        + Number(formData.insuranceCharges || 0) + Number(formData.otherCharges || 0)
        + Number(formData.taxAmount || 0)
        - Number(formData.discountAmount || 0) - Number(formData.exchangeValue || 0);
    const orderChangeDue = Math.max(0, Number(formData.paidAmount || 0) - orderGrandTotal);

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            if (modalMode === 'create' && !orderLines.length) {
                toast.error(isParts ? 'Add at least one part' : 'Add at least one vehicle');
                return;
            }
            const missing = orderLines.find((line) => (line.itemType === 'part' ? !line.partId : !line.vehicleId));
            if (missing) {
                toast.error('Every product line needs a product selected');
                return;
            }
            const payload = {
                ...formData,
                vehiclePrice: orderSubtotal || Number(formData.vehiclePrice || 0),
                lineItems: orderLines.map((line) => ({
                    itemType: line.itemType,
                    vehicleId: line.vehicleId || undefined,
                    partId: line.partId || undefined,
                    quantity: Number(line.quantity) || 1,
                    unitPrice: Number(line.unitPrice) || 0,
                    discountAmount: Number(line.discountAmount) || 0,
                    taxAmount: Number(line.taxAmount) || 0,
                    description: line.description || undefined,
                })),
                taxAmount: Number(formData.taxAmount) > 0 || !salesTax
                    ? Number(formData.taxAmount || 0)
                    : calculateConfiguredTax(orderSubtotal || Number(formData.vehiclePrice || 0), salesTax)
            };
            if (modalMode === 'create') {
                const res = await docApi.createDirectOrder(payload);
                const change = Number(res?.data?.data?.changeDue) || 0;
                toast.success(change > 0
                    ? `Sales order created — return change of ${currency.code} ${change.toLocaleString()}`
                    : 'Sales order created successfully');
            } else if (modalMode === 'edit') {
                await docApi.updateOrder(selectedItem.id, payload);
                toast.success('Sales order updated successfully');
            }
            closeModal();
            fetchData();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Operation failed');
        }
    };

    const handleCancelClick = (item) => {
        setConfirmModal({
            isOpen: true,
            title: 'Cancel Sales Order',
            message: `Are you sure you want to cancel order ${item.order_number}? This action cannot be undone.`,
            type: 'danger',
            onConfirm: async () => {
                try {
                    await docApi.deleteOrder(item.id);
                    toast.success('Order cancelled successfully');
                    setConfirmModal({ isOpen: false });
                    fetchData();
                } catch (error) {
                    toast.error(error.response?.data?.message || 'Failed to cancel order');
                }
            }
        });
    };

    const handleDeliverClick = (item) => {
        setConfirmModal({
            isOpen: true,
            title: 'Mark as Delivered',
            message: `Mark order ${item.order_number} as delivered? This will complete the sales process.`,
            type: 'primary',
            confirmText: 'Mark Delivered',
            onConfirm: async () => {
                try {
                    await docApi.deliverOrder(item.id);
                    toast.success('Order marked as delivered');
                    setConfirmModal({ isOpen: false });
                    fetchData();
                } catch (error) {
                    toast.error(error.response?.data?.message || 'Failed to deliver order');
                }
            }
        });
    };

    const handleSendEmail = async (item) => {
        setSendingEmail(item.id);
        try {
            await docApi.sendOrderEmail(item.id);
            toast.success(`Sales order emailed to ${item.customer_name}`);
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to email sales order');
        } finally {
            setSendingEmail(null);
        }
    };

    const handleGenerateInvoice = (item) => {
        setConfirmModal({
            isOpen: true,
            title: 'Generate Invoice',
            message: `Generate invoice for order ${item.order_number}? This will create a new invoice and update the order status.`,
            type: 'primary',
            confirmText: 'Generate Invoice',
            onConfirm: async () => {
                try {
                    const res = await docApi.generateInvoice(item.id, 30);
                    toast.success(`Invoice ${res.data?.data?.invoiceNumber} generated successfully`);
                    setConfirmModal({ isOpen: false });
                    fetchData();
                    // Navigate to invoices tab
                    navigate('/invoices');
                } catch (error) {
                    toast.error(error.response?.data?.message || 'Failed to generate invoice');
                }
            }
        });
    };

    const handleViewInvoice = (item) => {
        navigate(`/invoices?search=${encodeURIComponent(item.invoice_number || '')}`);
    };

    const handleEditInvoice = (item) => {
        navigate(`/invoices?search=${encodeURIComponent(item.invoice_number || '')}`);
    };

    const handleDeleteInvoice = (item) => {
        setConfirmModal({
            isOpen: true,
            title: 'Delete Invoice',
            message: `Delete invoice ${item.invoice_number}? The order can be re-invoiced afterwards.`,
            type: 'danger',
            onConfirm: async () => {
                try {
                    await invApi.delete(item.invoice_id, { reason: 'Deleted from sales orders view' });
                    toast.success('Invoice deleted');
                    setConfirmModal({ isOpen: false });
                    fetchData();
                } catch (error) {
                    toast.error(error.response?.data?.message || 'Failed to delete invoice');
                }
            }
        });
    };

    const getStatusBadge = (status) => {
        const colors = { confirmed: 'info', invoiced: 'primary', delivered: 'success', cancelled: 'danger', pending: 'warning' };
        return <span className={`badge badge-${colors[status] || 'secondary'}`}>{status?.toUpperCase()}</span>;
    };

    const calculateGrandTotal = () => {
        const price = parseFloat(formData.vehiclePrice) || 0;
        const accessories = parseFloat(formData.accessoriesTotal) || 0;
        const discount = parseFloat(formData.discountAmount) || 0;
        const tax = parseFloat(formData.taxAmount) || 0;
        const registration = parseFloat(formData.registrationCharges) || 0;
        const insurance = parseFloat(formData.insuranceCharges) || 0;
        const other = parseFloat(formData.otherCharges) || 0;
        const exchange = parseFloat(formData.exchangeValue) || 0;
        return price + accessories - discount + tax + registration + insurance + other - exchange;
    };

    if (loading) return <div className="spinner"></div>;

    return (
        <div className="card sales-page">
            <div className="card-header d-flex justify-content-between align-items-center">
                <div><h3>{config.label} Sales Orders</h3>{config.can.bulk && <BulkSalesActions type="order" config={config} selectedRows={data.filter(x=>selectedIds.includes(x.id))} onClear={()=>setSelectedIds([])} onRefresh={fetchData} canEmail={canSendEmail} canPdf={canDownloadPdf} canDelete={canDelete}/>}</div>
                {canCreate && (
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                        <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={() => setShowBulkUpload(true)}
                            title="Bulk upload direct sales orders (CSV / XLSX)"
                        >
                            <Upload size={18} style={{ marginRight: 4 }} />
                            Upload
                        </button>
                        <ScanLink config={config} doc="order" />
                        <button className="btn btn-primary" onClick={() => openModal('create')}>
                            <span className="material-icons" style={{ fontSize: '18px', verticalAlign: 'middle', marginRight: '4px' }}>add</span>
                            Create Direct Order
                        </button>
                    </div>
                )}
            </div>

            <SalesFilterBar
                filters={filters}
                onFilterChange={handleFilterChange}
                onClear={clearFilters}
                onRefresh={fetchData}
                loading={loading}
                statusOptions={statusOptions}
                customers={customers}
            />

            <div className="desktop-table">
                <table className="data-table">
                    <thead>
                        <tr>
                            <th className="sales-select-cell"><input type="checkbox" aria-label="Select all sales orders" checked={data.length>0&&data.every(x=>selectedIds.includes(x.id))} onChange={e=>setSelectedIds(e.target.checked?data.map(x=>x.id):[])}/></th><th>Order #</th>
                            <th>Date</th>
                            <th>Customer</th>
                            <th>Type</th>
                            <th>{config.key === 'parts' ? 'Parts' : 'Vehicles'}</th>
                            <th>Total</th>
                            <th>Paid</th>
                            <th>Invoice</th>
                            <th>Status</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.map(o => (
                            <tr key={o.id} onClick={() => openDrawer(o)} style={{ cursor: 'pointer' }} className={[selectedIds.includes(o.id)?'selected-row':'', Number(o.grand_total) > 0 && Number(o.paid_amount) >= Number(o.grand_total) ? 'sales-row-settled' : ''].filter(Boolean).join(' ')}>
                                <td className="sales-select-cell" onClick={e=>e.stopPropagation()}><input type="checkbox" checked={selectedIds.includes(o.id)} onChange={e=>setSelectedIds(ids=>e.target.checked?[...new Set([...ids,o.id])]:ids.filter(id=>id!==o.id))}/></td>
                                <td>
                                    <strong>{o.order_number}</strong>
                                    {o.external_order_number && <div className="text-muted small">{o.external_order_number}</div>}
                                    {o.booking_number && <div className="text-muted small">Booking {o.booking_number}</div>}
                                </td>
                                <td>{new Date(o.created_at).toLocaleDateString()}</td>
                                <td>
                                    {o.customer_name}
                                    {o.sale_person && <div className="text-muted small">{o.sale_person}</div>}
                                </td>
                                <td><span className={`badge badge-${o.sale_type === 'parts' ? 'secondary' : o.sale_type === 'service' ? 'info' : 'primary'}`} style={{ fontSize: '0.8em' }}>{(o.sale_type || 'vehicle').toUpperCase()}</span></td>
                                <td><ProductCell items={categoryLines(o.line_items, config.key)} fallback={o.item_name || `${o.make_name || ''} ${o.model_name || ''} ${o.variant_name || ''}`.trim() || 'Parts/Services'} /></td>
                                <td>PKR {Number(o.grand_total).toLocaleString()}</td>
                                <td>PKR {Number(o.paid_amount).toLocaleString()}</td>
                                <td>
                                    {o.invoice_number ? (
                                        <span className="badge badge-success" title={`Status: ${o.invoice_status}`}>
                                            {o.invoice_number}
                                            {o.external_invoice_reference && <small style={{ display: 'block' }}>{o.external_invoice_reference}</small>}
                                        </span>
                                    ) : (
                                        <span className="badge badge-secondary">Not Generated</span>
                                    )}
                                </td>
                                <td>{getStatusBadge(o.status)}</td>
                                <td onClick={e=>e.stopPropagation()}>
                                    <ActionButtons
                                        showView={true}
                                        showEdit={canEdit && o.status !== 'delivered' && o.status !== 'cancelled' && !o.invoice_number}
                                        showDelete={canDelete && o.status !== 'delivered' && o.status !== 'cancelled' && !o.invoice_number}
                                        onView={() => openModal('view', o)}
                                        onEdit={() => openModal('edit', o)}
                                        onDelete={() => handleCancelClick(o)}
                                        customActions={[
                                            ...(canDownloadPdf ? [{ icon: <Download size={18}/>, title: 'Download PDF', onClick: () => downloadSalesPdf('order', o.id, o.order_number), className: 'btn-info' }] : []),
                                            ...(canSendEmail ? [{ icon: <Send size={18} className="action-icon" />, title: 'Send sales order email', onClick: () => handleSendEmail(o), className: 'btn-info', disabled: sendingEmail === o.id, loading: sendingEmail === o.id }] : []),
                                            ...(canDeliverOrInvoice && !o.invoice_number && o.status === 'confirmed' ? [{
                                                icon: <FileText size={18} className="action-icon" />,
                                                title: 'Generate Invoice',
                                                onClick: () => handleGenerateInvoice(o),
                                                className: 'btn-info'
                                            }] : []),
                                            ...(canDeliverOrInvoice && o.status === 'dispatched' ? [{
                                                icon: <Truck size={18} className="action-icon" />,
                                                title: 'Mark Delivered',
                                                onClick: () => handleDeliverClick(o),
                                                className: 'btn-success'
                                            }] : []),
                                            ...(o.invoice_number ? [
                                                {
                                                    icon: <FileText size={18} className="action-icon" />,
                                                    title: 'View Invoice',
                                                    onClick: () => handleViewInvoice(o),
                                                    className: 'btn-outline-primary'
                                                },
                                                ...(canEditInvoice && o.invoice_status === 'draft' ? [{
                                                    icon: <Pencil size={18} className="action-icon" />,
                                                    title: 'Edit Invoice',
                                                    onClick: () => handleEditInvoice(o),
                                                    className: 'btn-outline-secondary'
                                                }] : []),
                                                ...(o.invoice_status !== 'paid' && o.invoice_status !== 'void' && o.invoice_status !== 'cancelled' ? [{
                                                    icon: <Trash2 size={18} className="action-icon" />,
                                                    title: 'Delete Invoice',
                                                    onClick: () => handleDeleteInvoice(o),
                                                    className: 'btn-outline-danger'
                                                }] : [])
                                            ] : [])
                                        ]}
                                    />
                                </td>
                            </tr>
                        ))}
                        {data.length === 0 && <tr><td colSpan="10" className="text-center p-4">No sales orders found</td></tr>}
                    </tbody>
                </table>
            </div>
            {data.length > 0 && (
                <div className="mobile-cards-view">
                    <div className="mobile-cards-container">
                        {data.map(o => (
                            <div key={o.id} className="data-card">
                                <div className="data-card-top">
                                    <input className="sales-mobile-select" type="checkbox" checked={selectedIds.includes(o.id)} onChange={e=>setSelectedIds(ids=>e.target.checked?[...new Set([...ids,o.id])]:ids.filter(id=>id!==o.id))}/><div className="data-card-avatar avatar-green">{o.sale_type === 'parts' ? 'P' : o.sale_type === 'service' ? 'S' : 'V'}</div>
                                    <div className="data-card-info">
                                        <span className="data-card-title">{o.order_number}</span>
                                        <span className="data-card-subtitle">{o.customer_name}</span>
                                    </div>
                                    <span className={`badge-pill ${o.sale_type === 'parts' ? 'status-inactive' : o.sale_type === 'service' ? 'status-pending' : 'status-active'}`}>{(o.sale_type || 'vehicle').toUpperCase()}</span>
                                    {getStatusBadge(o.status)}
                                </div>
                                <div className="data-card-body">
                                    <div className="data-card-row"><span className="row-icon">📦</span><span className="row-label">{config.key === 'parts' ? 'Parts' : 'Vehicles'}</span><span className="row-value"><ProductCell items={categoryLines(o.line_items, config.key)} fallback={o.item_name || `${o.make_name || ''} ${o.model_name || ''} ${o.variant_name || ''}`.trim() || 'Parts/Services'} /></span></div>
                                    <div className="data-card-row"><span className="row-icon">💰</span><span className="row-label">Total</span><span className="row-value">PKR {Number(o.grand_total).toLocaleString()}</span></div>
                                    <div className="data-card-row"><span className="row-icon">✅</span><span className="row-label">Paid</span><span className="row-value">PKR {Number(o.paid_amount).toLocaleString()}</span></div>
                                    <div className="data-card-row"><span className="row-icon">📄</span><span className="row-label">Invoice</span><span className="row-value">{o.invoice_number ? <span className="badge-pill status-active">{o.invoice_number}</span> : <span style={{ color: '#94a3b8' }}>Not Generated</span>}</span></div>
                                </div>
                                <div className="data-card-footer">
                                    <ActionButtons
                                        showView={true}
                                        showEdit={canEdit && o.status !== 'delivered' && o.status !== 'cancelled' && !o.invoice_number}
                                        showDelete={canDelete && o.status !== 'delivered' && o.status !== 'cancelled' && !o.invoice_number}
                                        onView={() => openModal('view', o)}
                                        onEdit={() => openModal('edit', o)}
                                        onDelete={() => handleCancelClick(o)}
                                        customActions={[
                                            ...(canDownloadPdf ? [{ icon: <Download size={18}/>, title: 'Download PDF', onClick: () => downloadSalesPdf('order', o.id, o.order_number), className: 'btn-info' }] : []),
                                            ...(canSendEmail ? [{ icon: <Send size={18} className="action-icon" />, title: 'Send sales order email', onClick: () => handleSendEmail(o), className: 'btn-info', disabled: sendingEmail === o.id, loading: sendingEmail === o.id }] : []),
                                            ...(canDeliverOrInvoice && !o.invoice_number && o.status === 'confirmed' ? [{
                                                icon: <FileText size={18} className="action-icon" />,
                                                title: 'Generate Invoice',
                                                onClick: () => handleGenerateInvoice(o),
                                                className: 'btn-info'
                                            }] : []),
                                            ...(canDeliverOrInvoice && o.status === 'dispatched' ? [{
                                                icon: <Truck size={18} className="action-icon" />,
                                                title: 'Mark Delivered',
                                                onClick: () => handleDeliverClick(o),
                                                className: 'btn-success'
                                            }] : []),
                                            ...(o.invoice_number ? [
                                                {
                                                    icon: <FileText size={18} className="action-icon" />,
                                                    title: 'View Invoice',
                                                    onClick: () => handleViewInvoice(o),
                                                    className: 'btn-outline-primary'
                                                },
                                                ...(canEditInvoice && o.invoice_status === 'draft' ? [{
                                                    icon: <Pencil size={18} className="action-icon" />,
                                                    title: 'Edit Invoice',
                                                    onClick: () => handleEditInvoice(o),
                                                    className: 'btn-outline-secondary'
                                                }] : []),
                                                ...(o.invoice_status !== 'paid' && o.invoice_status !== 'void' && o.invoice_status !== 'cancelled' ? [{
                                                    icon: <Trash2 size={18} className="action-icon" />,
                                                    title: 'Delete Invoice',
                                                    onClick: () => handleDeleteInvoice(o),
                                                    className: 'btn-outline-danger'
                                                }] : [])
                                            ] : [])
                                        ]}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <ServerPagination
                page={pagination.page}
                totalPages={pagination.totalPages || 1}
                total={pagination.total}
                limit={pagination.limit}
                onPageChange={(page) => setPagination(prev => ({ ...prev, page }))}
                onPageSizeChange={(limit) => setPagination(prev => ({ ...prev, page: 1, limit }))}
                loading={loading}
            />

            <ConfirmModal
                isOpen={confirmModal.isOpen}
                title={confirmModal.title}
                message={confirmModal.message}
                type={confirmModal.type}
                confirmText={confirmModal.confirmText}
                onConfirm={confirmModal.onConfirm}
                onCancel={() => setConfirmModal({ isOpen: false })}
                loading={sendingEmail}
            />

            {showModal && (
                <Modal
                    title={modalMode === 'view' ? `Sales order ${selectedItem?.order_number || ''}` : modalMode === 'create' ? 'Create Direct Sales Order' : 'Edit Sales Order'}
                    onClose={closeModal}
                    size="large"
                    overlayClassName={modalMode === 'view' ? 'sales-print-modal' : undefined}
                >
                    {modalMode === 'view' ? (
                        <>
                            {viewLoading ? (
                                <div className="spinner" />
                            ) : documentHtml ? (
                                <RenderedHtmlDocumentTemplate htmlString={documentHtml} />
                            ) : templateHtml ? (
                                <RenderedHtmlDocumentTemplate
                                    htmlString={renderSalesTemplate('order', templateHtml, {
                                        companyInfo, selectedItem, formData, customers, vehicles, parts
                                    })}
                                />
                            ) : (
                                <div className="corp-doc">
                                    <CorporatePrintHeader company={companyInfo} />
                                    <CorpDocTitleBar documentTitle="Sales order" reference={selectedItem?.order_number} />
                                    <SalesDocumentMeta
                                        rows={[
                                            { label: 'Order date', value: selectedItem?.created_at ? new Date(selectedItem.created_at).toLocaleString() : '—' },
                                            { label: 'Status', value: selectedItem?.status ? String(selectedItem.status).toUpperCase() : '—' },
                                            { label: 'Invoice', value: selectedItem?.invoice_number || '—' },
                                            { label: 'Printed', value: new Date().toLocaleString() }
                                        ]}
                                    />
                                    <CorpDocSection title="Parties & line item">
                                        <CorpDocKvTable
                                            rows={[
                                                { label: 'Sale type', value: formData.saleType === 'parts' ? 'Parts & accessories' : 'Vehicle sale' },
                                                { label: 'Customer', value: selectedItem?.customer_name || customerLabelById(formData.customerId, customers) },
                                                { label: 'Description', value: resolveOrderItemLine(formData, selectedItem, vehicles, parts) },
                                                {
                                                    label: 'Expected delivery',
                                                    value: formData.expectedDeliveryDate
                                                        ? new Date(`${formData.expectedDeliveryDate}T12:00:00`).toLocaleDateString(undefined, { dateStyle: 'long' })
                                                        : '—'
                                                },
                                                { label: 'Payment mode', value: formData.paymentMode || '—' }
                                            ]}
                                        />
                                    </CorpDocSection>
                                    {(formData.paymentMode && formData.paymentMode.toLowerCase().includes('finance')) && (
                                        <CorpDocSection title="Financing">
                                            <CorpDocKvTable
                                                rows={[
                                                    { label: 'Finance company', value: formData.financeCompany || '—' },
                                                    { label: 'Finance amount', value: formatPKR(formData.financeAmount) }
                                                ]}
                                            />
                                        </CorpDocSection>
                                    )}
                                    {(formData.paymentMode && formData.paymentMode.toLowerCase().includes('exchange')) && (
                                        <CorpDocSection title="Trade-in">
                                            <CorpDocKvTable
                                                rows={[
                                                    { label: 'Vehicle', value: formData.exchangeVehicleDetails || '—' },
                                                    { label: 'Allowance', value: formatPKR(formData.exchangeValue) }
                                                ]}
                                            />
                                        </CorpDocSection>
                                    )}
                                    <CorpDocSection title="Pricing & charges">
                                        <CorpDocFinancialTable
                                            rows={[
                                                { label: formData.saleType === 'vehicle' ? 'Vehicle price' : 'Line total', value: formatPKR(formData.vehiclePrice) },
                                                { label: 'Accessories', value: formatPKR(formData.accessoriesTotal) },
                                                { label: 'Discount', value: formatPKR(formData.discountAmount) },
                                                { label: 'Tax / levies', value: formatPKR(formData.taxAmount) },
                                                { label: 'Registration', value: formatPKR(formData.registrationCharges) },
                                                { label: 'Insurance', value: formatPKR(formData.insuranceCharges) },
                                                { label: 'Other charges', value: formatPKR(formData.otherCharges) },
                                                ...(parseFloat(formData.exchangeValue) > 0
                                                    ? [{ label: 'Trade-in (deducted)', value: `− ${formatPKR(formData.exchangeValue)}` }]
                                                    : []),
                                                { label: 'Collected to date', value: formatPKR(formData.paidAmount) }
                                            ]}
                                            totalLabel="Grand total"
                                            totalValue={formatPKR(calculateGrandTotal())}
                                            balanceLabel="Balance due"
                                            balanceValue={formatPKR(calculateGrandTotal() - (parseFloat(formData.paidAmount) || 0))}
                                        />
                                    </CorpDocSection>
                                    <CorpDocNotes text={formData.notes} />
                                </div>
                            )}
                            <div className="modal-actions" style={{ marginTop: '1rem' }}>
                                <button type="button" className="btn btn-secondary" onClick={closeModal}>Close</button>
                                <button type="button" className="btn btn-primary" onClick={runSalesPrint} disabled={viewLoading}>Print</button>
                            </div>
                        </>
                    ) : (
                        <form onSubmit={handleSubmit}>
                            <div className="form-group">
                                <CustomerField
                                    formData={formData}
                                    onChange={handleChange}
                                    customers={customers}
                                    onCustomerCreated={handleCustomerCreated}
                                />
                            </div>

                            {modalMode === 'create' && (
                                <LineItemsEditor
                                    value={orderLines}
                                    onChange={setOrderLines}
                                    vehicles={vehicles}
                                    parts={parts}
                                    currencyCode={currency.code}
                                    requireInventoryVehicle
                                    category={config.key}
                                />
                            )}

                            <div className="form-row">
                                <div className="form-group">
                                    <label>Products subtotal ({currency.code})</label>
                                    <input type="number" value={modalMode === 'create' ? orderSubtotal : formData.vehiclePrice} readOnly title="Sum of every product line" />
                                </div>
                                <div className="form-group">
                                    <label>Accessories Total</label>
                                    <input type="number" name="accessoriesTotal" value={formData.accessoriesTotal} onChange={handleChange} min="0" />
                                </div>
                            </div>
                            <div className="form-row">
                                <div className="form-group">
                                    <label>Discount Amount</label>
                                    <input type="number" name="discountAmount" value={formData.discountAmount} onChange={handleChange} min="0" />
                                </div>
                                <div className="form-group">
                                    <label>Tax Amount {salesTax ? `(${salesTax.tax_name} ${salesTax.tax_rate}%)` : ''}</label>
                                    <input type="number" name="taxAmount" value={formData.taxAmount} onChange={handleChange} min="0" />
                                </div>
                            </div>
                            <div className="form-row">
                                <div className="form-group">
                                    <label>Registration Charges</label>
                                    <input type="number" name="registrationCharges" value={formData.registrationCharges} onChange={handleChange} min="0" />
                                </div>
                                <div className="form-group">
                                    <label>Insurance Charges</label>
                                    <input type="number" name="insuranceCharges" value={formData.insuranceCharges} onChange={handleChange} min="0" />
                                </div>
                            </div>
                            <div className="form-row">
                                <div className="form-group">
                                    <label>Other Charges</label>
                                    <input type="number" name="otherCharges" value={formData.otherCharges} onChange={handleChange} min="0" />
                                </div>
                                <div className="form-group">
                                    <label>Payment Mode</label>
                                    <SearchableSelect name="paymentMode" value={formData.paymentMode} onChange={handleChange}>
                                        <option value="">Select Payment Method</option>
                                        {paymentMethods.map(pm => (
                                            <option key={pm.id} value={pm.name}>{pm.name}</option>
                                        ))}
                                    </SearchableSelect>
                                </div>
                            </div>
                            {formData.paymentMode && formData.paymentMode.toLowerCase().includes('finance') && (
                                <div className="form-row">
                                    <div className="form-group">
                                        <label>Finance Company</label>
                                        <input type="text" name="financeCompany" value={formData.financeCompany} onChange={handleChange} />
                                    </div>
                                    <div className="form-group">
                                        <label>Finance Amount</label>
                                        <input type="number" name="financeAmount" value={formData.financeAmount} onChange={handleChange} min="0" />
                                    </div>
                                </div>
                            )}
                            {formData.paymentMode && formData.paymentMode.toLowerCase().includes('exchange') && (
                                <div className="form-row">
                                    <div className="form-group">
                                        <label>Exchange Vehicle Details</label>
                                        <input type="text" name="exchangeVehicleDetails" value={formData.exchangeVehicleDetails} onChange={handleChange} placeholder="Make, Model, Year, Condition" />
                                    </div>
                                    <div className="form-group">
                                        <label>Exchange Value</label>
                                        <input type="number" name="exchangeValue" value={formData.exchangeValue} onChange={handleChange} min="0" />
                                    </div>
                                </div>
                            )}
                            <div className="form-row">
                                <div className="form-group">
                                    <label>Amount Received</label>
                                    <input type="number" name="paidAmount" value={formData.paidAmount} onChange={handleChange} min="0" placeholder="What the customer handed over" />
                                    {orderChangeDue > 0 && (
                                        <small style={{ color: '#b45309', fontWeight: 600 }}>
                                            Change to return: {currency.code} {orderChangeDue.toLocaleString()}
                                        </small>
                                    )}
                                </div>
                                <div className="form-group">
                                    <label>Expected Delivery Date</label>
                                    <input type="date" name="expectedDeliveryDate" value={formData.expectedDeliveryDate} onChange={handleChange} />
                                </div>
                            </div>
                            <div className="form-group">
                                <label>Notes</label>
                                <textarea name="notes" value={formData.notes} onChange={handleChange} rows="2" />
                            </div>

                            <div style={{ background: '#f8f9fa', padding: '1rem', borderRadius: '8px', marginTop: '1rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.2em' }}>
                                    <strong>Grand Total:</strong>
                                    <strong style={{ color: '#2563eb' }}>PKR {calculateGrandTotal().toLocaleString()}</strong>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem' }}>
                                    <span>Balance Due:</span>
                                    <span style={{ color: '#dc2626' }}>
                                        PKR {Math.max(0, calculateGrandTotal() - (parseFloat(formData.paidAmount) || 0)).toLocaleString()}
                                    </span>
                                </div>
                                {orderChangeDue > 0 && (
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem' }}>
                                        <span>Change to return:</span>
                                        <strong style={{ color: '#b45309' }}>PKR {orderChangeDue.toLocaleString()}</strong>
                                    </div>
                                )}
                            </div>

                            <div className="modal-actions" style={{ marginTop: '1rem' }}>
                                <button type="button" className="btn btn-secondary" onClick={closeModal}>Cancel</button>
                                <button type="submit" className="btn btn-primary">{modalMode === 'create' ? 'Create Order' : 'Update Order'}</button>
                            </div>
                        </form>
                    )}
                </Modal>
            )}

            <BulkUploadModal
                isOpen={showBulkUpload}
                onClose={() => setShowBulkUpload(false)}
                title="Bulk upload sales orders"
                description="Create direct vehicle orders in bulk using customer_id and vehicle_id from AMS. Required fields use * in the sample headers."
                templateType="sales-orders"
                onCompleted={() => fetchData()}
            />

            <SalesDrawer
                isOpen={Boolean(drawerItem)}
                loading={drawerLoading}
                onClose={() => setDrawerItem(null)}
                title={`Sales Order ${drawerItem?.order_number || ''}`}
                subtitle={drawerItem?.customer_name}
                fields={[
                    { label: 'Date', value: drawerItem?.created_at ? new Date(drawerItem.created_at).toLocaleDateString('en-GB') : '-' },
                    { label: 'Customer', value: drawerItem?.customer_name },
                    { label: 'External Order', value: drawerItem?.external_order_number },
                    { label: 'Booking', value: drawerItem?.booking_number },
                    { label: 'Salesman', value: drawerItem?.sale_person },
                    { label: 'Sale Type', value: drawerItem?.sale_type },
                    { label: 'Item', value: drawerItem?.item_name },
                    { label: 'Invoice', value: drawerItem?.invoice_number || 'Not generated' },
                    { label: 'External Invoice', value: drawerItem?.external_invoice_reference || drawerItem?.external_invoice_number },
                    { label: 'Dispatch', value: drawerItem?.dispatch_number },
                    { label: 'Chassis / VIN', value: drawerItem?.chassis_number || drawerItem?.vin },
                    { label: 'Notes', value: drawerItem?.notes, full: true },
                ]}
                items={drawerItem?.items || []}
                statusOptions={statusOptions}
                status={drawerItem?.status}
                onStatusChange={handleDrawerStatus}
                savingStatus={savingStatus}
                canEditStatus={canEdit}
                totals={{
                    total: drawerItem?.grand_total,
                    paid: drawerItem?.paid_amount,
                    balance: drawerItem?.balance_amount != null
                        ? drawerItem.balance_amount
                        : Number(drawerItem?.grand_total || 0) - Number(drawerItem?.paid_amount || 0),
                }}
            />
        </div>
    );
}


// ═══════════════════════════════════════════════════════════════════════════
// INVOICES COMPONENT - FULL CRUD
// ═══════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════
// INVOICES COMPONENT - FULL CRUD & PROFESSIONAL UI
// ═══════════════════════════════════════════════════════════════════════════

function Invoices({ category = 'vehicle' }) {
    const config = categoryConfig(category);
    const docApi = config.invoices;
    const isParts = config.key === 'parts';
    // A parts invoice consumes stock, so its lines must reference real parts
    // rather than the free-text rows a vehicle/service invoice uses.
    const [partOptions, setPartOptions] = useState([]);
    const [partLines, setPartLines] = useState([]);
    const { user } = useAuth();
    const { currency, salesTax, serviceTax, taxAmount: calculateConfiguredTax } = useErpDocumentSettings();
    const [searchParams] = useSearchParams();
    const urlSearch = searchParams.get('search') || '';
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [modalMode, setModalMode] = useState('view');
    const [selectedItem, setSelectedItem] = useState(null);
    const [selectedIds,setSelectedIds]=useState([]);
    const [sendingEmail, setSendingEmail] = useState(null);
    const [recordingPayment, setRecordingPayment] = useState(false);
    const [invoiceDetails, setInvoiceDetails] = useState(null);
    const [confirmModal, setConfirmModal] = useState({ isOpen: false, title: '', message: '', onConfirm: null });
    const [companyInfo, setCompanyInfo] = useState(null);
    const { documentHtml, documentLoading } = useSalesDocumentPrintHtml(
        'invoice',
        invoiceDetails?.id,
        showModal && modalMode === 'view'
    );
    const { templateHtml, templateLoading } = useSalesHtmlTemplate(
        'invoice',
        companyInfo?.id,
        showModal && modalMode === 'view'
    );
    const viewLoading = documentLoading || templateLoading;

    // Filters & Pagination
    const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 });
    const [filters, setFilters] = useState({
        search: urlSearch, status: '', customerId: '',
        dateFrom: '', dateTo: '',
        sortBy: 'created_at', sortOrder: 'desc'
    });
    const debouncedSearch = useDebounce(filters.search, 300);

    // Payment Modal
    const [showPaymentModal, setShowPaymentModal] = useState(false);
    const [paymentData, setPaymentData] = useState({ amount: '', paymentMethodId: '', referenceNumber: '', notes: '' });
    const [paymentMethods, setPaymentMethods] = useState([]);
    const [invoiceStatuses, setInvoiceStatuses] = useState([]);
    const [serviceTypes, setServiceTypes] = useState([]);

    // Create/Edit Invoice Form
    const [customers, setCustomers] = useState([]);
    const [formData, setFormData] = useState({
        invoiceType: 'sales', customerId: '', walkIn: false, walkInName: '', walkInPhone: '', dueDays: '30', notes: '', termsAndConditions: '',
        status: 'draft',
        paymentMethodId: '',
        initialPaidAmount: '',
        items: [{ description: '', quantity: 1, unitPrice: '', taxAmount: '0' }]
    });

    const canCreate = policyAllows(user, 'invoices', 'create', ['super_admin','admin','sales_manager','accountant'].includes(user?.role));
    // A parts invoice has already consumed stock by the time it exists, so its
    // lines are not editable; cancelling it (delete) is what returns the stock.
    const canEdit = config.can.editInvoice && policyAllows(user, 'invoices', 'edit', ['super_admin','admin','accountant'].includes(user?.role));
    const canDelete = policyAllows(user, 'invoices', 'delete', user?.role === 'super_admin');
    const canRecordPayment = ['super_admin', 'admin', 'sales_manager', 'accountant'].includes(user?.role);

    // Detail drawer (status + payment ledger)
    const [drawerInvoice, setDrawerInvoice] = useState(null);
    const [drawerLoading, setDrawerLoading] = useState(false);
    const [savingStatus, setSavingStatus] = useState(false);

    const loadDrawer = useCallback(async (id) => {
        setDrawerLoading(true);
        try {
            const res = await docApi.getById(id);
            setDrawerInvoice(res.data?.data || null);
        } catch (error) {
            toast.error('Failed to load invoice details');
            setDrawerInvoice(null);
        } finally {
            setDrawerLoading(false);
        }
    }, []);

    const openDrawer = (row) => { setDrawerInvoice({ id: row.id }); loadDrawer(row.id); };

    const handleDrawerStatus = async (status) => {
        if (!drawerInvoice?.id) return;
        setSavingStatus(true);
        try {
            await docApi.updateStatus(drawerInvoice.id, status);
            toast.success('Status updated');
            await Promise.all([loadDrawer(drawerInvoice.id), fetchData()]);
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to update status');
        } finally {
            setSavingStatus(false);
        }
    };

    const handleDrawerPayment = async ({ amount, paymentMethodId, referenceNumber }) => {
        if (!drawerInvoice?.id) return false;
        try {
            await docApi.recordPayment(drawerInvoice.id, { amount, paymentMethodId, referenceNumber });
            toast.success('Payment recorded');
            await Promise.all([loadDrawer(drawerInvoice.id), fetchData()]);
            return true;
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to record payment');
            return false;
        }
    };
    const canSend = config.can.email && policyAllows(user, 'invoices', 'sendEmail', ['super_admin','admin','sales_manager','accountant'].includes(user?.role));
    const canDownloadPdf = config.can.pdf && policyAllows(user, 'invoices', 'downloadPdf', true);

    const fetchData = useCallback(async () => {
        try {
            setLoading(true);
            const params = {
                ...filters,
                search: debouncedSearch,
                page: pagination.page,
                limit: pagination.limit
            };
            Object.keys(params).forEach(k => (params[k] === '' || params[k] === null) && delete params[k]);

            const res = await docApi.getAll(params);
            // Handle both legacy and new response formats
            if (res.data?.success) {
                setData(res.data.data || []);
                if (res.data.pagination) {
                    setPagination(prev => ({
                        ...prev,
                        total: res.data.pagination.total || 0,
                        totalPages: res.data.pagination.pages || res.data.pagination.totalPages || 0
                    }));
                }
            } else {
                setData(res.data || []);
            }
        } catch (error) {
            console.error('Error fetching invoices:', error);
            setData([]);
        } finally {
            setLoading(false);
        }
    }, [debouncedSearch, filters, pagination.page, pagination.limit]);

    // Add filter change handlers
    const handleFilterChange = (key, value) => {
        setFilters(prev => ({ ...prev, [key]: value }));
        if (key !== 'sortBy' && key !== 'sortOrder') setPagination(prev => ({ ...prev, page: 1 }));
    };

    const clearFilters = () => {
        setFilters({ search: '', status: '', customerId: '', dateFrom: '', dateTo: '', sortBy: 'created_at', sortOrder: 'desc' });
        setPagination(prev => ({ ...prev, page: 1 }));
    };

    const fetchDropdowns = useCallback(async () => {
        try {
            const results = await Promise.allSettled([
                fetchAllCustomersForDropdown(),
                docApi.getPaymentMethods(),
                erpSettingsAPI.getCompanies({ limit: 1 }),
                adminAPI.getStatusesByTable('invoices'),
                serviceMasterAPI.getTypes({ is_active: true, limit: 200 }),
                isParts ? partsAPI.getAll({ limit: 500 }) : Promise.resolve(null)
            ]);
            const partsResult = results[5];
            if (partsResult?.status === 'fulfilled' && partsResult.value) {
                setPartOptions(partsResult.value.data?.data?.parts || partsResult.value.data?.data || []);
            }
            setCustomers(results[0].status === 'fulfilled' ? results[0].value || [] : []);
            setPaymentMethods(results[1].status === 'fulfilled' ? results[1].value?.data?.data || [] : []);
            setServiceTypes(results[4].status === 'fulfilled' ? results[4].value?.data?.data || [] : []);

            // Set company info for invoices
            if (results[2].status === 'fulfilled' && results[2].value?.data?.data?.length > 0) {
                setCompanyInfo(results[2].value.data.data[0]);
            }
            // Set invoice statuses (supports both legacy and nested response shapes)
            if (results[3].status === 'fulfilled') {
                const statusPayload = results[3].value?.data?.data;
                const statuses = Array.isArray(statusPayload)
                    ? statusPayload
                    : (Array.isArray(statusPayload?.statuses) ? statusPayload.statuses : []);
                setInvoiceStatuses(statuses.map((status) => ({
                    ...status,
                    is_active: status.is_active ?? status.isActive ?? true,
                    name: status.name || status.status_code || status.value,
                    display_name: status.display_name || status.status_name || status.label,
                })));
            } else {
                setInvoiceStatuses([]);
            }
        } catch (error) {
            console.error('Error fetching dropdowns:', error);
        }
    }, []);

    useEffect(() => {
        fetchData();
        fetchDropdowns();
    }, [fetchData, fetchDropdowns]);

    // Update filters if URL search param changes
    useEffect(() => {
        if (urlSearch) {
            setFilters(prev => ({ ...prev, search: urlSearch }));
        }
    }, [urlSearch]);

    useEffect(() => { if (searchParams.get('action') === 'create') openModal('create'); }, []);

    // Rule 2 — refresh dropdown and auto-select the customer created inline
    const handleCustomerCreated = useCallback(async (created) => {
        try { setCustomers(await fetchAllCustomersForDropdown()); } catch (_) { /* dropdown refresh best-effort */ }
        const newId = created?._id || created?.id;
        if (newId) setFormData(prev => ({ ...prev, customerId: String(newId) }));
    }, []);

    const openModal = async (mode, item = null) => {
        setModalMode(mode);
        setSelectedItem(item);

        if (mode === 'view' && item) {
            try {
                const res = await docApi.getById(item.id);
                setInvoiceDetails(res.data?.data);
            } catch (error) {
                console.error('Error fetching invoice details:', error);
                toast.error('Failed to load invoice details');
            }
        } else if (mode === 'create') {
            setPartLines([]);
            setFormData({
                invoiceType: isParts ? 'parts' : 'sales',
                customerId: '', walkIn: false, walkInName: '', walkInPhone: '', dueDays: '30', notes: '', termsAndConditions: '',
                status: 'draft',
                paymentMethodId: '',
                initialPaidAmount: '',
                items: [{ description: '', quantity: 1, unitPrice: '', taxAmount: '0' }]
            });
        } else if (mode === 'edit' && item) {
            // Load existing data for edit (If API supported full edit, for now used for properties update)
            setFormData({
                ...formData,
                dueDays: item.due_days || '30', // Approximate or fetch
                notes: item.notes || '',
                // Note: Full edit of items would require fetching details first, simplifying to properties for this version
            });
        }
        setShowModal(true);
    };

    const closeModal = () => {
        setShowModal(false);
        setSelectedItem(null);
        setInvoiceDetails(null);
    };

    const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

    const handleItemChange = (index, field, value) => {
        const newItems = [...formData.items];
        newItems[index][field] = value;
        setFormData({ ...formData, items: newItems });
    };

    const addItem = () => {
        setFormData({ ...formData, items: [...formData.items, { description: '', quantity: 1, unitPrice: '', taxAmount: '0' }] });
    };

    const removeItem = (index) => {
        if (formData.items.length > 1) {
            const newItems = formData.items.filter((_, i) => i !== index);
            setFormData({ ...formData, items: newItems });
        }
    };

    const calculateSubtotal = () => {
        return formData.items.reduce((sum, item) => {
            return sum + ((parseFloat(item.quantity) || 0) * (parseFloat(item.unitPrice) || 0));
        }, 0);
    };

    const calculateTotalTax = () => {
        return formData.items.reduce((sum, item) => sum + (parseFloat(item.taxAmount) || 0), 0);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            if (modalMode === 'create') {
                const configuredTax = formData.invoiceType === 'service' ? serviceTax : salesTax;
                // A parts invoice is built from real part lines; every other
                // invoice is still free-text rows.
                if (isParts && !partLines.length) {
                    toast.error('Add at least one part');
                    return;
                }
                if (isParts && partLines.some((line) => !line.partId)) {
                    toast.error('Every line needs a part selected');
                    return;
                }
                const sourceItems = isParts
                    ? partLines.map((line) => ({
                        partId: line.partId,
                        quantity: Number(line.quantity) || 1,
                        unitPrice: Number(line.unitPrice) || 0,
                        discountAmount: Number(line.discountAmount) || 0,
                        taxAmount: Number(line.taxAmount) || 0,
                        description: line.description || undefined,
                    }))
                    : formData.items;
                const preparedItems = sourceItems.map(item => {
                    if (Number(item.taxAmount) > 0 || !configuredTax) return item;
                    const base = (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0);
                    return { ...item, taxAmount: calculateConfiguredTax(base, configuredTax) };
                });
                const preparedSubtotal = preparedItems.reduce((sum, item) => sum + ((Number(item.quantity) || 0) * (Number(item.unitPrice) || 0)), 0);
                const preparedTax = preparedItems.reduce((sum, item) => sum + (Number(item.taxAmount) || 0), 0);
                const invoiceTotal = preparedSubtotal + preparedTax;
                const hasInitialPaymentInput = formData.initialPaidAmount !== '' && formData.initialPaidAmount !== null && formData.initialPaidAmount !== undefined;
                const parsedInitialPaidAmount = hasInitialPaymentInput ? Number(formData.initialPaidAmount) : 0;
                if (hasInitialPaymentInput && Number.isNaN(parsedInitialPaidAmount)) {
                    toast.error('Initial payment must be a valid number');
                    return;
                }
                const amountToRecord = formData.status === 'paid' && parsedInitialPaidAmount <= 0
                    ? invoiceTotal
                    : parsedInitialPaidAmount;

                if ((amountToRecord > 0 || formData.status === 'paid') && !formData.paymentMethodId) {
                    toast.error('Please select payment mode');
                    return;
                }

                if (amountToRecord < 0) {
                    toast.error('Initial payment cannot be negative');
                    return;
                }

                if (amountToRecord > invoiceTotal) {
                    toast.error('Initial payment cannot exceed invoice total');
                    return;
                }

                const submitData = {
                    ...formData,
                    ...(isParts ? { lineItems: preparedItems } : { items: preparedItems }),
                    subtotal: preparedSubtotal,
                    // Line tax already sits on each part line; sending it at the
                    // document level too would tax the sale twice.
                    taxAmount: isParts ? 0 : preparedTax
                };
                delete submitData.paymentMethodId;
                delete submitData.initialPaidAmount;
                const res = await docApi.create(submitData);

                if (amountToRecord > 0) {
                    await docApi.recordPayment(res.data.data.id, {
                        amount: amountToRecord,
                        paymentMethodId: formData.paymentMethodId,
                        referenceNumber: '',
                        notes: 'Initial payment recorded during invoice creation'
                    });
                }

                // Avoid conflicting status writes when payment SP already sets partial/paid.
                const statusHandledByPayment = amountToRecord > 0 && ['partial', 'paid'].includes(formData.status);
                if (formData.status !== 'draft' && !statusHandledByPayment) {
                    await docApi.updateStatus(res.data.data.id, formData.status);
                }

                toast.success('Invoice created successfully');
            } else if (modalMode === 'edit') {
                await docApi.update(selectedItem.id, formData);
                toast.success('Invoice updated successfully');
            }
            closeModal();
            fetchData();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Operation failed');
        }
    };

    const handleVoidClick = (item) => {
        setConfirmModal({
            isOpen: true,
            title: 'Void Invoice',
            message: `Are you sure you want to void invoice ${item.invoice_number}? This action cannot be undone.`,
            type: 'danger',
            onConfirm: async () => {
                try {
                    await docApi.delete(item.id, { reason: 'Voided by user' });
                    toast.success('Invoice voided successfully');
                    setConfirmModal({ isOpen: false });
                    fetchData();
                } catch (error) {
                    toast.error(error.response?.data?.message || 'Failed to void invoice');
                }
            }
        });
    };

    const handleSendClick = (item) => {
        setConfirmModal({
            isOpen: true,
            title: 'Send Invoice Email',
            message: `Email invoice ${item.invoice_number} to its customer?`,
            type: 'primary',
            confirmText: 'Send Email',
            onConfirm: async () => {
                setSendingEmail(item.id);
                try {
                    await docApi.sendEmail(item.id);
                    toast.success('Invoice emailed successfully');
                    setConfirmModal({ isOpen: false });
                    fetchData();
                } catch (error) {
                    toast.error(error.response?.data?.message || 'Failed to email invoice');
                } finally {
                    setSendingEmail(null);
                }
            }
        });
    };

    const openPaymentModal = (item) => {
        setSelectedItem(item);
        setPaymentData({ amount: item.balance_amount || '', paymentMethodId: '', referenceNumber: '', notes: '' });
        setShowPaymentModal(true);
    };

    const handlePaymentChange = (e) => setPaymentData({ ...paymentData, [e.target.name]: e.target.value });

    const handleRecordPayment = async (e) => {
        e.preventDefault();
        if (recordingPayment) return;
        setRecordingPayment(true);
        try {
            const invoiceId = selectedItem.id;
            await docApi.recordPayment(invoiceId, paymentData);
            toast.success('Payment recorded successfully');
            setShowPaymentModal(false);
            setPaymentData({ amount: '', paymentMethodId: '', referenceNumber: '', notes: '' });
            fetchData();
            // Re-open the invoice with fresh details so the new payment (method +
            // reference) shows immediately in the payment history table.
            try {
                const res = await docApi.getById(invoiceId);
                setInvoiceDetails(res.data?.data);
                setModalMode('view');
                setShowModal(true);
            } catch { /* list already refreshed */ }
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to record payment');
        } finally {
            setRecordingPayment(false);
        }
    };

    const getStatusBadge = (status) => {
        const colors = { draft: 'secondary', sent: 'info', partial: 'warning', paid: 'success', overdue: 'danger', cancelled: 'danger' };
        return <span className={`badge badge-${colors[status] || 'secondary'}`}>{status?.toUpperCase()}</span>;
    };

    const statusOptions = useSalesStatusOptions('invoices', [
        { label: 'Draft', value: 'draft' },
        { label: 'Sent', value: 'sent' },
        { label: 'Partial', value: 'partial' },
        { label: 'Paid', value: 'paid' },
        { label: 'Overdue', value: 'overdue' },
        { label: 'Cancelled', value: 'cancelled' }
    ]);
    const createFormStatusOptions = invoiceStatuses
        .filter(status => status.is_active === 1 || status.is_active === true)
        .map(status => ({
            value: status.name || status.status_code,
            label: status.display_name || status.status_name || status.name || status.status_code
        }))
        .filter(option => option.value && option.label);

    if (loading) return <div className="spinner"></div>;

    return (
        <div className="card sales-page">
            <div className="card-header d-flex justify-content-between align-items-center">
                <div><h3>{config.label} Invoices</h3>{config.can.bulk && <BulkSalesActions type="invoice" config={config} selectedRows={data.filter(x=>selectedIds.includes(x.id))} onClear={()=>setSelectedIds([])} onRefresh={fetchData} canEmail={canSend} canPdf={canDownloadPdf} canDelete={canDelete}/>}</div>
                {canCreate && (
                    <div className="sales-header-actions">
                        <ScanLink config={config} doc="order" />
                        <button className="btn btn-primary" onClick={() => openModal('create')}>
                            <span className="material-icons" style={{ fontSize: '18px', verticalAlign: 'middle', marginRight: '4px' }}>add</span>
                            Create Manual Invoice
                        </button>
                    </div>
                )}
            </div>

            <SalesFilterBar
                filters={filters}
                onFilterChange={handleFilterChange}
                onClear={clearFilters}
                onRefresh={fetchData}
                loading={loading}
                statusOptions={statusOptions}
                customers={customers}
            />

            <div className="desktop-table">
                <table className="data-table">
                    <thead>
                        <tr>
                            <th className="sales-select-cell"><input type="checkbox" aria-label="Select all invoices" checked={data.length>0&&data.every(x=>selectedIds.includes(x.id))} onChange={e=>setSelectedIds(e.target.checked?data.map(x=>x.id):[])}/></th><th>Invoice #</th>
                            <th>Date</th>
                            <th>Due Date</th>
                            <th>Customer</th>
                            <th>Type</th>
                            <th>{config.key === 'parts' ? 'Parts' : 'Vehicles'}</th>
                            <th>Total</th>
                            <th>Paid</th>
                            <th>Balance</th>
                            <th>Status</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.map(inv => (
                            <tr
                                key={inv.id}
                                onClick={() => openDrawer(inv)}
                                style={{ cursor: 'pointer' }}
                                className={[
                                    selectedIds.includes(inv.id) ? 'selected-row' : '',
                                    // Settled invoices are tinted so a fully paid row stands out.
                                    Number(inv.balance_amount) <= 0 ? 'sales-row-settled' : '',
                                ].filter(Boolean).join(' ')}
                            >
                                <td className="sales-select-cell" onClick={e=>e.stopPropagation()}><input type="checkbox" checked={selectedIds.includes(inv.id)} onChange={e=>setSelectedIds(ids=>e.target.checked?[...new Set([...ids,inv.id])]:ids.filter(id=>id!==inv.id))}/></td>
                                <td>
                                    <strong>{inv.invoice_number}</strong>
                                    {inv.external_invoice_number && <div className="text-muted small">{inv.external_invoice_number}</div>}
                                </td>
                                <td>{new Date(inv.invoice_date).toLocaleDateString()}</td>
                                <td>{new Date(inv.due_date).toLocaleDateString()}</td>
                                <td>
                                    {inv.customer_name}
                                    {inv.sale_person && <div className="text-muted small">{inv.sale_person}</div>}
                                </td>
                                <td><span className="badge badge-info">{inv.invoice_type?.toUpperCase()}</span></td>
                                <td><ProductCell items={categoryLines(inv.line_items, config.key)} fallback={inv.item_name || 'Parts/Services'} /></td>
                                <td>PKR {Number(inv.total_amount).toLocaleString()}</td>
                                <td>PKR {Number(inv.paid_amount || 0).toLocaleString()}</td>
                                <td style={{ color: inv.balance_amount > 0 ? '#dc2626' : '#16a34a' }}>
                                    PKR {Number(inv.balance_amount).toLocaleString()}
                                </td>
                                <td>{getStatusBadge(inv.status)}</td>
                                <td onClick={e=>e.stopPropagation()}>
                                    <ActionButtons
                                        showView={true}
                                        showEdit={canEdit && inv.status === 'draft'}
                                        showDelete={canDelete && inv.status !== 'paid' && inv.status !== 'cancelled'}
                                        onView={() => openModal('view', inv)}
                                        onEdit={() => openModal('edit', inv)}
                                        onDelete={() => handleVoidClick(inv)}
                                        customActions={[
                                            ...(canDownloadPdf ? [{ icon: <Download size={18}/>, title: 'Download PDF', onClick: () => downloadSalesPdf('invoice', inv.id, inv.invoice_number), className: 'btn-info' }] : []),
                                            ...(canSend && inv.status !== 'cancelled' ? [{
                                                icon: <Send size={18} className="action-icon" />,
                                                title: 'Send invoice email',
                                                onClick: () => handleSendClick(inv),
                                                className: 'btn-info',
                                                disabled: sendingEmail === inv.id,
                                                loading: sendingEmail === inv.id
                                            }] : []),
                                            ...(canRecordPayment && inv.status !== 'paid' && inv.status !== 'cancelled' && inv.balance_amount > 0 ? [{
                                                icon: <DollarSign size={18} className="action-icon" />,
                                                title: 'Record Payment',
                                                onClick: () => openPaymentModal(inv),
                                                className: 'btn-success'
                                            }] : [])
                                        ]}
                                    />
                                </td>
                            </tr>
                        ))}
                        {data.length === 0 && <tr><td colSpan="11" className="text-center p-4">No invoices found</td></tr>}
                    </tbody>
                </table>
            </div>
            {data.length > 0 && (
                <div className="mobile-cards-view">
                    <div className="mobile-cards-container">
                        {data.map(inv => (
                            <div key={inv.id} className="data-card">
                                <div className="data-card-top">
                                    <input className="sales-mobile-select" type="checkbox" checked={selectedIds.includes(inv.id)} onChange={e=>setSelectedIds(ids=>e.target.checked?[...new Set([...ids,inv.id])]:ids.filter(id=>id!==inv.id))}/><div className="data-card-avatar avatar-rose">I</div>
                                    <div className="data-card-info">
                                        <span className="data-card-title">{inv.invoice_number}</span>
                                        <span className="data-card-subtitle">{inv.customer_name}</span>
                                    </div>
                                    <span className="badge-pill status-pending">{inv.invoice_type?.toUpperCase()}</span>
                                    {getStatusBadge(inv.status)}
                                </div>
                                <div className="data-card-body">
                                    <div className="data-card-row"><span className="row-icon">💰</span><span className="row-label">Total</span><span className="row-value">PKR {Number(inv.total_amount).toLocaleString()}</span></div>
                                    <div className="data-card-row"><span className="row-icon">✅</span><span className="row-label">Paid</span><span className="row-value">PKR {Number(inv.paid_amount || 0).toLocaleString()}</span></div>
                                    <div className="data-card-row">
                                        <span className="row-icon">⚖️</span><span className="row-label">Balance</span>
                                        <span className="row-value" style={{ color: inv.balance_amount > 0 ? '#dc2626' : '#16a34a' }}>PKR {Number(inv.balance_amount).toLocaleString()}</span>
                                    </div>
                                </div>
                                <div className="data-card-footer">
                                    <ActionButtons
                                        showView={true}
                                        showEdit={canEdit && inv.status === 'draft'}
                                        showDelete={canDelete && inv.status !== 'paid' && inv.status !== 'cancelled'}
                                        onView={() => openModal('view', inv)}
                                        onEdit={() => openModal('edit', inv)}
                                        onDelete={() => handleVoidClick(inv)}
                                        customActions={[
                                            ...(canDownloadPdf ? [{ icon: <Download size={18}/>, title: 'Download PDF', onClick: () => downloadSalesPdf('invoice', inv.id, inv.invoice_number), className: 'btn-info' }] : []),
                                            ...(canSend && inv.status !== 'cancelled' ? [{
                                                icon: <Send size={18} className="action-icon" />,
                                                title: 'Send invoice email',
                                                onClick: () => handleSendClick(inv),
                                                className: 'btn-info',
                                                disabled: sendingEmail === inv.id,
                                                loading: sendingEmail === inv.id
                                            }] : []),
                                            ...(canRecordPayment && inv.status !== 'paid' && inv.status !== 'cancelled' && inv.balance_amount > 0 ? [{
                                                icon: <DollarSign size={18} className="action-icon" />,
                                                title: 'Record Payment',
                                                onClick: () => openPaymentModal(inv),
                                                className: 'btn-success'
                                            }] : [])
                                        ]}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <ServerPagination
                page={pagination.page}
                totalPages={pagination.totalPages || 1}
                total={pagination.total}
                limit={pagination.limit}
                onPageChange={(page) => setPagination(prev => ({ ...prev, page }))}
                onPageSizeChange={(limit) => setPagination(prev => ({ ...prev, page: 1, limit }))}
                loading={loading}
            />

            <ConfirmModal
                isOpen={confirmModal.isOpen}
                title={confirmModal.title}
                message={confirmModal.message}
                type={confirmModal.type}
                confirmText={confirmModal.confirmText}
                onConfirm={confirmModal.onConfirm}
                onCancel={() => setConfirmModal({ isOpen: false })}
                loading={sendingEmail}
            />

            <SalesDrawer
                isOpen={Boolean(drawerInvoice)}
                loading={drawerLoading}
                onClose={() => setDrawerInvoice(null)}
                title={`Invoice ${drawerInvoice?.invoice_number || ''}`}
                subtitle={drawerInvoice?.customer_name}
                fields={[
                    { label: 'Invoice Date', value: drawerInvoice?.invoice_date ? new Date(drawerInvoice.invoice_date).toLocaleDateString('en-GB') : '-' },
                    { label: 'External Invoice', value: drawerInvoice?.external_invoice_number },
                    { label: 'Sales Order', value: drawerInvoice?.order_number },
                    { label: 'Booking', value: drawerInvoice?.booking_number },
                    { label: 'Salesman', value: drawerInvoice?.sale_person },
                    { label: 'Due Date', value: drawerInvoice?.due_date ? new Date(drawerInvoice.due_date).toLocaleDateString('en-GB') : '-' },
                    { label: 'Customer', value: drawerInvoice?.customer_name },
                    { label: 'Type', value: drawerInvoice?.invoice_type },
                    { label: 'Notes', value: drawerInvoice?.notes, full: true },
                ]}
                items={drawerInvoice?.items || []}
                statusOptions={statusOptions}
                status={drawerInvoice?.status}
                onStatusChange={handleDrawerStatus}
                savingStatus={savingStatus}
                canEditStatus={canEdit}
                totals={{
                    total: drawerInvoice?.total_amount,
                    paid: drawerInvoice?.paid_amount,
                    balance: drawerInvoice?.balance_amount,
                }}
                payments={drawerInvoice?.payments || []}
                paymentMethods={paymentMethods}
                onRecordPayment={canRecordPayment ? handleDrawerPayment : null}
            />

            {/* View Invoice Modal */}
            {showModal && modalMode === 'view' && invoiceDetails && (
                <Modal title={`Invoice ${invoiceDetails.invoice_number}`} onClose={closeModal} size="large" overlayClassName="sales-print-modal">
                    <>
                    {viewLoading ? (
                        <div className="spinner" style={{ minHeight: '200px' }} />
                    ) : documentHtml ? (
                        <RenderedHtmlDocumentTemplate htmlString={documentHtml} />
                    ) : templateHtml ? (
                        <RenderedHtmlDocumentTemplate
                            htmlString={renderSalesTemplate('invoice', templateHtml, { companyInfo, invoiceDetails })}
                        />
                    ) : (
                    <div style={{ padding: '1.5rem', fontFamily: 'Inter, sans-serif' }}>
                        {/* Professional Header */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2rem', borderBottom: '2px solid #f3f4f6', paddingBottom: '1.5rem' }}>
                            <div>
                                <h2 style={{ margin: '0 0 0.5rem 0', color: '#111827' }}>{invoiceDetails.company_name || 'Company Name'}</h2> {/* Snapshot Name */}
                                <p style={{ color: '#6b7280', margin: '0.2rem 0' }}>{invoiceDetails.company_address}</p>
                                <p style={{ color: '#6b7280', margin: '0.2rem 0' }}>{invoiceDetails.company_phone} | {invoiceDetails.company_email}</p>
                                <p style={{ color: '#6b7280', margin: '0.2rem 0' }}>NTN: {invoiceDetails.company_ntn}</p>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                                <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#374151', marginBottom: '0.5rem' }}>INVOICE</div>
                                <div style={{ color: '#6b7280' }}># {invoiceDetails.invoice_number}</div>
                                <div style={{ marginTop: '0.5rem' }}>{getStatusBadge(invoiceDetails.status)}</div>
                            </div>
                        </div>

                        {/* Bill To & Details */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2rem' }}>
                            <div style={{ flex: 1 }}>
                                <h6 style={{ color: '#9ca3af', textTransform: 'uppercase', fontSize: '0.75rem', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>Bill To</h6>
                                <h5 style={{ margin: '0 0 0.25rem 0', color: '#111827' }}>{invoiceDetails.customer_name}</h5>
                                <p style={{ color: '#4b5563', margin: '0' }}>{invoiceDetails.customer_address}</p>
                                <p style={{ color: '#4b5563', margin: '0' }}>{invoiceDetails.customer_phone}</p>
                                <p style={{ color: '#4b5563', margin: '0' }}>{invoiceDetails.customer_email}</p>
                            </div>
                            <div style={{ flex: 1, textAlign: 'right' }}>
                                <div style={{ marginBottom: '0.5rem' }}>
                                    <span style={{ color: '#6b7280', marginRight: '1rem' }}>Invoice Date:</span>
                                    <span style={{ fontWeight: '500', color: '#111827' }}>{new Date(invoiceDetails.invoice_date).toLocaleDateString()}</span>
                                </div>
                                <div style={{ marginBottom: '0.5rem' }}>
                                    <span style={{ color: '#6b7280', marginRight: '1rem' }}>Due Date:</span>
                                    <span style={{ fontWeight: '500', color: '#111827' }}>{new Date(invoiceDetails.due_date).toLocaleDateString()}</span>
                                </div>
                                {invoiceDetails.order_number && (
                                    <div style={{ marginBottom: '0.5rem' }}>
                                        <span style={{ color: '#6b7280', marginRight: '1rem' }}>Reference:</span>
                                        <span style={{ fontWeight: '500', color: '#111827' }}>{invoiceDetails.order_number}</span>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Items Table - Professional Look */}
                        {invoiceDetails.items && invoiceDetails.items.length > 0 && (
                            <div style={{ marginBottom: '2rem', borderRadius: '8px', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                    <thead style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                                        <tr>
                                            <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontSize: '0.75rem', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>Description</th>
                                            <th style={{ padding: '0.75rem 1rem', textAlign: 'right', fontSize: '0.75rem', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>Qty</th>
                                            <th style={{ padding: '0.75rem 1rem', textAlign: 'right', fontSize: '0.75rem', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>Price</th>
                                            <th style={{ padding: '0.75rem 1rem', textAlign: 'right', fontSize: '0.75rem', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>Tax</th>
                                            <th style={{ padding: '0.75rem 1rem', textAlign: 'right', fontSize: '0.75rem', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>Amount</th>
                                        </tr>
                                    </thead>
                                    <tbody style={{ background: 'white' }}>
                                        {invoiceDetails.items.map((item, i) => (
                                            <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                                <td style={{ padding: '0.75rem 1rem', color: '#111827' }}>{item.description}</td>
                                                <td style={{ padding: '0.75rem 1rem', textAlign: 'right', color: '#4b5563' }}>{item.quantity}</td>
                                                <td style={{ padding: '0.75rem 1rem', textAlign: 'right', color: '#4b5563' }}>PKR {Number(item.unit_price).toLocaleString()}</td>
                                                <td style={{ padding: '0.75rem 1rem', textAlign: 'right', color: '#4b5563' }}>PKR {Number(item.tax_amount || 0).toLocaleString()}</td>
                                                <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: '500', color: '#111827' }}>PKR {Number(item.total).toLocaleString()}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {/* Totals Section */}
                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '2rem' }}>
                            <div style={{ width: '300px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', paddingBottom: '0.5rem', borderBottom: '1px solid #f3f4f6' }}>
                                    <span style={{ color: '#6b7280' }}>Subtotal</span>
                                    <span style={{ color: '#111827', fontWeight: '500' }}>PKR {Number(invoiceDetails.subtotal || 0).toLocaleString()}</span>
                                </div>
                                {invoiceDetails.discount_amount > 0 && (
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', paddingBottom: '0.5rem', borderBottom: '1px solid #f3f4f6' }}>
                                        <span style={{ color: '#6b7280' }}>Discount</span>
                                        <span style={{ color: '#16a34a', fontWeight: '500' }}>- PKR {Number(invoiceDetails.discount_amount).toLocaleString()}</span>
                                    </div>
                                )}
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', paddingBottom: '0.5rem', borderBottom: '1px solid #f3f4f6' }}>
                                    <span style={{ color: '#6b7280' }}>Tax</span>
                                    <span style={{ color: '#111827', fontWeight: '500' }}>PKR {Number(invoiceDetails.tax_amount || 0).toLocaleString()}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem', fontSize: '1.25rem' }}>
                                    <span style={{ fontWeight: '600', color: '#111827' }}>Total</span>
                                    <span style={{ fontWeight: '700', color: '#2563eb' }}>PKR {Number(invoiceDetails.total_amount).toLocaleString()}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1rem', background: '#f9fafb', padding: '0.75rem', borderRadius: '6px' }}>
                                    <span style={{ color: '#6b7280' }}>Amount Due</span>
                                    <span style={{ fontWeight: '700', color: invoiceDetails.balance_amount > 0 ? '#dc2626' : '#16a34a' }}>
                                        PKR {Number(invoiceDetails.balance_amount || 0).toLocaleString()}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Payment History and Notes Split */}
                        <div style={{ display: 'flex', gap: '2rem', marginTop: '2rem', borderTop: '2px solid #f3f4f6', paddingTop: '2rem' }}>
                            <div style={{ flex: 1 }}>
                                {invoiceDetails.notes && (
                                    <>
                                        <h6 style={{ fontSize: '0.85rem', fontWeight: '600', color: '#374151', marginBottom: '0.5rem' }}>Notes</h6>
                                        <p style={{ color: '#6b7280', fontSize: '0.9rem', whiteSpace: 'pre-wrap', lineHeight: '1.5' }}>{invoiceDetails.notes}</p>
                                    </>
                                )}
                                {invoiceDetails.terms_and_conditions && (
                                    <div style={{ marginTop: '1.5rem' }}>
                                        <h6 style={{ fontSize: '0.85rem', fontWeight: '600', color: '#374151', marginBottom: '0.5rem' }}>Terms & Conditions</h6>
                                        <p style={{ color: '#6b7280', fontSize: '0.8rem', whiteSpace: 'pre-wrap' }}>{invoiceDetails.terms_and_conditions}</p>
                                    </div>
                                )}
                            </div>

                            {invoiceDetails.payments && invoiceDetails.payments.length > 0 && (
                                <div style={{ flex: 1 }}>
                                    <h6 style={{ fontSize: '0.85rem', fontWeight: '600', color: '#374151', marginBottom: '1rem' }}>Payment History</h6>
                                    <div style={{ border: '1px solid #e5e7eb', borderRadius: '6px', overflow: 'hidden' }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                                            <thead>
                                                <tr style={{ background: '#f9fafb', color: '#6b7280', textAlign: 'left' }}>
                                                    <th style={{ padding: '0.5rem 0.75rem', fontWeight: '600' }}>Date</th>
                                                    <th style={{ padding: '0.5rem 0.75rem', fontWeight: '600' }}>Method</th>
                                                    <th style={{ padding: '0.5rem 0.75rem', fontWeight: '600' }}>Reference</th>
                                                    <th style={{ padding: '0.5rem 0.75rem', fontWeight: '600', textAlign: 'right' }}>Amount</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {invoiceDetails.payments.map((payment, i) => (
                                                    <tr key={payment.id || i} style={{ borderTop: '1px solid #f3f4f6', background: '#fff' }}>
                                                        <td style={{ padding: '0.5rem 0.75rem', color: '#4b5563' }}>{payment.payment_date ? new Date(payment.payment_date).toLocaleDateString('en-GB') : '—'}</td>
                                                        <td style={{ padding: '0.5rem 0.75rem', color: '#111827', fontWeight: '500', textTransform: 'capitalize' }}>{payment.payment_method_name || '—'}</td>
                                                        <td style={{ padding: '0.5rem 0.75rem', color: '#6b7280' }}>{payment.reference_number || '—'}</td>
                                                        <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right', fontWeight: '600', color: '#16a34a' }}>PKR {Number(payment.amount || 0).toLocaleString()}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}
                        </div>

                    </div>
                    )}
                    <div className="modal-actions" style={{ marginTop: '2rem' }}>
                        <button className="btn btn-secondary" onClick={closeModal}>Close</button>
                        {canSend && invoiceDetails.status === 'draft' && (
                            <button className="btn btn-info" onClick={() => { closeModal(); handleSendClick(invoiceDetails); }} disabled={sendingEmail === invoiceDetails.id}>
                                {sendingEmail === invoiceDetails.id ? <><span className="spinner-mini"></span> Sending...</> : 'Send Invoice'}
                            </button>
                        )}
                        {canRecordPayment && invoiceDetails.status !== 'paid' && invoiceDetails.status !== 'cancelled' && invoiceDetails.balance_amount > 0 && (
                            <button className="btn btn-success" onClick={() => { closeModal(); openPaymentModal(invoiceDetails); }}>
                                Record Payment
                            </button>
                        )}
                        <button className="btn btn-primary" onClick={runSalesPrint} disabled={viewLoading}>Print</button>
                    </div>
                    </>
                </Modal>
            )}

            {/* Create Manual Invoice Modal - BIG POPUP */}
            {showModal && modalMode === 'create' && (
                <Modal title="Create Professional Invoice" onClose={closeModal} size="large">
                    <div style={{ padding: '0 1.5rem 1.5rem', fontFamily: 'Inter, sans-serif' }}>
                        {/* Company Header Snapshot */}
                        <div className="invoice-form-header">
                            <div style={{ textAlign: 'right' }}>
                                <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#374151', marginBottom: '0.5rem' }}>NEW INVOICE</div>
                                <div style={{ color: '#6b7280' }}>DRAFT</div>
                                <div style={{ marginTop: '0.5rem', fontSize: '0.9rem', color: '#9ca3af' }}>{new Date().toLocaleDateString()}</div>
                            </div>
                        </div>

                        <form onSubmit={handleSubmit}>
                            <div className="invoice-form-layout">
                                {/* Left Col */}
                                <div className="invoice-form-left">
                                    <div className="form-row">
                                        <div className="form-group" style={{ flex: 2 }}>
                                            <CustomerField
                                                formData={formData}
                                                onChange={handleChange}
                                                customers={customers}
                                                onCustomerCreated={handleCustomerCreated}
                                            />
                                        </div>
                                        <div className="form-group" style={{ flex: 1, display: isParts ? 'none' : undefined }}>
                                            <label>Invoice Type</label>
                                            <SearchableSelect name="invoiceType" value={formData.invoiceType} onChange={handleChange}>
                                                <option value="sales">Sales</option>
                                                <option value="service">Service</option>
                                                <option value="parts">Parts</option>
                                            </SearchableSelect>
                                        </div>
                                    </div>

                                    <div className="card" style={{ padding: '1rem', border: '1px solid #e5e7eb', boxShadow: 'none' }}>
                                        {isParts ? (
                                            // Real part lines: this invoice takes the stock off the
                                            // shelf the moment it is saved.
                                            <LineItemsEditor
                                                value={partLines}
                                                onChange={setPartLines}
                                                parts={partOptions}
                                                currencyCode={currency.code}
                                                category="parts"
                                            />
                                        ) : (
                                        <>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                                            <h5 style={{ margin: 0, fontSize: '1rem', fontWeight: '600' }}>Line Items</h5>
                                            <button type="button" className="btn btn-secondary btn-sm" onClick={addItem}>+ Add Item</button>
                                        </div>
                                        <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                                            {formData.items.map((item, index) => (
                                                <div key={index} className="invoice-line-item-row">
                                                    <div className="invoice-line-item-desc">
                                                        <label style={{ fontSize: '0.75rem' }}>Description</label>
                                                        {formData.invoiceType === 'service' ? (
                                                            <SearchableSelect
                                                                value={item.serviceTypeId || ''}
                                                                onChange={(e) => {
                                                                    const service = serviceTypes.find(s => String(s._id || s.id) === String(e.target.value));
                                                                    handleItemChange(index, 'serviceTypeId', e.target.value);
                                                                    handleItemChange(index, 'description', service?.name || '');
                                                                    if (service?.basePrice !== undefined) handleItemChange(index, 'unitPrice', service.basePrice);
                                                                }}
                                                                required
                                                            >
                                                                <option value="">Select Service</option>
                                                                {serviceTypes.map(service => <option key={service._id || service.id} value={service._id || service.id}>{service.name} {service.basePrice ? `(PKR ${Number(service.basePrice).toLocaleString()})` : ''}</option>)}
                                                            </SearchableSelect>
                                                        ) : (
                                                            <input type="text" value={item.description} onChange={(e) => handleItemChange(index, 'description', e.target.value)} required placeholder="Item Name / Service" />
                                                        )}
                                                    </div>
                                                    <div className="invoice-line-item-qty">
                                                        <label style={{ fontSize: '0.75rem' }}>Qty</label>
                                                        <input type="number" value={item.quantity} onChange={(e) => handleItemChange(index, 'quantity', e.target.value)} required min="1" />
                                                    </div>
                                                    <div className="invoice-line-item-price">
                                                        <label style={{ fontSize: '0.75rem' }}>Price</label>
                                                        <input type="number" value={item.unitPrice} onChange={(e) => handleItemChange(index, 'unitPrice', e.target.value)} required min="0" />
                                                    </div>
                                                    <div className="invoice-line-item-tax">
                                                        <label style={{ fontSize: '0.75rem' }}>Tax {((formData.invoiceType === 'service' ? serviceTax : salesTax) ? `(${(formData.invoiceType === 'service' ? serviceTax : salesTax).tax_name} ${(formData.invoiceType === 'service' ? serviceTax : salesTax).tax_rate}%)` : '')}</label>
                                                        <input type="number" value={item.taxAmount} onChange={(e) => handleItemChange(index, 'taxAmount', e.target.value)} min="0" />
                                                    </div>
                                                    <div className="invoice-line-item-actions">
                                                        {formData.items.length > 1 && (
                                                            <button type="button" className="btn btn-danger btn-sm" onClick={() => removeItem(index)} title="Remove Item">
                                                                <span className="material-icons" style={{ fontSize: '16px' }}>delete</span>
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                        </>
                                        )}
                                    </div>
                                </div>

                                {/* Right Col */}
                                <div className="invoice-summary">
                                    <h5 style={{ marginTop: 0, marginBottom: '1.5rem', color: '#374151' }}>Summary</h5>

                                    <div className="form-group">
                                        <label>Created Date</label>
                                        <div style={{ padding: '0.5rem', background: '#fff', border: '1px solid #d1d5db', borderRadius: '6px', color: '#6b7280' }}>{new Date().toLocaleDateString()}</div>
                                    </div>
                                    <div className="form-group">
                                        <label>Due In (Days)</label>
                                        <input type="number" name="dueDays" value={formData.dueDays} onChange={handleChange} min="0" max="365" />
                                    </div>

                                    <div className="form-group">
                                        <label>Status</label>
                                        <SearchableSelect
                                            name="status"
                                            value={formData.status}
                                            onChange={handleChange}
                                            options={createFormStatusOptions.length > 0 ? createFormStatusOptions : statusOptions}
                                            labelField="label"
                                            valueField="value"
                                            placeholder="Select..."
                                            style={{ borderColor: formData.status !== 'draft' ? '#16a34a' : '' }}
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>Payment Mode</label>
                                        <SearchableSelect
                                            name="paymentMethodId"
                                            value={formData.paymentMethodId}
                                            onChange={handleChange}
                                            options={paymentMethods.map(pm => ({ label: pm.name, value: String(pm.id) }))}
                                            labelField="label"
                                            valueField="value"
                                            placeholder="Select..."
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>Initial Payment</label>
                                        <input
                                            type="number"
                                            name="initialPaidAmount"
                                            value={formData.initialPaidAmount}
                                            onChange={handleChange}
                                            min="0"
                                            step="0.01"
                                            placeholder="0.00"
                                        />
                                    </div>

                                    <div style={{ borderTop: '2px solid #e5e7eb', marginTop: '1.5rem', paddingTop: '1.5rem' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                                            <span style={{ color: '#6b7280' }}>Subtotal</span>
                                            <strong>{calculateSubtotal().toLocaleString()}</strong>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                                            <span style={{ color: '#6b7280' }}>Tax</span>
                                            <strong>{calculateTotalTax().toLocaleString()}</strong>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.25rem', marginTop: '1rem', color: '#2563eb' }}>
                                            <strong>Total</strong>
                                            <strong>{currency.symbol} {(calculateSubtotal() + calculateTotalTax()).toLocaleString()}</strong>
                                        </div>
                                    </div>

                                    <div className="modal-actions" style={{ flexDirection: 'column', gap: '0.75rem', marginTop: '2rem' }}>
                                        <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: '0.75rem', fontSize: '1rem' }}>
                                            {formData.status === 'draft' ? 'Save as Draft' : 'Create & Send'}
                                        </button>
                                        <button type="button" className="btn btn-secondary" onClick={closeModal} style={{ width: '100%' }}>Cancel</button>
                                    </div>
                                </div>
                            </div>
                        </form>
                    </div>
                </Modal>
            )}

            {/* Record Payment Modal */}
            {showPaymentModal && selectedItem && (
                <Modal title={`Record Payment - ${selectedItem.invoice_number}`} onClose={() => setShowPaymentModal(false)} size="medium">
                    <form onSubmit={handleRecordPayment}>
                        <div style={{ background: '#dbeafe', padding: '1rem', borderRadius: '8px', marginBottom: '1rem', color: '#1e40af' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span>Invoice Total:</span>
                                <strong>PKR {Number(selectedItem.total_amount).toLocaleString()}</strong>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.25rem' }}>
                                <span>Outstanding Balance:</span>
                                <strong style={{ color: '#dc2626' }}>PKR {Number(selectedItem.balance_amount).toLocaleString()}</strong>
                            </div>
                        </div>

                        <div className="form-group">
                            <label>Payment Amount *</label>
                            <input
                                type="number"
                                name="amount"
                                value={paymentData.amount}
                                onChange={handlePaymentChange}
                                required
                                min="0.01"
                                max={selectedItem.balance_amount}
                                step="0.01"
                            />
                        </div>

                        <div className="form-group">
                            <label>Payment Method *</label>
                            <SearchableSelect name="paymentMethodId" value={paymentData.paymentMethodId} onChange={handlePaymentChange} required>
                                <option value="">Select Payment Method</option>
                                {paymentMethods.map(pm => (
                                    <option key={pm.id} value={pm.id}>{pm.name}</option>
                                ))}
                            </SearchableSelect>
                        </div>

                        <div className="form-group">
                            <label>Reference Number</label>
                            <input type="text" name="referenceNumber" value={paymentData.referenceNumber} onChange={handlePaymentChange} placeholder="Check/Transaction Number" />
                        </div>

                        <div className="form-group">
                            <label>Notes</label>
                            <textarea name="notes" value={paymentData.notes} onChange={handlePaymentChange} rows="2" />
                        </div>

                        <div className="modal-actions">
                            <button type="button" className="btn btn-secondary" onClick={() => setShowPaymentModal(false)} disabled={recordingPayment}>Cancel</button>
                            <button type="submit" className="btn btn-success" disabled={recordingPayment}>
                                {recordingPayment ? <><span className="spinner-mini"></span> Recording...</> : 'Record Payment'}
                            </button>
                        </div>
                    </form>
                </Modal>
            )}
        </div>
    );
}


// ═══════════════════════════════════════════════════════════════════════════
// GENERIC MODAL COMPONENT (Internal)
// ═══════════════════════════════════════════════════════════════════════════

const Modal = ({ title, children, onClose, size = 'medium', overlayClassName }) => {
    const printRootId = overlayClassName && String(overlayClassName).includes('sales-print-modal')
        ? 'ams-active-sales-print'
        : undefined;

    // Rule 4 — every modal closes on ESC. Skip when a nested modal
    // (e.g. customer quick create) is stacked on top of this one.
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key !== 'Escape') return;
            if (document.querySelectorAll('.modal-overlay').length > 1) return;
            onClose();
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [onClose]);

    return (
        <div
            id={printRootId}
            className={`modal-overlay${overlayClassName ? ` ${overlayClassName}` : ''}`}
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div className={`modal-content ${size === 'large' ? 'modal-lg' : ''}`} style={size === 'large' ? { maxWidth: '1200px', width: '95%' } : {}}>
                <div className="modal-header">
                    <h3>{title}</h3>
                    <button type="button" className="close-btn" onClick={onClose} aria-label="Close modal">
                        <X size={20} aria-hidden="true" />
                    </button>
                </div>
                <div className="modal-body">
                    {children}
                </div>
            </div>
        </div>
    );
};

export default Sales;
