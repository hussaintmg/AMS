/**
 * Vehicle Master Data Management Page
 * Full CRUD operations for makes, models, variants, colors, and categories
 * Maintained by Hussain Developer
 * hussaintmerng@gmail.com | +92 319 1634446
 * AMS ERP
 * Date: 2026-01-08
 * Updated: 2026-04-05 - Added Part Categories tab
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { ArrowUpDown, ArrowUp, ArrowDown, Upload } from 'lucide-react';
import VehicleMasterModal from '../components/vehicle/VehicleMasterModal';
import { vehicleMasterAPI } from '../services/api';
import toast from 'react-hot-toast';
import ErrorPopup from '../components/ErrorPopup';
import ActionButtons from '../components/ActionButtons';
import { useAuth } from '../context/AuthContext';
import { pageActions } from '../utils/roleJobs';
import ConfirmModal from '../components/ConfirmModal';
import EmailDrawer from '../components/EmailDrawer';
import '../styles/vehicleMasterData.css';
import '../styles/emailTemplates.css';
import '../styles/userManagement.css';

const VehicleMasterData = () => {
    const { user } = useAuth();
    // Seven tabs of master data, and not one of the Add / Edit / Delete controls
    // asked whether this role may write here.
    const can = pageActions(user, 'vehicle_master');
    // Active tab state
    const [activeTab, setActiveTab] = useState('makes');
    const [loading, setLoading] = useState(true);
    const [errorPopup, setErrorPopup] = useState(null);
    const [stats, setStats] = useState({});

    // Data states
    const [makes, setMakes] = useState([]);
    const [models, setModels] = useState([]);
    const [variants, setVariants] = useState([]);
    const [colors, setColors] = useState([]);
    const [categories, setCategories] = useState([]);
    const [suppliers, setSuppliers] = useState([]);
    const [conditions, setConditions] = useState([]);

    // Modal states
    const [showModal, setShowModal] = useState(false);
    const [modalMode, setModalMode] = useState('create');
    const [selectedItem, setSelectedItem] = useState(null);

    // Drawer
    const [drawerItem, setDrawerItem] = useState(null);

    // Delete
    const [deleteTarget, setDeleteTarget] = useState(null);
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [deleteAllTarget, setDeleteAllTarget] = useState(null);
    const [deletingAll, setDeletingAll] = useState(false);

    const toggleSelect = (id) => {
      setSelectedIds(prev => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
      });
    };

    const toggleSelectAll = () => {
      const data = filteredItems;
      setSelectedIds(prev => prev.size === data.length && data.length > 0 ? new Set() : new Set(data.map(d => d.id)));
    };

    const handleBulkDelete = async () => {
      setDeletingAll(true);
      try {
        const ids = Array.from(selectedIds);
        const deleteFns = {
          makes: vehicleMasterAPI.deleteMake,
          models: vehicleMasterAPI.deleteModel,
          variants: vehicleMasterAPI.deleteVariant,
          colors: vehicleMasterAPI.deleteColor,
          categories: vehicleMasterAPI.deleteCategory,
          suppliers: vehicleMasterAPI.deleteSupplier,
          conditions: vehicleMasterAPI.deleteCondition,
        };
        const fn = deleteFns[activeTab];
        for (const id of ids) {
          await fn(id);
        }
        toast.success(`${ids.length} ${activeTab} deleted`);
        setSelectedIds(new Set());
        setDeleteAllTarget(null);
        handleSaved();
      } catch (err) {
        setErrorPopup(err.response?.data || { message: 'Failed to delete' });
      } finally {
        setDeletingAll(false);
      }
    };

    // Filters
    const [makeFilter, setMakeFilter] = useState('');
    const [modelFilter, setModelFilter] = useState('');
    const [nameFilter, setNameFilter] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [countryFilter, setCountryFilter] = useState('');
    const [yearFilter, setYearFilter] = useState('');
    const [bodyTypeFilter, setBodyTypeFilter] = useState('');
    const [fuelFilter, setFuelFilter] = useState('');
    const [transmissionFilter, setTransmissionFilter] = useState('');
    const [supplierTypeFilter, setSupplierTypeFilter] = useState('');
    const [supplierCityFilter, setSupplierCityFilter] = useState('');
    const [codeFilter, setCodeFilter] = useState('');
    const [contactFilter, setContactFilter] = useState('');
    const [descriptionFilter, setDescriptionFilter] = useState('');
    const [parentFilter, setParentFilter] = useState('');
    const [metallicFilter, setMetallicFilter] = useState('all');
    const [modelCountFilter, setModelCountFilter] = useState('');
    const [vehicleCountFilter, setVehicleCountFilter] = useState('');
    const [variantCountFilter, setVariantCountFilter] = useState('');
    const [basePriceFilter, setBasePriceFilter] = useState('');
    const [hexFilter, setHexFilter] = useState('');
    const [additionalCostFilter, setAdditionalCostFilter] = useState('');
    const [partsCountFilter, setPartsCountFilter] = useState('');
    const [subCategoryCountFilter, setSubCategoryCountFilter] = useState('');
    const [partsPoFilter, setPartsPoFilter] = useState('');

    const handleTabChange = (tab) => {
        setActiveTab(tab);
        setSelectedIds(new Set());
        setDeleteAllTarget(null);
    };

    // Sorting
    const [sortField, setSortField] = useState('name');
    const [sortDir, setSortDir] = useState('asc');

    // ═══════════════════════════════════════════════════════════════════════
    // DATA FETCHING
    // ═══════════════════════════════════════════════════════════════════════

    const fetchStats = useCallback(async () => {
        try {
            const res = await vehicleMasterAPI.getStats();
            setStats(res?.data?.data || {});
        } catch (err) {
            console.error('Error fetching stats:', err);
        }
    }, []);

    const fetchMakes = useCallback(async () => {
        try {
            setLoading(true);
            const res = await vehicleMasterAPI.getMakes();
            setMakes(res?.data?.data?.makes || []);
        } catch (err) {
            console.error('Error fetching makes:', err);
            toast.error('Failed to load makes');
        } finally {
            setLoading(false);
        }
    }, []);

    const fetchModels = useCallback(async () => {
        try {
            setLoading(true);
            const params = makeFilter ? { make_id: makeFilter } : {};
            const res = await vehicleMasterAPI.getModels(params);
            setModels(res?.data?.data?.models || []);
        } catch (err) {
            console.error('Error fetching models:', err);
            toast.error('Failed to load models');
        } finally {
            setLoading(false);
        }
    }, [makeFilter]);

    const fetchVariants = useCallback(async () => {
        try {
            setLoading(true);
            const params = {};
            if (makeFilter) params.make_id = makeFilter;
            if (modelFilter) params.model_id = modelFilter;
            const res = await vehicleMasterAPI.getVariants(params);
            setVariants(res?.data?.data?.variants || []);
        } catch (err) {
            console.error('Error fetching variants:', err);
            toast.error('Failed to load variants');
        } finally {
            setLoading(false);
        }
    }, [makeFilter, modelFilter]);

    const fetchColors = useCallback(async () => {
        try {
            setLoading(true);
            const res = await vehicleMasterAPI.getColors();
            setColors(res?.data?.data?.colors || []);
        } catch (err) {
            console.error('Error fetching colors:', err);
            toast.error('Failed to load colors');
        } finally {
            setLoading(false);
        }
    }, []);

    const fetchCategories = useCallback(async () => {
        try {
            setLoading(true);
            const res = await vehicleMasterAPI.getCategories();
            setCategories(res?.data?.data?.categories || []);
        } catch (err) {
            console.error('Error fetching categories:', err);
            toast.error('Failed to load categories');
        } finally {
            setLoading(false);
        }
    }, []);

    const fetchSuppliers = useCallback(async () => {
        try {
            setLoading(true);
            const res = await vehicleMasterAPI.getSuppliers();
            setSuppliers(res?.data?.data?.suppliers || []);
        } catch (err) {
            console.error('Error fetching suppliers:', err);
            toast.error('Failed to load suppliers');
        } finally {
            setLoading(false);
        }
    }, []);

    const fetchConditions = useCallback(async () => {
        try {
            setLoading(true);
            const res = await vehicleMasterAPI.getConditions();
            setConditions(res?.data?.data?.conditions || []);
        } catch (err) {
            console.error('Error fetching conditions:', err);
            toast.error('Failed to load conditions');
        } finally {
            setLoading(false);
        }
    }, []);

    // Fetch data on tab change — always load makes + models for modal dropdowns
    useEffect(() => {
        fetchStats();
        fetchMakes();
        fetchModels();
        if (activeTab === 'makes') { /* already fetched */ }
        else if (activeTab === 'models') { /* already fetched */ }
        else if (activeTab === 'variants') fetchVariants();
        else if (activeTab === 'colors') fetchColors();
        else if (activeTab === 'categories') fetchCategories();
        else if (activeTab === 'suppliers') fetchSuppliers();
        else if (activeTab === 'conditions') fetchConditions();
    }, [activeTab, fetchStats, fetchMakes, fetchModels, fetchVariants, fetchColors, fetchCategories, fetchSuppliers, fetchConditions]);

    // ═══════════════════════════════════════════════════════════════════════
    // MODAL HANDLERS
    // ═══════════════════════════════════════════════════════════════════════

    const openModal = (mode, item = null) => {
        setModalMode(mode);
        setSelectedItem(item);
        setShowModal(true);
    };

    const closeModal = () => {
        setShowModal(false);
        setSelectedItem(null);
    };

    const handleSaved = () => {
        fetchStats();
        fetchMakes();
        fetchModels();
        if (activeTab === 'variants') fetchVariants();
        else if (activeTab === 'colors') fetchColors();
        else if (activeTab === 'categories') fetchCategories();
        else if (activeTab === 'suppliers') fetchSuppliers();
        else if (activeTab === 'conditions') fetchConditions();
    };

    const handleDeleteConfirm = async () => {
        if (!deleteTarget) return;
        const item = deleteTarget;
        const name = item.name;
        setDeleteTarget(null);
        try {
            if (activeTab === 'makes') {
                await vehicleMasterAPI.deleteMake(item.id);
                fetchMakes();
            } else if (activeTab === 'models') {
                await vehicleMasterAPI.deleteModel(item.id);
                fetchModels();
            } else if (activeTab === 'variants') {
                await vehicleMasterAPI.deleteVariant(item.id);
                fetchVariants();
            } else if (activeTab === 'colors') {
                await vehicleMasterAPI.deleteColor(item.id);
                fetchColors();
            } else if (activeTab === 'categories') {
                await vehicleMasterAPI.deleteCategory(item.id);
                fetchCategories();
            } else if (activeTab === 'suppliers') {
                await vehicleMasterAPI.deleteSupplier(item.id);
                fetchSuppliers();
            } else if (activeTab === 'conditions') {
                await vehicleMasterAPI.deleteCondition(item.id);
                fetchConditions();
            }
            toast.success(`${name} deleted successfully`);
            fetchStats();
        } catch (err) {
            console.error('Error deleting:', err);
            setErrorPopup(err.response?.data || { message: 'Failed to delete' });
        }
    };

    // ═══════════════════════════════════════════════════════════════════════
    // GET BUTTON LABEL & MODAL TITLE
    // ═══════════════════════════════════════════════════════════════════════

    const getTabLabel = () => {
        switch(activeTab) {
            case 'makes': return 'Brand';
            case 'models': return 'Model';
            case 'variants': return 'Variant';
            case 'colors': return 'Color';
            case 'categories': return 'Category';
            case 'suppliers': return 'Supplier';
            case 'conditions': return 'Condition';
            default: return '';
        }
    };

    // ═══════════════════════════════════════════════════════════════════════
    // SORTING
    // ═══════════════════════════════════════════════════════════════════════

    const handleSort = (field) => {
        if (sortField === field) {
            setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDir('asc');
        }
    };

    const SortIcon = ({ field }) => {
        if (sortField !== field) return <ArrowUpDown size={14} style={{ verticalAlign: 'middle', marginLeft: 4 }} />;
        return sortDir === 'asc'
            ? <ArrowUp size={14} style={{ verticalAlign: 'middle', marginLeft: 4 }} />
            : <ArrowDown size={14} style={{ verticalAlign: 'middle', marginLeft: 4 }} />;
    };

    const handleToggleActive = async (item) => {
        const type = activeTab;
        const id = item.id || item._id;
        try {
            const response = await vehicleMasterAPI.toggleActive(type, id);
            const isActive = response?.data?.data?.is_active ?? !item.is_active;
            const setters = { makes: setMakes, models: setModels, variants: setVariants, colors: setColors, categories: setCategories, suppliers: setSuppliers, conditions: setConditions };
            setters[type](items => items.map(entry => (entry.id || entry._id) === id ? { ...entry, is_active: isActive } : entry));
            toast.success(`Status ${isActive ? 'activated' : 'deactivated'}`);
            fetchStats();
        } catch (err) {
            setErrorPopup(err.response?.data || { message: 'Failed to update status' });
        }
    };

    const renderStatus = (item) => (
        <span
            className={`status-capsule ${item.is_active ? 'active' : ''}`}
            role="switch"
            aria-checked={Boolean(item.is_active)}
            title={item.is_active ? 'Deactivate' : 'Activate'}
            onClick={(e) => { e.stopPropagation(); handleToggleActive(item); }}
        ><span className="capsule-circle" /></span>
    );

    // ═══════════════════════════════════════════════════════════════════════
    // RENDER FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════

    const renderMakesTable = () => (
        <table className="data-table">
            <thead>
                <tr>
                    <th style={{ width: 40 }}><input type="checkbox" checked={selectedIds.size === filteredItems.length && filteredItems.length > 0} onChange={toggleSelectAll} /></th>
                    <th className="sortable" onClick={() => handleSort('name')}>Brand Name <SortIcon field="name" /></th>
                    <th>Logo</th>
                    <th className="sortable" onClick={() => handleSort('country')}>Country <SortIcon field="country" /></th>
                    <th className="sortable" onClick={() => handleSort('model_count')}>Models <SortIcon field="model_count" /></th>
                    <th className="sortable" onClick={() => handleSort('vehicle_count')}>Vehicles <SortIcon field="vehicle_count" /></th>
                    <th className="sortable" onClick={() => handleSort('is_active')}>Status <SortIcon field="is_active" /></th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
                {filteredItems.map(make => (
                    <tr key={make.id} onClick={() => setDrawerItem(make)} style={{ cursor: 'pointer' }}>
                        <td style={{ width: 40 }} onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={selectedIds.has(make.id)} onChange={() => toggleSelect(make.id)} /></td>
                        <td><strong>{make.name}</strong></td>
                        <td>
                            {make.logo ? (
                                <img
                                    className="make-logo"
                                    src={make.logo}
                                    alt={`${make.name} logo`}
                                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                />
                            ) : (
                                <span className="make-logo-placeholder">-</span>
                            )}
                        </td>
                        <td>{make.country || '-'}</td>
                        <td>{make.model_count || 0}</td>
                        <td>{make.vehicle_count || 0}</td>
                        <td>{renderStatus(make)}</td>
                        <td onClick={(e) => e.stopPropagation()}>
                            <ActionButtons
                                onEdit={can('edit') ? () => openModal('edit', make) : null}
                                onDelete={can('delete') ? () => setDeleteTarget(make) : null}
                                title={make.name}
                                showEdit={can('edit')}
                                showDelete={can('delete')}
                            />
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
    );

    const BODY_TYPES = ['Sedan', 'SUV', 'Hatchback', 'Coupe', 'Convertible', 'Pickup', 'Van', 'Wagon', 'Crossover'];
    const FUEL_TYPES = ['Petrol', 'Diesel', 'Electric', 'Hybrid', 'CNG', 'LPG'];
    const TRANSMISSION_TYPES = ['Manual', 'Automatic', 'CVT', 'AMT', 'DCT'];

    const renderModelsTable = () => (
        <table className="data-table">
            <thead>
                <tr>
                    <th style={{ width: 40 }}><input type="checkbox" checked={selectedIds.size === filteredItems.length && filteredItems.length > 0} onChange={toggleSelectAll} /></th>
                    <th className="sortable" onClick={() => handleSort('make_name')}>Brand <SortIcon field="make_name" /></th>
                    <th className="sortable" onClick={() => handleSort('name')}>Model <SortIcon field="name" /></th>
                    <th className="sortable" onClick={() => handleSort('year')}>Year <SortIcon field="year" /></th>
                    <th className="sortable" onClick={() => handleSort('body_type')}>Body Type <SortIcon field="body_type" /></th>
                    <th className="sortable" onClick={() => handleSort('fuel_type')}>Fuel <SortIcon field="fuel_type" /></th>
                    <th className="sortable" onClick={() => handleSort('transmission')}>Transmission <SortIcon field="transmission" /></th>
                    <th className="sortable" onClick={() => handleSort('variant_count')}>Variants <SortIcon field="variant_count" /></th>
                    <th className="sortable" onClick={() => handleSort('vehicle_count')}>Vehicles <SortIcon field="vehicle_count" /></th>
                    <th className="sortable" onClick={() => handleSort('is_active')}>Status <SortIcon field="is_active" /></th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
                {filteredItems.map(model => (
                    <tr key={model.id} onClick={() => setDrawerItem(model)} style={{ cursor: 'pointer' }}>
                        <td style={{ width: 40 }} onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={selectedIds.has(model.id)} onChange={() => toggleSelect(model.id)} /></td>
                        <td>{model.make_name}</td>
                        <td><strong>{model.name}</strong></td>
                        <td>{model.year || '-'}</td>
                        <td>{model.body_type}</td>
                        <td>{model.fuel_type}</td>
                        <td>{model.transmission}</td>
                        <td>{model.variant_count || 0}</td>
                        <td>{model.vehicle_count || 0}</td>
                        <td>{renderStatus(model)}</td>
                        <td onClick={(e) => e.stopPropagation()}>
                            <ActionButtons
                                onEdit={can('edit') ? () => openModal('edit', model) : null}
                                onDelete={can('delete') ? () => setDeleteTarget(model) : null}
                                title={model.name}
                                showEdit={can('edit')}
                                showDelete={can('delete')}
                            />
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
    );

    const renderVariantsTable = () => (
        <table className="data-table">
            <thead>
                <tr>
                    <th style={{ width: 40 }}><input type="checkbox" checked={selectedIds.size === filteredItems.length && filteredItems.length > 0} onChange={toggleSelectAll} /></th>
                    <th className="sortable" onClick={() => handleSort('make_name')}>Brand <SortIcon field="make_name" /></th>
                    <th className="sortable" onClick={() => handleSort('model_name')}>Model <SortIcon field="model_name" /></th>
                    <th className="sortable" onClick={() => handleSort('name')}>Variant <SortIcon field="name" /></th>
                    <th className="sortable" onClick={() => handleSort('base_price')}>Base Price <SortIcon field="base_price" /></th>
                    <th className="sortable" onClick={() => handleSort('vehicle_count')}>Vehicles <SortIcon field="vehicle_count" /></th>
                    <th className="sortable" onClick={() => handleSort('is_active')}>Status <SortIcon field="is_active" /></th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
                {filteredItems.map(variant => (
                    <tr key={variant.id} onClick={() => setDrawerItem(variant)} style={{ cursor: 'pointer' }}>
                        <td style={{ width: 40 }} onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={selectedIds.has(variant.id)} onChange={() => toggleSelect(variant.id)} /></td>
                        <td>{variant.make_name}</td>
                        <td>{variant.model_name}</td>
                        <td><strong>{variant.name}</strong></td>
                        <td>PKR {Number(variant.base_price || 0).toLocaleString()}</td>
                        <td>{variant.vehicle_count || 0}</td>
                        <td>{renderStatus(variant)}</td>
                        <td onClick={(e) => e.stopPropagation()}>
                            <ActionButtons
                                onEdit={can('edit') ? () => openModal('edit', variant) : null}
                                onDelete={can('delete') ? () => setDeleteTarget(variant) : null}
                                title={variant.name}
                                showEdit={can('edit')}
                                showDelete={can('delete')}
                            />
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
    );

    const renderColorsTable = () => (
        <table className="data-table">
            <thead>
                <tr>
                    <th style={{ width: 40 }}><input type="checkbox" checked={selectedIds.size === filteredItems.length && filteredItems.length > 0} onChange={toggleSelectAll} /></th>
                    <th className="sortable" onClick={() => handleSort('name')}>Color <SortIcon field="name" /></th>
                    <th>Preview</th>
                    <th className="sortable" onClick={() => handleSort('is_metallic')}>Metallic <SortIcon field="is_metallic" /></th>
                    <th className="sortable" onClick={() => handleSort('additional_cost')}>Add. Cost <SortIcon field="additional_cost" /></th>
                    <th className="sortable" onClick={() => handleSort('vehicle_count')}>Vehicles <SortIcon field="vehicle_count" /></th>
                    <th className="sortable" onClick={() => handleSort('is_active')}>Status <SortIcon field="is_active" /></th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
                {filteredItems.map(color => (
                    <tr key={color.id} onClick={() => setDrawerItem(color)} style={{ cursor: 'pointer' }}>
                        <td style={{ width: 40 }} onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={selectedIds.has(color.id)} onChange={() => toggleSelect(color.id)} /></td>
                        <td><strong>{color.name}</strong></td>
                        <td>
                            <div
                                className="color-preview"
                                style={{ backgroundColor: color.hex_code || '#ccc' }}
                                title={color.hex_code}
                            />
                        </td>
                        <td>{color.is_metallic ? 'Yes' : 'No'}</td>
                        <td>PKR {Number(color.additional_cost || 0).toLocaleString()}</td>
                        <td>{color.vehicle_count || 0}</td>
                        <td>{renderStatus(color)}</td>
                        <td onClick={(e) => e.stopPropagation()}>
                            <ActionButtons
                                onEdit={can('edit') ? () => openModal('edit', color) : null}
                                onDelete={can('delete') ? () => setDeleteTarget(color) : null}
                                title={color.name}
                                showEdit={can('edit')}
                                showDelete={can('delete')}
                            />
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
    );

    const renderCategoriesTable = () => (
        <table className="data-table">
            <thead>
                <tr>
                    <th style={{ width: 40 }}><input type="checkbox" checked={selectedIds.size === filteredItems.length && filteredItems.length > 0} onChange={toggleSelectAll} /></th>
                    <th className="sortable" onClick={() => handleSort('name')}>Category Name <SortIcon field="name" /></th>
                    <th className="sortable" onClick={() => handleSort('description')}>Description <SortIcon field="description" /></th>
                    <th className="sortable" onClick={() => handleSort('parent_name')}>Parent Category <SortIcon field="parent_name" /></th>
                    <th className="sortable" onClick={() => handleSort('parts_count')}>Parts <SortIcon field="parts_count" /></th>
                    <th className="sortable" onClick={() => handleSort('sub_category_count')}>Sub-Categories <SortIcon field="sub_category_count" /></th>
                    <th className="sortable" onClick={() => handleSort('is_active')}>Status <SortIcon field="is_active" /></th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
                {filteredItems.map(cat => (
                    <tr key={cat.id} onClick={() => setDrawerItem(cat)} style={{ cursor: 'pointer' }}>
                        <td style={{ width: 40 }} onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={selectedIds.has(cat.id)} onChange={() => toggleSelect(cat.id)} /></td>
                        <td><strong>{cat.name}</strong></td>
                        <td>{cat.description || '-'}</td>
                        <td>{cat.parent_name || <span className="badge badge-info">Root</span>}</td>
                        <td>{cat.parts_count || 0}</td>
                        <td>{cat.sub_category_count || 0}</td>
                        <td>{renderStatus(cat)}</td>
                        <td onClick={(e) => e.stopPropagation()}>
                            <ActionButtons
                                onEdit={can('edit') ? () => openModal('edit', cat) : null}
                                onDelete={can('delete') ? () => setDeleteTarget(cat) : null}
                                title={cat.name}
                                showEdit={can('edit')}
                                showDelete={can('delete')}
                            />
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
    );

    const SUPPLIER_TYPES = ['local', 'international', 'manufacturer', 'distributor'];

    const renderSuppliersTable = () => (
        <table className="data-table">
            <thead>
                <tr>
                    <th style={{ width: 40 }}><input type="checkbox" checked={selectedIds.size === filteredItems.length && filteredItems.length > 0} onChange={toggleSelectAll} /></th>
                    <th className="sortable" onClick={() => handleSort('supplier_code')}>Code <SortIcon field="supplier_code" /></th>
                    <th className="sortable" onClick={() => handleSort('name')}>Supplier Name <SortIcon field="name" /></th>
                    <th className="sortable" onClick={() => handleSort('type')}>Type <SortIcon field="type" /></th>
                    <th>Contact Info</th>
                    <th className="sortable" onClick={() => handleSort('city')}>Location <SortIcon field="city" /></th>
                    <th>Parts/POs</th>
                    <th className="sortable" onClick={() => handleSort('is_active')}>Status <SortIcon field="is_active" /></th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
                {filteredItems.map(sup => (
                    <tr key={sup.id} onClick={() => setDrawerItem(sup)} style={{ cursor: 'pointer' }}>
                        <td style={{ width: 40 }} onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={selectedIds.has(sup.id)} onChange={() => toggleSelect(sup.id)} /></td>
                        <td><span className="code">{sup.supplier_code}</span></td>
                        <td><strong>{sup.name}</strong></td>
                        <td><span className={`badge badge-outline`}>{sup.type?.toUpperCase()}</span></td>
                        <td>
                            <div className="contact-info">
                                <div>{sup.contact_person}</div>
                                <div className="small-text">{sup.email}</div>
                                <div className="small-text">{sup.phone}</div>
                            </div>
                        </td>
                        <td>{sup.city}, {sup.country}</td>
                        <td>
                            <div className="stats-inline">
                                <span>Parts: {sup.parts_count}</span>
                                <span>POs: {sup.po_count}</span>
                            </div>
                        </td>
                        <td>{renderStatus(sup)}</td>
                        <td onClick={(e) => e.stopPropagation()}>
                            <ActionButtons
                                onEdit={can('edit') ? () => openModal('edit', sup) : null}
                                onDelete={can('delete') ? () => setDeleteTarget(sup) : null}
                                title={sup.name}
                                showEdit={can('edit')}
                                showDelete={can('delete')}
                            />
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
    );

    const renderConditionsTable = () => (
        <table className="data-table">
            <thead>
                <tr>
                    <th style={{ width: 40 }}><input type="checkbox" checked={selectedIds.size === filteredItems.length && filteredItems.length > 0} onChange={toggleSelectAll} /></th>
                    <th className="sortable" onClick={() => handleSort('name')}>Name <SortIcon field="name" /></th>
                    <th className="sortable" onClick={() => handleSort('description')}>Description <SortIcon field="description" /></th>
                    <th className="sortable" onClick={() => handleSort('is_active')}>Status <SortIcon field="is_active" /></th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
                {filteredItems.map(cond => (
                    <tr key={cond.id} onClick={() => setDrawerItem(cond)} style={{ cursor: 'pointer' }}>
                        <td style={{ width: 40 }} onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={selectedIds.has(cond.id)} onChange={() => toggleSelect(cond.id)} /></td>
                        <td><strong>{cond.name}</strong></td>
                        <td>{cond.description || '-'}</td>
                        <td>{renderStatus(cond)}</td>
                        <td onClick={(e) => e.stopPropagation()}>
                            <ActionButtons
                                onEdit={can('edit') ? () => openModal('edit', cond) : null}
                                onDelete={can('delete') ? () => setDeleteTarget(cond) : null}
                                title={cond.name}
                                showEdit={can('edit')}
                                showDelete={can('delete')}
                            />
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
    );

    const renderMakesCards = () => (
        <div className="mobile-cards-container">
            {filteredItems.map(make => (
                <div key={make.id} className={`data-card ${!make.is_active ? 'card-inactive' : ''}`} onClick={() => setDrawerItem(make)}>
                    <div className="data-card-top">
                        <div className="data-card-avatar">{make.name?.[0] || 'M'}</div>
                        <div className="data-card-info">
                            <span className="data-card-title">{make.name}</span>
                            <span className="data-card-subtitle">{make.country || '-'}</span>
                        </div>
                        <span className={`badge-pill ${make.is_active ? 'status-active' : 'status-inactive'}`}>{make.is_active ? 'Active' : 'Inactive'}</span>
                    </div>
                    <div className="data-card-body">
                        <div className="data-card-row"><span className="row-icon">🚗</span><span className="row-label">Models</span><span className="row-value">{make.model_count || 0}</span></div>
                        <div className="data-card-row"><span className="row-icon">🚙</span><span className="row-label">Vehicles</span><span className="row-value">{make.vehicle_count || 0}</span></div>
                    </div>
                    <div className="data-card-footer" onClick={e => e.stopPropagation()}>
                        <ActionButtons onEdit={can('edit') ? () => openModal('edit', make) : null} onDelete={can('delete') ? () => setDeleteTarget(make) : null} title={make.name} showEdit showDelete />
                    </div>
                </div>
            ))}
        </div>
    );

    const renderModelsCards = () => (
        <div className="mobile-cards-container">
            {filteredItems.map(model => (
                <div key={model.id} className={`data-card ${!model.is_active ? 'card-inactive' : ''}`} onClick={() => setDrawerItem(model)}>
                    <div className="data-card-top">
                        <div className="data-card-avatar avatar-cyan">{model.name?.[0] || 'M'}</div>
                        <div className="data-card-info">
                            <span className="data-card-title">{model.name}</span>
                            <span className="data-card-subtitle">{model.make_name} · {model.year}</span>
                        </div>
                        <span className={`badge-pill ${model.is_active ? 'status-active' : 'status-inactive'}`}>{model.is_active ? 'Active' : 'Inactive'}</span>
                    </div>
                    <div className="data-card-body">
                        <div className="data-card-row"><span className="row-icon">🔧</span><span className="row-label">Body</span><span className="row-value">{model.body_type || '-'}</span></div>
                        <div className="data-card-row"><span className="row-icon">⛽</span><span className="row-label">Fuel</span><span className="row-value">{model.fuel_type || '-'}</span></div>
                        <div className="data-card-row"><span className="row-icon">⚙️</span><span className="row-label">Trans</span><span className="row-value">{model.transmission || '-'}</span></div>
                        <div className="data-card-row"><span className="row-icon">📋</span><span className="row-label">Variants</span><span className="row-value">{model.variant_count || 0}</span></div>
                        <div className="data-card-row"><span className="row-icon">🚙</span><span className="row-label">Vehicles</span><span className="row-value">{model.vehicle_count || 0}</span></div>
                    </div>
                    <div className="data-card-footer" onClick={e => e.stopPropagation()}>
                        <ActionButtons onEdit={can('edit') ? () => openModal('edit', model) : null} onDelete={can('delete') ? () => setDeleteTarget(model) : null} title={model.name} showEdit showDelete />
                    </div>
                </div>
            ))}
        </div>
    );

    const renderVariantsCards = () => (
        <div className="mobile-cards-container">
            {filteredItems.map(variant => (
                <div key={variant.id} className={`data-card ${!variant.is_active ? 'card-inactive' : ''}`} onClick={() => setDrawerItem(variant)}>
                    <div className="data-card-top">
                        <div className="data-card-avatar avatar-green">{variant.name?.[0] || 'V'}</div>
                        <div className="data-card-info">
                            <span className="data-card-title">{variant.name}</span>
                            <span className="data-card-subtitle">{variant.make_name} · {variant.model_name}</span>
                        </div>
                        <span className={`badge-pill ${variant.is_active ? 'status-active' : 'status-inactive'}`}>{variant.is_active ? 'Active' : 'Inactive'}</span>
                    </div>
                    <div className="data-card-body">
                        <div className="data-card-row"><span className="row-icon">💰</span><span className="row-label">Price</span><span className="row-value">PKR {Number(variant.base_price || 0).toLocaleString()}</span></div>
                        <div className="data-card-row"><span className="row-icon">🚙</span><span className="row-label">Vehicles</span><span className="row-value">{variant.vehicle_count || 0}</span></div>
                    </div>
                    <div className="data-card-footer" onClick={e => e.stopPropagation()}>
                        <ActionButtons onEdit={can('edit') ? () => openModal('edit', variant) : null} onDelete={can('delete') ? () => setDeleteTarget(variant) : null} title={variant.name} showEdit showDelete />
                    </div>
                </div>
            ))}
        </div>
    );

    const renderColorsCards = () => (
        <div className="mobile-cards-container">
            {filteredItems.map(color => (
                <div key={color.id} className={`data-card ${!color.is_active ? 'card-inactive' : ''}`} onClick={() => setDrawerItem(color)}>
                    <div className="data-card-top">
                        <div className="data-card-avatar avatar-purple" style={{ background: color.hex_code || '#6366f1' }}>{color.name?.[0] || 'C'}</div>
                        <div className="data-card-info">
                            <span className="data-card-title">{color.name}</span>
                            <span className="data-card-subtitle">{color.hex_code || '-'}</span>
                        </div>
                        <span className={`badge-pill ${color.is_active ? 'status-active' : 'status-inactive'}`}>{color.is_active ? 'Active' : 'Inactive'}</span>
                    </div>
                    <div className="data-card-body">
                        <div className="data-card-row"><span className="row-icon">✨</span><span className="row-label">Metallic</span><span className="row-value">{color.is_metallic ? 'Yes' : 'No'}</span></div>
                        <div className="data-card-row"><span className="row-icon">💰</span><span className="row-label">Add. Cost</span><span className="row-value">PKR {Number(color.additional_cost || 0).toLocaleString()}</span></div>
                        <div className="data-card-row"><span className="row-icon">🚙</span><span className="row-label">Vehicles</span><span className="row-value">{color.vehicle_count || 0}</span></div>
                    </div>
                    <div className="data-card-footer" onClick={e => e.stopPropagation()}>
                        <ActionButtons onEdit={can('edit') ? () => openModal('edit', color) : null} onDelete={can('delete') ? () => setDeleteTarget(color) : null} title={color.name} showEdit showDelete />
                    </div>
                </div>
            ))}
        </div>
    );

    const renderCategoriesCards = () => (
        <div className="mobile-cards-container">
            {filteredItems.map(cat => (
                <div key={cat.id} className={`data-card ${!cat.is_active ? 'card-inactive' : ''}`} onClick={() => setDrawerItem(cat)}>
                    <div className="data-card-top">
                        <div className="data-card-avatar avatar-amber">{cat.name?.[0] || 'C'}</div>
                        <div className="data-card-info">
                            <span className="data-card-title">{cat.name}</span>
                            <span className="data-card-subtitle">{cat.parent_name || <span className="badge-pill status-active" style={{ padding: '1px 6px', fontSize: 10 }}>Root</span>}</span>
                        </div>
                        <span className={`badge-pill ${cat.is_active ? 'status-active' : 'status-inactive'}`}>{cat.is_active ? 'Active' : 'Inactive'}</span>
                    </div>
                    <div className="data-card-body">
                        <div className="data-card-row"><span className="row-icon">📝</span><span className="row-label">Desc</span><span className="row-value">{cat.description || '-'}</span></div>
                        <div className="data-card-row"><span className="row-icon">🔧</span><span className="row-label">Parts</span><span className="row-value">{cat.parts_count || 0}</span></div>
                        <div className="data-card-row"><span className="row-icon">📂</span><span className="row-label">Sub-Cats</span><span className="row-value">{cat.sub_category_count || 0}</span></div>
                    </div>
                    <div className="data-card-footer" onClick={e => e.stopPropagation()}>
                        <ActionButtons onEdit={can('edit') ? () => openModal('edit', cat) : null} onDelete={can('delete') ? () => setDeleteTarget(cat) : null} title={cat.name} showEdit showDelete />
                    </div>
                </div>
            ))}
        </div>
    );

    const renderSuppliersCards = () => (
        <div className="mobile-cards-container">
            {filteredItems.map(sup => (
                <div key={sup.id} className={`data-card ${!sup.is_active ? 'card-inactive' : ''}`} onClick={() => setDrawerItem(sup)}>
                    <div className="data-card-top">
                        <div className="data-card-avatar avatar-rose">{sup.name?.[0] || 'S'}</div>
                        <div className="data-card-info">
                            <span className="data-card-title">{sup.name}</span>
                            <span className="data-card-subtitle">{sup.supplier_code}</span>
                        </div>
                        <span className={`badge-pill ${sup.is_active ? 'status-active' : 'status-inactive'}`}>{sup.is_active ? 'Active' : 'Inactive'}</span>
                    </div>
                    <div className="data-card-body">
                        <div className="data-card-row"><span className="row-icon">🏷️</span><span className="row-label">Type</span><span className="row-value">{sup.type?.toUpperCase()}</span></div>
                        <div className="data-card-row"><span className="row-icon">👤</span><span className="row-label">Contact</span><span className="row-value">{sup.contact_person || '-'}{sup.email ? `, ${sup.email}` : ''}</span></div>
                        <div className="data-card-row"><span className="row-icon">📞</span><span className="row-label">Phone</span><span className="row-value">{sup.phone || '-'}</span></div>
                        <div className="data-card-row"><span className="row-icon">📍</span><span className="row-label">Location</span><span className="row-value">{sup.city}{sup.country ? `, ${sup.country}` : ''}</span></div>
                        <div className="data-card-row"><span className="row-icon">📦</span><span className="row-label">Parts</span><span className="row-value">{sup.parts_count || 0} / POs: {sup.po_count || 0}</span></div>
                    </div>
                    <div className="data-card-footer" onClick={e => e.stopPropagation()}>
                        <ActionButtons onEdit={can('edit') ? () => openModal('edit', sup) : null} onDelete={can('delete') ? () => setDeleteTarget(sup) : null} title={sup.name} showEdit showDelete />
                    </div>
                </div>
            ))}
        </div>
    );

    const renderConditionsCards = () => (
        <div className="mobile-cards-container">
            {filteredItems.map(cond => (
                <div key={cond.id} className={`data-card ${!cond.is_active ? 'card-inactive' : ''}`} onClick={() => setDrawerItem(cond)}>
                    <div className="data-card-top">
                        <div className="data-card-avatar">{cond.name?.[0] || 'C'}</div>
                        <div className="data-card-info">
                            <span className="data-card-title">{cond.name}</span>
                            <span className="data-card-subtitle">{cond.description || '-'}</span>
                        </div>
                        <span className={`badge-pill ${cond.is_active ? 'status-active' : 'status-inactive'}`}>{cond.is_active ? 'Active' : 'Inactive'}</span>
                    </div>
                    <div className="data-card-footer" onClick={e => e.stopPropagation()}>
                        <ActionButtons onEdit={can('edit') ? () => openModal('edit', cond) : null} onDelete={can('delete') ? () => setDeleteTarget(cond) : null} title={cond.name} showEdit showDelete />
                    </div>
                </div>
            ))}
        </div>
    );

    // ═══════════════════════════════════════════════════════════════════════
    // HELPERS
    // ═══════════════════════════════════════════════════════════════════════

    const getCurrentData = () => {
        switch(activeTab) {
            case 'makes': return makes;
            case 'models': return models;
            case 'variants': return variants;
            case 'colors': return colors;
            case 'categories': return categories;
            case 'suppliers': return suppliers;
            case 'conditions': return conditions;
            default: return [];
        }
    };

    const filteredItems = useMemo(() => {
        const dataMap = { makes, models, variants, colors, categories, suppliers, conditions };
        let data = [...(dataMap[activeTab] || [])];

        // Per-column filters
        const term = (v) => (v ?? '').toString().toLowerCase();
        if (activeTab === 'makes') {
            if (nameFilter) data = data.filter(m => term(m.name).includes(term(nameFilter)));
            if (countryFilter) data = data.filter(m => term(m.country).includes(term(countryFilter)));
            if (modelCountFilter) data = data.filter(m => term(m.model_count).includes(term(modelCountFilter)));
            if (vehicleCountFilter) data = data.filter(m => term(m.vehicle_count).includes(term(vehicleCountFilter)));
            if (statusFilter !== 'all') data = data.filter(m => m.is_active === (statusFilter === 'active'));
        } else if (activeTab === 'models') {
            if (makeFilter) data = data.filter(m => String(m.make_id) === String(makeFilter));
            if (nameFilter) data = data.filter(m => term(m.name).includes(term(nameFilter)));
            if (yearFilter) data = data.filter(m => term(m.year).includes(term(yearFilter)));
            if (bodyTypeFilter) data = data.filter(m => term(m.body_type) === term(bodyTypeFilter));
            if (fuelFilter) data = data.filter(m => term(m.fuel_type) === term(fuelFilter));
            if (transmissionFilter) data = data.filter(m => term(m.transmission) === term(transmissionFilter));
            if (variantCountFilter) data = data.filter(m => term(m.variant_count).includes(term(variantCountFilter)));
            if (vehicleCountFilter) data = data.filter(m => term(m.vehicle_count).includes(term(vehicleCountFilter)));
            if (statusFilter !== 'all') data = data.filter(m => m.is_active === (statusFilter === 'active'));
        } else if (activeTab === 'variants') {
            if (makeFilter) data = data.filter(v => String(v.make_id) === String(makeFilter));
            if (modelFilter) data = data.filter(v => String(v.model_id) === String(modelFilter));
            if (nameFilter) data = data.filter(v => term(v.name).includes(term(nameFilter)));
            if (basePriceFilter) data = data.filter(v => term(v.base_price).includes(term(basePriceFilter)));
            if (vehicleCountFilter) data = data.filter(v => term(v.vehicle_count).includes(term(vehicleCountFilter)));
            if (statusFilter !== 'all') data = data.filter(v => v.is_active === (statusFilter === 'active'));
        } else if (activeTab === 'colors') {
            if (nameFilter) data = data.filter(c => term(c.name).includes(term(nameFilter)));
            if (hexFilter) data = data.filter(c => term(c.hex_code).includes(term(hexFilter)));
            if (metallicFilter !== 'all') data = data.filter(c => c.is_metallic === (metallicFilter === 'yes'));
            if (additionalCostFilter) data = data.filter(c => term(c.additional_cost).includes(term(additionalCostFilter)));
            if (vehicleCountFilter) data = data.filter(c => term(c.vehicle_count).includes(term(vehicleCountFilter)));
            if (statusFilter !== 'all') data = data.filter(c => c.is_active === (statusFilter === 'active'));
        } else if (activeTab === 'categories') {
            if (nameFilter) data = data.filter(c => term(c.name).includes(term(nameFilter)));
            if (descriptionFilter) data = data.filter(c => term(c.description).includes(term(descriptionFilter)));
            if (parentFilter) data = data.filter(c => term(c.parent_name).includes(term(parentFilter)));
            if (partsCountFilter) data = data.filter(c => term(c.parts_count).includes(term(partsCountFilter)));
            if (subCategoryCountFilter) data = data.filter(c => term(c.sub_category_count).includes(term(subCategoryCountFilter)));
            if (statusFilter !== 'all') data = data.filter(c => c.is_active === (statusFilter === 'active'));
        } else if (activeTab === 'suppliers') {
            if (codeFilter) data = data.filter(s => term(s.supplier_code).includes(term(codeFilter)));
            if (nameFilter) data = data.filter(s => term(s.name).includes(term(nameFilter)));
            if (supplierTypeFilter) data = data.filter(s => term(s.type) === term(supplierTypeFilter));
            if (contactFilter) data = data.filter(s => term(s.contact_person).includes(term(contactFilter)) || term(s.email).includes(term(contactFilter)) || term(s.phone).includes(term(contactFilter)));
            if (supplierCityFilter) data = data.filter(s => term(s.city).includes(term(supplierCityFilter)));
            if (partsPoFilter) data = data.filter(s => term(s.parts_count).includes(term(partsPoFilter)) || term(s.po_count).includes(term(partsPoFilter)));
            if (statusFilter !== 'all') data = data.filter(s => s.is_active === (statusFilter === 'active'));
        } else if (activeTab === 'conditions') {
            if (nameFilter) data = data.filter(c => term(c.name).includes(term(nameFilter)));
            if (descriptionFilter) data = data.filter(c => term(c.description).includes(term(descriptionFilter)));
            if (statusFilter !== 'all') data = data.filter(c => c.is_active === (statusFilter === 'active'));
        }

        // Sorting
        data.sort((a, b) => {
            let aVal = a[sortField], bVal = b[sortField];
            if (aVal == null) aVal = '';
            if (bVal == null) bVal = '';
            let cmp;
            if (typeof aVal === 'number' && typeof bVal === 'number') {
                cmp = aVal - bVal;
            } else if (typeof aVal === 'boolean' && typeof bVal === 'boolean') {
                cmp = (aVal === bVal) ? 0 : aVal ? 1 : -1;
            } else {
                cmp = String(aVal).localeCompare(String(bVal));
            }
            return sortDir === 'asc' ? cmp : -cmp;
        });

        return data;
    }, [makes, models, variants, colors, categories, suppliers, conditions, activeTab, nameFilter, statusFilter, makeFilter, modelFilter, countryFilter, yearFilter, bodyTypeFilter, fuelFilter, transmissionFilter, supplierTypeFilter, supplierCityFilter, descriptionFilter, parentFilter, metallicFilter, codeFilter, contactFilter, modelCountFilter, vehicleCountFilter, variantCountFilter, basePriceFilter, hexFilter, additionalCostFilter, partsCountFilter, subCategoryCountFilter, partsPoFilter, sortField, sortDir]);

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
            <span className={`status-badge ${active ? 'status-active' : 'status-inactive'}`}>
                {active ? 'Active' : 'Inactive'}
            </span>
        );

        switch(activeTab) {
            case 'makes':
                return (<><Detail label="Brand Name" value={item.name} /><Detail label="Logo" value={item.logo ? <img className="make-logo make-logo-drawer" src={item.logo} alt={`${item.name} logo`} /> : '-'} /><Detail label="Description" value={item.description || '-'} /><Detail label="Country of Origin" value={item.country || '-'} /><Detail label="Established Year" value={item.established_year || '-'} /><Detail label="Website" value={item.website ? <a href={item.website} target="_blank" rel="noreferrer">{item.website}</a> : '-'} /><Detail label="Models" value={item.model_count} /><Detail label="Vehicles" value={item.vehicle_count} /><Detail label="Status" value={statusBadge(item.is_active)} /></>);
            case 'models':
                return (<><Detail label="Brand" value={item.make_name} /><Detail label="Model" value={item.name} /><Detail label="Year" value={item.year} /><Detail label="Body Type" value={item.body_type} /><Detail label="Fuel" value={item.fuel_type} /><Detail label="Transmission" value={item.transmission} /><Detail label="Variants" value={item.variant_count} /><Detail label="Vehicles" value={item.vehicle_count} /><Detail label="Status" value={statusBadge(item.is_active)} /></>);
            case 'variants':
                return (<><Detail label="Brand" value={item.make_name} /><Detail label="Model" value={item.model_name} /><Detail label="Variant" value={item.name} /><Detail label="Base Price" value={`PKR ${Number(item.base_price || 0).toLocaleString()}`} /><Detail label="Vehicles" value={item.vehicle_count} /><Detail label="Status" value={statusBadge(item.is_active)} /></>);
            case 'colors':
                return (<><Detail label="Color" value={item.name} /><Detail label="Hex" value={item.hex_code} /><Detail label="Metallic" value={item.is_metallic ? 'Yes' : 'No'} /><Detail label="Additional Cost" value={`PKR ${Number(item.additional_cost || 0).toLocaleString()}`} /><Detail label="Vehicles" value={item.vehicle_count} /><Detail label="Status" value={statusBadge(item.is_active)} /></>);
            case 'categories':
                return (<><Detail label="Name" value={item.name} /><Detail label="Description" value={item.description} /><Detail label="Parent" value={item.parent_name || 'Root'} /><Detail label="Parts" value={item.parts_count} /><Detail label="Sub-Categories" value={item.sub_category_count} /><Detail label="Status" value={statusBadge(item.is_active)} /></>);
            case 'suppliers':
                return (<><Detail label="Code" value={item.supplier_code} /><Detail label="Name" value={item.name} /><Detail label="Type" value={item.type} /><Detail label="Contact" value={item.contact_person} /><Detail label="Email" value={item.email} /><Detail label="Phone" value={item.phone} /><Detail label="City" value={item.city} /><Detail label="Country" value={item.country} /><Detail label="Parts" value={item.parts_count} /><Detail label="POs" value={item.po_count} /><Detail label="Status" value={statusBadge(item.is_active)} /></>);
            case 'conditions':
                return (<><Detail label="Name" value={item.name} /><Detail label="Description" value={item.description} /><Detail label="Status" value={statusBadge(item.is_active)} /></>);
            default: return null;
        }
    };

    // ═══════════════════════════════════════════════════════════════════════
    // MAIN RENDER
    // ═══════════════════════════════════════════════════════════════════════

    return (
        <div className="vehicle-master-page">
            {/* Page Header */}
            <div className="page-header">
                <div className="header-content">
                    <h1>Vehicle Master Data</h1>
                    <p className="subtitle">Manage vehicle makes, models, variants, colors, part categories, and suppliers</p>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                    {can('create') && <button className="btn btn-primary btn-create" onClick={() => openModal('create')}>
                        <span className="icon">+</span>
                        Add {getTabLabel()}
                    </button>}
                </div>
            </div>

            {/* Stats Cards */}
            <div className="stats-grid stats-grid-5">
                <div className={`stat-card ${activeTab === 'makes' ? 'active' : ''}`} onClick={() => setActiveTab('makes')} data-section="brands">
                    <div className="stat-icon">🏭</div>
                    <div className="stat-content">
                        <span className="stat-value">{stats.total_makes || 0}</span>
                        <span className="stat-label">Brands</span>
                    </div>
                </div>
                <div className={`stat-card ${activeTab === 'models' ? 'active' : ''}`} onClick={() => setActiveTab('models')}>
                    <div className="stat-icon">🚗</div>
                    <div className="stat-content">
                        <span className="stat-value">{stats.total_models || 0}</span>
                        <span className="stat-label">Models</span>
                    </div>
                </div>
                <div className={`stat-card ${activeTab === 'variants' ? 'active' : ''}`} onClick={() => setActiveTab('variants')}>
                    <div className="stat-icon">📋</div>
                    <div className="stat-content">
                        <span className="stat-value">{stats.total_variants || 0}</span>
                        <span className="stat-label">Variants</span>
                    </div>
                </div>
                <div className={`stat-card ${activeTab === 'colors' ? 'active' : ''}`} onClick={() => setActiveTab('colors')}>
                    <div className="stat-icon">🎨</div>
                    <div className="stat-content">
                        <span className="stat-value">{stats.total_colors || 0}</span>
                        <span className="stat-label">Colors</span>
                    </div>
                </div>
                <div className={`stat-card ${activeTab === 'categories' ? 'active' : ''}`} onClick={() => setActiveTab('categories')}>
                    <div className="stat-icon">📂</div>
                    <div className="stat-content">
                        <span className="stat-value">{stats.total_categories || 0}</span>
                        <span className="stat-label">Categories</span>
                    </div>
                </div>
                <div className={`stat-card ${activeTab === 'suppliers' ? 'active' : ''}`} onClick={() => setActiveTab('suppliers')}>
                    <div className="stat-icon">🏢</div>
                    <div className="stat-content">
                        <span className="stat-value">{stats.total_suppliers || 0}</span>
                        <span className="stat-label">Suppliers</span>
                    </div>
                </div>
                <div className={`stat-card ${activeTab === 'conditions' ? 'active' : ''}`} onClick={() => setActiveTab('conditions')}>
                    <div className="stat-icon">📋</div>
                    <div className="stat-content">
                        <span className="stat-value">{stats.total_conditions || 0}</span>
                        <span className="stat-label">Conditions</span>
                    </div>
                </div>
            </div>

            <ErrorPopup error={errorPopup} onClose={() => setErrorPopup(null)} />

            <div className="vehicle-master-content-card">
            {/* Tabs */}
            <div className="tabs-container">
                <div className="tabs">
                    <button className={`tab ${activeTab === 'makes' ? 'active' : ''}`} onClick={() => handleTabChange('makes')}>Brands</button>
                    <button className={`tab ${activeTab === 'models' ? 'active' : ''}`} onClick={() => handleTabChange('models')}>Models</button>
                    <button className={`tab ${activeTab === 'variants' ? 'active' : ''}`} onClick={() => handleTabChange('variants')}>Variants</button>
                    <button className={`tab ${activeTab === 'colors' ? 'active' : ''}`} onClick={() => handleTabChange('colors')}>Colors</button>
                    <button className={`tab ${activeTab === 'categories' ? 'active' : ''}`} onClick={() => handleTabChange('categories')}>Categories</button>
                    <button className={`tab ${activeTab === 'suppliers' ? 'active' : ''}`} onClick={() => handleTabChange('suppliers')}>Suppliers</button>
                    <button className={`tab ${activeTab === 'conditions' ? 'active' : ''}`} onClick={() => handleTabChange('conditions')}>Conditions</button>
                </div>


            </div>

            {/* Bulk Delete Bar */}
            {selectedIds.size > 0 && (
                <div className="selection-bar">
                    <span className="selection-count">{selectedIds.size} selected</span>
                    <button className="btn btn-danger btn-sm" onClick={() => setDeleteAllTarget(true)}>Delete Selected</button>
                    <button className="btn btn-secondary btn-sm" onClick={() => setSelectedIds(new Set())}>Deselect All</button>
                </div>
            )}

            {/* Data Table */}
            <div className="table-container">
                {loading ? (
                    <div className="loading-state">
                        <div className="spinner"></div>
                        <p>Loading...</p>
                    </div>
                ) : getCurrentData().length === 0 ? (
                    <div className="empty-state">
                        <div className="empty-icon">📭</div>
                        <h3>No {activeTab} found</h3>
                        <p>Click the "Add" button to create one.</p>
                    </div>
                ) : filteredItems.length === 0 ? (
                    <div className="empty-state">
                        <div className="empty-icon">🔍</div>
                        <h3>No matches found</h3>
                        <p>Try adjusting your filters.</p>
                    </div>
                ) : (
                    <>
                        {activeTab === 'makes' && <><div className="desktop-table desktop-only">{renderMakesTable()}</div><div className="mobile-only">{renderMakesCards()}</div></>}
                        {activeTab === 'models' && <><div className="desktop-table desktop-only">{renderModelsTable()}</div><div className="mobile-only">{renderModelsCards()}</div></>}
                        {activeTab === 'variants' && <><div className="desktop-table desktop-only">{renderVariantsTable()}</div><div className="mobile-only">{renderVariantsCards()}</div></>}
                        {activeTab === 'colors' && <><div className="desktop-table desktop-only">{renderColorsTable()}</div><div className="mobile-only">{renderColorsCards()}</div></>}
                        {activeTab === 'categories' && <><div className="desktop-table desktop-only">{renderCategoriesTable()}</div><div className="mobile-only">{renderCategoriesCards()}</div></>}
                        {activeTab === 'suppliers' && <><div className="desktop-table desktop-only">{renderSuppliersTable()}</div><div className="mobile-only">{renderSuppliersCards()}</div></>}
                        {activeTab === 'conditions' && <><div className="desktop-table desktop-only">{renderConditionsTable()}</div><div className="mobile-only">{renderConditionsCards()}</div></>}
                    </>
                )}
            </div>
            </div>

            {/* Modal */}
            {showModal && (
                <VehicleMasterModal
                    key={`${modalMode}-${selectedItem?._id || 'new'}`}
                    type={{ makes: 'make', models: 'model', variants: 'variant', colors: 'color', categories: 'category', suppliers: 'supplier', conditions: 'condition' }[activeTab] || activeTab}
                    mode={modalMode}
                    item={selectedItem}
                    makes={makes}
                    models={models}
                    categories={categories}
                    onClose={closeModal}
                    onSaved={handleSaved}
                />
            )}

            <EmailDrawer
                isOpen={!!drawerItem}
                onClose={() => setDrawerItem(null)}
                title={drawerItem ? drawerItem.name : ''}
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

            <ConfirmModal
                isOpen={!!deleteTarget}
                title={`Delete ${getTabLabel()}`}
                message={`Are you sure you want to delete "${deleteTarget?.name || ''}"?`}
                onConfirm={handleDeleteConfirm}
                onCancel={() => setDeleteTarget(null)}
                confirmText="Delete"
                type="danger"
            />

            {/* Bulk Delete Confirmation */}
            <ConfirmModal
                isOpen={!!deleteAllTarget}
                title={`Delete Selected ${getTabLabel()}s`}
                message={`Are you sure you want to delete ${selectedIds.size} ${getTabLabel().toLowerCase()}(s)? This action cannot be undone.`}
                onConfirm={handleBulkDelete}
                onCancel={() => setDeleteAllTarget(null)}
                confirmText={deletingAll ? 'Deleting...' : 'Delete All'}
                type="danger"
            />
        </div>
    );
};

export default VehicleMasterData;
