import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "../../styles/productCell.css";

/**
 * The "Vehicle/Parts" cell in every sales listing.
 *
 * A document can carry any number of vehicles and parts, so the cell shows a
 * short summary and keeps the full list in a tooltip. Two details matter:
 *
 *  - the tooltip is rendered into <body> through a portal, because the tables
 *    live inside `overflow: auto` wrappers that would otherwise clip it;
 *  - it is placed below the cell only when there is room, and flips above when
 *    the row is near the bottom of the window.
 *
 * Hovering opens it; clicking pins it open so the list can be read (and
 * scrolled) without keeping the pointer still. Clicking also has to stop
 * propagation — these rows open a drawer when clicked.
 */
const MAX_CHARS = 28;
const GAP = 6;      // between the cell and the tooltip
const MARGIN = 8;   // smallest gap we leave against the window edge

const labelFor = (item) =>
  String(item?.name || item?.description || "").trim();

/** "Toyota Corolla, Brake Pad" — cut to length on a whole word where possible. */
function summarise(labels) {
  const joined = labels.join(", ");
  if (joined.length <= MAX_CHARS) return { text: joined, truncated: false };
  const cut = joined.slice(0, MAX_CHARS);
  const lastSpace = cut.lastIndexOf(" ");
  const head = lastSpace > MAX_CHARS * 0.6 ? cut.slice(0, lastSpace) : cut;
  return { text: `${head.trimEnd()}…`, truncated: true };
}

function ProductCell({ items = [], fallback = "" }) {
  const anchorRef = useRef(null);
  const tipRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [coords, setCoords] = useState(null);

  const products = (Array.isArray(items) ? items : []).filter((item) => labelFor(item));
  const labels = products.map(labelFor);
  // Older documents predate line items and only carry a single name.
  const hasList = labels.length > 0;
  const summary = hasList
    ? summarise(labels)
    : { text: fallback || "—", truncated: false };

  const close = useCallback(() => { setOpen(false); setPinned(false); setCoords(null); }, []);

  /**
   * Measure the tooltip, then decide where it goes. Runs after the tooltip is
   * in the DOM (but still invisible) so its real height is known — guessing the
   * height is what makes flip-above logic wrong for long lists.
   */
  useLayoutEffect(() => {
    if (!open || !anchorRef.current || !tipRef.current) return;
    const anchor = anchorRef.current.getBoundingClientRect();
    const tip = tipRef.current.getBoundingClientRect();

    const viewport = window.innerHeight;
    const roomBelow = viewport - anchor.bottom - GAP - MARGIN;
    const roomAbove = anchor.top - GAP - MARGIN;

    // Prefer below; flip when it does not fit there but does above. If neither
    // side can hold it, take the roomier one and let the list scroll.
    const placement = tip.height <= roomBelow ? "below"
      : tip.height <= roomAbove ? "above"
        : roomAbove > roomBelow ? "above" : "below";
    const room = placement === "above" ? roomAbove : roomBelow;

    /**
     * The ceiling is the room itself, never more. An earlier version floored
     * this at a "readable" 120px, which let a tooltip render taller than the
     * gap it was placed in and hang off the bottom of the window. Capping to
     * the room makes overflow impossible; the list scrolls inside instead.
     * The small floor is only reached when a window is too short either way,
     * and the position clamp below keeps that case on screen.
     */
    const maxHeight = Math.max(Math.min(room, viewport - MARGIN * 2), 80);

    /**
     * Above is pinned by its bottom edge, not its top. Applying maxHeight can
     * change how the text wraps and therefore the height, and a top-anchored
     * tooltip would then creep down over the row it belongs to. Growing upward
     * from a fixed bottom edge cannot do that.
     *
     * Both edges are then clamped into the window, because a card far down a
     * long mobile list has an anchor that is off-screen entirely.
     */
    const position = placement === "above"
      ? { bottom: Math.max(MARGIN, viewport - anchor.top + GAP) }
      : { top: Math.max(MARGIN, Math.min(anchor.bottom + GAP, viewport - maxHeight - MARGIN)) };

    let left = anchor.left;
    if (left + tip.width > window.innerWidth - MARGIN) {
      left = window.innerWidth - tip.width - MARGIN;
    }
    if (left < MARGIN) left = MARGIN;

    setCoords({ ...position, left, placement, maxHeight });
  }, [open]);

  // Scrolling or resizing moves the row out from under the tooltip, so drop it
  // rather than leave it floating somewhere meaningless.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => { if (event.key === "Escape") close(); };
    const onAway = (event) => {
      if (!anchorRef.current?.contains(event.target) && !tipRef.current?.contains(event.target)) close();
    };
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    window.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onAway);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onAway);
    };
  }, [open, close]);

  if (!hasList) return <span className="product-cell-plain">{summary.text}</span>;

  return (
    <>
      <span
        ref={anchorRef}
        className={`product-cell ${open ? "is-open" : ""}`}
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => { if (!pinned) close(); }}
        onFocus={() => setOpen(true)}
        onBlur={() => { if (!pinned) close(); }}
        onClick={(event) => {
          // The row itself opens a drawer on click.
          event.stopPropagation();
          setPinned((was) => !was);
          setOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            event.stopPropagation();
            setPinned((was) => !was);
            setOpen(true);
          }
        }}
      >
        <span className="product-cell-text">{summary.text}</span>
        {products.length > 1 && <span className="product-cell-count">+{products.length - 1}</span>}
      </span>

      {open && createPortal(
        <div
          ref={tipRef}
          className={`product-tip ${coords ? `is-${coords.placement} is-ready` : ""}`}
          style={coords
            // Only one of top/bottom is set — see the placement effect.
            ? { top: coords.top, bottom: coords.bottom, left: coords.left, maxHeight: coords.maxHeight }
            // First paint is off-screen so the measurement above sees the real
            // size without the tooltip ever flashing in the wrong place.
            : { top: -9999, left: -9999 }}
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => { if (!pinned) close(); }}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="product-tip-head">
            {products.length} product{products.length === 1 ? "" : "s"}
          </div>
          <div className="product-tip-list">
            {products.map((item, index) => (
              <div className="product-tip-row" key={item.id || `${item.item_type}-${index}`}>
                <span className={`product-tip-kind product-tip-kind-${item.item_type || "other"}`}>
                  {item.item_type === "part" ? "Part" : item.item_type === "service" ? "Service" : "Vehicle"}
                </span>
                <span className="product-tip-name">{labelFor(item)}</span>
                {Number(item.quantity) > 1 && (
                  <span className="product-tip-qty">× {Number(item.quantity)}</span>
                )}
              </div>
            ))}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

export default ProductCell;
