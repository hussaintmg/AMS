import React, { useState, useRef } from "react";
import SearchableSelect from "../SearchableSelect";
import ToggleSwitch from "../ToggleSwitch";
import { vehicleMasterAPI } from "../../services/api";
import toast from "react-hot-toast";
import useModalKeyboard from "../../hooks/useModalKeyboard";

const LABEL_MAP = {
  make: "Brand",
  model: "Model",
  variant: "Variant",
  color: "Color",
  category: "Category",
  supplier: "Supplier",
  condition: "Condition",
};

const DEFAULTS = {
  make: {
    name: "",
    country: "",
    logo: "",
    description: "",
    establishedYear: "",
    website: "",
    isActive: true,
  },
  model: {
    makeId: "",
    name: "",
    year: new Date().getFullYear(),
    bodyType: "sedan",
    fuelType: "petrol",
    transmission: "automatic",
    engineCapacity: "",
    seatingCapacity: 5,
    isActive: true,
  },
  variant: {
    modelId: "",
    name: "",
    basePrice: "",
    features: "",
    isActive: true,
  },
  color: {
    name: "",
    hexCode: "#000000",
    isMetallic: false,
    additionalCost: 0,
    isActive: true,
  },
  category: { name: "", description: "", parentId: "", isActive: true },
  supplier: {
    supplierCode: "",
    name: "",
    type: "oem",
    contactPerson: "",
    email: "",
    phone: "",
    address: "",
    city: "",
    country: "Pakistan",
    taxNumber: "",
    paymentTerms: "",
    creditLimit: 0,
    isActive: true,
  },
  condition: { name: "", description: "", isActive: true },
};

function itemToForm(type, item) {
  if (!item) return { ...DEFAULTS[type] };
  switch (type) {
    case "make":
      return {
        name: item.name,
        country: item.country || "",
        logo: item.logo || "",
        description: item.description || "",
        establishedYear: item.established_year || "",
        website: item.website || "",
        isActive: item.is_active,
      };
    case "model":
      return {
        makeId: item.make_id,
        name: item.name,
        year: item.year,
        bodyType: item.body_type,
        fuelType: item.fuel_type,
        transmission: item.transmission,
        engineCapacity: item.engine_capacity || "",
        seatingCapacity: item.seating_capacity || 5,
        isActive: item.is_active,
      };
    case "variant":
      return {
        modelId: item.model_id,
        name: item.name,
        basePrice: item.base_price,
        features: item.features || "",
        isActive: item.is_active,
      };
    case "color":
      return {
        name: item.name,
        hexCode: item.hex_code || "#000000",
        isMetallic: item.is_metallic,
        additionalCost: item.additional_cost || 0,
        isActive: item.is_active,
      };
    case "category":
      return {
        name: item.name,
        description: item.description || "",
        parentId: item.parent_id || "",
        isActive: item.is_active,
      };
    case "supplier":
      return {
        supplierCode: item.supplier_code,
        name: item.name,
        type: item.type,
        contactPerson: item.contact_person || "",
        email: item.email || "",
        phone: item.phone || "",
        address: item.address || "",
        city: item.city || "",
        country: item.country || "",
        taxNumber: item.tax_number || "",
        paymentTerms: item.payment_terms || "",
        creditLimit: item.credit_limit || 0,
        isActive: item.is_active,
      };
    case "condition":
      return {
        name: item.name,
        description: item.description || "",
        isActive: item.is_active,
      };
    default:
      return { ...DEFAULTS[type] };
  }
}

export default function VehicleMasterModal({
  type,
  mode = "create",
  item = null,
  onClose,
  onSaved,
  makes = [],
  models = [],
  categories = [],
  initialData = {},
}) {
  const [formData, setFormData] = useState(() => ({
    ...itemToForm(type, mode === "edit" ? item : null),
    ...initialData,
  }));
  const [saving, setSaving] = useState(false);
  const [variantMakeId, setVariantMakeId] = useState(initialData.makeId || "");
  const formRef = useRef(null);
  const [quickCreate, setQuickCreate] = useState(null);
  const [extraMakes, setExtraMakes] = useState([]);
  const [extraModels, setExtraModels] = useState([]);
  const allMakes = [...makes, ...extraMakes];
  const allModels = [...models, ...extraModels];

  useModalKeyboard(true, onClose, () => formRef.current?.requestSubmit());

  const set = (field, value) =>
    setFormData((prev) => ({ ...prev, [field]: value }));

  const handleInputChange = (e) => {
    const { name, value, type: itype, checked } = e.target;
    set(name, itype === "checkbox" ? checked : value);
  };

  const getCreateFn = () => {
    switch (type) {
      case "make":
        return vehicleMasterAPI.createMake;
      case "model":
        return vehicleMasterAPI.createModel;
      case "variant":
        return vehicleMasterAPI.createVariant;
      case "color":
        return vehicleMasterAPI.createColor;
      case "category":
        return vehicleMasterAPI.createCategory;
      case "supplier":
        return vehicleMasterAPI.createSupplier;
      case "condition":
        return vehicleMasterAPI.createCondition;
      default:
        return null;
    }
  };

  const getUpdateFn = () => {
    switch (type) {
      case "make":
        return (id, d) => vehicleMasterAPI.updateMake(id, d);
      case "model":
        return (id, d) => vehicleMasterAPI.updateModel(id, d);
      case "variant":
        return (id, d) => vehicleMasterAPI.updateVariant(id, d);
      case "color":
        return (id, d) => vehicleMasterAPI.updateColor(id, d);
      case "category":
        return (id, d) => vehicleMasterAPI.updateCategory(id, d);
      case "supplier":
        return (id, d) => vehicleMasterAPI.updateSupplier(id, d);
      case "condition":
        return (id, d) => vehicleMasterAPI.updateCondition(id, d);
      default:
        return null;
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name?.trim()) {
      toast.error("Name is required");
      return;
    }
    setSaving(true);
    try {
      let res;
      if (mode === "create") {
        const fn = getCreateFn();
        res = await fn(formData);
      } else {
        const fn = getUpdateFn();
        res = await fn(item.id, formData);
      }
      toast.success(
        res?.data?.message || `${LABEL_MAP[type]} saved successfully`,
      );
      if (onSaved) onSaved(res?.data?.data || { ...formData, id: item?.id });
      onClose();
    } catch (err) {
      console.error("Error saving:", err);
      toast.error(err.response?.data?.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleQuickCreateSaved = (newItem) => {
    if (quickCreate === "make" && newItem?.id) {
      setExtraMakes((prev) => [...prev, newItem]);
      set("makeId", newItem.id);
    } else if (quickCreate === "model" && newItem?.id) {
      setExtraModels((prev) => [...prev, newItem]);
      set("modelId", newItem.id);
    }
    setQuickCreate(null);
  };

  const label = LABEL_MAP[type] || "Item";
  const modalTitle = mode === "create" ? `Add ${label}` : `Edit ${label}`;

  return (
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{modalTitle}</h2>
          <button className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>
        <form ref={formRef} onSubmit={handleSubmit}>
          <div className="modal-body">
            {type === "make" && (
              <MakeForm
                formData={formData}
                onChange={handleInputChange}
                set={set}
              />
            )}
            {type === "model" && (
              <ModelForm
                formData={formData}
                onChange={handleInputChange}
                set={set}
                makes={allMakes}
                onQuickCreate={() => setQuickCreate("make")}
              />
            )}
            {type === "variant" && (
              <VariantForm
                formData={formData}
                onChange={handleInputChange}
                set={set}
                makes={allMakes}
                models={allModels}
                variantMakeId={variantMakeId}
                setVariantMakeId={setVariantMakeId}
                onQuickCreateMake={() => setQuickCreate("make")}
                onQuickCreateModel={() => setQuickCreate("model")}
              />
            )}
            {type === "color" && (
              <ColorForm
                formData={formData}
                onChange={handleInputChange}
                set={set}
              />
            )}
            {type === "category" && (
              <CategoryForm
                formData={formData}
                onChange={handleInputChange}
                set={set}
                categories={categories}
                item={item}
              />
            )}
            {type === "supplier" && (
              <SupplierForm
                formData={formData}
                onChange={handleInputChange}
                set={set}
              />
            )}
            {type === "condition" && (
              <ConditionForm
                formData={formData}
                onChange={handleInputChange}
                set={set}
              />
            )}
          </div>
          <div className="modal-footer">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? (
                <>
                  <span className="spinner-mini"></span> Saving...
                </>
              ) : mode === "create" ? (
                "Create"
              ) : (
                "Save Changes"
              )}
            </button>
          </div>
        </form>
      </div>

      {quickCreate && (
        <VehicleMasterModal
          type={quickCreate}
          mode="create"
          makes={allMakes}
          models={allModels}
          onClose={() => setQuickCreate(null)}
          onSaved={handleQuickCreateSaved}
        />
      )}
    </div>
  );
}

function MakeForm({ formData, onChange, set }) {
  return (
    <>
      <div className="form-group">
        <label>Brand Name *</label>
        <input
          type="text"
          name="name"
          value={formData.name || ""}
          onChange={onChange}
          required
          placeholder="e.g., Toyota, Honda"
        />
      </div>
      <div className="form-group">
        <label>Description</label>
        <textarea
          name="description"
          value={formData.description || ""}
          onChange={onChange}
          rows={2}
          placeholder="Short description of the brand"
        />
      </div>
      <div className="form-group">
        <label>Country of Origin</label>
        <input
          type="text"
          name="country"
          value={formData.country || ""}
          onChange={onChange}
          placeholder="e.g., Japan, USA"
        />
      </div>
      <div className="form-group">
        <label>Established Year</label>
        <input
          type="number"
          name="establishedYear"
          value={formData.establishedYear || ""}
          onChange={onChange}
          placeholder="e.g., 1937"
          min="1800"
          max={new Date().getFullYear()}
        />
      </div>
      <div className="form-group">
        <label>Website</label>
        <input
          type="text"
          name="website"
          value={formData.website || ""}
          onChange={onChange}
          placeholder="https://..."
        />
      </div>
      <div className="form-group">
        <label>Logo URL</label>
        <input
          type="text"
          name="logo"
          value={formData.logo || ""}
          onChange={onChange}
          placeholder="https://..."
        />
      </div>
      <div className="form-group checkbox-group">
        <label style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <ToggleSwitch
            checked={formData.isActive !== false}
            onChange={(v) => set("isActive", v)}
          />
          Active
        </label>
      </div>
    </>
  );
}

function ModelForm({ formData, onChange, set, makes, onQuickCreate }) {
  return (
    <>
      <div className="form-row">
        <div className="form-group">
          <label className="form-label-add">
            Brand *{" "}
            <a
              className="label-add-link"
              onClick={onQuickCreate}
              title="Create Brand"
            >
              + Brand
            </a>
          </label>
          <SearchableSelect
            name="makeId"
            value={formData.makeId || ""}
            onChange={onChange}
            required
          >
            <option value="">Select Brand</option>
            {makes.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </SearchableSelect>
        </div>
        <div className="form-group">
          <label>Model Name *</label>
          <input
            type="text"
            name="name"
            value={formData.name || ""}
            onChange={onChange}
            required
            placeholder="e.g., Corolla, Civic"
          />
        </div>
      </div>
      <div className="form-row">
        <div className="form-group">
          <label>Year</label>
          <input
            type="number"
            name="year"
            value={formData.year || ""}
            onChange={onChange}
            min="1990"
            max="2030"
          />
        </div>
        <div className="form-group">
          <label>Body Type</label>
          <SearchableSelect
            name="bodyType"
            value={formData.bodyType || "sedan"}
            onChange={onChange}
          >
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
          <SearchableSelect
            name="fuelType"
            value={formData.fuelType || "petrol"}
            onChange={onChange}
          >
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
          <SearchableSelect
            name="transmission"
            value={formData.transmission || "automatic"}
            onChange={onChange}
          >
            <option value="automatic">Automatic</option>
            <option value="manual">Manual</option>
            <option value="cvt">CVT</option>
          </SearchableSelect>
        </div>
      </div>
      <div className="form-row">
        <div className="form-group">
          <label>Engine Capacity</label>
          <input
            type="text"
            name="engineCapacity"
            value={formData.engineCapacity || ""}
            onChange={onChange}
            placeholder="e.g., 1.8L, 2000cc"
          />
        </div>
        <div className="form-group">
          <label>Seating Capacity</label>
          <input
            type="number"
            name="seatingCapacity"
            value={formData.seatingCapacity || 5}
            onChange={onChange}
            min="2"
            max="12"
          />
        </div>
      </div>
      <div className="form-group checkbox-group">
        <label style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <ToggleSwitch
            checked={formData.isActive !== false}
            onChange={(v) => set("isActive", v)}
          />
          Active
        </label>
      </div>
    </>
  );
}

function VariantForm({
  formData,
  onChange,
  set,
  makes,
  models,
  variantMakeId,
  setVariantMakeId,
  onQuickCreateMake,
  onQuickCreateModel,
}) {
  const filteredModels = models.filter(
    (m) => !variantMakeId || String(m.make_id) === String(variantMakeId),
  );
  return (
    <>
      <div className="form-row">
        <div className="form-group">
          <label className="form-label-add">
            Brand *{" "}
            <a
              className="label-add-link"
              onClick={onQuickCreateMake}
              title="Create Brand"
            >
              + Brand
            </a>
          </label>
          <SearchableSelect
            value={variantMakeId}
            onChange={(e) => {
              setVariantMakeId(e.target.value);
              set("modelId", "");
            }}
          >
            <option value="">Select Brand</option>
            {makes.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </SearchableSelect>
        </div>
        <div className="form-group">
          <label className="form-label-add">
            Model *{" "}
            <a
              className="label-add-link"
              onClick={onQuickCreateModel}
              title="Create Model"
            >
              + Model
            </a>
          </label>
          <SearchableSelect
            name="modelId"
            value={formData.modelId || ""}
            onChange={onChange}
            required
          >
            <option value="">Select Model</option>
            {filteredModels.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </SearchableSelect>
        </div>
      </div>
      <div className="form-group">
        <label>Variant Name *</label>
        <input
          type="text"
          name="name"
          value={formData.name || ""}
          onChange={onChange}
          required
          placeholder="e.g., Base, Sport, Premium"
        />
      </div>
      <div className="form-group">
        <label>Base Price (PKR)</label>
        <input
          type="number"
          name="basePrice"
          value={formData.basePrice || ""}
          onChange={onChange}
          min="0"
          placeholder="0"
        />
      </div>
      <div className="form-group">
        <label>Features</label>
        <textarea
          name="features"
          value={formData.features || ""}
          onChange={onChange}
          rows={3}
          placeholder="Key features..."
        />
      </div>
      <div className="form-group checkbox-group">
        <label style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <ToggleSwitch
            checked={formData.isActive !== false}
            onChange={(v) => set("isActive", v)}
          />
          Active
        </label>
      </div>
    </>
  );
}

function ColorForm({ formData, onChange, set }) {
  return (
    <>
      <div className="form-row">
        <div className="form-group">
          <label>Color Name *</label>
          <input
            type="text"
            name="name"
            value={formData.name || ""}
            onChange={onChange}
            required
            placeholder="e.g., Pearl White"
          />
        </div>
        <div className="form-group">
          <label>Hex Code</label>
          <div className="color-input-wrapper">
            <input
              type="color"
              name="hexCode"
              value={formData.hexCode || "#000000"}
              onChange={onChange}
            />
            <input
              type="text"
              value={formData.hexCode || "#000000"}
              onChange={(e) => set("hexCode", e.target.value)}
            />
          </div>
        </div>
      </div>
      <div className="form-row">
        <div className="form-group">
          <label>Additional Cost (PKR)</label>
          <input
            type="number"
            name="additionalCost"
            value={formData.additionalCost || 0}
            onChange={onChange}
            min="0"
          />
        </div>
        <div className="form-group checkbox-group">
          <label>
            <input
              type="checkbox"
              name="isMetallic"
              checked={formData.isMetallic || false}
              onChange={onChange}
            />
            Metallic Finish
          </label>
        </div>
      </div>
      <div className="form-group checkbox-group">
        <label style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <ToggleSwitch
            checked={formData.isActive !== false}
            onChange={(v) => set("isActive", v)}
          />
          Active
        </label>
      </div>
    </>
  );
}

function CategoryForm({ formData, onChange, set, categories, item }) {
  return (
    <>
      <div className="form-group">
        <label>Category Name *</label>
        <input
          type="text"
          name="name"
          value={formData.name || ""}
          onChange={onChange}
          required
          placeholder="e.g., Engine Parts, Brake System, Electrical"
        />
      </div>
      <div className="form-group">
        <label>Description</label>
        <textarea
          name="description"
          value={formData.description || ""}
          onChange={onChange}
          rows={2}
          placeholder="Brief description of this category..."
        />
      </div>
      <div className="form-group">
        <label>Parent Category</label>
        <SearchableSelect
          name="parentId"
          value={formData.parentId || ""}
          onChange={onChange}
        >
          <option value="">None (Root Category)</option>
          {categories
            .filter((c) => !item || c.id !== item.id)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
        </SearchableSelect>
      </div>
      <div className="form-group checkbox-group">
        <label style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <ToggleSwitch
            checked={formData.isActive !== false}
            onChange={(v) => set("isActive", v)}
          />
          Active
        </label>
      </div>
    </>
  );
}

function SupplierForm({ formData, onChange, set }) {
  return (
    <>
      <div className="form-row">
        <div className="form-group">
          <label>Supplier Code *</label>
          <input
            type="text"
            name="supplierCode"
            value={formData.supplierCode || ""}
            onChange={onChange}
            required
            placeholder="e.g., SUP-001"
          />
        </div>
        <div className="form-group">
          <label>Supplier Name *</label>
          <input
            type="text"
            name="name"
            value={formData.name || ""}
            onChange={onChange}
            required
            placeholder="e.g., Indus Motor Company"
          />
        </div>
      </div>
      <div className="form-row">
        <div className="form-group">
          <label>Supplier Type *</label>
          <SearchableSelect
            name="type"
            value={formData.type || "oem"}
            onChange={onChange}
            required
          >
            <option value="oem">OEM (Manufacturer)</option>
            <option value="distributor">Distributor</option>
            <option value="local_vendor">Local Vendor</option>
          </SearchableSelect>
        </div>
        <div className="form-group">
          <label>Contact Person</label>
          <input
            type="text"
            name="contactPerson"
            value={formData.contactPerson || ""}
            onChange={onChange}
            placeholder="e.g., John Doe"
          />
        </div>
      </div>
      <div className="form-row">
        <div className="form-group">
          <label>Email</label>
          <input
            type="email"
            name="email"
            value={formData.email || ""}
            onChange={onChange}
            placeholder="supplier@example.com"
          />
        </div>
        <div className="form-group">
          <label>Phone</label>
          <input
            type="text"
            name="phone"
            value={formData.phone || ""}
            onChange={onChange}
            placeholder="+92 3XX XXXXXXX"
          />
        </div>
      </div>
      <div className="form-row">
        <div className="form-group">
          <label>City</label>
          <input
            type="text"
            name="city"
            value={formData.city || ""}
            onChange={onChange}
            placeholder="e.g., Karachi"
          />
        </div>
        <div className="form-group">
          <label>Country</label>
          <input
            type="text"
            name="country"
            value={formData.country || "Pakistan"}
            onChange={onChange}
          />
        </div>
      </div>
      <div className="form-group">
        <label>Address</label>
        <textarea
          name="address"
          value={formData.address || ""}
          onChange={onChange}
          rows={2}
          placeholder="Full address..."
        />
      </div>
      <div className="form-row">
        <div className="form-group">
          <label>Tax Number (NTN/GST)</label>
          <input
            type="text"
            name="taxNumber"
            value={formData.taxNumber || ""}
            onChange={onChange}
          />
        </div>
        <div className="form-group">
          <label>Payment Terms</label>
          <input
            type="text"
            name="paymentTerms"
            value={formData.paymentTerms || ""}
            onChange={onChange}
            placeholder="e.g., Net 30"
          />
        </div>
      </div>
      <div className="form-group checkbox-group">
        <label style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <ToggleSwitch
            checked={formData.isActive !== false}
            onChange={(v) => set("isActive", v)}
          />
          Active
        </label>
      </div>
    </>
  );
}

function ConditionForm({ formData, onChange, set }) {
  return (
    <>
      <div className="form-group">
        <label>Condition Name *</label>
        <input
          type="text"
          name="name"
          value={formData.name || ""}
          onChange={onChange}
          required
          placeholder="e.g., New, Used, Certified Pre-Owned"
        />
      </div>
      <div className="form-group">
        <label>Description</label>
        <textarea
          name="description"
          value={formData.description || ""}
          onChange={onChange}
          rows={2}
          placeholder="Brief description..."
        />
      </div>
      <div className="form-group checkbox-group">
        <label style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <ToggleSwitch
            checked={formData.isActive !== false}
            onChange={(v) => set("isActive", v)}
          />
          Active
        </label>
      </div>
    </>
  );
}
