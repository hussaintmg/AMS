import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { ArrowUpDown, ArrowUp, ArrowDown, Upload } from 'lucide-react';
import { salesMasterAPI } from '../services/api';
import toast from 'react-hot-toast';
import ActionButtons from '../components/ActionButtons';
import ToggleSwitch from '../components/ToggleSwitch';
import ConfirmModal from '../components/ConfirmModal';
import EmailDrawer from '../components/EmailDrawer';
import useModalKeyboard from '../hooks/useModalKeyboard';
import '../styles/salesMasterData.css';
import ServerPagination from '../components/ServerPagination';
import '../styles/emailTemplates.css';

const toArray = (value) => Array.isArray(value) ? value : [];

const TABS = [
  { key: 'payment-terms', label: 'Payment Terms', icon: 'credit_card' },
  { key: 'delivery-terms', label: 'Delivery Terms', icon: 'local_shipping' },
  { key: 'quotation-validities', label: 'Quotation Validity', icon: 'schedule' },
  { key: 'discount-types', label: 'Discount Types', icon: 'local_offer' },
  { key: 'sales-order-types', label: 'Sales Order Types', icon: 'description' },
  { key: 'invoice-types', label: 'Invoice Types', icon: 'receipt' },
];

const API_MAP = {
  'payment-terms': {
    create: 'createPaymentTerm', update: 'updatePaymentTerm',
    get: 'getPaymentTerms', del: 'deletePaymentTerm',
  },
  'delivery-terms': {
    create: 'createDeliveryTerm', update: 'updateDeliveryTerm',
    get: 'getDeliveryTerms', del: 'deleteDeliveryTerm',
  },
  'quotation-validities': {
    create: 'createQuotationValidity', update: 'updateQuotationValidity',
    get: 'getQuotationValidities', del: 'deleteQuotationValidity',
  },
  'discount-types': {
    create: 'createDiscountType', update: 'updateDiscountType',
    get: 'getDiscountTypes', del: 'deleteDiscountType',
  },
  'sales-order-types': {
    create: 'createSalesOrderType', update: 'updateSalesOrderType',
    get: 'getSalesOrderTypes', del: 'deleteSalesOrderType',
  },
  'invoice-types': {
    create: 'createInvoiceType', update: 'updateInvoiceType',
    get: 'getInvoiceTypes', del: 'deleteInvoiceType',
  },
};

const STATS_KEYS = {
  'payment-terms': 'paymentTerms',
  'delivery-terms': 'deliveryTerms',
  'quotation-validities': 'quotationValidities',
  'discount-types': 'discountTypes',
  'sales-order-types': 'salesOrderTypes',
  'invoice-types': 'invoiceTypes',
};

const TAB_STAT_ICONS = {
  'payment-terms': 'payment',
  'delivery-terms': 'delivery',
  'quotation-validities': 'validity',
  'discount-types': 'discount',
  'sales-order-types': 'order-type',
  'invoice-types': 'invoice-type',
};

const STAT_EMOJIS = {
  payment: '💳', delivery: '🚚', validity: '⏱️',
  discount: '🏷️', 'order-type': '📄', 'invoice-type': '🧾',
};

function SalesMasterData() {
  const [activeTab, setActiveTab] = useState('payment-terms');
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(false);
  const [tableData, setTableData] = useState([]);
  const [search, setSearch] = useState('');
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 1 });

  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState('create');
  const [currentItem, setCurrentItem] = useState(null);
  const [formData, setFormData] = useState({});
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [drawerItem, setDrawerItem] = useState(null);
  const [nameFilter, setNameFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [codeFilter, setCodeFilter] = useState('');
  const [descriptionFilter, setDescriptionFilter] = useState('');
  const [daysFilter, setDaysFilter] = useState('');
  const [valueFilter, setValueFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [sortField, setSortField] = useState('name');
  const [sortDir, setSortDir] = useState('asc');
  const formRef = useRef(null);

  const [selectedIds, setSelectedIds] = useState(new Set());
  const [deleteAllTarget, setDeleteAllTarget] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);

  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelectedIds(prev => prev.size === filteredItems.length && filteredItems.length > 0 ? new Set() : new Set(filteredItems.map(d => d._id)));
  };

  const handleBulkDelete = async () => {
    setDeletingAll(true);
    try {
      const ids = Array.from(selectedIds);
      for (const id of ids) {
        await salesMasterAPI[API_MAP[activeTab].del](id);
      }
      toast.success(`${ids.length} item(s) deleted`);
      setSelectedIds(new Set());
      setDeleteAllTarget(false);
      fetchTableData();
      fetchStats();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Bulk delete failed');
    } finally {
      setDeletingAll(false);
    }
  };

  const fetchStats = useCallback(async () => {
    try {
      const res = await salesMasterAPI.getStats();
      if (res.data.success) setStats(res.data.data || {});
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    }
  }, []);

  const fetchTableData = useCallback(async () => {
    setLoading(true);
    try {
      const apiKey = API_MAP[activeTab]?.get;
      if (!apiKey) { setTableData([]); return; }
      const params = { search, page: pagination.page, limit: pagination.limit };
      const res = await salesMasterAPI[apiKey](params);
      if (res.data.success) {
        setTableData(toArray(res.data.data));
        if (res.data.pagination) setPagination(res.data.pagination);
      }
    } catch (error) {
      toast.error('Failed to fetch data');
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, [activeTab, search, pagination.page, pagination.limit]);

  useEffect(() => { fetchStats(); }, [fetchStats]);
  useEffect(() => { fetchTableData(); }, [fetchTableData]);

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setSearch('');
    setSelectedIds(new Set());
    setDeleteAllTarget(false);
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  const handleSearch = (e) => {
    setSearch(e.target.value);
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  const openModal = (mode, item = null) => {
    setModalMode(mode);
    setCurrentItem(item);
    setFormData(item ? { ...item } : { isActive: true });
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setFormData({});
    setCurrentItem(null);
  };

  useModalKeyboard(modalOpen, closeModal, () => formRef.current?.requestSubmit());

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name?.trim()) { toast.error('Name is required'); return; }
    setSaving(true);
    try {
      const data = { ...formData };
      if (data.days) data.days = Number(data.days);
      if (data.value) data.value = Number(data.value);

      const ops = API_MAP[activeTab];
      const id = currentItem?._id;
      const res = id
        ? await salesMasterAPI[ops.update](id, data)
        : await salesMasterAPI[ops.create](data);

      if (res.data.success) {
        toast.success(res.data.message);
        fetchTableData();
        fetchStats();
        closeModal();
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Operation failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      const res = await salesMasterAPI[API_MAP[activeTab].del](deleteTarget._id);
      if (res.data.success) {
        toast.success('Deleted successfully');
        fetchTableData();
        fetchStats();
        setDeleteTarget(null);
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Delete failed');
    }
  };

  const handleToggleActive = async (item) => {
    const prev = item.isActive;
    const next = !prev;
    item.isActive = next;
    if (item === drawerItem) setDrawerItem({ ...drawerItem });
    try {
      const op = API_MAP[activeTab]?.update;
      if (!op) return;
      const res = await salesMasterAPI[op](item._id, { isActive: next });
      if (res.data.success) {
        toast.success(res.data.message);
        fetchTableData();
        fetchStats();
      } else {
        item.isActive = prev;
        if (item === drawerItem) setDrawerItem({ ...drawerItem });
      }
    } catch (error) {
      item.isActive = prev;
      if (item === drawerItem) setDrawerItem({ ...drawerItem });
      toast.error(error.response?.data?.message || 'Failed to toggle status');
    }
  };

  const paginate = (page) => setPagination(prev => ({ ...prev, page }));

  const renderPagination = () => <ServerPagination {...pagination} onPageChange={paginate} onPageSizeChange={(limit) => setPagination(prev => ({ ...prev, page: 1, limit }))} loading={loading} />;

  const handleSort = (field) => {
    if (sortField === field) { setSortDir(d => d === 'asc' ? 'desc' : 'asc'); }
    else { setSortField(field); setSortDir('asc'); }
  };

  const SortIcon = ({ field }) => {
    if (sortField !== field) return <ArrowUpDown size={14} style={{ verticalAlign: 'middle', marginLeft: 4 }} />;
    return sortDir === 'asc'
      ? <ArrowUp size={14} style={{ verticalAlign: 'middle', marginLeft: 4 }} />
      : <ArrowDown size={14} style={{ verticalAlign: 'middle', marginLeft: 4 }} />;
  };

  const filteredItems = useMemo(() => {
    let data = [...tableData];
    const term = (v) => (v || '').toString().toLowerCase();
    if (nameFilter) data = data.filter(item => term(item.name).includes(term(nameFilter)));
    if (codeFilter) data = data.filter(item => term(item.code).includes(term(codeFilter)));
    if (descriptionFilter) data = data.filter(item => term(item.description).includes(term(descriptionFilter)));
    if (statusFilter !== 'all') data = data.filter(item => item.isActive === (statusFilter === 'active'));
    if (daysFilter) data = data.filter(item => String(item.days ?? '').includes(daysFilter));
    if (valueFilter) data = data.filter(item => String(item.value ?? '').includes(valueFilter));
    if (typeFilter) data = data.filter(item => item.type === typeFilter);
    data.sort((a, b) => {
      let aVal = a[sortField], bVal = b[sortField];
      if (aVal == null) aVal = '';
      if (bVal == null) bVal = '';
      let cmp;
      if (typeof aVal === 'number' && typeof bVal === 'number') cmp = aVal - bVal;
      else if (typeof aVal === 'boolean' && typeof bVal === 'boolean') cmp = (aVal === bVal) ? 0 : aVal ? 1 : -1;
      else cmp = String(aVal).localeCompare(String(bVal));
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return data;
  }, [tableData, nameFilter, statusFilter, codeFilter, descriptionFilter, sortField, sortDir, daysFilter, valueFilter, typeFilter]);

  const renderDrawerContent = () => {
    if (!drawerItem) return null;
    const item = drawerItem;
    const Detail = ({ label: lbl, value }) => (
      <div className="drawer-detail-row" style={{ padding: '8px 0', borderBottom: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ fontWeight: 600, color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{lbl}</span>
        <span style={{ color: 'var(--text-primary)' }}>{value ?? '-'}</span>
      </div>
    );
    const statusBadge = (active) => (
      <span className={`status-capsule ${active ? 'active' : ''}`} onClick={(e) => { e.stopPropagation(); handleToggleActive(item); }}><span className="capsule-circle" /></span>
    );
    const tabKey = activeTab;
    if (tabKey === 'payment-terms') return (<><Detail label="Name" value={item.name} /><Detail label="Code" value={item.code} /><Detail label="Days" value={item.days ? `Net ${item.days}` : '-'} /><Detail label="Description" value={item.description} /><Detail label="Status" value={statusBadge(item.isActive)} /></>);
    if (tabKey === 'delivery-terms') return (<><Detail label="Name" value={item.name} /><Detail label="Code" value={item.code} /><Detail label="Description" value={item.description} /><Detail label="Status" value={statusBadge(item.isActive)} /></>);
    if (tabKey === 'quotation-validities') return (<><Detail label="Name" value={item.name} /><Detail label="Code" value={item.code} /><Detail label="Valid Days" value={item.days ? `${item.days} days` : '-'} /><Detail label="Description" value={item.description} /><Detail label="Status" value={statusBadge(item.isActive)} /></>);
    if (tabKey === 'discount-types') return (<><Detail label="Name" value={item.name} /><Detail label="Code" value={item.code} /><Detail label="Type" value={item.type} /><Detail label="Value" value={item.type === 'percentage' ? `${item.value}%` : `$${Number(item.value || 0).toFixed(2)}`} /><Detail label="Description" value={item.description} /><Detail label="Status" value={statusBadge(item.isActive)} /></>);
    if (tabKey === 'sales-order-types') return (<><Detail label="Name" value={item.name} /><Detail label="Code" value={item.code} /><Detail label="Description" value={item.description} /><Detail label="Status" value={statusBadge(item.isActive)} /></>);
    if (tabKey === 'invoice-types') return (<><Detail label="Name" value={item.name} /><Detail label="Code" value={item.code} /><Detail label="Description" value={item.description} /><Detail label="Status" value={statusBadge(item.isActive)} /></>);
    return null;
  };

  const renderStatus = (item) => (
    <span className={`status-capsule ${item.isActive ? 'active' : ''}`} onClick={(e) => { e.stopPropagation(); handleToggleActive(item); }}>
      <span className="capsule-circle" />
    </span>
  );

  const renderActions = (item) => (
    <ActionButtons onEdit={() => openModal('edit', item)} onDelete={() => setDeleteTarget(item)} />
  );

  const nameFilterInput = <input type="text" className="form-input filter-input" placeholder="Filter..." value={nameFilter} onChange={(e) => setNameFilter(e.target.value)} onClick={(e) => e.stopPropagation()} />;
  const codeFilterInput = <input type="text" className="form-input filter-input" placeholder="Filter code..." value={codeFilter} onChange={(e) => setCodeFilter(e.target.value)} onClick={(e) => e.stopPropagation()} />;
  const descFilterInput = <input type="text" className="form-input filter-input" placeholder="Filter desc..." value={descriptionFilter} onChange={(e) => setDescriptionFilter(e.target.value)} onClick={(e) => e.stopPropagation()} />;
  const statusFilterSelect = (
    <select className="form-input filter-input" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} onClick={(e) => e.stopPropagation()}>
      <option value="all">All</option>
      <option value="active">Active</option>
      <option value="inactive">Inactive</option>
    </select>
  );
  const daysFilterInput = <input type="text" className="form-input filter-input" placeholder="Filter days..." value={daysFilter} onChange={(e) => setDaysFilter(e.target.value)} onClick={(e) => e.stopPropagation()} />;
  const valueFilterInput = <input type="text" className="form-input filter-input" placeholder="Filter value..." value={valueFilter} onChange={(e) => setValueFilter(e.target.value)} onClick={(e) => e.stopPropagation()} />;
  const typeFilterSelect = (
    <select className="form-input filter-input" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} onClick={(e) => e.stopPropagation()}>
      <option value="">All</option>
      <option value="percentage">Percentage</option>
      <option value="fixed">Fixed</option>
    </select>
  );

  const renderTable = (headers, rows, filterCols = [], sortFields = []) => (
    <div className="table-container">
      <table>
        <thead>
          <tr>
            <th style={{ width: 40 }}><input type="checkbox" checked={selectedIds.size === filteredItems.length && filteredItems.length > 0} onChange={toggleSelectAll} /></th>
            {headers.map((h, i) => (
              <th key={h} className={sortFields[i] ? 'sortable' : ''} onClick={sortFields[i] ? () => handleSort(sortFields[i]) : undefined}>
                {h}
                {sortFields[i] && <SortIcon field={sortFields[i]} />}
              </th>
            ))}
          </tr>
          <tr className="filter-row">
            <th></th>
            {headers.map((h, i) => (
              <th key={`f-${h}`}>{filterCols[i] || null}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={headers.length + 1} style={{ textAlign: 'center' }}>No records found</td></tr>
          ) : rows}
        </tbody>
      </table>
    </div>
  );

  const renderCards = (items, renderCardContent) => (
    <div className="mobile-cards">
      {items.length === 0 ? (
        <div className="empty-state">No records found</div>
      ) : items.map(item => (
        <div key={item._id} className="data-card">
          {renderCardContent(item)}
          <div className="card-actions">
            <ActionButtons onEdit={() => openModal('edit', item)} onDelete={() => setDeleteTarget(item)} />
          </div>
        </div>
      ))}
    </div>
  );

  // ── Payment Terms ────────────────────────────────────────────────────

  const renderPaymentTermsTable = () => renderTable(
    ['Name', 'Code', 'Days', 'Description', 'Status', 'Actions'],
    filteredItems.map(item => (
      <tr key={item._id} onClick={() => setDrawerItem(item)} style={{ cursor: 'pointer' }}>
        <td onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={selectedIds.has(item._id)} onChange={() => toggleSelect(item._id)} /></td>
        <td onClick={(e) => e.stopPropagation()}><strong>{item.name}</strong></td>
        <td>{item.code || '—'}</td>
        <td>{item.days ? `Net ${item.days}` : '—'}</td>
        <td>{item.description || '—'}</td>
        <td>{renderStatus(item)}</td>
        <td onClick={(e) => e.stopPropagation()}>{renderActions(item)}</td>
      </tr>
    )),
    [nameFilterInput, codeFilterInput, daysFilterInput, descFilterInput, statusFilterSelect, null],
    ['name', 'code', 'days', 'description', 'isActive', null]
  );

  const renderPaymentTermsCards = () => renderCards(tableData, item => (
    <>
      <div className="card-field"><strong>{item.name}</strong></div>
      {item.code && <div className="card-field"><label>Code:</label><span>{item.code}</span></div>}
      {item.days && <div className="card-field"><label>Days:</label><span>Net {item.days}</span></div>}
      {item.description && <div className="card-field"><label>Description:</label><span>{item.description}</span></div>}
      <div className="card-field">{renderStatus(item)}</div>
    </>
  ));

  const renderPaymentTermForm = () => (
    <>
      <div className="form-group">
        <label>Name *</label>
        <input type="text" name="name" value={formData.name || ''} onChange={handleInputChange} required autoFocus />
      </div>
      <div className="form-group">
        <label>Code</label>
        <input type="text" name="code" value={formData.code || ''} onChange={handleInputChange} placeholder="e.g. NET30" />
      </div>
      <div className="form-group">
        <label>Net Days</label>
        <input type="number" name="days" value={formData.days ?? ''} onChange={handleInputChange} min="0" placeholder="e.g. 30" />
      </div>
      <div className="form-group">
        <label>Description</label>
        <textarea name="description" value={formData.description || ''} onChange={handleInputChange} />
      </div>
      <div className="form-group">
        <label style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <ToggleSwitch checked={formData.isActive !== false} onChange={(v) => setFormData(prev => ({ ...prev, isActive: v }))} />
          Active
        </label>
      </div>
    </>
  );

  // ── Delivery Terms ───────────────────────────────────────────────────

  const renderDeliveryTermsTable = () => renderTable(
    ['Name', 'Code', 'Description', 'Status', 'Actions'],
    filteredItems.map(item => (
      <tr key={item._id} onClick={() => setDrawerItem(item)} style={{ cursor: 'pointer' }}>
        <td onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={selectedIds.has(item._id)} onChange={() => toggleSelect(item._id)} /></td>
        <td onClick={(e) => e.stopPropagation()}><strong>{item.name}</strong></td>
        <td>{item.code || '—'}</td>
        <td>{item.description || '—'}</td>
        <td>{renderStatus(item)}</td>
        <td onClick={(e) => e.stopPropagation()}>{renderActions(item)}</td>
      </tr>
    )),
    [nameFilterInput, codeFilterInput, descFilterInput, statusFilterSelect, null],
    ['name', 'code', 'description', 'isActive', null]
  );

  const renderDeliveryTermsCards = () => renderCards(tableData, item => (
    <>
      <div className="card-field"><strong>{item.name}</strong></div>
      {item.code && <div className="card-field"><label>Code:</label><span>{item.code}</span></div>}
      {item.description && <div className="card-field"><label>Description:</label><span>{item.description}</span></div>}
      <div className="card-field">{renderStatus(item)}</div>
    </>
  ));

  const renderDeliveryTermForm = () => (
    <>
      <div className="form-group">
        <label>Name *</label>
        <input type="text" name="name" value={formData.name || ''} onChange={handleInputChange} required autoFocus />
      </div>
      <div className="form-group">
        <label>Code</label>
        <input type="text" name="code" value={formData.code || ''} onChange={handleInputChange} placeholder="e.g. EXW" />
      </div>
      <div className="form-group">
        <label>Description</label>
        <textarea name="description" value={formData.description || ''} onChange={handleInputChange} />
      </div>
      <div className="form-group">
        <label style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <ToggleSwitch checked={formData.isActive !== false} onChange={(v) => setFormData(prev => ({ ...prev, isActive: v }))} />
          Active
        </label>
      </div>
    </>
  );

  // ── Quotation Validities ─────────────────────────────────────────────

  const renderQuotationValiditiesTable = () => renderTable(
    ['Name', 'Code', 'Valid Days', 'Description', 'Status', 'Actions'],
    filteredItems.map(item => (
      <tr key={item._id} onClick={() => setDrawerItem(item)} style={{ cursor: 'pointer' }}>
        <td onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={selectedIds.has(item._id)} onChange={() => toggleSelect(item._id)} /></td>
        <td onClick={(e) => e.stopPropagation()}><strong>{item.name}</strong></td>
        <td>{item.code || '—'}</td>
        <td>{item.days ? `${item.days} days` : '—'}</td>
        <td>{item.description || '—'}</td>
        <td>{renderStatus(item)}</td>
        <td onClick={(e) => e.stopPropagation()}>{renderActions(item)}</td>
      </tr>
    )),
    [nameFilterInput, codeFilterInput, daysFilterInput, descFilterInput, statusFilterSelect, null],
    ['name', 'code', 'days', 'description', 'isActive', null]
  );

  const renderQuotationValiditiesCards = () => renderCards(tableData, item => (
    <>
      <div className="card-field"><strong>{item.name}</strong></div>
      {item.code && <div className="card-field"><label>Code:</label><span>{item.code}</span></div>}
      {item.days && <div className="card-field"><label>Valid Days:</label><span>{item.days} days</span></div>}
      {item.description && <div className="card-field"><label>Description:</label><span>{item.description}</span></div>}
      <div className="card-field">{renderStatus(item)}</div>
    </>
  ));

  const renderQuotationValidityForm = () => (
    <>
      <div className="form-group">
        <label>Name *</label>
        <input type="text" name="name" value={formData.name || ''} onChange={handleInputChange} required autoFocus />
      </div>
      <div className="form-group">
        <label>Code</label>
        <input type="text" name="code" value={formData.code || ''} onChange={handleInputChange} placeholder="e.g. VAL30" />
      </div>
      <div className="form-group">
        <label>Valid Days</label>
        <input type="number" name="days" value={formData.days ?? ''} onChange={handleInputChange} min="0" placeholder="e.g. 30" />
      </div>
      <div className="form-group">
        <label>Description</label>
        <textarea name="description" value={formData.description || ''} onChange={handleInputChange} />
      </div>
      <div className="form-group">
        <label style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <ToggleSwitch checked={formData.isActive !== false} onChange={(v) => setFormData(prev => ({ ...prev, isActive: v }))} />
          Active
        </label>
      </div>
    </>
  );

  // ── Discount Types ───────────────────────────────────────────────────

  const renderDiscountTypesTable = () => renderTable(
    ['Name', 'Code', 'Type', 'Value', 'Description', 'Status', 'Actions'],
    filteredItems.map(item => (
      <tr key={item._id} onClick={() => setDrawerItem(item)} style={{ cursor: 'pointer' }}>
        <td onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={selectedIds.has(item._id)} onChange={() => toggleSelect(item._id)} /></td>
        <td onClick={(e) => e.stopPropagation()}><strong>{item.name}</strong></td>
        <td>{item.code || '—'}</td>
        <td><span className="status-badge" style={{ background: '#f1f5f9', color: '#475569' }}>{item.type || 'percentage'}</span></td>
        <td>{item.type === 'percentage' ? `${item.value}%` : `$${Number(item.value || 0).toFixed(2)}`}</td>
        <td>{item.description || '—'}</td>
        <td>{renderStatus(item)}</td>
        <td onClick={(e) => e.stopPropagation()}>{renderActions(item)}</td>
      </tr>
    )),
    [nameFilterInput, codeFilterInput, typeFilterSelect, valueFilterInput, descFilterInput, statusFilterSelect, null],
    ['name', 'code', 'type', 'value', 'description', 'isActive', null]
  );

  const renderDiscountTypesCards = () => renderCards(tableData, item => (
    <>
      <div className="card-field"><strong>{item.name}</strong></div>
      {item.code && <div className="card-field"><label>Code:</label><span>{item.code}</span></div>}
      <div className="card-field"><label>Type:</label><span>{item.type || 'percentage'}</span></div>
      <div className="card-field"><label>Value:</label><span>{item.type === 'percentage' ? `${item.value}%` : `$${Number(item.value || 0).toFixed(2)}`}</span></div>
      {item.description && <div className="card-field"><label>Description:</label><span>{item.description}</span></div>}
      <div className="card-field">{renderStatus(item)}</div>
    </>
  ));

  const renderDiscountTypeForm = () => (
    <>
      <div className="form-group">
        <label>Name *</label>
        <input type="text" name="name" value={formData.name || ''} onChange={handleInputChange} required autoFocus />
      </div>
      <div className="form-group">
        <label>Code</label>
        <input type="text" name="code" value={formData.code || ''} onChange={handleInputChange} placeholder="e.g. BULK-10" />
      </div>
      <div className="grid-cols-2">
        <div className="form-group">
          <label>Discount Type</label>
          <select name="type" value={formData.type || 'percentage'} onChange={handleInputChange}>
            <option value="percentage">Percentage (%)</option>
            <option value="fixed">Fixed Amount ($)</option>
          </select>
        </div>
        <div className="form-group">
          <label>Value</label>
          <input type="number" name="value" value={formData.value ?? ''} onChange={handleInputChange} min="0" step={formData.type === 'percentage' ? '1' : '0.01'} />
        </div>
      </div>
      <div className="form-group">
        <label>Description</label>
        <textarea name="description" value={formData.description || ''} onChange={handleInputChange} />
      </div>
      <div className="form-group">
        <label style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <ToggleSwitch checked={formData.isActive !== false} onChange={(v) => setFormData(prev => ({ ...prev, isActive: v }))} />
          Active
        </label>
      </div>
    </>
  );

  // ── Sales Order Types ────────────────────────────────────────────────

  const renderSalesOrderTypesTable = () => renderTable(
    ['Name', 'Code', 'Description', 'Status', 'Actions'],
    filteredItems.map(item => (
      <tr key={item._id} onClick={() => setDrawerItem(item)} style={{ cursor: 'pointer' }}>
        <td onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={selectedIds.has(item._id)} onChange={() => toggleSelect(item._id)} /></td>
        <td onClick={(e) => e.stopPropagation()}><strong>{item.name}</strong></td>
        <td>{item.code || '—'}</td>
        <td>{item.description || '—'}</td>
        <td>{renderStatus(item)}</td>
        <td onClick={(e) => e.stopPropagation()}>{renderActions(item)}</td>
      </tr>
    )),
    [nameFilterInput, codeFilterInput, descFilterInput, statusFilterSelect, null],
    ['name', 'code', 'description', 'isActive', null]
  );

  const renderSalesOrderTypesCards = () => renderCards(tableData, item => (
    <>
      <div className="card-field"><strong>{item.name}</strong></div>
      {item.code && <div className="card-field"><label>Code:</label><span>{item.code}</span></div>}
      {item.description && <div className="card-field"><label>Description:</label><span>{item.description}</span></div>}
      <div className="card-field">{renderStatus(item)}</div>
    </>
  ));

  const renderSalesOrderTypeForm = () => (
    <>
      <div className="form-group">
        <label>Name *</label>
        <input type="text" name="name" value={formData.name || ''} onChange={handleInputChange} required autoFocus />
      </div>
      <div className="form-group">
        <label>Code</label>
        <input type="text" name="code" value={formData.code || ''} onChange={handleInputChange} placeholder="e.g. SO-STD" />
      </div>
      <div className="form-group">
        <label>Description</label>
        <textarea name="description" value={formData.description || ''} onChange={handleInputChange} />
      </div>
      <div className="form-group">
        <label style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <ToggleSwitch checked={formData.isActive !== false} onChange={(v) => setFormData(prev => ({ ...prev, isActive: v }))} />
          Active
        </label>
      </div>
    </>
  );

  // ── Invoice Types ────────────────────────────────────────────────────

  const renderInvoiceTypesTable = () => renderTable(
    ['Name', 'Code', 'Description', 'Status', 'Actions'],
    filteredItems.map(item => (
      <tr key={item._id} onClick={() => setDrawerItem(item)} style={{ cursor: 'pointer' }}>
        <td onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={selectedIds.has(item._id)} onChange={() => toggleSelect(item._id)} /></td>
        <td onClick={(e) => e.stopPropagation()}><strong>{item.name}</strong></td>
        <td>{item.code || '—'}</td>
        <td>{item.description || '—'}</td>
        <td>{renderStatus(item)}</td>
        <td onClick={(e) => e.stopPropagation()}>{renderActions(item)}</td>
      </tr>
    )),
    [nameFilterInput, codeFilterInput, descFilterInput, statusFilterSelect, null],
    ['name', 'code', 'description', 'isActive', null]
  );

  const renderInvoiceTypesCards = () => renderCards(tableData, item => (
    <>
      <div className="card-field"><strong>{item.name}</strong></div>
      {item.code && <div className="card-field"><label>Code:</label><span>{item.code}</span></div>}
      {item.description && <div className="card-field"><label>Description:</label><span>{item.description}</span></div>}
      <div className="card-field">{renderStatus(item)}</div>
    </>
  ));

  const renderInvoiceTypeForm = () => (
    <>
      <div className="form-group">
        <label>Name *</label>
        <input type="text" name="name" value={formData.name || ''} onChange={handleInputChange} required autoFocus />
      </div>
      <div className="form-group">
        <label>Code</label>
        <input type="text" name="code" value={formData.code || ''} onChange={handleInputChange} placeholder="e.g. INV-STD" />
      </div>
      <div className="form-group">
        <label>Description</label>
        <textarea name="description" value={formData.description || ''} onChange={handleInputChange} />
      </div>
      <div className="form-group">
        <label style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <ToggleSwitch checked={formData.isActive !== false} onChange={(v) => setFormData(prev => ({ ...prev, isActive: v }))} />
          Active
        </label>
      </div>
    </>
  );

  // ── Form & table lookup ──────────────────────────────────────────────

  const FORMS = {
    'payment-terms': renderPaymentTermForm,
    'delivery-terms': renderDeliveryTermForm,
    'quotation-validities': renderQuotationValidityForm,
    'discount-types': renderDiscountTypeForm,
    'sales-order-types': renderSalesOrderTypeForm,
    'invoice-types': renderInvoiceTypeForm,
  };

  const TABLES = {
    'payment-terms': { table: renderPaymentTermsTable, cards: renderPaymentTermsCards },
    'delivery-terms': { table: renderDeliveryTermsTable, cards: renderDeliveryTermsCards },
    'quotation-validities': { table: renderQuotationValiditiesTable, cards: renderQuotationValiditiesCards },
    'discount-types': { table: renderDiscountTypesTable, cards: renderDiscountTypesCards },
    'sales-order-types': { table: renderSalesOrderTypesTable, cards: renderSalesOrderTypesCards },
    'invoice-types': { table: renderInvoiceTypesTable, cards: renderInvoiceTypesCards },
  };

  const TAB_LABELS = {
    'payment-terms': 'Payment Term',
    'delivery-terms': 'Delivery Term',
    'quotation-validities': 'Quotation Validity',
    'discount-types': 'Discount Type',
    'sales-order-types': 'Sales Order Type',
    'invoice-types': 'Invoice Type',
  };

  return (
    <div className="sales-master-page">
      <div className="page-header">
        <h1>
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" width="28">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          Sales Master Data
        </h1>
      </div>

      {/* Stats */}
      <div className="stats-grid">
        {TABS.map(tab => {
          const iconClass = TAB_STAT_ICONS[tab.key];
          return (
            <div key={tab.key} className="stat-card">
              <div className={`stat-icon ${iconClass}`}>{STAT_EMOJIS[iconClass]}</div>
              <div className="stat-info">
                <h3>{tab.label}</h3>
                <div className="value">{stats[STATS_KEYS[tab.key]] ?? 0}</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Content */}
      <div className="tabs-container">
        <div className="tabs-header">
          {TABS.map(tab => (
            <button key={tab.key} className={`tab-btn ${activeTab === tab.key ? 'active' : ''}`} onClick={() => handleTabChange(tab.key)}>
              {tab.label}
            </button>
          ))}
        </div>

        <div className="tab-content">
          <div className="action-bar">
            <div className="search-box">
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <circle cx="11" cy="11" r="7" strokeWidth="2" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="m20 20-4-4" />
              </svg>
              <input type="text" placeholder="Search..." value={search} onChange={handleSearch} />
            </div>
            <button className="add-btn" onClick={() => openModal('create')}>
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" width="20">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
              </svg>
              Add New
            </button>
          </div>

          {loading ? (
            <div className="flex justify-center p-12"><div className="spinner"></div></div>
          ) : (
            <>
              {selectedIds.size > 0 && (
                <div className="selection-bar">
                  <span className="selection-count">{selectedIds.size} selected</span>
                  <button className="btn btn-danger btn-sm" onClick={() => setDeleteAllTarget(true)}>Delete Selected</button>
                  <button className="btn btn-secondary btn-sm" onClick={() => setSelectedIds(new Set())}>Deselect All</button>
                </div>
              )}
              <div className="desktop-table">{TABLES[activeTab].table()}</div>
              <div className="mobile-cards-view">{TABLES[activeTab].cards()}</div>
              {renderPagination()}
            </>
          )}
        </div>
      </div>

      {/* Modal */}
      {modalOpen && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{modalMode === 'create' ? 'Create' : 'Edit'} {TAB_LABELS[activeTab]}</h2>
              <button className="close-btn" onClick={closeModal}>✕</button>
            </div>
            <form ref={formRef} onSubmit={handleSubmit}>
              <div className="modal-body">{FORMS[activeTab]()}</div>
              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={closeModal} disabled={saving}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={saving}>
                  {saving ? <><span className="spinner-mini"></span> Saving...</> : modalMode === 'create' ? 'Create' : 'Update'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Drawer */}
      <EmailDrawer
        isOpen={!!drawerItem}
        onClose={() => setDrawerItem(null)}
        title={drawerItem?.name || ''}
        width="50%"
      >
        <div style={{ padding: '0 4px' }}>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
            <button className="btn btn-primary" style={{ padding: '6px 16px', fontSize: '0.85rem' }} onClick={() => { const item = drawerItem; setDrawerItem(null); openModal('edit', item); }}>
              Edit
            </button>
            <button className="btn btn-danger" style={{ padding: '6px 16px', fontSize: '0.85rem' }} onClick={() => { const item = drawerItem; setDrawerItem(null); setDeleteTarget(item); }}>
              Delete
            </button>
          </div>
          {renderDrawerContent()}
        </div>
      </EmailDrawer>

      {/* Delete confirmation */}
      <ConfirmModal
        isOpen={!!deleteTarget}
        title="Delete Record"
        message={`Are you sure you want to delete "${deleteTarget?.name || ''}"?`}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
        confirmText="Delete"
        type="danger"
      />

      {/* Bulk Delete Confirmation */}
      <ConfirmModal
        isOpen={deleteAllTarget}
        title="Delete Selected Records"
        message={`Are you sure you want to delete ${selectedIds.size} record(s)? This action cannot be undone.`}
        onConfirm={handleBulkDelete}
        onCancel={() => setDeleteAllTarget(false)}
        confirmText={deletingAll ? 'Deleting...' : 'Delete All'}
        type="danger"
      />
    </div>
  );
}

export default SalesMasterData;
