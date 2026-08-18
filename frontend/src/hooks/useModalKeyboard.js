import { useEffect, useRef } from 'react';

/**
 * Enter submits, Escape closes — for the modal on top, and only for it.
 *
 * Every dialog in the app calls this hook, and every one of them listens on
 * `document`. Open a quick-create ("+ Create Source") from inside the New
 * Customer form and two listeners are live at once: one Enter ran both
 * submits, so the source was created twice, and one Escape closed the child
 * *and* the form behind it. The `DupService …` rows in Service Master Data are
 * that bug's fingerprint.
 *
 * So the open dialogs are kept as a stack, in the order they opened. A keydown
 * is answered by the most recently opened dialog and by nothing underneath it.
 * The same stack decides stacking order on screen: each overlay's z-index is
 * set from its depth, so a dialog opened from a dialog always sits above it,
 * whatever order the CSS files happened to load in.
 *
 * Call signature is unchanged from the version this replaces, so the ~40 call
 * sites did not need touching:
 *
 *   useModalKeyboard(isOpen, onClose, onSubmit, loading)
 */

const stack = [];

/** The z-index tokens live in index.css; keep the numbers in step. */
const MODAL_BASE_Z = 1100;
const MODAL_STEP_Z = 10;

/**
 * Re-layer the overlays in the DOM to match the stack. Overlays are found by
 * class rather than handed in, because the hook never sees its own element —
 * and DOM order is the open order for every dialog rendered from another
 * (React appends the child after the parent's overlay). Portals to
 * `document.body` land last, which is also where they belong.
 */
const relayer = () => {
  const overlays = document.querySelectorAll('.modal-overlay');
  overlays.forEach((overlay, index) => {
    overlay.style.zIndex = String(MODAL_BASE_Z + index * MODAL_STEP_Z);
  });
};

export default function useModalKeyboard(isOpen, onClose, onSubmit, loading = false) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const onSubmitRef = useRef(onSubmit);
  onSubmitRef.current = onSubmit;
  const loadingRef = useRef(loading);
  loadingRef.current = loading;
  const submittingRef = useRef(false);

  useEffect(() => {
    if (!isOpen) return undefined;

    const entry = {};
    stack.push(entry);
    // The overlay is already committed when an effect runs; layer now, and
    // once more on the next tick for dialogs that portal themselves in later.
    // (A timer rather than requestAnimationFrame: hidden tabs stop painting,
    // and the layering must not wait for a frame that never comes.)
    relayer();
    const timer = setTimeout(relayer, 0);

    const handleKeyDown = (e) => {
      // Not the dialog on top — somebody opened another one over us.
      if (stack[stack.length - 1] !== entry) return;
      // A control inside the dialog already used the key (a searchable
      // dropdown picking an option with Enter, closing with Escape).
      if (e.defaultPrevented) return;

      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current?.();
        return;
      }
      if (e.key === 'Enter' && !e.shiftKey && onSubmitRef.current) {
        const tag = e.target?.tagName;
        if (tag === 'TEXTAREA') return;
        // A button with focus is being pressed on purpose; let it be.
        if (tag === 'BUTTON' && e.target.type !== 'submit') return;
        if (submittingRef.current || loadingRef.current) return;

        e.preventDefault();
        e.stopPropagation();
        submittingRef.current = true;
        const result = onSubmitRef.current();
        if (result && typeof result.then === 'function') {
          Promise.resolve(result).finally(() => { submittingRef.current = false; });
        } else {
          submittingRef.current = false;
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      clearTimeout(timer);
      const at = stack.indexOf(entry);
      if (at >= 0) stack.splice(at, 1);
      setTimeout(relayer, 0);
    };
  }, [isOpen]);
}

/** How many dialogs are open — for tests and for anything that must know. */
export const openModalCount = () => stack.length;
