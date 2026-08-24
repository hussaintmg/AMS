import { createPortal } from 'react-dom';

/**
 * Put a dialog at the end of `<body>`, whatever it was rendered from.
 *
 * Every quick create ("+ Customer", "+ Create Source") is written where the
 * field it fills is, which is inside that screen's `<form>`. Rendered there, the
 * dialog's own `<form>` ends up *inside* another one — nesting the HTML parser
 * would never produce, and which React's event system does not deliver
 * `onSubmit` for. Nothing prevented the default, so the browser submitted the
 * page: a New Customer opened from a quotation, a source raised inside it, and
 * the screen reloaded with the half-typed quotation gone. The trailing `?` left
 * on the URL was the only trace of it.
 *
 * A portal keeps the dialog where it belongs in the React tree — props, context
 * and state all still flow from the component that opened it — while placing it
 * in the DOM where a dialog belongs. That also settles the stacking: portals
 * append to the end of `<body>`, so a dialog opened from a dialog is later in
 * document order, which is exactly what `useModalKeyboard` layers on.
 *
 * Events still propagate along the React tree, so a dialog's submit must still
 * be stopped there — see `utils/modalForm.js`.
 */
export default function ModalPortal({ children }) {
  if (typeof document === 'undefined') return children;
  return createPortal(children, document.body);
}
