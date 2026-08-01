import React, { useCallback, useMemo, useRef, useState } from "react";
import { barcodeAPI } from "../../services/api";
import toast from "react-hot-toast";
import "../../styles/lineItems.css";

/**
 * Product picker for every sales document: a quotation, booking, sales order or
 * invoice may carry any mix of inventory vehicles and parts.
 *
 * Lines are held by the parent as the API shape:
 *   { itemType, vehicleId | partId, quantity, unitPrice, discountAmount, taxAmount, description }
 *
 * `requireInventoryVehicle` (bookings and later) forces a real inventory unit
 * rather than a catalogue variant, matching the server's own rule.
 */
const money = (value, code = "PKR") => {
  const number = Number(value);
  return Number.isFinite(number) ? `${code} ${number.toLocaleString("en-PK")}` : `${code} 0`;
};
const num = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const emptyLine = (itemType = "vehicle") => ({
  key: `${itemType}-${Math.random().toString(36).slice(2, 9)}`,
  itemType,
  vehicleId: "",
  vehicleVariantId: "",
  partId: "",
  quantity: 1,
  unitPrice: "",
  discountAmount: 0,
  taxAmount: 0,
  description: "",
});

function LineItemsEditor({
  value = [],
  onChange,
  vehicles = [],
  parts = [],
  variants = [],
  currencyCode = "PKR",
  requireInventoryVehicle = false,
  allowScan = true,
  disabled = false,
}) {
  const [scanCode, setScanCode] = useState("");
  const [scanning, setScanning] = useState(false);
  const scanRef = useRef(null);

  const lines = useMemo(
    () => (value || []).map((line, index) => ({ key: line.key || `line-${index}`, ...line })),
    [value],
  );

  const emit = useCallback((next) => { if (onChange) onChange(next); }, [onChange]);

  const addLine = (itemType) => emit([...lines, emptyLine(itemType)]);
  const removeLine = (key) => emit(lines.filter((line) => line.key !== key));
  const patchLine = (key, patch) =>
    emit(lines.map((line) => (line.key === key ? { ...line, ...patch } : line)));

  // Choosing a product fills its price so the user only overrides when they mean to.
  const chooseVehicle = (key, vehicleId) => {
    const vehicle = vehicles.find((item) => String(item.id) === String(vehicleId));
    patchLine(key, {
      vehicleId,
      vehicleVariantId: vehicle?.variant_id || "",
      unitPrice: vehicle?.selling_price ?? vehicle?.price ?? "",
      description: vehicle
        ? [vehicle.make_name, vehicle.model_name, vehicle.variant_name].filter(Boolean).join(" ")
        : "",
    });
  };
  const chooseVariant = (key, variantId) => {
    const variant = variants.find((item) => String(item.id) === String(variantId));
    patchLine(key, {
      vehicleVariantId: variantId,
      vehicleId: "",
      unitPrice: variant?.base_price ?? "",
      description: variant?.name || "",
    });
  };
  const choosePart = (key, partId) => {
    const part = parts.find((item) => String(item.id) === String(partId));
    patchLine(key, {
      partId,
      unitPrice: part?.selling_price ?? "",
      description: part ? `${part.name || part.part_name}${part.part_number ? ` (${part.part_number})` : ""}` : "",
    });
  };

  /** Scan or type a code: the server resolves it to a ready-made line. */
  const handleScan = async (event) => {
    event?.preventDefault();
    const code = scanCode.trim();
    if (!code || scanning) return;
    setScanning(true);
    try {
      const res = await barcodeAPI.scan(code);
      const found = res?.data?.data;
      if (!found?.lineItem) throw new Error("Not found");
      if (found.kind === "part" && !found.inStock) {
        toast.error(`${found.name} is out of stock`);
      }
      const incoming = found.lineItem;
      // Scanning the same part twice bumps its quantity instead of stacking
      // duplicate rows — that is what a counter operator expects.
      const existing = lines.find(
        (line) =>
          (incoming.partId && String(line.partId) === String(incoming.partId)) ||
          (incoming.vehicleId && String(line.vehicleId) === String(incoming.vehicleId)),
      );
      if (existing && incoming.partId) {
        patchLine(existing.key, { quantity: num(existing.quantity, 1) + 1 });
        toast.success(`${found.name} — quantity ${num(existing.quantity, 1) + 1}`);
      } else if (existing) {
        toast(`${found.name} is already on this document`);
      } else {
        emit([...lines, { key: `scan-${Date.now()}`, ...incoming }]);
        toast.success(`Added ${found.name}`);
      }
      setScanCode("");
      scanRef.current?.focus();
    } catch (err) {
      toast.error(err?.response?.data?.message || `Nothing matches "${code}"`);
    } finally {
      setScanning(false);
    }
  };

  const lineTotal = (line) =>
    num(line.unitPrice) * num(line.quantity, 1) - num(line.discountAmount) + num(line.taxAmount);
  const subtotal = lines.reduce((sum, line) => sum + num(line.unitPrice) * num(line.quantity, 1), 0);
  const totalDiscount = lines.reduce((sum, line) => sum + num(line.discountAmount), 0);
  const totalTax = lines.reduce((sum, line) => sum + num(line.taxAmount), 0);
  const grandTotal = subtotal - totalDiscount + totalTax;

  return (
    <div className="line-items">
      <div className="line-items-head">
        <label>Products *</label>
        <div className="line-items-add">
          <button type="button" className="btn-chip" onClick={() => addLine("vehicle")} disabled={disabled}>
            + Vehicle
          </button>
          <button type="button" className="btn-chip" onClick={() => addLine("part")} disabled={disabled}>
            + Part
          </button>
        </div>
      </div>

      {allowScan && (
        <div className="line-items-scan">
          <input
            ref={scanRef}
            type="text"
            value={scanCode}
            placeholder="Scan a barcode, or type a part code / chassis number"
            onChange={(event) => setScanCode(event.target.value)}
            onKeyDown={(event) => {
              // Handheld scanners send Enter after the code.
              if (event.key === "Enter") handleScan(event);
            }}
            disabled={disabled || scanning}
          />
          <button type="button" className="btn btn-secondary" onClick={handleScan} disabled={disabled || scanning || !scanCode.trim()}>
            {scanning ? "Looking up…" : "Add"}
          </button>
        </div>
      )}

      {lines.length === 0 ? (
        <p className="line-items-empty">
          No products yet — add a vehicle or a part, or scan a barcode.
        </p>
      ) : (
        <div className="line-items-table-wrap">
          <table className="line-items-table">
            <thead>
              <tr>
                <th style={{ width: 34 }}>#</th>
                <th>Product</th>
                <th style={{ width: 80 }}>Qty</th>
                <th style={{ width: 130 }}>Unit price</th>
                <th style={{ width: 110 }}>Discount</th>
                <th style={{ width: 110 }}>Tax</th>
                <th style={{ width: 130 }}>Amount</th>
                <th style={{ width: 40 }} />
              </tr>
            </thead>
            <tbody>
              {lines.map((line, index) => (
                <tr key={line.key}>
                  <td>{index + 1}</td>
                  <td>
                    <div className="line-items-product">
                      <span className={`line-type line-type-${line.itemType}`}>
                        {line.itemType === "part" ? "Part" : "Vehicle"}
                      </span>
                      {line.itemType === "part" ? (
                        <select
                          value={line.partId || ""}
                          onChange={(event) => choosePart(line.key, event.target.value)}
                          disabled={disabled}
                          required
                        >
                          <option value="">Select part</option>
                          {parts.map((part) => (
                            <option key={part.id} value={part.id}>
                              {part.name || part.part_name}
                              {part.part_number ? ` (${part.part_number})` : ""}
                              {part.current_stock != null ? ` — ${part.current_stock} in stock` : ""}
                            </option>
                          ))}
                        </select>
                      ) : requireInventoryVehicle || line.vehicleId || !variants.length ? (
                        <select
                          value={line.vehicleId || ""}
                          onChange={(event) => chooseVehicle(line.key, event.target.value)}
                          disabled={disabled}
                          required
                        >
                          <option value="">Select inventory vehicle</option>
                          {vehicles.map((vehicle) => (
                            <option key={vehicle.id} value={vehicle.id}>
                              {[vehicle.make_name, vehicle.model_name, vehicle.variant_name].filter(Boolean).join(" ")}
                              {vehicle.chassis_number ? ` — ${vehicle.chassis_number}` : ""}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <select
                          value={line.vehicleVariantId || ""}
                          onChange={(event) => chooseVariant(line.key, event.target.value)}
                          disabled={disabled}
                          required
                        >
                          <option value="">Select vehicle model</option>
                          {variants.map((variant) => (
                            <option key={variant.id} value={variant.id}>{variant.name}</option>
                          ))}
                        </select>
                      )}
                    </div>
                  </td>
                  <td>
                    <input
                      type="number"
                      min="1"
                      value={line.quantity}
                      // A vehicle is one physical unit — the server enforces this too.
                      disabled={disabled || line.itemType === "vehicle"}
                      onChange={(event) => patchLine(line.key, { quantity: event.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      min="0"
                      value={line.unitPrice}
                      disabled={disabled}
                      onChange={(event) => patchLine(line.key, { unitPrice: event.target.value })}
                      required
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      min="0"
                      value={line.discountAmount}
                      disabled={disabled}
                      onChange={(event) => patchLine(line.key, { discountAmount: event.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      min="0"
                      value={line.taxAmount}
                      disabled={disabled}
                      onChange={(event) => patchLine(line.key, { taxAmount: event.target.value })}
                    />
                  </td>
                  <td className="line-items-amount">{money(lineTotal(line), currencyCode)}</td>
                  <td>
                    <button
                      type="button"
                      className="line-items-remove"
                      onClick={() => removeLine(line.key)}
                      disabled={disabled}
                      aria-label="Remove line"
                      title="Remove"
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {lines.length > 0 && (
        <div className="line-items-summary">
          <div><span>Subtotal</span><strong>{money(subtotal, currencyCode)}</strong></div>
          {totalDiscount > 0 && <div><span>Line discounts</span><strong>- {money(totalDiscount, currencyCode)}</strong></div>}
          {totalTax > 0 && <div><span>Line tax</span><strong>{money(totalTax, currencyCode)}</strong></div>}
          <div className="line-items-grand">
            <span>{lines.length} product{lines.length === 1 ? "" : "s"}</span>
            <strong>{money(grandTotal, currencyCode)}</strong>
          </div>
        </div>
      )}
    </div>
  );
}

export { emptyLine };
export default LineItemsEditor;
