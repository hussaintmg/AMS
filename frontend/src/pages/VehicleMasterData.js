/**
 * Vehicle Master Data Management Page
 * Full CRUD operations for makes, models, variants, colors, and categories
 * Created by LOGIXINVENTOR (PVT) Ltd.
 * info@logixinventor.com +92 333 3836851
 * www.logixinventor.com | AMS
 * Date: 2026-01-08
 * Updated: 2026-04-05 - Added Part Categories tab
 */

import React, { useState, useEffect, useCallback } from 'react';
import SearchableSelect from '../components/SearchableSelect';
import { vehicleMasterAPI } from '../services/api';
import toast from 'react-hot-toast';
import ErrorPopup from '../components/ErrorPopup';
import ActionButtons from '../components/ActionButtons';
import '../styles/vehicleMasterData.css';

const VehicleMasterData = () => {
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

    // Modal states
    const [showModal, setShowModal] = useState(false);
    const [modalMode, setModalMode] = useState('create');
    const [selectedItem, setSelectedItem] = useState(null);

    // Form data
    const [formData, setFormData] = useState({});

    // Filters
    const [makeFilter, setMakeFilter] = useState('');
    const [modelFilter, setModelFilter] = useState('');

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

    // Fetch data on tab change
    useEffect(() => {
        fetchStats();
        if (activeTab === 'makes') fetchMakes();
        else if (activeTab === 'models') fetchModels();
        else if (activeTab === 'variants') fetchVariants();
        else if (activeTab === 'colors') fetchColors();
        else if (activeTab === 'categories') fetchCategories();
        else if (activeTab === 'suppliers') fetchSuppliers();
    }, [activeTab, fetchStats, fetchMakes, fetchModels, fetchVariants, fetchColors, fetchCategories, fetchSuppliers]);

    // ═══════════════════════════════════════════════════════════════════════
    // MODAL HANDLERS
    // ═══════════════════════════════════════════════════════════════════════

    const openModal = (mode, item = null) => {
        setModalMode(mode);
        setSelectedItem(item);

        if (mode === 'create') {
            // Default form data based on active tab
            if (activeTab === 'makes') {
                setFormData({ name: '', country: '', logo: '', isActive: true });
            } else if (activeTab === 'models') {
                setFormData({ makeId: '', name: '', year: new Date().getFullYear(), bodyType: 'sedan', fuelType: 'petrol', transmission: 'automatic', engineCapacity: '', seatingCapacity: 5, isActive: true });
            } else if (activeTab === 'variants') {
                setFormData({ modelId: '', name: '', basePrice: '', features: '', isActive: true });
            } else if (activeTab === 'colors') {
                setFormData({ name: '', hexCode: '#000000', isMetallic: false, additionalCost: 0, isActive: true });
            } else if (activeTab === 'categories') {
                setFormData({ name: '', description: '', parentId: '', isActive: true });
            } else if (activeTab === 'suppliers') {
                setFormData({ supplierCode: '', name: '', type: 'oem', contactPerson: '', email: '', phone: '', address: '', city: '', country: 'Pakistan', taxNumber: '', paymentTerms: '', creditLimit: 0, isActive: true });
            }
        } else if (item) {
            // Edit mode - populate form
            if (activeTab === 'makes') {
                setFormData({ name: item.name, country: item.country || '', logo: item.logo || '', isActive: item.is_active });
            } else if (activeTab === 'models') {
                setFormData({ makeId: item.make_id, name: item.name, year: item.year, bodyType: item.body_type, fuelType: item.fuel_type, transmission: item.transmission, engineCapacity: item.engine_capacity || '', seatingCapacity: item.seating_capacity || 5, isActive: item.is_active });
            } else if (activeTab === 'variants') {
                setFormData({ modelId: item.model_id, name: item.name, basePrice: item.base_price, features: item.features || '', isActive: item.is_active });
            } else if (activeTab === 'colors') {
                setFormData({ name: item.name, hexCode: item.hex_code || '#000000', isMetallic: item.is_metallic, additionalCost: item.additional_cost || 0, isActive: item.is_active });
            } else if (activeTab === 'categories') {
                setFormData({ name: item.name, description: item.description || '', parentId: item.parent_id || '', isActive: item.is_active });
            } else if (activeTab === 'suppliers') {
                setFormData({ 
                    supplierCode: item.supplier_code, name: item.name, type: item.type, 
                    contactPerson: item.contact_person || '', email: item.email || '', phone: item.phone || '', 
                    address: item.address || '', city: item.city || '', country: item.country || '', 
                    taxNumber: item.tax_number || '', paymentTerms: item.payment_terms || '', 
                    creditLimit: item.credit_limit || 0, isActive: item.is_active 
                });
            }
        }
        setShowModal(true);
    };

    const closeModal = () => {
        setShowModal(false);
        setSelectedItem(null);
        setFormData({});
    };

    const handleInputChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value
        }));
    };

    // ═══════════════════════════════════════════════════════════════════════
    // CRUD OPERATIONS
    // ═══════════════════════════════════════════════════════════════════════

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            if (activeTab === 'makes') {
                if (modalMode === 'create') {
                    await vehicleMasterAPI.createMake(formData);
                    toast.success('Make created successfully');
                } else {
                    await vehicleMasterAPI.updateMake(selectedItem.id, formData);
                    toast.success('Make updated successfully');
                }
                fetchMakes();
            } else if (activeTab === 'models') {
                if (modalMode === 'create') {
                    await vehicleMasterAPI.createModel(formData);
                    toast.success('Model created successfully');
                } else {
                    await vehicleMasterAPI.updateModel(selectedItem.id, formData);
                    toast.success('Model updated successfully');
                }
                fetchModels();
            } else if (activeTab === 'variants') {
                if (modalMode === 'create') {
                    await vehicleMasterAPI.createVariant(formData);
                    toast.success('Variant created successfully');
                } else {
                    await vehicleMasterAPI.updateVariant(selectedItem.id, formData);
                    toast.success('Variant updated successfully');
                }
                fetchVariants();
            } else if (activeTab === 'colors') {
                if (modalMode === 'create') {
                    await vehicleMasterAPI.createColor(formData);
                    toast.success('Color created successfully');
                } else {
                    await vehicleMasterAPI.updateColor(selectedItem.id, formData);
                    toast.success('Color updated successfully');
                }
                fetchColors();
            } else if (activeTab === 'categories') {
                if (modalMode === 'create') {
                    await vehicleMasterAPI.createCategory(formData);
                    toast.success('Category created successfully');
                } else {
                    await vehicleMasterAPI.updateCategory(selectedItem.id, formData);
                    toast.success('Category updated successfully');
                }
                fetchCategories();
            } else if (activeTab === 'suppliers') {
                if (modalMode === 'create') {
                    await vehicleMasterAPI.createSupplier(formData);
                    toast.success('Supplier created successfully');
                } else {
                    await vehicleMasterAPI.updateSupplier(selectedItem.id, formData);
                    toast.success('Supplier updated successfully');
                }
                fetchSuppliers();
            }
            fetchStats();
            closeModal();
        } catch (err) {
            console.error('Error saving:', err);
            setErrorPopup(err.response?.data || { message: 'Failed to save' });
        }
    };

    const handleDelete = async (item) => {
        const name = item.name;
        if (!window.confirm(`Are you sure you want to delete "${name}"?`)) return;

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
            case 'makes': return 'Make';
            case 'models': return 'Model';
            case 'variants': return 'Variant';
            case 'colors': return 'Color';
            case 'categories': return 'Category';
            case 'suppliers': return 'Supplier';
            default: return '';
        }
    };

    // ═══════════════════════════════════════════════════════════════════════
    // RENDER FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════

    const renderMakesTable = () => (
        <table className="data-table">
            <thead>
                <tr>
                    <th>Name</th>
                    <th>Country</th>
                    <th>Models</th>
                    <th>Vehicles</th>
                    <th>Status</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
                {makes.map(make => (
                    <tr key={make.id}>
                        <td><strong>{make.name}</strong></td>
                        <td>{make.country || '-'}</td>
                        <td>{make.model_count || 0}</td>
                        <td>{make.vehicle_count || 0}</td>
                        <td>
                            <span className={`badge ${make.is_active ? 'badge-success' : 'badge-secondary'}`}>
                                {make.is_active ? 'Active' : 'Inactive'}
                            </span>
                        </td>
                        <td>
                            <ActionButtons
                                onEdit={() => openModal('edit', make)}
                                onDelete={() => handleDelete(make)}
                                title={make.name}
                                showEdit
                                showDelete
                            />
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
    );

    const renderModelsTable = () => (
        <table className="data-table">
            <thead>
                <tr>
                    <th>Make</th>
                    <th>Model</th>
                    <th>Year</th>
                    <th>Body Type</th>
                    <th>Fuel</th>
                    <th>Transmission</th>
                    <th>Variants</th>
                    <th>Status</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
                {models.map(model => (
                    <tr key={model.id}>
                        <td>{model.make_name}</td>
                        <td><strong>{model.name}</strong></td>
                        <td>{model.year || '-'}</td>
                        <td>{model.body_type}</td>
                        <td>{model.fuel_type}</td>
                        <td>{model.transmission}</td>
                        <td>{model.variant_count || 0}</td>
                        <td>
                            <span className={`badge ${model.is_active ? 'badge-success' : 'badge-secondary'}`}>
                                {model.is_active ? 'Active' : 'Inactive'}
                            </span>
                        </td>
                        <td>
                            <ActionButtons
                                onEdit={() => openModal('edit', model)}
                                onDelete={() => handleDelete(model)}
                                title={model.name}
                                showEdit
                                showDelete
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
                    <th>Make</th>
                    <th>Model</th>
                    <th>Variant</th>
                    <th>Base Price</th>
                    <th>Vehicles</th>
                    <th>Status</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
                {variants.map(variant => (
                    <tr key={variant.id}>
                        <td>{variant.make_name}</td>
                        <td>{variant.model_name}</td>
                        <td><strong>{variant.name}</strong></td>
                        <td>PKR {Number(variant.base_price || 0).toLocaleString()}</td>
                        <td>{variant.vehicle_count || 0}</td>
                        <td>
                            <span className={`badge ${variant.is_active ? 'badge-success' : 'badge-secondary'}`}>
                                {variant.is_active ? 'Active' : 'Inactive'}
                            </span>
                        </td>
                        <td>
                            <ActionButtons
                                onEdit={() => openModal('edit', variant)}
                                onDelete={() => handleDelete(variant)}
                                title={variant.name}
                                showEdit
                                showDelete
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
                    <th>Color</th>
                    <th>Preview</th>
                    <th>Metallic</th>
                    <th>Additional Cost</th>
                    <th>Vehicles</th>
                    <th>Status</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
                {colors.map(color => (
                    <tr key={color.id}>
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
                        <td>
                            <span className={`badge ${color.is_active ? 'badge-success' : 'badge-secondary'}`}>
                                {color.is_active ? 'Active' : 'Inactive'}
                            </span>
                        </td>
                        <td>
                            <ActionButtons
                                onEdit={() => openModal('edit', color)}
                                onDelete={() => handleDelete(color)}
                                title={color.name}
                                showEdit
                                showDelete
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
                    <th>Category Name</th>
                    <th>Description</th>
                    <th>Parent Category</th>
                    <th>Parts</th>
                    <th>Sub-Categories</th>
                    <th>Status</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
                {categories.map(cat => (
                    <tr key={cat.id}>
                        <td><strong>{cat.name}</strong></td>
                        <td>{cat.description || '-'}</td>
                        <td>{cat.parent_name || <span className="badge badge-info">Root</span>}</td>
                        <td>{cat.parts_count || 0}</td>
                        <td>{cat.sub_category_count || 0}</td>
                        <td>
                            <span className={`badge ${cat.is_active ? 'badge-success' : 'badge-secondary'}`}>
                                {cat.is_active ? 'Active' : 'Inactive'}
                            </span>
                        </td>
                        <td>
                            <ActionButtons
                                onEdit={() => openModal('edit', cat)}
                                onDelete={() => handleDelete(cat)}
                                title={cat.name}
                                showEdit
                                showDelete
                            />
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
    );

    const renderSuppliersTable = () => (
        <table className="data-table">
            <thead>
                <tr>
                    <th>Code</th>
                    <th>Supplier Name</th>
                    <th>Type</th>
                    <th>Contact Info</th>
                    <th>Location</th>
                    <th>Parts/POs</th>
                    <th>Status</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
                {suppliers.map(sup => (
                    <tr key={sup.id}>
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
                        <td>
                            <span className={`badge ${sup.is_active ? 'badge-success' : 'badge-secondary'}`}>
                                {sup.is_active ? 'Active' : 'Inactive'}
                            </span>
                        </td>
                        <td>
                            <ActionButtons
                                onEdit={() => openModal('edit', sup)}
                                onDelete={() => handleDelete(sup)}
                                title={sup.name}
                                showEdit
                                showDelete
                            />
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
    );

    // ═══════════════════════════════════════════════════════════════════════
    // MODAL FORMS
    // ═══════════════════════════════════════════════════════════════════════

    const renderMakeForm = () => (
        <>
            <div className="form-group">
                <label>Make Name *</label>
                <input type="text" name="name" value={formData.name || ''} onChange={handleInputChange} required placeholder="e.g., Toyota, Honda" />
            </div>
            <div className="form-group">
                <label>Country</label>
                <input type="text" name="country" value={formData.country || ''} onChange={handleInputChange} placeholder="e.g., Japan, USA" />
            </div>
            <div className="form-group">
                <label>Logo URL</label>
                <input type="text" name="logo" value={formData.logo || ''} onChange={handleInputChange} placeholder="https://..." />
            </div>
            <div className="form-group checkbox-group">
                <label>
                    <input type="checkbox" name="isActive" checked={formData.isActive !== false} onChange={handleInputChange} />
                    Active
                </label>
            </div>
        </>
    );

    const renderModelForm = () => (
        <>
            <div className="form-row">
                <div className="form-group">
                    <label>Make *</label>
                    <SearchableSelect name="makeId" value={formData.makeId || ''} onChange={handleInputChange} required>
                        <option value="">Select Make</option>
                        {makes.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </SearchableSelect>
                </div>
                <div className="form-group">
                    <label>Model Name *</label>
                    <input type="text" name="name" value={formData.name || ''} onChange={handleInputChange} required placeholder="e.g., Corolla, Civic" />
                </div>
            </div>
            <div className="form-row">
                <div className="form-group">
                    <label>Year</label>
                    <input type="number" name="year" value={formData.year || ''} onChange={handleInputChange} min="1990" max="2030" />
                </div>
                <div className="form-group">
                    <label>Body Type</label>
                    <SearchableSelect name="bodyType" value={formData.bodyType || 'sedan'} onChange={handleInputChange}>
                        <option value="sedan">Sedan</option>
                        <option value="suv">SUV</option>
                        <option value="hatchback">Hatchback</option>
                        <option value="coupe">Coupe</option>
                        <option value="truck">Truck</option>
                        <option value="van">Van</option>
                        <option value="wagon">Wagon</option>
                        <option value="convertible">Convertible</option>
                    </SearchableSelect>
                </div>
            </div>
            <div className="form-row">
                <div className="form-group">
                    <label>Fuel Type</label>
                    <SearchableSelect name="fuelType" value={formData.fuelType || 'petrol'} onChange={handleInputChange}>
                        <option value="petrol">Petrol</option>
                        <option value="diesel">Diesel</option>
                        <option value="hybrid">Hybrid</option>
                        <option value="electric">Electric</option>
                        <option value="cng">CNG</option>
                        <option value="lpg">LPG</option>
                    </SearchableSelect>
                </div>
                <div className="form-group">
                    <label>Transmission</label>
                    <SearchableSelect name="transmission" value={formData.transmission || 'automatic'} onChange={handleInputChange}>
                        <option value="automatic">Automatic</option>
                        <option value="manual">Manual</option>
                        <option value="cvt">CVT</option>
                    </SearchableSelect>
                </div>
            </div>
            <div className="form-row">
                <div className="form-group">
                    <label>Engine Capacity</label>
                    <input type="text" name="engineCapacity" value={formData.engineCapacity || ''} onChange={handleInputChange} placeholder="e.g., 1.8L, 2000cc" />
                </div>
                <div className="form-group">
                    <label>Seating Capacity</label>
                    <input type="number" name="seatingCapacity" value={formData.seatingCapacity || 5} onChange={handleInputChange} min="2" max="12" />
                </div>
            </div>
            <div className="form-group checkbox-group">
                <label>
                    <input type="checkbox" name="isActive" checked={formData.isActive !== false} onChange={handleInputChange} />
                    Active
                </label>
            </div>
        </>
    );

    const renderVariantForm = () => (
        <>
            <div className="form-row">
                <div className="form-group">
                    <label>Make *</label>
                    <SearchableSelect
                        value={makeFilter || ''}
                        onChange={(e) => {
                            setMakeFilter(e.target.value);
                            setFormData(prev => ({ ...prev, modelId: '' }));
                        }}
                    >
                        <option value="">Select Make</option>
                        {makes.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </SearchableSelect>
                </div>
                <div className="form-group">
                    <label>Model *</label>
                    <SearchableSelect name="modelId" value={formData.modelId || ''} onChange={handleInputChange} required>
                        <option value="">Select Model</option>
                        {models.filter(m => !makeFilter || m.make_id === parseInt(makeFilter)).map(m => (
                            <option key={m.id} value={m.id}>{m.name}</option>
                        ))}
                    </SearchableSelect>
                </div>
            </div>
            <div className="form-group">
                <label>Variant Name *</label>
                <input type="text" name="name" value={formData.name || ''} onChange={handleInputChange} required placeholder="e.g., Base, Sport, Premium" />
            </div>
            <div className="form-group">
                <label>Base Price (PKR)</label>
                <input type="number" name="basePrice" value={formData.basePrice || ''} onChange={handleInputChange} min="0" placeholder="0" />
            </div>
            <div className="form-group">
                <label>Features</label>
                <textarea name="features" value={formData.features || ''} onChange={handleInputChange} rows={3} placeholder="Key features..." />
            </div>
            <div className="form-group checkbox-group">
                <label>
                    <input type="checkbox" name="isActive" checked={formData.isActive !== false} onChange={handleInputChange} />
                    Active
                </label>
            </div>
        </>
    );

    const renderColorForm = () => (
        <>
            <div className="form-row">
                <div className="form-group">
                    <label>Color Name *</label>
                    <input type="text" name="name" value={formData.name || ''} onChange={handleInputChange} required placeholder="e.g., Pearl White" />
                </div>
                <div className="form-group">
                    <label>Hex Code</label>
                    <div className="color-input-wrapper">
                        <input type="color" name="hexCode" value={formData.hexCode || '#000000'} onChange={handleInputChange} />
                        <input type="text" value={formData.hexCode || '#000000'} onChange={(e) => setFormData(prev => ({ ...prev, hexCode: e.target.value }))} />
                    </div>
                </div>
            </div>
            <div className="form-row">
                <div className="form-group">
                    <label>Additional Cost (PKR)</label>
                    <input type="number" name="additionalCost" value={formData.additionalCost || 0} onChange={handleInputChange} min="0" />
                </div>
                <div className="form-group checkbox-group">
                    <label>
                        <input type="checkbox" name="isMetallic" checked={formData.isMetallic || false} onChange={handleInputChange} />
                        Metallic Finish
                    </label>
                </div>
            </div>
            <div className="form-group checkbox-group">
                <label>
                    <input type="checkbox" name="isActive" checked={formData.isActive !== false} onChange={handleInputChange} />
                    Active
                </label>
            </div>
        </>
    );

    const renderCategoryForm = () => (
        <>
            <div className="form-group">
                <label>Category Name *</label>
                <input type="text" name="name" value={formData.name || ''} onChange={handleInputChange} required placeholder="e.g., Engine Parts, Brake System, Electrical" />
            </div>
            <div className="form-group">
                <label>Description</label>
                <textarea name="description" value={formData.description || ''} onChange={handleInputChange} rows={2} placeholder="Brief description of this category..." />
            </div>
            <div className="form-group">
                <label>Parent Category</label>
                <SearchableSelect name="parentId" value={formData.parentId || ''} onChange={handleInputChange}>
                    <option value="">None (Root Category)</option>
                    {categories
                        .filter(c => !selectedItem || c.id !== selectedItem.id)
                        .map(c => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                        ))
                    }
                </SearchableSelect>
            </div>
            <div className="form-group checkbox-group">
                <label>
                    <input type="checkbox" name="isActive" checked={formData.isActive !== false} onChange={handleInputChange} />
                    Active
                </label>
            </div>
        </>
    );

    const renderSupplierForm = () => (
        <>
            <div className="form-row">
                <div className="form-group">
                    <label>Supplier Code *</label>
                    <input type="text" name="supplierCode" value={formData.supplierCode || ''} onChange={handleInputChange} required placeholder="e.g., SUP-001" />
                </div>
                <div className="form-group">
                    <label>Supplier Name *</label>
                    <input type="text" name="name" value={formData.name || ''} onChange={handleInputChange} required placeholder="e.g., Indus Motor Company" />
                </div>
            </div>
            <div className="form-row">
                <div className="form-group">
                    <label>Supplier Type *</label>
                    <SearchableSelect name="type" value={formData.type || 'oem'} onChange={handleInputChange} required>
                        <option value="oem">OEM (Manufacturer)</option>
                        <option value="distributor">Distributor</option>
                        <option value="local_vendor">Local Vendor</option>
                    </SearchableSelect>
                </div>
                <div className="form-group">
                    <label>Contact Person</label>
                    <input type="text" name="contactPerson" value={formData.contactPerson || ''} onChange={handleInputChange} placeholder="e.g., John Doe" />
                </div>
            </div>
            <div className="form-row">
                <div className="form-group">
                    <label>Email</label>
                    <input type="email" name="email" value={formData.email || ''} onChange={handleInputChange} placeholder="supplier@example.com" />
                </div>
                <div className="form-group">
                    <label>Phone</label>
                    <input type="text" name="phone" value={formData.phone || ''} onChange={handleInputChange} placeholder="+92 3XX XXXXXXX" />
                </div>
            </div>
            <div className="form-row">
                <div className="form-group">
                    <label>City</label>
                    <input type="text" name="city" value={formData.city || ''} onChange={handleInputChange} placeholder="e.g., Karachi" />
                </div>
                <div className="form-group">
                    <label>Country</label>
                    <input type="text" name="country" value={formData.country || 'Pakistan'} onChange={handleInputChange} />
                </div>
            </div>
            <div className="form-group">
                <label>Address</label>
                <textarea name="address" value={formData.address || ''} onChange={handleInputChange} rows={2} placeholder="Full address..." />
            </div>
            <div className="form-row">
                <div className="form-group">
                    <label>Tax Number (NTN/GST)</label>
                    <input type="text" name="taxNumber" value={formData.taxNumber || ''} onChange={handleInputChange} />
                </div>
                <div className="form-group">
                    <label>Payment Terms</label>
                    <input type="text" name="paymentTerms" value={formData.paymentTerms || ''} onChange={handleInputChange} placeholder="e.g., Net 30" />
                </div>
            </div>
            <div className="form-group checkbox-group">
                <label>
                    <input type="checkbox" name="isActive" checked={formData.isActive !== false} onChange={handleInputChange} />
                    Active
                </label>
            </div>
        </>
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
            default: return [];
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
                <button className="btn btn-primary btn-create" onClick={() => openModal('create')}>
                    <span className="icon">+</span>
                    Add {getTabLabel()}
                </button>
            </div>

            {/* Stats Cards */}
            <div className="stats-grid stats-grid-6">
                <div className={`stat-card ${activeTab === 'makes' ? 'active' : ''}`} onClick={() => setActiveTab('makes')}>
                    <div className="stat-icon">🏭</div>
                    <div className="stat-content">
                        <span className="stat-value">{stats.total_makes || 0}</span>
                        <span className="stat-label">Makes</span>
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
            </div>

            <ErrorPopup error={errorPopup} onClose={() => setErrorPopup(null)} />

            {/* Tabs */}
            <div className="tabs-container">
                <div className="tabs">
                    <button className={`tab ${activeTab === 'makes' ? 'active' : ''}`} onClick={() => setActiveTab('makes')}>Makes</button>
                    <button className={`tab ${activeTab === 'models' ? 'active' : ''}`} onClick={() => setActiveTab('models')}>Models</button>
                    <button className={`tab ${activeTab === 'variants' ? 'active' : ''}`} onClick={() => setActiveTab('variants')}>Variants</button>
                    <button className={`tab ${activeTab === 'colors' ? 'active' : ''}`} onClick={() => setActiveTab('colors')}>Colors</button>
                    <button className={`tab ${activeTab === 'categories' ? 'active' : ''}`} onClick={() => setActiveTab('categories')}>Categories</button>
                    <button className={`tab ${activeTab === 'suppliers' ? 'active' : ''}`} onClick={() => setActiveTab('suppliers')}>Suppliers</button>
                </div>

                {/* Filters for Models/Variants */}
                {(activeTab === 'models' || activeTab === 'variants') && (
                    <div className="filters-bar">
                        <SearchableSelect value={makeFilter} onChange={(e) => { setMakeFilter(e.target.value); setModelFilter(''); }}>
                            <option value="">All Makes</option>
                            {makes.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                        </SearchableSelect>
                        {activeTab === 'variants' && (
                            <SearchableSelect value={modelFilter} onChange={(e) => setModelFilter(e.target.value)} disabled={!makeFilter}>
                                <option value="">All Models</option>
                                {models.filter(m => !makeFilter || m.make_id === parseInt(makeFilter)).map(m => (
                                    <option key={m.id} value={m.id}>{m.name}</option>
                                ))}
                            </SearchableSelect>
                        )}
                    </div>
                )}
            </div>

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
                ) : (
                    <>
                        {activeTab === 'makes' && renderMakesTable()}
                        {activeTab === 'models' && renderModelsTable()}
                        {activeTab === 'variants' && renderVariantsTable()}
                        {activeTab === 'colors' && renderColorsTable()}
                        {activeTab === 'categories' && renderCategoriesTable()}
                        {activeTab === 'suppliers' && renderSuppliersTable()}
                    </>
                )}
            </div>

            {/* Modal */}
            {showModal && (
                <div className="modal-overlay">
                    <div className="modal-content" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>{modalMode === 'create' ? 'Add' : 'Edit'} {getTabLabel()}</h2>
                            <button className="modal-close" onClick={closeModal}>×</button>
                        </div>
                        <form onSubmit={handleSubmit}>
                            <div className="modal-body">
                                {activeTab === 'makes' && renderMakeForm()}
                                {activeTab === 'models' && renderModelForm()}
                                {activeTab === 'variants' && renderVariantForm()}
                                {activeTab === 'colors' && renderColorForm()}
                                {activeTab === 'categories' && renderCategoryForm()}
                                {activeTab === 'suppliers' && renderSupplierForm()}
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-secondary" onClick={closeModal}>Cancel</button>
                                <button type="submit" className="btn btn-primary">
                                    {modalMode === 'create' ? 'Create' : 'Save Changes'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default VehicleMasterData;