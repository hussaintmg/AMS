import React, { useState } from "react";
import { Barcode } from "lucide-react";
import toast from "react-hot-toast";
import { barcodeAPI } from "../services/api";
import Modal from "./Modal";

/**
 * Print barcode labels for every selected part or vehicle in one pass.
 *
 * Labelling a delivery one product at a time is the slow part of receiving
 * stock, so this takes the inventory screen's existing row selection and turns
 * it into a single sheet. Anything selected that has no barcode yet is assigned
 * one by the server, exactly as opening a single label does.
 *
 * `copies` is per product: a shelf usually needs one label per physical unit,
 * not one per product line.
 */
function BarcodeBulkPrint({ kind, ids = [], disabled = false }) {
  const [open, setOpen] = useState(false);
  const [copies, setCopies] = useState(1);
  const [busy, setBusy] = useState(false);

  const print = async () => {
    if (!ids.length) return;
    setBusy(true);
    // Opened before the request, not after: a pop-up blocker rejects any window
    // opened once the await has broken the user-gesture chain.
    const win = window.open("", "_blank", "width=900,height=700");
    if (!win) {
      setBusy(false);
      toast.error("Allow pop-ups to print the labels");
      return;
    }
    win.document.write("<p style='font:14px Arial;padding:16px'>Building labels…</p>");
    try {
      const token =
        localStorage.getItem("token") || sessionStorage.getItem("token");
      const res = await fetch(barcodeAPI.labelsUrl(kind), {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ ids, copies: Number(copies) || 1 }),
      });
      if (!res.ok) {
        // The server sends JSON on failure and HTML on success.
        const problem = await res.json().catch(() => null);
        throw new Error(problem?.message || `Request failed (${res.status})`);
      }
      const html = await res.text();
      win.document.open();
      win.document.write(html);
      win.document.close();
      setOpen(false);
    } catch (error) {
      win.close();
      toast.error(error.message || "Could not build the labels");
    } finally {
      setBusy(false);
    }
  };

  const total = ids.length * (Number(copies) || 1);

  return (
    <>
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        onClick={() => setOpen(true)}
        disabled={disabled || !ids.length}
        title={`Print barcode labels for ${ids.length} selected record(s)`}
      >
        <Barcode size={15} style={{ marginRight: 5, verticalAlign: "middle" }} />
        Print Barcodes
      </button>

      {open && (
        <Modal
          onClose={() => !busy && setOpen(false)}
          title={`Print barcode labels — ${ids.length} selected`}
          closeOnEscape
          closeOnBackdrop
        >
          <div style={{ padding: "4px 2px" }}>
            <div className="form-group">
              <label htmlFor="barcode-copies">Copies of each label</label>
              <input
                id="barcode-copies"
                type="number"
                min="1"
                max="50"
                value={copies}
                onChange={(event) => setCopies(event.target.value)}
                disabled={busy}
              />
              <small style={{ color: "#64748b" }}>
                One label per physical unit is usual — 3 copies of 10 products prints 30 labels.
              </small>
            </div>
            <p style={{ color: "#475569", fontSize: "0.85rem" }}>
              {total} label{total === 1 ? "" : "s"} will open in a new tab, ready to print.
              Anything without a barcode gets one now.
            </p>
            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setOpen(false)}
                disabled={busy}
              >
                Cancel
              </button>
              <button type="button" className="btn btn-primary" onClick={print} disabled={busy}>
                {busy ? "Building…" : "Open labels"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

export default BarcodeBulkPrint;
