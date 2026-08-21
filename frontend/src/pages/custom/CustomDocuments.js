/**
 * Custom quotations / bookings / invoices — free-text documents for anything
 * that is neither a vehicle nor a part. One screen, three kinds, chosen by the
 * `kind` prop ('quotations' | 'bookings' | 'invoices').
 *
 * Deliberately shaped like the sales screens: cards above the list, the same
 * filter bar, the same drawer, the same PDF / e-mail buttons, the same
 * Paid | Credit tabs on invoices, the same service-charges block on the form.
 * What differs is the line editor — a description and a price, no product
 * picker — because nothing here touches stock.
 *
 * Hidden until Server Management → Custom switches the module on; the route
 * still guards on the page (custom_quotations…) through Role Jobs.
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { FileText, Pencil, Send, CheckCircle, Clock, Wallet, CreditCard, AlertTriangle, Trash2, Plus, Download, Mail, ArrowRightLeft, DollarSign, HandCoins } from 'lucide-react';
import { customQuotationsAPI, customBookingsAPI, customInvoicesAPI, customerAPI, pdfManagementAPI, paymentMethodsAPI, accountsAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { pageActions, dropdownHint, fieldAccessor, moduleOn } from '../../utils/roleJobs';
import useErpDocumentSettings from '../../hooks/useErpDocumentSettings';
import useModalKeyboard from '../../hooks/useModalKeyboard';
import SearchableSelect from '../../components/SearchableSelect';
import StatCards from '../../components/StatCards';
import ActionButtons from '../../components/ActionButtons';
import ConfirmModal from '../../components/ConfirmModal';
import ServerPagination from '../../components/ServerPagination';
import CustomerQuickCreate from '../../components/customers/CustomerQuickCreate';
import SalesFilterBar from '../../components/sales/SalesFilterBar';
import SalesDrawer from '../../components/sales/SalesDrawer';
import EmailRecipientModal from '../../components/sales/EmailRecipientModal';
import ServiceChargesEditor, { useServiceCharges } from '../../components/sales/ServiceChargesEditor';
import { formatPKR } from '../../components/sales/CorporateDocumentView';
import '../../styles/userManagement.css';
import '../../styles/sales-print.css';

const KINDS = {
  quotations: { api: customQuotationsAPI, page: 'custom_quotations', label: 'Custom Quotations', singular: 'Custom quotation', numberKey: 'quotation_number', pdfType: 'quotation',
    statuses: [{ label: 'Draft', value: 'draft' }, { label: 'Sent', value: 'sent' }, { label: 'Accepted', value: 'accepted' }, { label: 'Rejected', value: 'rejected' }, { label: 'Converted', value: 'converted' }, { label: 'Expired', value: 'expired' }] },
  bookings: { api: customBookingsAPI, page: 'custom_bookings', label: 'Custom Bookings', singular: 'Custom booking', numberKey: 'booking_number', pdfType: 'booking',
    statuses: [{ label: 'Pending', value: 'pending' }, { label: 'Confirmed', value: 'confirmed' }, { label: 'Completed', value: 'completed' }, { label: 'Cancelled', value: 'cancelled' }] },
  invoices: { api: customInvoicesAPI, page: 'custom_invoices', label: 'Custom Invoices', singular: 'Custom invoice', numberKey: 'invoice_number', pdfType: 'invoice',
    statuses: [{ label: 'Draft', value: 'draft' }, { label: 'Sent', value: 'sent' }, { label: 'Partial', value: 'partial' }, { label: 'Paid', value: 'paid' }, { label: 'Overdue', value: 'overdue' }, { label: 'Cancelled', value: 'cancelled' }] },
};

const emptyLine = () => ({ description: '', unit: '', quantity: 1, unitPrice: '', discountAmount: '', taxPercent: 0 });
const lineTotal = (line) => {
  const net = (Number(line.quantity) || 0) * (Number(line.unitPrice) || 0) - (Number(line.discountAmount) || 0);
  return net + net * (Number(line.taxPercent) || 0) / 100;
};

const customerLabel = (c) => [c.customer_number || c.customerCode, [c.first_name || c.firstName, c.last_name || c.lastName].filter(Boolean).join(' ') || c.companyName || c.name, c.phone].filter(Boolean).join(' - ');

export default function CustomDocuments({ kind = 'quotations' }) {
  const config = KINDS[kind] || KINDS.quotations;
  const isInvoice = kind === 'invoices';
  const isQuotation = kind === 'quotations';
  const isBooking = kind === 'bookings';
  const { user } = useAuth();
  const navigate = useNavigate();
  const can = pageActions(user, config.page);
  const showField = fieldAccessor(user, config.page);
  const { currency, salesTax } = useErpDocumentSettings();
  const currencyCode = currency?.code || 'PKR';
  // A convert button must never point at a module that is switched off: that
  // screen is not in the menu and its API answers 404, so the document it made
  // could not be opened. With bookings off an approved quotation goes straight
  // to an invoice; with invoices off nothing offers to raise one. The server
  // applies the same rules, so these only decide which button is worth drawing.
  const bookingsOn = moduleOn(user, 'custom_bookings');
  const invoicesOn = moduleOn(user, 'custom_invoices');

  // ── list state ──
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState(null);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [filters, setFilters] = useState({ search: '', status: '', customerId: '', dateFrom: '', dateTo: '', paymentTerm: '', sortBy: 'created_at', sortOrder: 'desc' });
  const [customers, setCustomers] = useState([]);
  const [paymentMethods, setPaymentMethods] = useState([]);
  // Where money taken against an invoice actually lands.
  const [accounts, setAccounts] = useState([]);
  const [confirm, setConfirm] = useState({ isOpen: false });
  // The "convert to invoice" question: how much is being paid now, into which
  // account, and is the rest going on credit.
  const [convertModal, setConvertModal] = useState(null);
  const [payModal, setPayModal] = useState(null);
  const [emailPrompt, setEmailPrompt] = useState(null);

  // ── form state ──
  const [modal, setModal] = useState(null); // { mode: 'create'|'edit', item }
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({});
  const [lines, setLines] = useState([emptyLine()]);
  const svc = useServiceCharges();

  // ── drawer ──
  const [drawer, setDrawer] = useState(null);
  const [drawerLoading, setDrawerLoading] = useState(false);

  const loadCustomers = useCallback(async () => {
    try {
      const res = await customerAPI.getAllForDropdown(dropdownHint(config.page, 'create', 'customer'));
      setCustomers(res.data?.data || []);
    } catch { setCustomers([]); }
  }, [config.page]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = { ...filters, page: pagination.page, limit: pagination.limit };
      Object.keys(params).forEach((k) => (params[k] === '' || params[k] == null) && delete params[k]);
      const res = await config.api.getAll(params);
      setRows(res.data?.data || []);
      const p = res.data?.pagination;
      if (p) setPagination((prev) => ({ ...prev, total: p.total || 0, totalPages: p.totalPages || 0 }));
      config.api.getSummary().then((s) => setSummary(s.data?.data || null)).catch(() => setSummary(null));
    } catch (error) {
      if (error.response?.status === 404) toast.error('This module is switched off. Turn it on in Server Management → Custom.');
      setRows([]);
    } finally { setLoading(false); }
  }, [config, filters, pagination.page, pagination.limit]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => {
    loadCustomers();
    paymentMethodsAPI.getAll({ is_active: true }).then((res) => setPaymentMethods(res.data?.data || [])).catch(() => {});
    accountsAPI.getForPayments().then(setAccounts);
  }, [loadCustomers]);

  /** Petty cash unless something else is chosen — the client's stated default. */
  const defaultAccountId = useMemo(() => {
    const petty = accounts.find((a) => a.type === 'petty_cash') || accounts[0];
    return petty ? String(petty.id || petty._id) : '';
  }, [accounts]);

  const setFilter = (key, value) => { setFilters((prev) => ({ ...prev, [key]: value })); if (key !== 'sortBy' && key !== 'sortOrder') setPagination((prev) => ({ ...prev, page: 1 })); };
  const clearFilters = () => { setFilters({ search: '', status: '', customerId: '', dateFrom: '', dateTo: '', paymentTerm: '', sortBy: 'created_at', sortOrder: 'desc' }); setPagination((prev) => ({ ...prev, page: 1 })); };

  // ── form ──
  const openCreate = () => {
    setForm({ customerId: '', walkIn: false, walkInName: '', walkInPhone: '', title: '', notes: '', termsAndConditions: '', discountAmount: '', additionalCharges: '', validityDays: 7, priority: 'normal', bookingAmount: '', expectedDeliveryDate: '', dueDays: 30, paymentTerm: 'paid', creditDueDate: '', paymentMethodId: '', paidAmount: '', accountId: defaultAccountId });
    setLines([emptyLine()]); svc.reset();
    setModal({ mode: 'create', item: null });
  };
  const openEdit = (item) => {
    setForm({
      customerId: item.customer_id || '', walkIn: item.walk_in === true, walkInName: item.walk_in_name || '', walkInPhone: item.walk_in_phone || '',
      title: item.title || '', notes: item.notes || '', termsAndConditions: item.terms_and_conditions || '',
      discountAmount: '', additionalCharges: item.additional_charges || '', validityDays: item.validity_days || 7, priority: item.priority || 'normal',
      bookingAmount: item.booking_amount || '', expectedDeliveryDate: item.expected_delivery_date ? String(item.expected_delivery_date).slice(0, 10) : '',
      dueDays: 30, paymentTerm: item.payment_term || 'paid', creditDueDate: item.credit_due_date ? String(item.credit_due_date).slice(0, 10) : '', paymentMethodId: '', paidAmount: '',
    });
    setLines((item.line_items || []).map((line) => ({ description: line.description, unit: line.unit || '', quantity: line.quantity, unitPrice: line.unit_price, discountAmount: line.discount_amount || '', taxPercent: line.tax_percent || 0 })));
    svc.loadFrom(item);
    setModal({ mode: 'edit', item });
  };
  const closeModal = () => { if (!saving) setModal(null); };
  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));
  const setLine = (index, patch) => setLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)));

  const subtotal = useMemo(() => lines.reduce((sum, line) => sum + (Number(line.quantity) || 0) * (Number(line.unitPrice) || 0), 0), [lines]);
  const linesTotal = useMemo(() => lines.reduce((sum, line) => sum + lineTotal(line), 0), [lines]);
  const grandTotal = linesTotal - (Number(form.discountAmount) || 0) + (Number(form.additionalCharges) || 0) + svc.totals.grand;

  const submit = async () => {
    if (saving) return;
    if (!form.walkIn && !form.customerId) { toast.error('Select a customer'); return; }
    if (!lines.some((line) => String(line.description || '').trim())) { toast.error('Add at least one line'); return; }
    const isCredit = isInvoice && form.paymentTerm === 'credit';
    if (isInvoice && modal.mode === 'create') {
      if (isCredit && !form.creditDueDate) { toast.error('Give the credit invoice a due date'); return; }
      if (!isCredit && !form.paymentMethodId) { toast.error('Select how the customer is paying'); return; }
      if (!isCredit && (Number(form.paidAmount) || 0) + 0.009 < grandTotal) { toast.error(`A paid invoice needs the full amount (${currencyCode} ${grandTotal.toLocaleString()}). Switch to Credit to take part of it now.`); return; }
      // A deposit on a credit invoice still has to be paid by some means.
      if (isCredit && (Number(form.paidAmount) || 0) > 0 && !form.paymentMethodId) { toast.error('Select how the deposit is being paid'); return; }
      if (isCredit && (Number(form.paidAmount) || 0) > grandTotal + 0.009) { toast.error('The deposit cannot be more than the invoice total'); return; }
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        lineItems: lines.filter((line) => String(line.description || '').trim()).map((line) => ({ description: line.description, unit: line.unit, quantity: Number(line.quantity) || 1, unitPrice: Number(line.unitPrice) || 0, discountAmount: Number(line.discountAmount) || 0, taxPercent: Number(line.taxPercent) || 0 })),
        ...svc.payload(),
        paymentTerm: isCredit ? 'credit' : 'paid',
        creditDueDate: isCredit ? form.creditDueDate : undefined,
        paymentMethodId: form.paymentMethodId || undefined,
        // A credit invoice keeps whatever was handed over now; the rest becomes
        // the customer's outstanding balance.
        paidAmount: Number(form.paidAmount) || 0,
        accountId: (Number(form.paidAmount) || 0) > 0 ? (form.accountId || defaultAccountId || undefined) : undefined,
      };
      const res = modal.mode === 'create' ? await config.api.create(payload) : await config.api.update(modal.item.id, payload);
      toast.success(res.data?.message || 'Saved');
      setModal(null);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Operation failed');
    } finally { setSaving(false); }
  };
  useModalKeyboard(Boolean(modal), closeModal, submit, saving);

  // ── actions ──
  const doDelete = (item) => setConfirm({
    isOpen: true, title: `Delete ${config.singular}`, message: `Delete ${item[config.numberKey]}? This cannot be undone.`,
    onConfirm: async () => { try { const res = await config.api.delete(item.id); toast.success(res.data?.message || 'Deleted'); fetchData(); } catch (error) { toast.error(error.response?.data?.message || 'Delete failed'); } setConfirm({ isOpen: false }); },
  });
  const doApprove = async (item, decision = 'approved') => {
    try { const res = await config.api.approve(item.id, { decision }); toast.success(res.data?.message); fetchData(); } catch (error) { toast.error(error.response?.data?.message || 'Failed'); }
  };
  /**
   * Converting to a booking is a straight copy. Converting to an invoice is
   * where money changes hands, so it asks the two questions the counter has to
   * answer: how much is the customer paying now, and into which account. Petty
   * cash is the default; anything left unpaid becomes a credit balance.
   */
  const doConvert = (item, to) => {
    if (to === 'booking') {
      setConfirm({
        isOpen: true, title: 'Convert to booking', message: `Convert ${item[config.numberKey]} into a custom booking? Its lines, customer and service charges carry over unchanged.`,
        onConfirm: async () => {
          try {
            const res = await config.api.convert(item.id, { to: 'booking' });
            toast.success(res.data?.message || 'Converted');
            setConfirm({ isOpen: false }); fetchData(); navigate('/custom/bookings');
          } catch (error) { toast.error(error.response?.data?.message || 'Conversion failed'); setConfirm({ isOpen: false }); }
        },
      });
      return;
    }
    const alreadyPaid = Number(item.paid_amount) || 0;
    const outstanding = Math.max(0, (Number(item.total_amount) || 0) - alreadyPaid);
    setConvertModal({
      item,
      total: Number(item.total_amount) || 0,
      alreadyPaid,
      paidAmount: String(outstanding),
      paymentMethodId: '',
      accountId: defaultAccountId,
      creditDueDate: new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10),
      saving: false,
    });
  };

  const submitConvert = async () => {
    if (!convertModal || convertModal.saving) return;
    const paying = Number(convertModal.paidAmount) || 0;
    const outstanding = Math.max(0, convertModal.total - convertModal.alreadyPaid - paying);
    if (paying > 0 && !convertModal.paymentMethodId) { toast.error('Select how the customer is paying'); return; }
    if (outstanding > 0.009 && !convertModal.creditDueDate) { toast.error('Give the outstanding balance a due date'); return; }
    setConvertModal((prev) => ({ ...prev, saving: true }));
    try {
      const res = await config.api.convert(convertModal.item.id, {
        to: 'invoice',
        paymentTerm: outstanding > 0.009 ? 'credit' : 'paid',
        creditDueDate: outstanding > 0.009 ? convertModal.creditDueDate : undefined,
        paidAmount: paying,
        paymentMethodId: convertModal.paymentMethodId || undefined,
        accountId: paying > 0 ? (convertModal.accountId || defaultAccountId || undefined) : undefined,
      });
      toast.success(res.data?.message || 'Converted');
      setConvertModal(null);
      fetchData();
      navigate('/custom/invoices');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Conversion failed');
      setConvertModal((prev) => prev && { ...prev, saving: false });
    }
  };

  /** Take money against an invoice straight from the list, without the drawer. */
  const openPay = (item) => setPayModal({
    item,
    outstanding: Number(item.balance_amount) || 0,
    amount: String(Number(item.balance_amount) || 0),
    paymentMethodId: '',
    accountId: defaultAccountId,
    referenceNumber: '',
    saving: false,
  });

  const submitPay = async () => {
    if (!payModal || payModal.saving) return;
    const amount = Number(payModal.amount) || 0;
    if (!(amount > 0)) { toast.error('Enter the amount received'); return; }
    if (amount > payModal.outstanding + 0.009) { toast.error(`That is more than the ${currencyCode} ${payModal.outstanding.toLocaleString()} outstanding`); return; }
    if (!payModal.paymentMethodId) { toast.error('Select how the customer is paying'); return; }
    setPayModal((prev) => ({ ...prev, saving: true }));
    try {
      const res = await config.api.recordPayment(payModal.item.id, {
        amount,
        paymentMethodId: payModal.paymentMethodId,
        accountId: payModal.accountId || defaultAccountId || undefined,
        referenceNumber: payModal.referenceNumber,
      });
      toast.success(res.data?.message || 'Payment recorded');
      setPayModal(null);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to record payment');
      setPayModal((prev) => prev && { ...prev, saving: false });
    }
  };
  const downloadPdf = async (item) => {
    try {
      const response = await pdfManagementAPI.download(config.pdfType, item.id);
      const url = URL.createObjectURL(response.data);
      const link = document.createElement('a'); link.href = url; link.download = `${item[config.numberKey] || config.pdfType}.pdf`; document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
    } catch (error) {
      let message = error.response?.data?.message;
      if (!message && error.response?.data instanceof Blob) { try { message = JSON.parse(await error.response.data.text())?.message; } catch { /* not JSON */ } }
      toast.error(message || 'PDF download failed');
    }
  };
  /**
   * Send the document with its PDF. When the customer has no usable address —
   * a walk-in, or one of the imported records carrying a placeholder — ask for
   * one instead of refusing outright, which is what read as "email is broken".
   */
  const sendEmail = async (item, to = null) => {
    try {
      const res = await config.api.sendEmail(item.id, to ? { to } : undefined);
      toast.success(res.data?.message || 'Email sent');
      setEmailPrompt(null);
      return true;
    } catch (error) {
      const message = error.response?.data?.message || 'Email failed';
      if (!to && /email address|address to send/i.test(message)) {
        setEmailPrompt({ item, label: item[config.numberKey], reason: message, suggested: item.customer_email && !/@import\./.test(item.customer_email) ? item.customer_email : '' });
        return false;
      }
      toast.error(message);
      return false;
    }
  };

  const openDrawer = async (item) => {
    setDrawer({ id: item.id }); setDrawerLoading(true);
    try { const res = await config.api.getById(item.id); setDrawer(res.data?.data || null); } catch { toast.error('Failed to load'); setDrawer(null); } finally { setDrawerLoading(false); }
  };
  const drawerStatus = async (status) => {
    if (!drawer?.id) return;
    try { await config.api.update(drawer.id, { status }); toast.success('Status updated'); openDrawer({ id: drawer.id }); fetchData(); } catch (error) { toast.error(error.response?.data?.message || 'Failed'); }
  };
  const drawerPayment = async ({ amount, paymentMethodId, accountId, referenceNumber }) => {
    try {
      const res = await config.api.recordPayment(drawer.id, { amount, paymentMethodId, accountId: accountId || defaultAccountId || undefined, referenceNumber });
      toast.success(res.data?.message || 'Payment recorded');
      openDrawer({ id: drawer.id }); fetchData(); return true;
    } catch (error) { toast.error(error.response?.data?.message || 'Failed to record payment'); return false; }
  };

  // ── cards ──
  const cards = useMemo(() => {
    if (!summary) return [];
    if (isInvoice) return [
      { key: 'total', label: 'Total invoices', value: summary.total, sub: formatPKR(summary.totalAmount), icon: <FileText size={18} />, color: '#3b82f6', bg: '#dbeafe', onClick: () => setFilter('paymentTerm', ''), active: !filters.paymentTerm },
      { key: 'paid', label: 'Paid', value: summary.paidCount, sub: formatPKR(summary.paidAmount), icon: <Wallet size={18} />, color: '#16a34a', bg: '#dcfce7', onClick: () => setFilter('paymentTerm', 'paid'), active: filters.paymentTerm === 'paid' },
      { key: 'credit', label: 'Credit', value: summary.creditCount, sub: formatPKR(summary.creditAmount), icon: <CreditCard size={18} />, color: '#f59e0b', bg: '#fef3c7', onClick: () => setFilter('paymentTerm', 'credit'), active: filters.paymentTerm === 'credit' },
      { key: 'outstanding', label: 'Outstanding (credit)', value: formatPKR(summary.creditOutstanding), icon: <Clock size={18} />, color: '#7c3aed', bg: '#ede9fe' },
      { key: 'overdue', label: 'Overdue', value: summary.overdueCount, sub: formatPKR(summary.overdueAmount), icon: <AlertTriangle size={18} />, color: '#dc2626', bg: '#fee2e2' },
    ];
    if (isQuotation) return [
      { key: 'total', label: 'Total quotations', value: summary.total, sub: formatPKR(summary.totalAmount), icon: <FileText size={18} />, color: '#3b82f6', bg: '#dbeafe' },
      { key: 'draft', label: 'Draft', value: summary.draft, icon: <Pencil size={18} />, color: '#64748b', bg: '#f1f5f9' },
      { key: 'sent', label: 'Sent', value: summary.sent, icon: <Send size={18} />, color: '#0ea5e9', bg: '#e0f2fe' },
      { key: 'approved', label: 'Approved', value: summary.approved, icon: <CheckCircle size={18} />, color: '#16a34a', bg: '#dcfce7' },
      { key: 'expired', label: 'Expired', value: summary.expired, icon: <Clock size={18} />, color: '#dc2626', bg: '#fee2e2' },
    ];
    return [
      { key: 'total', label: 'Total bookings', value: summary.total, sub: formatPKR(summary.totalAmount), icon: <FileText size={18} />, color: '#3b82f6', bg: '#dbeafe' },
      { key: 'pending', label: 'Pending', value: summary.pending, icon: <Clock size={18} />, color: '#f59e0b', bg: '#fef3c7' },
      { key: 'confirmed', label: 'Confirmed', value: summary.confirmed, icon: <CheckCircle size={18} />, color: '#0ea5e9', bg: '#e0f2fe' },
      { key: 'converted', label: 'Invoiced', value: summary.converted, icon: <ArrowRightLeft size={18} />, color: '#16a34a', bg: '#dcfce7' },
    ];
  }, [summary, isInvoice, isQuotation, filters.paymentTerm]);

  const convertOutstanding = convertModal
    ? Math.max(0, convertModal.total - convertModal.alreadyPaid - (Number(convertModal.paidAmount) || 0))
    : 0;

  /**
   * A row's buttons, defined once.
   *
   * The table and the mobile cards both draw them; two copies of this list
   * would drift the moment a permission or a condition changed, and the copy
   * nobody was looking at would be the wrong one.
   */
  const rowActions = (row) => (
    <ActionButtons
      title={row[config.numberKey]}
      // An approved quotation is a price the customer agreed to, and an
      // issued invoice has left the building — neither may be rewritten.
      showEdit={can('edit') && !isInvoice && !['converted', 'completed', 'paid', 'cancelled'].includes(row.status)
        && !(isQuotation && row.approval_status === 'approved')}
      showDelete={can('delete') && !['paid'].includes(row.status)}
      onEdit={() => openEdit(row)}
      onDelete={() => doDelete(row)}
      customActions={[
        ...(can('downloadPdf') ? [{ icon: <Download size={16} />, title: 'Download PDF', onClick: () => downloadPdf(row) }] : []),
        ...(isInvoice && can('recordPayment') && Number(row.balance_amount) > 0 && row.status !== 'cancelled'
          ? [{ icon: <HandCoins size={16} />, title: 'Receive payment', className: 'btn-success', onClick: () => openPay(row) }] : []),
        ...(can('sendEmail') ? [{ icon: <Mail size={16} />, title: 'Send email (with PDF)', onClick: () => sendEmail(row) }] : []),
        ...(isQuotation && can('approve') && row.approval_status !== 'approved' && row.status !== 'converted' ? [{ icon: <CheckCircle size={16} />, title: 'Approve quotation', className: 'btn-success', onClick: () => doApprove(row) }] : []),
        ...(isQuotation && can('convert') && row.approval_status === 'approved' && row.status !== 'converted' ? [
          ...(bookingsOn ? [{ icon: <ArrowRightLeft size={16} />, title: 'Convert to booking', className: 'btn-info', onClick: () => doConvert(row, 'booking') }] : []),
          ...(invoicesOn ? [{ icon: <DollarSign size={16} />, title: bookingsOn ? 'Convert to invoice' : 'Convert to invoice (bookings are switched off)', className: 'btn-info', onClick: () => doConvert(row, 'invoice') }] : []),
        ] : []),
        ...(isBooking && invoicesOn && can('convert') && !row.invoice_id && row.status !== 'cancelled' ? [{ icon: <DollarSign size={16} />, title: 'Convert to invoice', className: 'btn-info', onClick: () => doConvert(row, 'invoice') }] : []),
      ]}
    />
  );

  /** The payment-term chip an invoice row shows, in the table and on a card. */
  const termBadge = (row) => (row.payment_term === 'credit'
    ? <span className={`badge ${row.credit_status === 'overdue' ? 'badge-danger' : row.credit_status === 'settled' ? 'badge-success' : 'badge-warning'}`}>CREDIT{row.credit_status && row.credit_status !== 'open' ? ` · ${String(row.credit_status).toUpperCase()}` : ''}</span>
    : <span className="badge badge-success">PAID</span>);

  const money = (value) => `${currencyCode} ${Number(value || 0).toLocaleString()}`;

  const badge = (status) => {
    const colors = { draft: 'secondary', sent: 'info', pending: 'warning', confirmed: 'info', accepted: 'success', approved: 'success', partial: 'warning', paid: 'success', completed: 'success', converted: 'success', rejected: 'danger', overdue: 'danger', expired: 'danger', cancelled: 'danger' };
    return <span className={`badge badge-${colors[status] || 'secondary'}`}>{String(status || '').toUpperCase()}</span>;
  };

  return (
    <div className="card sales-page">
      <div className="card-header d-flex justify-content-between align-items-center">
        <div><h3>{config.label}</h3></div>
        {can('create') && (
          <div className="sales-header-actions">
            <button className="btn btn-primary" onClick={openCreate}><Plus size={16} /> New {config.singular.replace('Custom ', '')}</button>
          </div>
        )}
      </div>

      {cards.length > 0 && <StatCards items={cards} />}

      {isInvoice && (
        <div className="sales-term-tabs" role="tablist">
          {[['', 'All'], ['paid', 'Paid'], ['credit', 'Credit']].map(([value, label]) => (
            <button key={value || 'all'} type="button" role="tab" aria-selected={filters.paymentTerm === value} className={`sales-term-tab${filters.paymentTerm === value ? ' active' : ''}`} onClick={() => setFilter('paymentTerm', value)}>
              {label}{value === 'credit' && summary?.creditCount > 0 && <span className="sales-term-count">{summary.creditCount}</span>}
            </button>
          ))}
        </div>
      )}

      <SalesFilterBar filters={filters} onFilterChange={setFilter} onClear={clearFilters} onRefresh={fetchData} loading={loading} statusOptions={config.statuses} customers={customers} />

      <div className="desktop-table">
        <table className="data-table">
          <thead>
            <tr>
              <th>{isInvoice ? 'Invoice #' : isBooking ? 'Booking #' : 'Quote #'}</th>
              <th>Date</th>
              {isInvoice && <th>Due Date</th>}
              {showField('customer') && <th>Customer</th>}
              <th>Items</th>
              {showField('amounts') && <th>Total</th>}
              {isBooking && showField('payments') && <th>Amount Paid</th>}
              {isBooking && <th>Expected Date</th>}
              {isInvoice && showField('payments') && <th>Paid</th>}
              {isInvoice && showField('payments') && <th>Balance</th>}
              {isInvoice && showField('payments') && <th>Payment Term</th>}
              <th>Service Charges</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && !rows.length ? <tr><td colSpan={12} style={{ textAlign: 'center', padding: 30 }}><div className="spinner" /></td></tr>
              : rows.length === 0 ? <tr><td colSpan={12} style={{ textAlign: 'center', padding: 30, color: '#94a3b8' }}>No {config.label.toLowerCase()} yet</td></tr>
              : rows.map((row) => (
                <tr key={row.id} onClick={() => openDrawer(row)} style={{ cursor: 'pointer' }}>
                  <td><strong>{row[config.numberKey]}</strong>{row.title && <div className="text-muted small">{row.title}</div>}</td>
                  <td>{new Date(row.created_at).toLocaleDateString('en-GB')}</td>
                  {isInvoice && <td>{row.due_date ? new Date(row.due_date).toLocaleDateString('en-GB') : '-'}</td>}
                  {showField('customer') && <td>{row.customer_name}{row.sale_person && <div className="text-muted small">{row.sale_person}</div>}</td>}
                  <td title={row.item_name}>{row.item_count} line{row.item_count === 1 ? '' : 's'}<div className="text-muted small">{row.item_name}</div></td>
                  {showField('amounts') && <td>{currencyCode} {Number(row.total_amount).toLocaleString()}</td>}
                  {isBooking && showField('payments') && <td>{currencyCode} {Number(row.paid_amount || 0).toLocaleString()}</td>}
                  {isBooking && <td>{row.expected_delivery_date ? new Date(row.expected_delivery_date).toLocaleDateString('en-GB') : '-'}</td>}
                  {isInvoice && showField('payments') && <td>{currencyCode} {Number(row.paid_amount || 0).toLocaleString()}</td>}
                  {isInvoice && showField('payments') && <td style={{ color: row.balance_amount > 0 ? '#dc2626' : '#16a34a' }}>{currencyCode} {Number(row.balance_amount || 0).toLocaleString()}</td>}
                  {isInvoice && showField('payments') && <td>{termBadge(row)}</td>}
                  <td>{row.has_service_charges ? `${currencyCode} ${Number(row.service_charges_total + row.service_tax_total).toLocaleString()}` : '—'}</td>
                  <td>{badge(row.status)}{isQuotation && row.approval_status === 'approved' && <span className="badge badge-success" style={{ marginLeft: 4 }}>APPROVED</span>}</td>
                  <td onClick={(e) => e.stopPropagation()}>{rowActions(row)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      {/* The same rows as a card each, for anything narrower than a desktop.
          Without this the table was simply hidden below 1025px and the screen
          showed a row count with no rows under it. */}
      <div className="mobile-cards-view">
        <div className="mobile-cards-container">
          {loading && !rows.length ? <div className="data-card"><div className="spinner" /></div>
            : rows.length === 0 ? <div className="data-card" style={{ textAlign: 'center', color: '#94a3b8' }}>No {config.label.toLowerCase()} yet</div>
            : rows.map((row) => (
              <div key={row.id} className="data-card" onClick={() => openDrawer(row)}>
                <div className="data-card-top">
                  <div className={`data-card-avatar ${isInvoice ? 'avatar-green' : isBooking ? 'avatar-purple' : 'avatar-amber'}`}>
                    {isInvoice ? 'I' : isBooking ? 'B' : 'Q'}
                  </div>
                  <div className="data-card-info">
                    <span className="data-card-title">{row[config.numberKey]}</span>
                    {showField('customer') && <span className="data-card-subtitle">{row.customer_name}</span>}
                  </div>
                  {badge(row.status)}
                </div>
                <div className="data-card-body">
                  {row.title && <div className="data-card-row"><span className="row-icon">🏷️</span><span className="row-label">Title</span><span className="row-value">{row.title}</span></div>}
                  <div className="data-card-row"><span className="row-icon">📦</span><span className="row-label">Items</span><span className="row-value">{row.item_count} line{row.item_count === 1 ? '' : 's'}{row.item_name ? ` — ${row.item_name}` : ''}</span></div>
                  {showField('amounts') && <div className="data-card-row"><span className="row-icon">💰</span><span className="row-label">Total</span><span className="row-value">{money(row.total_amount)}</span></div>}
                  {(isInvoice || isBooking) && showField('payments') && <div className="data-card-row"><span className="row-icon">✅</span><span className="row-label">Paid</span><span className="row-value">{money(row.paid_amount)}</span></div>}
                  {isInvoice && showField('payments') && (
                    <div className="data-card-row">
                      <span className="row-icon">⚖️</span><span className="row-label">Balance</span>
                      <span className="row-value" style={{ color: row.balance_amount > 0 ? '#dc2626' : '#16a34a', fontWeight: 600 }}>{money(row.balance_amount)}</span>
                    </div>
                  )}
                  {isInvoice && showField('payments') && <div className="data-card-row"><span className="row-icon">💳</span><span className="row-label">Terms</span><span className="row-value">{termBadge(row)}</span></div>}
                  {isInvoice && <div className="data-card-row"><span className="row-icon">⏰</span><span className="row-label">Due</span><span className="row-value">{row.due_date ? new Date(row.due_date).toLocaleDateString('en-GB') : '—'}</span></div>}
                  {isBooking && <div className="data-card-row"><span className="row-icon">📆</span><span className="row-label">Expected</span><span className="row-value">{row.expected_delivery_date ? new Date(row.expected_delivery_date).toLocaleDateString('en-GB') : '—'}</span></div>}
                  {row.has_service_charges && <div className="data-card-row"><span className="row-icon">🔧</span><span className="row-label">Services</span><span className="row-value">{money(Number(row.service_charges_total) + Number(row.service_tax_total))}</span></div>}
                  <div className="data-card-row"><span className="row-icon">📅</span><span className="row-label">Date</span><span className="row-value">{new Date(row.created_at).toLocaleDateString('en-GB')}</span></div>
                  {isQuotation && row.approval_status === 'approved' && <div className="data-card-row"><span className="row-icon">👍</span><span className="row-label">Approval</span><span className="row-value"><span className="badge badge-success">APPROVED</span></span></div>}
                </div>
                <div className="data-card-footer" onClick={(e) => e.stopPropagation()}>{rowActions(row)}</div>
              </div>
            ))}
        </div>
      </div>

      <ServerPagination page={pagination.page} totalPages={pagination.totalPages} total={pagination.total} limit={pagination.limit} loading={loading} onPageChange={(page) => setPagination((prev) => ({ ...prev, page }))} onPageSizeChange={(limit) => setPagination((prev) => ({ ...prev, limit, page: 1 }))} />

      {/* ── Form ── */}
      {modal && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-content" style={{ maxWidth: 1000, width: '96%' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{modal.mode === 'create' ? 'New' : 'Edit'} {config.singular}</h3>
              <button className="modal-close" onClick={closeModal}>×</button>
            </div>
            <div className="modal-body" style={{ maxHeight: '75vh', overflowY: 'auto' }}>
              <div className="form-row">
                <div className="form-group" style={{ flex: 2 }}>
                  <div className="form-label-add">
                    <span>{form.walkIn ? 'Walk-in customer' : 'Customer *'}</span>
                    <span className="walkin-toggle">
                      <label><input type="checkbox" checked={form.walkIn === true} onChange={(e) => set('walkIn', e.target.checked)} /> Walk-in</label>
                      {!form.walkIn && <CustomerQuickCreate form={modal.mode} pageKey={config.page} onCreated={async (created) => { await loadCustomers(); if (created?._id || created?.id) set('customerId', String(created._id || created.id)); }} />}
                    </span>
                  </div>
                  {form.walkIn ? (
                    <div className="form-row walkin-fields">
                      <input type="text" value={form.walkInName || ''} onChange={(e) => set('walkInName', e.target.value)} placeholder="Buyer's name (optional)" />
                      <input type="text" value={form.walkInPhone || ''} onChange={(e) => set('walkInPhone', e.target.value)} placeholder="Phone (optional)" />
                    </div>
                  ) : (
                    <SearchableSelect value={form.customerId} onChange={(e) => set('customerId', e.target.value)} placeholder="Select customer">
                      <option value="">Select Customer</option>
                      {customers.map((c) => <option key={c.id} value={c.id}>{customerLabel(c)}</option>)}
                    </SearchableSelect>
                  )}
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Title / subject</label>
                  <input type="text" value={form.title || ''} onChange={(e) => set('title', e.target.value)} placeholder="e.g. Generator supply & installation" />
                </div>
              </div>

              <div className="card" style={{ padding: '1rem', border: '1px solid #e5e7eb', boxShadow: 'none', marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <h5 style={{ margin: 0 }}>Items</h5>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setLines((prev) => [...prev, emptyLine()])}>+ Add line</button>
                </div>
                <div className="custom-lines">
                  {lines.map((line, index) => (
                    <div className="custom-line" key={index}>
                      <div className="form-group custom-line-desc"><label>Description *</label><input type="text" value={line.description} onChange={(e) => setLine(index, { description: e.target.value })} placeholder="What is being quoted / sold" /></div>
                      <div className="form-group"><label>Unit</label><input type="text" value={line.unit} onChange={(e) => setLine(index, { unit: e.target.value })} placeholder="pcs" /></div>
                      <div className="form-group"><label>Qty</label><input type="number" min="0" value={line.quantity} onChange={(e) => setLine(index, { quantity: e.target.value })} /></div>
                      <div className="form-group"><label>Unit price</label><input type="number" min="0" step="0.01" value={line.unitPrice} onChange={(e) => setLine(index, { unitPrice: e.target.value })} placeholder="0.00" /></div>
                      <div className="form-group"><label>Discount</label><input type="number" min="0" step="0.01" value={line.discountAmount} onChange={(e) => setLine(index, { discountAmount: e.target.value })} placeholder="0" /></div>
                      <div className="form-group"><label>Tax %</label><input type="number" min="0" max="100" step="0.01" value={line.taxPercent} onChange={(e) => setLine(index, { taxPercent: e.target.value })} /></div>
                      <div className="custom-line-total"><label>Total</label><strong>{currencyCode} {lineTotal(line).toLocaleString(undefined, { maximumFractionDigits: 2 })}</strong></div>
                      <button type="button" className="btn-action btn-delete" title="Remove line" onClick={() => setLines((prev) => prev.length > 1 ? prev.filter((_, i) => i !== index) : [emptyLine()])}><Trash2 size={16} /></button>
                    </div>
                  ))}
                </div>
                <ServiceChargesEditor {...svc.editorProps} currencyCode={currencyCode} form={modal.mode} pageKey={config.page} defaultTaxPercent={Number(salesTax?.tax_rate) || 0} />
              </div>

              <div className="form-row">
                <div className="form-group"><label>Extra discount ({currencyCode})</label><input type="number" min="0" step="0.01" value={form.discountAmount ?? ''} onChange={(e) => set('discountAmount', e.target.value)} placeholder="0" /></div>
                <div className="form-group"><label>Additional charges ({currencyCode})</label><input type="number" min="0" step="0.01" value={form.additionalCharges ?? ''} onChange={(e) => set('additionalCharges', e.target.value)} placeholder="0" /></div>
                {isQuotation && <div className="form-group"><label>Validity (days)</label><input type="number" min="1" value={form.validityDays} onChange={(e) => set('validityDays', e.target.value)} /></div>}
                {isBooking && (<>
                  <div className="form-group"><label>Booking amount ({currencyCode})</label><input type="number" min="0" step="0.01" value={form.bookingAmount ?? ''} onChange={(e) => set('bookingAmount', e.target.value)} placeholder="Deposit received" /></div>
                  <div className="form-group"><label>Expected date</label><input type="date" value={form.expectedDeliveryDate || ''} onChange={(e) => set('expectedDeliveryDate', e.target.value)} /></div>
                  <div className="form-group"><label>Priority</label><select className="form-input" value={form.priority} onChange={(e) => set('priority', e.target.value)}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option></select></div>
                </>)}
              </div>

              {isInvoice && modal.mode === 'create' && (
                <div className="form-row">
                  <div className="form-group">
                    <label>Payment terms *</label>
                    <div className="sales-term-tabs" style={{ padding: 0 }} role="tablist">
                      {[['paid', 'Paid now'], ['credit', 'Credit']].map(([value, label]) => (
                        <button key={value} type="button" role="tab" aria-selected={form.paymentTerm === value} className={`sales-term-tab${form.paymentTerm === value ? ' active' : ''}`} disabled={value === 'credit' && !can('changePaymentTerm')} title={value === 'credit' && !can('changePaymentTerm') ? 'Your role may not issue credit invoices' : ''} onClick={() => set('paymentTerm', value)}>{label}</button>
                      ))}
                    </div>
                  </div>
                  {form.paymentTerm === 'credit' && (
                    <div className="form-group"><label>Credit due date *</label><input type="date" value={form.creditDueDate || ''} min={new Date().toISOString().slice(0, 10)} onChange={(e) => set('creditDueDate', e.target.value)} /></div>
                  )}
                  <div className="form-group"><label>Payment mode {form.paymentTerm === 'credit' ? '' : '*'}</label><SearchableSelect value={form.paymentMethodId} onChange={(e) => set('paymentMethodId', e.target.value)} options={paymentMethods.map((pm) => ({ label: pm.name, value: String(pm.id || pm._id) }))} labelField="label" valueField="value" placeholder="Select…" /></div>
                  <div className="form-group">
                    <label>{form.paymentTerm === 'credit' ? 'Received now' : 'Amount received *'}</label>
                    <input type="number" min="0" step="0.01" value={form.paidAmount ?? ''} onChange={(e) => set('paidAmount', e.target.value)} placeholder="0.00" />
                    <button type="button" className="btn btn-secondary btn-sm" style={{ marginTop: 4, width: '100%' }} onClick={() => set('paidAmount', String(grandTotal))}>Paid in full ({currencyCode} {grandTotal.toLocaleString()})</button>
                  </div>
                  {/* Where the money goes. Only asked when money is changing hands. */}
                  {accounts.length > 0 && (Number(form.paidAmount) || 0) > 0 && (
                    <div className="form-group"><label>Into account *</label><SearchableSelect value={form.accountId || defaultAccountId} onChange={(e) => set('accountId', e.target.value)} options={accounts.map((a) => ({ label: a.name, value: String(a.id || a._id) }))} labelField="label" valueField="value" /></div>
                  )}
                  {form.paymentTerm === 'credit' && (
                    <div className="form-group" style={{ alignSelf: 'flex-end' }}>
                      <p className="sm-role-job-note" style={{ margin: 0 }}>
                        Outstanding after this: <strong>{currencyCode} {Math.max(0, grandTotal - (Number(form.paidAmount) || 0)).toLocaleString(undefined, { maximumFractionDigits: 2 })}</strong>
                      </p>
                    </div>
                  )}
                </div>
              )}

              <div className="form-row">
                <div className="form-group"><label>Notes</label><textarea rows="2" value={form.notes || ''} onChange={(e) => set('notes', e.target.value)} /></div>
                <div className="form-group"><label>Terms & conditions</label><textarea rows="2" value={form.termsAndConditions || ''} onChange={(e) => set('termsAndConditions', e.target.value)} /></div>
              </div>

              <div className="custom-totals">
                <span>Subtotal <strong>{currencyCode} {subtotal.toLocaleString()}</strong></span>
                <span>Lines incl. tax <strong>{currencyCode} {linesTotal.toLocaleString(undefined, { maximumFractionDigits: 2 })}</strong></span>
                {svc.totals.grand > 0 && <span>Service charges <strong>{currencyCode} {svc.totals.grand.toLocaleString(undefined, { maximumFractionDigits: 2 })}</strong></span>}
                <span className="custom-grand">Total <strong>{currencyCode} {grandTotal.toLocaleString(undefined, { maximumFractionDigits: 2 })}</strong></span>
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={closeModal} disabled={saving}>Cancel</button>
              <button type="button" className="btn btn-primary" onClick={submit} disabled={saving}>{saving ? 'Saving…' : modal.mode === 'create' ? `Create ${config.singular.replace('Custom ', '')}` : 'Save changes'}</button>
            </div>
          </div>
        </div>
      )}

      <SalesDrawer
        isOpen={Boolean(drawer)}
        loading={drawerLoading}
        onClose={() => setDrawer(null)}
        title={`${config.singular} ${drawer?.[config.numberKey] || ''}`}
        subtitle={drawer?.customer_name}
        fields={[
          { label: 'Date', value: drawer?.created_at ? new Date(drawer.created_at).toLocaleDateString('en-GB') : '-' },
          { label: 'Customer', value: drawer?.customer_name },
          { label: 'Title', value: drawer?.title || '—' },
          { label: 'Total', value: drawer?.total_amount != null ? `${currencyCode} ${Number(drawer.total_amount).toLocaleString()}` : '-' },
          ...(isInvoice ? [
            { label: 'Payment Term', value: drawer?.payment_term === 'credit' ? `CREDIT — due ${drawer?.credit_due_date ? new Date(drawer.credit_due_date).toLocaleDateString('en-GB') : ''}` : 'PAID' },
            // Where the money actually landed, so the counter and the Accounts
            // screen can be reconciled from the invoice itself.
            { label: 'Received into', value: drawer?.payment_account_name || '—' },
          ] : []),
          ...(isQuotation ? [{ label: 'Valid Until', value: drawer?.valid_until ? new Date(drawer.valid_until).toLocaleDateString('en-GB') : '-' }, { label: 'Approval', value: drawer?.approval_status }] : []),
          ...(isBooking ? [{ label: 'Expected Date', value: drawer?.expected_delivery_date ? new Date(drawer.expected_delivery_date).toLocaleDateString('en-GB') : '-' }] : []),
          { label: 'Notes', value: drawer?.notes, full: true },
        ]}
        items={(drawer?.items || []).map((line) => ({ ...line, unitPrice: line.unit_price, total: line.total_price }))}
        serviceCharges={drawer?.service_charges || []}
        statusOptions={config.statuses}
        status={drawer?.status}
        onStatusChange={drawerStatus}
        canEditStatus={can('edit')}
        totals={isInvoice || isBooking ? { total: drawer?.total_amount, paid: drawer?.paid_amount, remaining: drawer?.balance_amount } : null}
        payments={isInvoice ? (drawer?.payments || []).map((p) => ({ ...p, payment_date: p.date, payment_method_name: p.method, reference_number: p.reference })) : null}
        paymentMethods={paymentMethods}
        accounts={accounts}
        onRecordPayment={isInvoice && can('recordPayment') ? drawerPayment : null}
      />

      {/* Convert to invoice: how much now, into which account, what is left on credit. */}
      {convertModal && (
        <div className="modal-overlay" onClick={() => !convertModal.saving && setConvertModal(null)}>
          <div className="modal-content" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Convert {convertModal.item[config.numberKey]} to an invoice</h3>
              <button className="modal-close" onClick={() => !convertModal.saving && setConvertModal(null)}>&times;</button>
            </div>
            <div className="modal-body">
              <p className="sm-role-job-note">
                Invoice total <strong>{currencyCode} {convertModal.total.toLocaleString()}</strong>
                {convertModal.alreadyPaid > 0 && <> &middot; already taken on the booking <strong>{currencyCode} {convertModal.alreadyPaid.toLocaleString()}</strong></>}
              </p>
              <div className="form-row">
                <div className="form-group">
                  <label>Receiving now ({currencyCode})</label>
                  <input type="number" min="0" step="0.01" autoFocus value={convertModal.paidAmount} onChange={(e) => setConvertModal((prev) => ({ ...prev, paidAmount: e.target.value }))} />
                  <button type="button" className="btn btn-secondary btn-sm" style={{ marginTop: 4, width: '100%' }} onClick={() => setConvertModal((prev) => ({ ...prev, paidAmount: String(Math.max(0, prev.total - prev.alreadyPaid)) }))}>
                    Paid in full
                  </button>
                </div>
                <div className="form-group">
                  <label>Payment mode</label>
                  <SearchableSelect value={convertModal.paymentMethodId} onChange={(e) => setConvertModal((prev) => ({ ...prev, paymentMethodId: e.target.value }))} options={paymentMethods.map((pm) => ({ label: pm.name, value: String(pm.id || pm._id) }))} labelField="label" valueField="value" placeholder="Select..." />
                </div>
              </div>
              {accounts.length > 0 && (Number(convertModal.paidAmount) || 0) > 0 && (
                <div className="form-group"><label>Into account</label><SearchableSelect value={convertModal.accountId} onChange={(e) => setConvertModal((prev) => ({ ...prev, accountId: e.target.value }))} options={accounts.map((a) => ({ label: a.name, value: String(a.id || a._id) }))} labelField="label" valueField="value" /></div>
              )}
              {convertOutstanding > 0.009 && (
                <div className="form-group">
                  <label>Balance due by *</label>
                  <input type="date" min={new Date().toISOString().slice(0, 10)} value={convertModal.creditDueDate} onChange={(e) => setConvertModal((prev) => ({ ...prev, creditDueDate: e.target.value }))} />
                  <small style={{ color: '#dc2626' }}>
                    {currencyCode} {convertOutstanding.toLocaleString(undefined, { maximumFractionDigits: 2 })} stays on the customer account as a credit balance.
                  </small>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setConvertModal(null)} disabled={convertModal.saving}>Cancel</button>
              <button type="button" className="btn btn-primary" onClick={submitConvert} disabled={convertModal.saving}>{convertModal.saving ? 'Converting...' : 'Create invoice'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Receive money against an outstanding invoice, straight from the list. */}
      {payModal && (
        <div className="modal-overlay" onClick={() => !payModal.saving && setPayModal(null)}>
          <div className="modal-content" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Receive payment &mdash; {payModal.item[config.numberKey]}</h3>
              <button className="modal-close" onClick={() => !payModal.saving && setPayModal(null)}>&times;</button>
            </div>
            <div className="modal-body">
              <p className="sm-role-job-note">Outstanding: <strong>{currencyCode} {payModal.outstanding.toLocaleString()}</strong> from {payModal.item.customer_name}</p>
              <div className="form-row">
                <div className="form-group"><label>Amount *</label><input type="number" min="0.01" step="0.01" autoFocus value={payModal.amount} onChange={(e) => setPayModal((prev) => ({ ...prev, amount: e.target.value }))} /></div>
                <div className="form-group"><label>Payment mode *</label><SearchableSelect value={payModal.paymentMethodId} onChange={(e) => setPayModal((prev) => ({ ...prev, paymentMethodId: e.target.value }))} options={paymentMethods.map((pm) => ({ label: pm.name, value: String(pm.id || pm._id) }))} labelField="label" valueField="value" placeholder="Select..." /></div>
              </div>
              {accounts.length > 0 && (
                <div className="form-group"><label>Into account *</label><SearchableSelect value={payModal.accountId} onChange={(e) => setPayModal((prev) => ({ ...prev, accountId: e.target.value }))} options={accounts.map((a) => ({ label: a.name, value: String(a.id || a._id) }))} labelField="label" valueField="value" /></div>
              )}
              <div className="form-group"><label>Reference</label><input type="text" value={payModal.referenceNumber} onChange={(e) => setPayModal((prev) => ({ ...prev, referenceNumber: e.target.value }))} placeholder="Txn / cheque no." /></div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setPayModal(null)} disabled={payModal.saving}>Cancel</button>
              <button type="button" className="btn btn-primary" onClick={submitPay} disabled={payModal.saving}>{payModal.saving ? 'Saving...' : 'Record payment'}</button>
            </div>
          </div>
        </div>
      )}

      <EmailRecipientModal prompt={emailPrompt} onClose={() => setEmailPrompt(null)} onSend={(to) => sendEmail(emailPrompt.item, to)} />

      <ConfirmModal isOpen={confirm.isOpen} title={confirm.title} message={confirm.message} onConfirm={confirm.onConfirm} onCancel={() => setConfirm({ isOpen: false })} />
    </div>
  );
}
