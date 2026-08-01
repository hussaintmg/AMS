import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { ScanLine, Trash2, X } from "lucide-react";
import { barcodeAPI, salesAPI, customerAPI } from "../services/api";
import useErpDocumentSettings from "../hooks/useErpDocumentSettings";
import SearchableSelect from "../components/SearchableSelect";
import "../styles/barcodeScan.css";

/**
 * Counter screen: scan products, pick a customer, enter what the customer hands
 * over, and create the document.
 *
 * The whole point is speed — the operator never types a per-product amount.
 * Scanning fills the basket and prices it; they enter one figure and the page
 * works out the change. That change is shown here and printed on the receipt,
 * and is never added to the amount paid.
 */
const DOCUMENTS = [
  { key: "quotation", label: "Quotation", hint: "An offer. No stock is touched." },
  { key: "booking", label: "Booking", hint: "Reserves vehicles. Parts stay in stock." },
  { key: "order", label: "Sales Order + Invoice", hint: "Invoices immediately — this is what moves stock." },
];

const num = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

function BarcodeScan() {
  const navigate = useNavigate();
  const { currency } = useErpDocumentSettings();
  const scanRef = useRef(null);

  const [docType, setDocType] = useState("order");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [basket, setBasket] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [customerId, setCustomerId] = useState("");
  const [amountReceived, setAmountReceived] = useState("");
  const [lastResult, setLastResult] = useState(null);
  const currencyCode = currency?.code || "PKR";

  useEffect(() => {
    (async () => {
      try {
        const res = await customerAPI.getAllForDropdown();
        setCustomers(res?.data?.data || []);
      } catch { /* the picker simply stays empty */ }
    })();
    scanRef.current?.focus();
  }, []);

  const money = useCallback(
    (value) => `${currencyCode} ${num(value).toLocaleString("en-PK")}`,
    [currencyCode],
  );

  const total = useMemo(
    () => basket.reduce((sum, row) => sum + num(row.unitPrice) * num(row.quantity, 1), 0),
    [basket],
  );
  const received = num(amountReceived);
  // Over-tender is normal at a counter; the surplus is change, not payment.
  const changeDue = Math.max(0, received - total);
  const balanceDue = Math.max(0, total - received);

  /** Resolve a scanned or typed code and add it to the basket. */
  const handleScan = async (event) => {
    event?.preventDefault();
    const value = code.trim();
    if (!value || busy) return;
    setBusy(true);
    try {
      const res = await barcodeAPI.scan(value);
      const found = res?.data?.data;
      if (!found?.lineItem) throw new Error("Not found");

      setBasket((current) => {
        const existing = current.find(
          (row) =>
            (found.lineItem.partId && row.partId === found.lineItem.partId) ||
            (found.lineItem.vehicleId && row.vehicleId === found.lineItem.vehicleId),
        );
        // Scanning the same part again bumps the quantity — the operator does
        // not have to open a field and type "2".
        if (existing && found.kind === "part") {
          toast.success(`${found.name} × ${existing.quantity + 1}`);
          return current.map((row) =>
            row === existing ? { ...row, quantity: row.quantity + 1 } : row,
          );
        }
        if (existing) {
          toast(`${found.name} is already in the basket`);
          return current;
        }
        if (found.kind === "part" && !found.inStock) toast.error(`${found.name} is out of stock`);
        toast.success(`Added ${found.name}`);
        return [
          ...current,
          {
            key: `${found.kind}-${found.id}`,
            kind: found.kind,
            name: found.name,
            code: found.code || found.barcode,
            available: found.available,
            quantity: 1,
            unitPrice: num(found.unitPrice),
            partId: found.lineItem.partId,
            vehicleId: found.lineItem.vehicleId,
            itemType: found.lineItem.itemType,
          },
        ];
      });
      setCode("");
    } catch (error) {
      toast.error(error?.response?.data?.message || `Nothing matches "${value}"`);
    } finally {
      setBusy(false);
      scanRef.current?.focus();
    }
  };

  const setQuantity = (key, quantity) =>
    setBasket((current) =>
      current.map((row) => (row.key === key ? { ...row, quantity: Math.max(1, num(quantity, 1)) } : row)),
    );
  const setPrice = (key, unitPrice) =>
    setBasket((current) => current.map((row) => (row.key === key ? { ...row, unitPrice } : row)));
  const removeRow = (key) => setBasket((current) => current.filter((row) => row.key !== key));
  const clearAll = () => { setBasket([]); setAmountReceived(""); setLastResult(null); };

  const lineItems = () =>
    basket.map((row) => ({
      itemType: row.itemType,
      partId: row.partId || undefined,
      vehicleId: row.vehicleId || undefined,
      quantity: num(row.quantity, 1),
      unitPrice: num(row.unitPrice),
    }));

  const submit = async () => {
    if (!customerId) { toast.error("Select a customer"); return; }
    if (!basket.length) { toast.error("Scan at least one product"); return; }
    setSaving(true);
    try {
      if (docType === "quotation") {
        const res = await salesAPI.createQuotation({
          customerId, lineItems: lineItems(), validityDays: 7,
        });
        setLastResult({ kind: "Quotation", number: res?.data?.data?.quotationNumber, id: res?.data?.data?.id });
        toast.success("Quotation created");
      } else if (docType === "booking") {
        const res = await salesAPI.createBooking({
          customerId, lineItems: lineItems(),
          bookingAmount: received || total, totalAmount: total,
        });
        setLastResult({ kind: "Booking", number: res?.data?.data?.bookingNumber, id: res?.data?.data?.id });
        toast.success("Booking created");
      } else {
        const res = await salesAPI.createDirectOrder({
          customerId, lineItems: lineItems(),
          paidAmount: received, paymentMode: "cash",
        });
        const data = res?.data?.data || {};
        setLastResult({
          kind: "Sales order",
          number: data.orderNumber,
          id: data.id,
          invoiceNumber: data.invoiceNumber,
          changeDue: num(data.changeDue),
        });
        toast.success(
          num(data.changeDue) > 0
            ? `Order created — return ${money(data.changeDue)}`
            : "Order created",
        );
      }
      setBasket([]);
      setAmountReceived("");
      scanRef.current?.focus();
    } catch (error) {
      toast.error(error?.response?.data?.message || "Could not create the document");
    } finally {
      setSaving(false);
    }
  };

  const activeDoc = DOCUMENTS.find((entry) => entry.key === docType);

  return (
    <div className="scan-page">
      <div className="page-header">
        <div className="header-content">
          <h1><ScanLine size={22} /> Barcode Scan</h1>
          <p>Scan products to build a quotation, booking or sale — no typing per product.</p>
        </div>
      </div>

      <div className="scan-layout">
        <section className="scan-main">
          <form className="scan-box" onSubmit={handleScan}>
            <input
              ref={scanRef}
              type="text"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="Scan a barcode, or type a part code / chassis number"
              autoComplete="off"
              disabled={busy}
            />
            <button type="submit" className="btn btn-primary" disabled={busy || !code.trim()}>
              {busy ? "Looking up…" : "Add"}
            </button>
          </form>

          {basket.length === 0 ? (
            <div className="scan-empty">
              <ScanLine size={40} />
              <p>Nothing scanned yet. The cursor stays in the box, so a handheld scanner just works.</p>
            </div>
          ) : (
            <div className="scan-table-wrap">
              <table className="scan-table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th style={{ width: 90 }}>Qty</th>
                    <th style={{ width: 140 }}>Unit price</th>
                    <th style={{ width: 140 }}>Amount</th>
                    <th style={{ width: 40 }} />
                  </tr>
                </thead>
                <tbody>
                  {basket.map((row) => (
                    <tr key={row.key}>
                      <td>
                        <span className={`scan-kind scan-kind-${row.kind}`}>{row.kind}</span>
                        <strong>{row.name}</strong>
                        {row.code && <small>{row.code}</small>}
                        {row.kind === "part" && row.available != null && (
                          <small className={row.quantity > row.available ? "scan-over" : ""}>
                            {row.available} in stock
                          </small>
                        )}
                      </td>
                      <td>
                        <input
                          type="number"
                          min="1"
                          value={row.quantity}
                          disabled={row.kind === "vehicle"}
                          onChange={(event) => setQuantity(row.key, event.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min="0"
                          value={row.unitPrice}
                          onChange={(event) => setPrice(row.key, event.target.value)}
                        />
                      </td>
                      <td className="scan-amount">{money(num(row.unitPrice) * num(row.quantity, 1))}</td>
                      <td>
                        <button type="button" className="scan-remove" onClick={() => removeRow(row.key)} aria-label="Remove">
                          <X size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <aside className="scan-side">
          <div className="scan-card">
            <label>Document</label>
            <div className="scan-doc-types">
              {DOCUMENTS.map((entry) => (
                <button
                  key={entry.key}
                  type="button"
                  className={`scan-doc ${docType === entry.key ? "active" : ""}`}
                  onClick={() => setDocType(entry.key)}
                >
                  {entry.label}
                </button>
              ))}
            </div>
            <p className="scan-hint">{activeDoc?.hint}</p>
          </div>

          <div className="scan-card">
            <label htmlFor="scan-customer">Customer *</label>
            <SearchableSelect
              id="scan-customer"
              name="customerId"
              value={customerId}
              onChange={(event) => setCustomerId(event.target.value)}
            >
              <option value="">Select customer</option>
              {customers.map((customer) => (
                <option key={customer.id || customer._id} value={customer.id || customer._id}>
                  {customer.companyName || customer.name ||
                    [customer.firstName, customer.lastName].filter(Boolean).join(" ")}
                  {customer.phone ? ` — ${customer.phone}` : ""}
                </option>
              ))}
            </SearchableSelect>
          </div>

          <div className="scan-card scan-totals">
            <div className="scan-total-row">
              <span>{basket.length} product{basket.length === 1 ? "" : "s"}</span>
              <strong>{money(total)}</strong>
            </div>

            {docType !== "quotation" && (
              <>
                <label htmlFor="scan-received">Amount received</label>
                <input
                  id="scan-received"
                  type="number"
                  min="0"
                  className="scan-received"
                  value={amountReceived}
                  onChange={(event) => setAmountReceived(event.target.value)}
                  placeholder="What the customer handed over"
                />
                {/* Only ever one of these two is meaningful. */}
                {changeDue > 0 ? (
                  <div className="scan-change">
                    <span>Change to return</span>
                    <strong>{money(changeDue)}</strong>
                  </div>
                ) : balanceDue > 0 && received > 0 ? (
                  <div className="scan-balance">
                    <span>Balance due</span>
                    <strong>{money(balanceDue)}</strong>
                  </div>
                ) : null}
              </>
            )}

            <button
              type="button"
              className="btn btn-primary scan-submit"
              onClick={submit}
              disabled={saving || !basket.length || !customerId}
            >
              {saving ? "Creating…" : `Create ${activeDoc?.label}`}
            </button>
            <button type="button" className="btn btn-secondary" onClick={clearAll} disabled={saving || !basket.length}>
              <Trash2 size={15} /> Clear
            </button>
          </div>

          {lastResult && (
            <div className="scan-card scan-result">
              <strong>{lastResult.kind} {lastResult.number}</strong>
              {lastResult.invoiceNumber && <div>Invoice {lastResult.invoiceNumber}</div>}
              {lastResult.changeDue > 0 && (
                <div className="scan-result-change">Change returned: {money(lastResult.changeDue)}</div>
              )}
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => navigate(docType === "quotation" ? "/sales?tab=quotations" : docType === "booking" ? "/sales?tab=bookings" : "/sales?tab=orders")}
              >
                Open in Sales
              </button>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

export default BarcodeScan;
