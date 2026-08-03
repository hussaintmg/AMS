import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { ArrowUpDown, ArrowUp, ArrowDown, Upload } from 'lucide-react';
import { serviceMasterAPI } from '../services/api';
import toast from 'react-hot-toast';
import ActionButtons from '../components/ActionButtons';
import ToggleSwitch from '../components/ToggleSwitch';
import ConfirmModal from '../components/ConfirmModal';
import EmailDrawer from '../components/EmailDrawer';
import useModalKeyboard from '../hooks/useModalKeyboard';
import '../styles/serviceMasterData.css';
import ServerPagination from '../components/ServerPagination';
import '../styles/emailTemplates.css';

const toArray = (value) => Array.isArray(value) ? value : [];

function ServiceMasterData() {
    const [activeTab, setActiveTab] = useState('types');
    const [stats, setStats] = useState({ serviceTypes: 0, laborRates: 0, packages: 0, warranties: 0 });
    const [warrantyTypes, setWarrantyTypes] = useState([]);
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
    const [priceFilter, setPriceFilter] = useState('');
    const [hoursFilter, setHoursFilter] = useState('');
    const [servicesFilter, setServicesFilter] = useState('');
    const [kmFilter, setKmFilter] = useState('');
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
        const ops = {
          types: 'deleteType',
          rates: 'deleteLaborRate',
          packages: 'deletePackage',
          warranties: 'deleteWarranty',
        };
        for (const id of ids) {
          await serviceMasterAPI[ops[activeTab]](id);
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
            const res = await serviceMasterAPI.getStats();
            if (res.data.success) setStats(res.data.data);
        } catch (error) {
            console.error('Failed to fetch stats:', error);
        }
    }, []);

    const fetchTableData = useCallback(async () => {
        setLoading(true);
        try {
            const params = { search, page: pagination.page, limit: pagination.limit };
            const lookup = { types: 'getTypes', rates: 'getLaborRates', packages: 'getPackages', warranties: 'getWarranties' };
            const method = lookup[activeTab];
            if (!method) { setTableData([]); return; }
            const res = await serviceMasterAPI[method](params);
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

    // Warranty types feed the package form's warranty picker, so they are loaded
    // independently of whichever tab is currently shown.
    const fetchWarrantyTypes = useCallback(async () => {
        try {
            const res = await serviceMasterAPI.getWarranties({ limit: 500 });
            if (res.data.success) setWarrantyTypes(toArray(res.data.data));
        } catch (error) {
            console.error('Failed to fetch warranty types:', error);
        }
    }, []);

    useEffect(() => { fetchStats(); }, [fetchStats]);

    useEffect(() => { fetchTableData(); }, [fetchTableData]);

    useEffect(() => { fetchWarrantyTypes(); }, [fetchWarrantyTypes]);

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
        const initial = item ? { ...item } : { isActive: true };
        if (mode === 'create' && activeTab === 'packages') {
            initial.services = [];
        }
        setFormData(initial);
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

    const handleAddService = () => {
        setFormData(prev => ({
            ...prev,
            services: [...(prev.services || []), { name: '', quantity: 1, price: 0 }]
        }));
    };

    const handleServiceChange = (index, field, value) => {
        const services = [...(formData.services || [])];
        services[index] = { ...services[index], [field]: value };
        setFormData(prev => ({ ...prev, services }));
    };

    const handleRemoveService = (index) => {
        const services = (formData.services || []).filter((_, i) => i !== index);
        setFormData(prev => ({ ...prev, services }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        const nameField = activeTab === 'packages' ? 'packageName' : 'name';
        if (!formData[nameField]?.trim()) { toast.error('Name is required'); return; }
        setSaving(true);
        try {
            const data = { ...formData };
            if (data.basePrice) data.basePrice = Number(data.basePrice);
            if (data.estimatedHours) data.estimatedHours = Number(data.estimatedHours);
            if (data.rate) data.rate = Number(data.rate);
            if (data.duration) data.duration = Number(data.duration);
            if (data.price) data.price = Number(data.price);
            if (data.durationMonths) data.durationMonths = Number(data.durationMonths);
            if (data.durationKm) data.durationKm = Number(data.durationKm);

            const operations = {
                types: { create: 'createType', update: 'updateType' },
                rates: { create: 'createLaborRate', update: 'updateLaborRate' },
                packages: { create: 'createPackage', update: 'updatePackage' },
                warranties: { create: 'createWarranty', update: 'updateWarranty' },
            };
            const op = operations[activeTab][modalMode];
            const id = currentItem?._id;
            const res = id
                ? await serviceMasterAPI[op](id, data)
                : await serviceMasterAPI[op](data);

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

    const handleToggleActive = async (item) => {
        const prev = item.isActive;
        const next = !prev;
        item.isActive = next;
        if (item === drawerItem) setDrawerItem({ ...drawerItem });
        try {
            const operations = {
                types: 'updateType',
                rates: 'updateLaborRate',
                packages: 'updatePackage',
                warranties: 'updateWarranty',
            };
            const op = operations[activeTab];
            if (!op) return;
            const res = await serviceMasterAPI[op](item._id, { isActive: next });
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

    const handleDelete = async () => {
        if (!deleteTarget) return;
        try {
            const ops = {
                types: 'deleteType',
                rates: 'deleteLaborRate',
                packages: 'deletePackage',
                warranties: 'deleteWarranty',
            };
            const res = await serviceMasterAPI[ops[activeTab]](deleteTarget._id);
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

    const paginate = (page) => setPagination(prev => ({ ...prev, page }));

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

    const renderPagination = () => <ServerPagination {...pagination} onPageChange={paginate} onPageSizeChange={(limit) => setPagination(prev => ({ ...prev, page: 1, limit }))} loading={loading} />;

    const filteredItems = useMemo(() => {
        let data = [...tableData];
        const term = (v) => (v || '').toString().toLowerCase();
        if (nameFilter) data = data.filter(item => term(item.name || item.packageName).includes(term(nameFilter)));
        if (codeFilter) data = data.filter(item => term(item.code).includes(term(codeFilter)));
        if (descriptionFilter) data = data.filter(item => term(item.description).includes(term(descriptionFilter)));
        if (statusFilter !== 'all') data = data.filter(item => item.isActive === (statusFilter === 'active'));
        if (priceFilter) data = data.filter(item => String(item.basePrice ?? item.rate ?? item.price ?? '').includes(priceFilter));
        if (hoursFilter) data = data.filter(item => String(item.estimatedHours ?? item.duration ?? item.durationMonths ?? '').includes(hoursFilter));
        if (servicesFilter) data = data.filter(item => String((item.services || []).length).includes(servicesFilter));
        if (kmFilter) data = data.filter(item => String(item.durationKm ?? '').includes(kmFilter));
        data.sort((a, b) => {
            const nameField = activeTab === 'packages' && sortField === 'name' ? 'packageName' : sortField;
            let aVal = a[nameField], bVal = b[nameField];
            if (aVal == null) aVal = '';
            if (bVal == null) bVal = '';
            let cmp;
            if (typeof aVal === 'number' && typeof bVal === 'number') cmp = aVal - bVal;
            else if (typeof aVal === 'boolean' && typeof bVal === 'boolean') cmp = (aVal === bVal) ? 0 : aVal ? 1 : -1;
            else cmp = String(aVal).localeCompare(String(bVal));
            return sortDir === 'asc' ? cmp : -cmp;
        });
        return data;
    }, [tableData, activeTab, nameFilter, statusFilter, codeFilter, descriptionFilter, sortField, sortDir, priceFilter, hoursFilter, servicesFilter, kmFilter]);

    const renderDrawerContent = () => {
        if (!drawerItem) return null;
        const item = drawerItem;
        const Detail = ({ label, value }) => (
            <div className="drawer-detail-row" style={{ padding: '8px 0', borderBottom: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontWeight: 600, color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{label}</span>
                <span style={{ color: 'var(--text-primary)' }}>{value ?? '-'}</span>
            </div>
        );
        const statusBadge = (active) => (
            <span className={`status-capsule ${active ? 'active' : ''}`} onClick={(e) => { e.stopPropagation(); handleToggleActive(item); }}>
                <span className="capsule-circle" />
            </span>
        );
        switch(activeTab) {
            case 'types':
                return (<><Detail label="Name" value={item.name} /><Detail label="Code" value={item.code} /><Detail label="Base Price" value={`PKR ${Number(item.basePrice || 0).toFixed(2)}`} /><Detail label="Est. Hours" value={item.estimatedHours ? `${item.estimatedHours} hrs` : '-'} /><Detail label="Description" value={item.description} /><Detail label="Category" value={item.category} /><Detail label="Status" value={statusBadge(item.isActive)} /></>);
            case 'rates':
                return (<><Detail label="Name" value={item.name} /><Detail label="Code" value={item.code} /><Detail label="Rate" value={`PKR ${Number(item.rate || 0).toFixed(2)}/hr`} /><Detail label="Duration" value={item.duration ? `${item.duration} min` : '-'} /><Detail label="Description" value={item.description} /><Detail label="Status" value={statusBadge(item.isActive)} /></>);
            case 'packages':
                return (<><Detail label="Package Name" value={item.packageName} /><Detail label="Price" value={`PKR ${Number(item.price || 0).toFixed(2)}`} /><Detail label="Duration" value={item.duration ? `${item.duration} min` : '-'} /><Detail label="Services" value={(item.services || []).length} /><Detail label="Description" value={item.description} /><Detail label="Warranty" value={item.warranty} /><Detail label="Status" value={statusBadge(item.isActive)} /></>);
            case 'warranties':
                return (<><Detail label="Name" value={item.name} /><Detail label="Code" value={item.code} /><Detail label="Duration" value={item.durationMonths ? `${item.durationMonths} months` : '-'} /><Detail label="Km Limit" value={item.durationKm ? `${Number(item.durationKm).toLocaleString()} km` : '-'} /><Detail label="Description" value={item.description} /><Detail label="Terms" value={item.terms} /><Detail label="Status" value={statusBadge(item.isActive)} /></>);
            default: return null;
        }
    };

    const renderStatus = (item) => (
        <span className={`status-capsule ${item.isActive ? 'active' : ''}`} onClick={(e) => { e.stopPropagation(); handleToggleActive(item); }}>
            <span className="capsule-circle" />
        </span>
    );

    const renderActions = (item) => (
        <ActionButtons onEdit={() => openModal('edit', item)} onDelete={() => setDeleteTarget(item)} />
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
                            <th key={`f-${h}`}>
                                {filterCols[i] || null}
                            </th>
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
    const priceFilterInput = <input type="text" className="form-input filter-input" placeholder="Filter price..." value={priceFilter} onChange={(e) => setPriceFilter(e.target.value)} onClick={(e) => e.stopPropagation()} />;
    const hoursFilterInput = <input type="text" className="form-input filter-input" placeholder="Filter hours..." value={hoursFilter} onChange={(e) => setHoursFilter(e.target.value)} onClick={(e) => e.stopPropagation()} />;
    const servicesFilterInput = <input type="text" className="form-input filter-input" placeholder="Filter services..." value={servicesFilter} onChange={(e) => setServicesFilter(e.target.value)} onClick={(e) => e.stopPropagation()} />;
    const kmFilterInput = <input type="text" className="form-input filter-input" placeholder="Filter km..." value={kmFilter} onChange={(e) => setKmFilter(e.target.value)} onClick={(e) => e.stopPropagation()} />;

    const renderServiceTypesTable = () => renderTable(
        ['Name', 'Code', 'Base Price', 'Est. Hours', 'Status', 'Actions'],
        filteredItems.map(item => (
            <tr key={item._id} onClick={() => setDrawerItem(item)} style={{ cursor: 'pointer' }}>
                <td onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={selectedIds.has(item._id)} onChange={() => toggleSelect(item._id)} /></td>
                <td onClick={(e) => e.stopPropagation()}><strong>{item.name}</strong>{item.description && <div className="cell-desc">{item.description}</div>}</td>
                <td>{item.code || '—'}</td>
                <td>PKR {Number(item.basePrice || 0).toFixed(2)}</td>
                <td>{item.estimatedHours ? `${item.estimatedHours} hrs` : '—'}</td>
                <td>{renderStatus(item)}</td>
                <td onClick={(e) => e.stopPropagation()}>{renderActions(item)}</td>
            </tr>
        )),
        [nameFilterInput, codeFilterInput, priceFilterInput, hoursFilterInput, statusFilterSelect, null],
        ['name', 'code', 'basePrice', 'estimatedHours', 'isActive', null]
    );

    const renderServiceTypesCards = () => renderCards(tableData, item => (
        <>
            <div className="card-field"><strong>{item.name}</strong></div>
            {item.code && <div className="card-field"><label>Code:</label><span>{item.code}</span></div>}
            <div className="card-field"><label>Base Price:</label><span>PKR {Number(item.basePrice || 0).toFixed(2)}</span></div>
            {item.estimatedHours && <div className="card-field"><label>Est. Hours:</label><span>{item.estimatedHours} hrs</span></div>}
            {item.description && <div className="card-field"><label>Description:</label><span>{item.description}</span></div>}
            <div className="card-field">{renderStatus(item)}</div>
        </>
    ));

    const renderLaborRatesTable = () => renderTable(
        ['Name', 'Code', 'Rate', 'Duration', 'Status', 'Actions'],
        filteredItems.map(item => (
            <tr key={item._id} onClick={() => setDrawerItem(item)} style={{ cursor: 'pointer' }}>
                <td onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={selectedIds.has(item._id)} onChange={() => toggleSelect(item._id)} /></td>
                <td onClick={(e) => e.stopPropagation()}><strong>{item.name}</strong>{item.description && <div className="cell-desc">{item.description}</div>}</td>
                <td>{item.code || '—'}</td>
                <td>PKR {Number(item.rate || 0).toFixed(2)}/hr</td>
                <td>{item.duration ? `${item.duration} min` : '—'}</td>
                <td>{renderStatus(item)}</td>
                <td onClick={(e) => e.stopPropagation()}>{renderActions(item)}</td>
            </tr>
        )),
        [nameFilterInput, codeFilterInput, priceFilterInput, hoursFilterInput, statusFilterSelect, null],
        ['name', 'code', 'rate', 'duration', 'isActive', null]
    );

    const renderLaborRatesCards = () => renderCards(tableData, item => (
        <>
            <div className="card-field"><strong>{item.name}</strong></div>
            {item.code && <div className="card-field"><label>Code:</label><span>{item.code}</span></div>}
            <div className="card-field"><label>Rate:</label><span>PKR {Number(item.rate || 0).toFixed(2)}/hr</span></div>
            {item.duration && <div className="card-field"><label>Duration:</label><span>{item.duration} min</span></div>}
            {item.description && <div className="card-field"><label>Description:</label><span>{item.description}</span></div>}
            <div className="card-field">{renderStatus(item)}</div>
        </>
    ));

    const renderPackagesTable = () => renderTable(
        ['Package Name', 'Price', 'Services', 'Duration', 'Status', 'Actions'],
        filteredItems.map(item => (
            <tr key={item._id} onClick={() => setDrawerItem(item)} style={{ cursor: 'pointer' }}>
                <td onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={selectedIds.has(item._id)} onChange={() => toggleSelect(item._id)} /></td>
                <td onClick={(e) => e.stopPropagation()}><strong>{item.packageName}</strong>{item.description && <div className="cell-desc">{item.description}</div>}</td>
                <td>PKR {Number(item.price || 0).toFixed(2)}</td>
                <td>{(item.services || []).length} items</td>
                <td>{item.duration ? `${item.duration} min` : '—'}</td>
                <td>{renderStatus(item)}</td>
                <td onClick={(e) => e.stopPropagation()}>{renderActions(item)}</td>
            </tr>
        )),
        [nameFilterInput, priceFilterInput, servicesFilterInput, hoursFilterInput, statusFilterSelect, null],
        ['name', 'price', null, 'duration', 'isActive', null]
    );

    const renderPackagesCards = () => renderCards(tableData, item => (
        <>
            <div className="card-field"><strong>{item.packageName}</strong></div>
            <div className="card-field"><label>Price:</label><span>PKR {Number(item.price || 0).toFixed(2)}</span></div>
            <div className="card-field"><label>Services:</label><span>{(item.services || []).length} items</span></div>
            {item.duration && <div className="card-field"><label>Duration:</label><span>{item.duration} min</span></div>}
            {item.description && <div className="card-field"><label>Description:</label><span>{item.description}</span></div>}
            <div className="card-field">{renderStatus(item)}</div>
        </>
    ));

    const renderWarrantiesTable = () => renderTable(
        ['Name', 'Code', 'Duration', 'Km Limit', 'Status', 'Actions'],
        filteredItems.map(item => (
            <tr key={item._id} onClick={() => setDrawerItem(item)} style={{ cursor: 'pointer' }}>
                <td onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={selectedIds.has(item._id)} onChange={() => toggleSelect(item._id)} /></td>
                <td onClick={(e) => e.stopPropagation()}><strong>{item.name}</strong>{item.description && <div className="cell-desc">{item.description}</div>}</td>
                <td>{item.code || '—'}</td>
                <td>{item.durationMonths ? `${item.durationMonths} months` : '—'}</td>
                <td>{item.durationKm ? `${Number(item.durationKm).toLocaleString()} km` : '—'}</td>
                <td>{renderStatus(item)}</td>
                <td onClick={(e) => e.stopPropagation()}>{renderActions(item)}</td>
            </tr>
        )),
        [nameFilterInput, codeFilterInput, hoursFilterInput, kmFilterInput, statusFilterSelect, null],
        ['name', 'code', 'durationMonths', 'durationKm', 'isActive', null]
    );

    const renderWarrantiesCards = () => renderCards(tableData, item => (
        <>
            <div className="card-field"><strong>{item.name}</strong></div>
            {item.code && <div className="card-field"><label>Code:</label><span>{item.code}</span></div>}
            {item.durationMonths && <div className="card-field"><label>Duration:</label><span>{item.durationMonths} months</span></div>}
            {item.durationKm && <div className="card-field"><label>Km Limit:</label><span>{Number(item.durationKm).toLocaleString()} km</span></div>}
            {item.description && <div className="card-field"><label>Description:</label><span>{item.description}</span></div>}
            {item.terms && <div className="card-field"><label>Terms:</label><span>{item.terms}</span></div>}
            <div className="card-field">{renderStatus(item)}</div>
        </>
    ));

    const renderServiceTypeForm = () => (
        <>
            <div className="form-group">
                <label>Name *</label>
                <input type="text" name="name" value={formData.name || ''} onChange={handleInputChange} required autoFocus />
            </div>
            <div className="form-group">
                <label>Code</label>
                <input type="text" name="code" value={formData.code || ''} onChange={handleInputChange} placeholder="e.g. OIL-CHG" />
            </div>
            <div className="form-group">
                <label>Description</label>
                <textarea name="description" value={formData.description || ''} onChange={handleInputChange} />
            </div>
            <div className="grid grid-cols-2 gap-4">
                <div className="form-group">
                    <label>Base Price (PKR)</label>
                    <input type="number" name="basePrice" value={formData.basePrice ?? ''} onChange={handleInputChange} min="0" step="0.01" />
                </div>
                <div className="form-group">
                    <label>Estimated Hours</label>
                    <input type="number" name="estimatedHours" value={formData.estimatedHours ?? ''} onChange={handleInputChange} min="0" step="0.1" />
                </div>
            </div>
            <div className="form-group">
                <label>Category</label>
                <input type="text" name="category" value={formData.category || ''} onChange={handleInputChange} placeholder="e.g. Maintenance" />
            </div>
            <div className="form-group">
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <ToggleSwitch checked={formData.isActive !== false} onChange={(v) => setFormData(prev => ({ ...prev, isActive: v }))} />
                    Active
                </label>
            </div>
        </>
    );

    const renderLaborRateForm = () => (
        <>
            <div className="form-group">
                <label>Name *</label>
                <input type="text" name="name" value={formData.name || ''} onChange={handleInputChange} required autoFocus />
            </div>
            <div className="form-group">
                <label>Code</label>
                <input type="text" name="code" value={formData.code || ''} onChange={handleInputChange} placeholder="e.g. STD-LABOR" />
            </div>
            <div className="grid grid-cols-2 gap-4">
                <div className="form-group">
                    <label>Rate (PKR/hr) *</label>
                    <input type="number" name="rate" value={formData.rate ?? ''} onChange={handleInputChange} min="0" step="0.01" required />
                </div>
                <div className="form-group">
                    <label>Duration (minutes)</label>
                    <input type="number" name="duration" value={formData.duration ?? ''} onChange={handleInputChange} min="0" />
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

    const renderPackageForm = () => (
        <>
            <div className="form-group">
                <label>Package Name *</label>
                <input type="text" name="packageName" value={formData.packageName || ''} onChange={handleInputChange} required autoFocus />
            </div>
            <div className="grid grid-cols-2 gap-4">
                <div className="form-group">
                    <label>Price (PKR)</label>
                    <input type="number" name="price" value={formData.price ?? ''} onChange={handleInputChange} min="0" step="0.01" />
                </div>
                <div className="form-group">
                    <label>Duration (minutes)</label>
                    <input type="number" name="duration" value={formData.duration ?? ''} onChange={handleInputChange} min="0" />
                </div>
            </div>
            <div className="form-group">
                <label>Description</label>
                <textarea name="description" value={formData.description || ''} onChange={handleInputChange} />
            </div>
            <div className="form-group">
                <label>Warranty</label>
                <select name="warranty" value={formData.warranty || ''} onChange={handleInputChange}>
                    <option value="">-- Select warranty type --</option>
                    {warrantyTypes.map((w) => (
                        <option key={w._id} value={w.name}>
                            {w.name}
                            {w.durationMonths ? ` — ${w.durationMonths} months` : ''}
                            {w.durationKm ? ` / ${Number(w.durationKm).toLocaleString()} km` : ''}
                        </option>
                    ))}
                    {/* Keep a legacy free-text value selectable so editing an older
                        package does not silently clear its warranty. */}
                    {formData.warranty && !warrantyTypes.some((w) => w.name === formData.warranty) && (
                        <option value={formData.warranty}>{formData.warranty}</option>
                    )}
                </select>
            </div>

            {/* Services sub-array */}
            <div className="form-group">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <label style={{ margin: 0 }}>Services</label>
                    <button type="button" className="btn-small" onClick={handleAddService}>+ Add Service</button>
                </div>
                {(formData.services || []).map((svc, i) => (
                    <div key={i} className="package-service-row">
                        <input type="text" placeholder="Service name" value={svc.name || ''} onChange={e => handleServiceChange(i, 'name', e.target.value)} />
                        <input type="number" placeholder="Qty" value={svc.quantity ?? 1} onChange={e => handleServiceChange(i, 'quantity', Number(e.target.value))} min="1" className="input-sm" />
                        <input type="number" placeholder="Price" value={svc.price ?? 0} onChange={e => handleServiceChange(i, 'price', Number(e.target.value))} min="0" step="0.01" className="input-sm" />
                        <button type="button" className="btn-icon danger" onClick={() => handleRemoveService(i)} title="Remove">✕</button>
                    </div>
                ))}
                {(formData.services || []).length === 0 && (
                    <div className="text-muted" style={{ fontSize: '13px', color: '#94a3b8' }}>No services added yet</div>
                )}
            </div>

            <div className="form-group">
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <ToggleSwitch checked={formData.isActive !== false} onChange={(v) => setFormData(prev => ({ ...prev, isActive: v }))} />
                    Active
                </label>
            </div>
        </>
    );

    const renderWarrantyForm = () => (
        <>
            <div className="form-group">
                <label>Name *</label>
                <input type="text" name="name" value={formData.name || ''} onChange={handleInputChange} required autoFocus />
            </div>
            <div className="form-group">
                <label>Code</label>
                <input type="text" name="code" value={formData.code || ''} onChange={handleInputChange} placeholder="e.g. STD-WTY" />
            </div>
            <div className="grid grid-cols-2 gap-4">
                <div className="form-group">
                    <label>Duration (Months)</label>
                    <input type="number" name="durationMonths" value={formData.durationMonths ?? ''} onChange={handleInputChange} min="0" />
                </div>
                <div className="form-group">
                    <label>Duration (Km)</label>
                    <input type="number" name="durationKm" value={formData.durationKm ?? ''} onChange={handleInputChange} min="0" />
                </div>
            </div>
            <div className="form-group">
                <label>Description</label>
                <textarea name="description" value={formData.description || ''} onChange={handleInputChange} />
            </div>
            <div className="form-group">
                <label>Terms & Conditions</label>
                <textarea name="terms" value={formData.terms || ''} onChange={handleInputChange} rows="3" />
            </div>
            <div className="form-group">
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <ToggleSwitch checked={formData.isActive !== false} onChange={(v) => setFormData(prev => ({ ...prev, isActive: v }))} />
                    Active
                </label>
            </div>
        </>
    );

    const forms = {
        types: renderServiceTypeForm,
        rates: renderLaborRateForm,
        packages: renderPackageForm,
        warranties: renderWarrantyForm,
    };

    const tables = {
        types: { table: renderServiceTypesTable, cards: renderServiceTypesCards },
        rates: { table: renderLaborRatesTable, cards: renderLaborRatesCards },
        packages: { table: renderPackagesTable, cards: renderPackagesCards },
        warranties: { table: renderWarrantiesTable, cards: renderWarrantiesCards },
    };

    return (
        <div className="service-master-page">
            <div className="page-header">
                <h1>
                    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" width="28">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                    </svg>
                    Service Master Data
                </h1>
            </div>

            <div className="stats-grid">
                <div className="stat-card">
                    <div className="stat-icon types">🛠️</div>
                    <div className="stat-info"><h3>Service Types</h3><div className="value">{stats.serviceTypes}</div></div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon rates">💲</div>
                    <div className="stat-info"><h3>Labor Rates</h3><div className="value">{stats.laborRates}</div></div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon packages">📦</div>
                    <div className="stat-info"><h3>Packages</h3><div className="value">{stats.packages}</div></div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon warranties">🛡️</div>
                    <div className="stat-info"><h3>Warranties</h3><div className="value">{stats.warranties}</div></div>
                </div>
            </div>

            <div className="tabs-container">
                <div className="tabs-header">
                    {[
                        { key: 'types', label: 'Service Types' },
                        { key: 'rates', label: 'Labor Rates' },
                        { key: 'packages', label: 'Service Packages' },
                        { key: 'warranties', label: 'Warranty Types' },
                    ].map(tab => (
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
                            <div className="desktop-table">
                                {tables[activeTab].table()}
                            </div>
                            <div className="mobile-cards-view">
                                {tables[activeTab].cards()}
                            </div>
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
                            <h2>
                                {modalMode === 'create' ? 'Create' : 'Edit'}
                                {activeTab === 'types' ? ' Service Type' :
                                    activeTab === 'rates' ? ' Labor Rate' :
                                        activeTab === 'packages' ? ' Service Package' : ' Warranty Type'}
                            </h2>
                            <button className="close-btn" onClick={closeModal}>✕</button>
                        </div>
                        <form ref={formRef} onSubmit={handleSubmit}>
                            <div className="modal-body">
                                {forms[activeTab]()}
                            </div>
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
                title={drawerItem?.name || drawerItem?.packageName || ''}
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
                message={`Are you sure you want to delete "${deleteTarget?.name || deleteTarget?.packageName || ''}"?`}
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

export default ServiceMasterData;
