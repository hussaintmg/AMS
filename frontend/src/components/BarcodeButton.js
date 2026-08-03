import React, { useState } from "react";
import { Barcode } from "lucide-react";
import toast from "react-hot-toast";
import { barcodeAPI } from "../services/api";
import Modal from "./Modal";

/**
 * Barcode action for one inventory record (a part or a vehicle).
 *
 * Opens a preview of the record's Code 128 barcode with buttons to save it as
 * an SVG or open a printable label. The code is assigned on demand, so stock
 * that predates barcodes becomes scannable the first time anyone looks at it.
 */
function BarcodeButton({
  kind,
  id,
  code,
  label = "",
  subtitle = "",
  onAssigned,
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [barcode, setBarcode] = useState(code || "");
  const [svg, setSvg] = useState("");

  const authFetch = async (url) => {
    const token =
      localStorage.getItem("token") || sessionStorage.getItem("token");
    const res = await fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      credentials: "include",
    });
    if (!res.ok) throw new Error(`Request failed (${res.status})`);
    return res;
  };

  const openPreview = async () => {
    setOpen(true);
    setLoading(true);
    try {
      // Assign-or-return: a record with no barcode gets one here.
      const assigned = await barcodeAPI.assign(kind, id);
      const value = assigned?.data?.data?.barcode || "";
      setBarcode(value);
      if (value && value !== code && onAssigned) onAssigned(value);
      const res = await authFetch(barcodeAPI.svgUrl(kind, id));
      setSvg(await res.text());
    } catch (error) {
      toast.error(
        error?.response?.data?.message || "Could not build the barcode",
      );
      setOpen(false);
    } finally {
      setLoading(false);
    }
  };

  const downloadSvg = async () => {
    try {
      const res = await authFetch(barcodeAPI.svgUrl(kind, id, true));
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${barcode || kind}.svg`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success("Barcode downloaded");
    } catch (error) {
      toast.error("Could not download the barcode");
    }
  };

  const printLabel = async () => {
    try {
      const res = await authFetch(barcodeAPI.labelUrl(kind, id));
      const html = await res.text();
      // The label arrives as a full document; hand it to a new window so the
      // browser's own print dialog handles paper size.
      const win = window.open("", "_blank", "width=520,height=420");
      if (!win) {
        toast.error("Allow pop-ups to print the label");
        return;
      }
      win.document.write(html);
      win.document.close();
    } catch (error) {
      toast.error("Could not open the label");
    }
  };

  return (
    <>
      <button
        type="button"
        className="btn-icon btn-icon-info"
        onClick={(event) => {
          event.stopPropagation();
          openPreview();
        }}
        title={code ? `Barcode ${code}` : "Generate barcode"}
        aria-label="Barcode"
      >
        <Barcode size={16} />
      </button>

      {open && (
        <Modal
          onClose={() => setOpen(false)}
          title={`Barcode — ${label || barcode || ""}`}
          closeOnEscape
          closeOnBackdrop
        >
          <div style={{ textAlign: "center", padding: "8px 4px" }}>
            {subtitle && (
              <p
                style={{
                  color: "#64748b",
                  fontSize: "0.85rem",
                  margin: "0 0 10px",
                }}
              >
                {subtitle}
              </p>
            )}
            {loading ? (
              <p>Generating…</p>
            ) : (
              <>
                <div
                  style={{
                    background: "#fff",
                    padding: 10,
                    borderRadius: 6,
                    display: "inline-block",
                    maxWidth: "100%",
                    overflowX: "auto",
                  }}
                  // The SVG comes from our own API and contains no scripts.
                  dangerouslySetInnerHTML={{ __html: svg }}
                />
                <p
                  style={{
                    fontFamily: "monospace",
                    letterSpacing: 1,
                    marginTop: 10,
                  }}
                >
                  {barcode}
                </p>
                <div
                  className="modal-actions"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 10,
                  }}
                >
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={downloadSvg}
                  >
                    Download SVG
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={printLabel}
                  >
                    Print label
                  </button>
                </div>
              </>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}

export default BarcodeButton;
