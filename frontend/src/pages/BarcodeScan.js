import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { Camera, Keyboard, PackageSearch, ScanLine, Search, Trash2, X } from "lucide-react";
import { barcodeAPI, salesAPI, customerAPI } from "../services/api";
import useErpDocumentSettings from "../hooks/useErpDocumentSettings";
import SearchableSelect from "../components/SearchableSelect";
import CameraScanner from "../components/CameraScanner";
import "../styles/barcodeScan.css";

/**
 * Counter screen: put products in a basket, pick a customer, enter what the
 * customer hands over, and create the document.
 *
 * The whole point is speed — the operator never types a per-product amount.
 * Adding a product prices it; they enter one figure and the page works out the
 * change. That change is shown here and printed on the receipt, and is never
 * added to the amount paid.
 *
 * Products get in three ways, because not every counter has the same kit:
 * a handheld scanner typing into the box, the device camera, or a plain
 * product search for stock whose label is missing or unreadable.
 */
const DOCUMENTS = [
  { key: "quotation", label: "Quotation", hint: "An offer. No stock is touched." },
  { key: "booking", label: "Booking", hint: "Reserves vehicles. Parts stay in stock." },
  { key: "order", label: "Sales Order + Invoice", hint: "Invoices immediately — this is what moves stock." },
];

const MODES = [
  { key: "keyboard", label: "Scanner", icon: Keyboard, hint: "Handheld scanner or typed code" },
  { key: "camera", label: "Camera", icon: Camera, hint: "Use this device's camera" },
  { key: "browse", label: "Browse", icon: PackageSearch, hint: "Pick a product from stock" },
];

const CAMERA_SCAN_COOLDOWN_MS = 2000;

const num = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

function BarcodeScan() {
  const navigate = useNavigate();
  const { currency } = useErpDocumentSettings();
  const scanRef = useRef(null);
  // Lookups run one after another on this chain. The camera can accept a new
  // scan while the previous lookup is still on the wire; queueing it — instead
  // of dropping it — means every beep the operator hears ends up in the basket.
  const queueRef = useRef(Promise.resolve());
  const pendingRef = useRef(0);
  // Mirror of the basket, so adding a product needs no state updater. See addFound.
  const basketRef = useRef([]);

  const [docType, setDocType] = useState("order");
  const [mode, setMode] = useState("keyboard");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [basket, setBasket] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [customerId, setCustomerId] = useState("");
  const [amountReceived, setAmountReceived] = useState("");
  const [lastResult, setLastResult] = useState(null);

  const [query, setQuery] = useState("");
  const [queryKind, setQueryKind] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);

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

  // Quantity edits, removals and clearing all go through setBasket, so re-point
  // the mirror at whatever the basket actually became.
  useEffect(() => { basketRef.current = basket; }, [basket]);

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

  /**
   * Put a resolved product in the basket, however it was found.
   *
   * The basket is mirrored in a ref so the decision — new row or bump the
   * quantity — and its toast happen here rather than inside a state updater:
   * React may run an updater while rendering, and a toast fired from there
   * updates the toaster mid-render. The ref is also written synchronously, so
   * two scans in quick succession still see each other.
   */
  const addFound = useCallback((found) => {
    if (!found?.lineItem) return;
    const current = basketRef.current;
    // partId/itemType are the authoritative API fields. Some older API
    // responses used a different `kind` value, which incorrectly sent an
    // existing part through the vehicle-only "already in basket" branch.
    const isPart = Boolean(found.lineItem.partId) ||
      String(found.lineItem.itemType || found.kind).toLowerCase() === "part";
    const available = Math.max(0, num(found.available));
    const existing = current.find(
      (row) =>
        (found.lineItem.partId && String(row.partId) === String(found.lineItem.partId)) ||
        (found.lineItem.vehicleId && String(row.vehicleId) === String(found.lineItem.vehicleId)),
    );

    // Scanning the same part again bumps the quantity — the operator does not
    // have to open a field and type "2".
    if (existing && isPart) {
      if (num(existing.quantity, 1) >= available) {
        toast.error(`Only ${available} ${found.name} in stock`);
        return;
      }
      const quantity = num(existing.quantity, 1) + 1;
      const next = current.map((row) =>
        row.key === existing.key ? { ...row, quantity, available } : row,
      );
      basketRef.current = next;
      setBasket(next);
      toast.success(`${found.name} × ${quantity}`);
      return;
    }
    if (existing) {
      toast(`${found.name} is already in the basket`);
      return;
    }

    if (isPart && available === 0) {
      toast.error(`${found.name} is out of stock`);
      return;
    }
    const next = [
      ...current,
      {
        key: `${isPart ? "part" : "vehicle"}-${found.id}`,
        kind: isPart ? "part" : "vehicle",
        name: found.name,
        code: found.code || found.barcode,
        available,
        quantity: 1,
        unitPrice: num(found.unitPrice),
        partId: found.lineItem.partId,
        vehicleId: found.lineItem.vehicleId,
        itemType: found.lineItem.itemType,
      },
    ];
    basketRef.current = next;
    setBasket(next);
    toast.success(`Added ${found.name}`);
  }, []);

  /** Resolve a code — from the scanner box or the camera — and basket it. */
  const resolveCode = useCallback((value) => {
    const trimmed = String(value || "").trim();
    if (!trimmed) return Promise.resolve();
    pendingRef.current += 1;
    setBusy(true);
    const run = queueRef.current.then(async () => {
      try {
        const res = await barcodeAPI.scan(trimmed);
        const found = res?.data?.data;
        if (!found?.lineItem) throw new Error("Not found");
        addFound(found);
        setCode("");
      } catch (error) {
        toast.error(error?.response?.data?.message || `Nothing matches "${trimmed}"`);
      } finally {
        pendingRef.current -= 1;
        if (pendingRef.current === 0) setBusy(false);
      }
    });
    queueRef.current = run;
    return run;
  }, [addFound]);

  const handleScan = async (event) => {
    event?.preventDefault();
    await resolveCode(code);
    scanRef.current?.focus();
  };

  // Browse tab: debounced so typing does not fire a request per keystroke.
  useEffect(() => {
    if (mode !== "browse") return undefined;
    let live = true;
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const res = await barcodeAPI.search({ q: query.trim(), kind: queryKind || undefined, limit: 30 });
        if (live) setResults(res?.data?.data || []);
      } catch {
        if (live) setResults([]);
      } finally {
        if (live) setSearching(false);
      }
    }, 300);
    return () => { live = false; clearTimeout(timer); };
  }, [mode, query, queryKind]);

  const chooseMode = (next) => {
    setMode(next);
    if (next === "keyboard") setTimeout(() => scanRef.current?.focus(), 0);
  };

  const setQuantity = (key, quantity) => {
    const current = basketRef.current;
    const row = current.find((item) => item.key === key);
    if (!row) return;
    const requested = Math.max(1, num(quantity, 1));
    const nextQuantity = row.kind === "part"
      ? Math.min(requested, Math.max(1, num(row.available, 1)))
      : 1;
    if (requested > nextQuantity) toast.error(`Only ${row.available} ${row.name} in stock`);
    const next = current.map((item) =>
      item.key === key ? { ...item, quantity: nextQuantity } : item,
    );
    basketRef.current = next;
    setBasket(next);
  };
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
    if (!basket.length) { toast.error("Add at least one product"); return; }
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
  const activeMode = MODES.find((entry) => entry.key === mode);
  const inBasket = (item) =>
    basket.some((row) => row.partId === item.lineItem?.partId && row.vehicleId === item.lineItem?.vehicleId);

  return (
    <div className="scan-page">
      <div className="page-header">
        <div className="header-content">
          <h1><ScanLine size={22} /> Barcode Scan</h1>
          <p>Build a quotation, booking or sale by scanning — or pick products straight from stock.</p>
        </div>
      </div>

      <div className="scan-layout">
        <section className="scan-main">
          <div className="scan-modes" role="tablist" aria-label="How to add products">
            {MODES.map((entry) => {
              const Icon = entry.icon;
              return (
                <button
                  key={entry.key}
                  type="button"
                  role="tab"
                  aria-selected={mode === entry.key}
                  className={`scan-mode ${mode === entry.key ? "active" : ""}`}
                  onClick={() => chooseMode(entry.key)}
                >
                  <Icon size={16} />
                  {entry.label}
                </button>
              );
            })}
            <span className="scan-mode-hint">{activeMode?.hint}</span>
          </div>

          {mode === "keyboard" && (
            <form className="scan-box" onSubmit={handleScan}>
              <ScanLine size={18} className="scan-box-icon" />
              {/* Never disabled while looking up: a handheld scanner fires the
                  next code immediately, and a disabled input would eat it. The
                  queue in resolveCode handles overlapping lookups. */}
              <input
                ref={scanRef}
                type="text"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                placeholder="Scan a barcode, or type a part code / chassis number"
                autoComplete="off"
              />
              <button type="submit" className="btn btn-primary" disabled={!code.trim()}>
                {busy ? "Looking up…" : "Add"}
              </button>
            </form>
          )}

          {mode === "camera" && (
            <div className="scan-camera">
              <CameraScanner
                onDetected={resolveCode}
                pauseMs={CAMERA_SCAN_COOLDOWN_MS}
                onClose={() => chooseMode("keyboard")}
              />
              {busy && <p className="scan-note">Looking up the code…</p>}
            </div>
          )}

          {mode === "browse" && (
            <div className="scan-browse">
              <div className="scan-browse-bar">
                <span className="scan-browse-search">
                  <Search size={16} />
                  <input
                    type="text"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search by name, part code or chassis number"
                    autoComplete="off"
                  />
                </span>
                <select value={queryKind} onChange={(event) => setQueryKind(event.target.value)} aria-label="Product type">
                  <option value="">All products</option>
                  <option value="part">Parts only</option>
                  <option value="vehicle">Vehicles only</option>
                </select>
              </div>

              {searching && !results.length ? (
                <p className="scan-note">Searching…</p>
              ) : results.length === 0 ? (
                <p className="scan-note">No products match that search.</p>
              ) : (
                <ul className="scan-results">
                  {results.map((item) => (
                    <li key={`${item.kind}-${item.id}`}>
                      <button
                        type="button"
                        onClick={() => addFound(item)}
                        // A part already in the basket can be clicked again to
                        // bump its quantity; only a vehicle is one-of-a-kind.
                        disabled={item.kind === "vehicle" && inBasket(item)}
                      >
                        <span className={`scan-kind scan-kind-${item.kind}`}>{item.kind}</span>
                        <span className="scan-result-name">
                          <strong>{item.name}</strong>
                          <small>
                            {item.code || item.barcode || "no code"}
                            {item.kind === "part" ? ` · ${item.available} in stock` : item.status ? ` · ${item.status}` : ""}
                          </small>
                        </span>
                        <span className="scan-result-price">{money(item.unitPrice)}</span>
                        <span className="scan-result-add">
                          {inBasket(item) ? (item.kind === "part" ? "+ 1" : "Added") : "Add"}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {basket.length === 0 ? (
            <div className="scan-empty">
              <ScanLine size={40} />
              <p>
                Nothing in the basket yet. A handheld scanner types straight into the Scanner
                box; no scanner at the counter means Camera or Browse.
              </p>
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
