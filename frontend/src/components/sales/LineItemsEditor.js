import React, { useCallback, useMemo, useRef } from "react";
import "../../styles/lineItems.css";

/**
 * Product picker for every sales document: a quotation, booking, sales order or
 * invoice. Any number of products may be added.
 *
 * `category` decides what may go on the document, matching the URL the form was
 * opened from and the server's own rule: a document under /vehicles takes
 * vehicles only, one under /parts takes parts only. A vehicle is one physical
 * unit so its quantity is fixed at 1; a part carries a real quantity that
 * cannot exceed what is on the shelf.
 *
 * Products are chosen straight from the vehicle and part lists. There is
 * deliberately no barcode box here — scanning belongs to the counter screen
 * (the Barcode Scan page), while these forms are filled in by picking.
 *
 * Lines are held by the parent as the API shape:
 *   { itemType, vehicleId | partId, quantity, unitPrice, discountAmount, taxAmount, description }
 *
 * `requireInventoryVehicle` (bookings and later) forces a real inventory unit
 * rather than a catalogue variant, matching the server's own rule.
 */
// Two decimals always: a price may carry paisa, and a column that prints
// "1,250" beside "1,250.5" reads like two different kinds of number.
const money = (value, code = "PKR") => {
  const number = Number(value);
  return Number.isFinite(number)
    ? `${code} ${number.toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : `${code} 0.00`;
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
  disabled = false,
  category = "vehicle",
}) {
  const isParts = category === "parts";
  const lineType = isParts ? "part" : "vehicle";
  const stockOf = (partId) => {
    const part = parts.find((item) => String(item.id) === String(partId));
    const stock = Number(part?.current_stock);
    return Number.isFinite(stock) ? stock : null;
  };
  const lines = useMemo(
    () => (value || []).map((line, index) => ({ key: line.key || `line-${index}`, ...line })),
    [value],
  );

  // Mirrors the lines so a handler can append to what was last emitted rather
  // than to the array this render closed over — two quick clicks on "+ Part"
  // would otherwise both build on the same list and only add one row.
  const linesRef = useRef(lines);
  linesRef.current = lines;

  const emit = useCallback((next) => {
    linesRef.current = next;
    if (onChange) onChange(next);
  }, [onChange]);

  const addLine = () => emit([...linesRef.current, emptyLine(lineType)]);
  const removeLine = (key) => emit(linesRef.current.filter((line) => line.key !== key));
  const patchLine = (key, patch) =>
    emit(linesRef.current.map((line) => (line.key === key ? { ...line, ...patch } : line)));

  /**
   * Stock is the hard ceiling on a part line. Typing 50 when 6 are left would
   * only fail on save, so it is clamped here and the row says why.
   */
  const setQuantity = (key, raw) => {
    const line = linesRef.current.find((entry) => entry.key === key);
    if (!line) return;
    if (raw === "") return patchLine(key, { quantity: "" });
    const stock = stockOf(line.partId);
    const wanted = Math.max(1, num(raw, 1));
    patchLine(key, { quantity: stock == null ? wanted : Math.min(wanted, Math.max(0, stock)) });
  };

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
    const stock = stockOf(partId);
    const current = linesRef.current.find((line) => line.key === key);
    patchLine(key, {
      partId,
      unitPrice: part?.selling_price ?? "",
      // Switching to a part with less on the shelf must not leave the old,
      // now-impossible quantity behind.
      quantity: stock == null ? num(current?.quantity, 1) : Math.min(Math.max(1, num(current?.quantity, 1)), Math.max(1, stock)),
      description: part ? `${part.name || part.part_name}${part.part_number ? ` (${part.part_number})` : ""}` : "",
    });
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
        <label>{isParts ? "Parts *" : "Vehicles *"}</label>
        <div className="line-items-add">
          <button type="button" className="btn-chip" onClick={addLine} disabled={disabled}>
            {isParts ? "+ Part" : "+ Vehicle"}
          </button>
        </div>
      </div>

      {lines.length === 0 ? (
        <p className="line-items-empty">
          {isParts
            ? "No parts yet — add as many as the customer is buying."
            : "No vehicles yet — add one or more."}
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
                      <span className={`line-type line-type-${isParts ? "part" : "vehicle"}`}>
                        {isParts ? "Part" : "Vehicle"}
                      </span>
                      {isParts ? (
                        <select
                          value={line.partId || ""}
                          onChange={(event) => choosePart(line.key, event.target.value)}
                          disabled={disabled}
                          required
                        >
                          <option value="">Select part</option>
                          {/* A saved line may point at a part the (limited)
                              list did not include — without its own option the
                              select would silently show the placeholder. */}
                          {line.partId &&
                            !parts.some((part) => String(part.id) === String(line.partId)) && (
                            <option value={line.partId}>
                              {line.description || "Saved part"}
                            </option>
                          )}
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
                          {/* The vehicle list is fetched with a limit (and on
                              orders filtered to in-stock statuses), so the
                              vehicle already on a saved document is often not
                              in it — its name still has to show. */}
                          {line.vehicleId &&
                            !vehicles.some((vehicle) => String(vehicle.id) === String(line.vehicleId)) && (
                            <option value={line.vehicleId}>
                              {line.description || "Saved vehicle"}
                            </option>
                          )}
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
                    {isParts ? (
                      <>
                        <input
                          type="number"
                          min="1"
                          max={stockOf(line.partId) ?? undefined}
                          value={line.quantity}
                          disabled={disabled}
                          onChange={(event) => setQuantity(line.key, event.target.value)}
                        />
                        {line.partId && stockOf(line.partId) != null && (
                          <small className="line-items-stock">{stockOf(line.partId)} in stock</small>
                        )}
                      </>
                    ) : (
                      // A vehicle is one physical unit — the server enforces this too.
                      <input type="number" value={1} disabled readOnly />
                    )}
                  </td>
                  <td>
                    <input
                      type="number" step="0.01"
                      min="0"
                      value={line.unitPrice}
                      disabled={disabled}
                      onChange={(event) => patchLine(line.key, { unitPrice: event.target.value })}
                      required
                    />
                  </td>
                  <td>
                    <input
                      type="number" step="0.01"
                      min="0"
                      value={line.discountAmount}
                      disabled={disabled}
                      onChange={(event) => patchLine(line.key, { discountAmount: event.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      type="number" step="0.01"
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
