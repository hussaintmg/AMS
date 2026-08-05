import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import { Camera, Keyboard, PackageSearch, ScanLine, Search, Trash2, UserRound, X } from "lucide-react";
import { barcodeAPI, salesAPI, partsSalesAPI, customerAPI } from "../services/api";
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
 *
 * There is one of these per side of the business. `category` comes from the
 * URL (/vehicle-sales/barcode-scan or /parts-sales/barcode-scan) and decides what a scan
 * may resolve to and which collection the document lands in — a vehicle code
 * scanned at the parts counter is reported as not found rather than quietly
 * basketed. `?doc=quotation|booking|order` preselects the document, so arriving
 * from the Quotations screen starts a quotation.
 */
const CATEGORY = {
  vehicle: {
    key: "vehicle",
    kind: "vehicle",
    label: "Vehicle",
    basePath: "/vehicle-sales",
    api: salesAPI,
    lead: "Scan a chassis number or barcode to build a quotation, booking or sale.",
    searchPlaceholder: "Search by name or chassis number",
    scanPlaceholder: "Scan a barcode, or type a chassis number",
    documents: [
      { key: "quotation", label: "Quotation", hint: "An offer. Nothing is reserved." },
      { key: "booking", label: "Booking", hint: "Reserves the vehicles for this customer." },
      { key: "order", label: "Sales Order + Invoice", hint: "Invoices immediately — this is what marks vehicles sold." },
    ],
  },
  parts: {
    key: "parts",
    kind: "part",
    label: "Parts",
    basePath: "/parts-sales",
    api: partsSalesAPI,
    lead: "Scan a part barcode to build a quotation or a counter sale.",
    searchPlaceholder: "Search by name or part code",
    scanPlaceholder: "Scan a barcode, or type a part code",
    // The parts flow is quotation → invoice only; a counter sale invoices
    // immediately. There are no bookings on this side.
    documents: [
      { key: "quotation", label: "Quotation", hint: "An offer. No stock is touched." },
      { key: "order", label: "Invoice (Counter Sale)", hint: "Invoices immediately — this is what takes stock off the shelf." },
    ],
  },
};

/** Where each created document can be opened. */
const LIST_PATH = { quotation: "quotations", booking: "booking", order: "orders" };

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

function BarcodeScan({ category = "vehicle" }) {
  const config = CATEGORY[category] || CATEGORY.vehicle;
  const isParts = config.key === "parts";
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { currency } = useErpDocumentSettings();
  const scanRef = useRef(null);
  // Lookups run one after another on this chain. The camera can accept a new
  // scan while the previous lookup is still on the wire; queueing it — instead
  // of dropping it — means every beep the operator hears ends up in the basket.
  const queueRef = useRef(Promise.resolve());
  const pendingRef = useRef(0);
  // Mirror of the basket, so adding a product needs no state updater. See addFound.
  const basketRef = useRef([]);

  // Arriving from Quotations should start a quotation, not the default sale.
  const requestedDoc = searchParams.get("doc");
  const [docType, setDocType] = useState(
    config.documents.some((entry) => entry.key === requestedDoc) ? requestedDoc : "order",
  );
  const [mode, setMode] = useState("keyboard");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [basket, setBasket] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [customerId, setCustomerId] = useState("");
  // A counter mostly serves people who are not on the customer list.
  const [walkIn, setWalkIn] = useState(false);
  const [walkInName, setWalkInName] = useState("");
  const [walkInPhone, setWalkInPhone] = useState("");
  const [amountReceived, setAmountReceived] = useState("");
  const [lastResult, setLastResult] = useState(null);

  const [query, setQuery] = useState("");
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
    // The lookup is already scoped to this counter's kind; this catches a stale
    // result and keeps a vehicle out of a parts document either way.
    if (isPart !== (config.kind === "part")) {
      toast.error(`${found.name} is not a ${config.label.toLowerCase()} product`);
      return;
    }
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

    if (available === 0) {
      // Sold, dispatched or delivered for a vehicle; nothing left on the shelf
      // for a part. Either way it cannot go on a new document.
      toast.error(isPart
        ? `${found.name} is out of stock`
        : `${found.name} is not available (${found.status || "already sold"})`);
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
  }, [config.kind, config.label]);

  /** Resolve a code — from the scanner box or the camera — and basket it. */
  const resolveCode = useCallback((value) => {
    const trimmed = String(value || "").trim();
    if (!trimmed) return Promise.resolve();
    pendingRef.current += 1;
    setBusy(true);
    const run = queueRef.current.then(async () => {
      try {
        const res = await barcodeAPI.scan(trimmed, config.kind);
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
  }, [addFound, config.kind]);

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
        // Only what the counter can actually hand over: parts with stock left,
        // and vehicles that have not been sold, dispatched or delivered.
        const res = await barcodeAPI.search({ q: query.trim(), kind: config.kind, limit: 30 });
        if (live) setResults(res?.data?.data || []);
      } catch {
        if (live) setResults([]);
      } finally {
        if (live) setSearching(false);
      }
    }, 300);
    return () => { live = false; clearTimeout(timer); };
  }, [mode, query, config.kind]);

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

  /** The buyer, however they were identified. */
  const buyer = () => (walkIn
    ? { walkIn: true, walkInName: walkInName.trim(), walkInPhone: walkInPhone.trim() }
    : { customerId });

  const submit = async () => {
    if (!walkIn && !customerId) { toast.error("Select a customer, or switch to walk-in"); return; }
    if (!basket.length) { toast.error("Add at least one product"); return; }
    const overStock = basket.find((row) => row.kind === "part" && num(row.quantity, 1) > num(row.available));
    if (overStock) {
      toast.error(`Only ${overStock.available} ${overStock.name} in stock`);
      return;
    }
    setSaving(true);
    try {
      const api = config.api;
      if (docType === "quotation") {
        const res = await api.createQuotation({
          ...buyer(), lineItems: lineItems(), validityDays: 7,
        });
        setLastResult({ kind: "Quotation", doc: "quotation", number: res?.data?.data?.quotationNumber, id: res?.data?.data?.id });
        toast.success("Quotation created");
      } else if (docType === "booking") {
        const res = await api.createBooking({
          ...buyer(), lineItems: lineItems(),
          bookingAmount: received || total, totalAmount: total,
        });
        setLastResult({ kind: "Booking", doc: "booking", number: res?.data?.data?.bookingNumber, id: res?.data?.data?.id });
        toast.success("Booking created");
      } else {
        const res = await api.createDirectOrder({
          ...buyer(), lineItems: lineItems(),
          paidAmount: received, paymentMode: "cash",
        });
        const data = res?.data?.data || {};
        setLastResult({
          kind: "Sales order",
          doc: "order",
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

  const activeDoc = config.documents.find((entry) => entry.key === docType);
  const activeMode = MODES.find((entry) => entry.key === mode);
  const inBasket = (item) =>
    basket.some((row) => row.partId === item.lineItem?.partId && row.vehicleId === item.lineItem?.vehicleId);

  return (
    <div className="scan-page">
      <div className="page-header">
        <div className="header-content">
          <h1><ScanLine size={22} /> {config.label} Scan</h1>
          <p>{config.lead}</p>
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
                placeholder={config.scanPlaceholder}
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
                    placeholder={config.searchPlaceholder}
                    autoComplete="off"
                  />
                </span>
              </div>

              {searching && !results.length ? (
                <p className="scan-note">Searching…</p>
              ) : results.length === 0 ? (
                <p className="scan-note">
                  {isParts
                    ? "No parts with stock match that search."
                    : "No available vehicles match that search — sold and dispatched units are not listed."}
                </p>
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
                box; no scanner at the counter means Camera or Browse. Only {isParts ? "parts" : "vehicles"} can
                be added here.
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
              {config.documents.map((entry) => (
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
            <div className="scan-customer-head">
              <label htmlFor="scan-customer">{walkIn ? "Walk-in customer" : "Customer *"}</label>
              {/* Most counter buyers are not on the customer list; the sale is
                  still booked against the one shared walk-in record. */}
              <label className="scan-walkin">
                <input type="checkbox" checked={walkIn} onChange={(event) => setWalkIn(event.target.checked)} />
                <UserRound size={13} /> Walk-in
              </label>
            </div>
            {walkIn ? (
              <div className="scan-walkin-fields">
                <input
                  type="text"
                  value={walkInName}
                  onChange={(event) => setWalkInName(event.target.value)}
                  placeholder="Buyer's name (optional)"
                />
                <input
                  type="text"
                  value={walkInPhone}
                  onChange={(event) => setWalkInPhone(event.target.value)}
                  placeholder="Phone (optional)"
                />
              </div>
            ) : (
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
            )}
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
              disabled={saving || !basket.length || (!walkIn && !customerId)}
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
              {/* Open the document that was just created, on the right side of
                  the business, searched by its own number. */}
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => navigate(
                  `${config.basePath}/${LIST_PATH[lastResult.doc] || "orders"}?search=${encodeURIComponent(lastResult.number || "")}`,
                )}
              >
                Open {lastResult.kind.toLowerCase()}
              </button>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

export default BarcodeScan;
