/**
 * Print the open sales document modal (quotation / booking / order / invoice).
 * Uses a dedicated iframe so Chrome reliably renders content (main-window print
 * with fixed modals + async style toggles often produces blank previews).
 */

function toAbsoluteStylesheetHref(href) {
    if (!href) return '';
    try {
        return new URL(href, window.location.href).href;
    } catch {
        return href;
    }
}

function collectStylesheetLinks() {
    return Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
        .map((link) => {
            const href = toAbsoluteStylesheetHref(link.getAttribute('href'));
            return href ? `<link rel="stylesheet" href="${href.replace(/"/g, '&quot;')}">` : '';
        })
        .join('\n');
}

/** CRA dev server injects rules into &lt;style&gt;; copy so the print iframe matches the screen. */
function collectHeadStyleTags() {
    return Array.from(document.querySelectorAll('head > style'))
        .map((el) => {
            const txt = el.textContent || '';
            if (!txt.trim()) return '';
            return `<style>${txt.replace(/<\/style/gi, '<\\/style')}</style>`;
        })
        .join('\n');
}

function stripNonPrintableFromClone(root) {
    root.querySelectorAll('.close-btn, .modal-actions, .ss-dropdown, script').forEach((el) => el.remove());
}

const ACTIVE_PRINT_ID = 'ams-active-sales-print';

function waitForIframeStyles(doc, win, done) {
    let called = false;
    const doneOnce = () => {
        if (called) return;
        called = true;
        done();
    };

    const links = Array.from(doc.querySelectorAll('link[rel="stylesheet"]'));
    if (links.length === 0) {
        win.setTimeout(doneOnce, 0);
        return;
    }
    let pending = 0;
    links.forEach((link) => {
        if (!link.sheet) pending += 1;
    });
    if (pending === 0) {
        win.setTimeout(doneOnce, 0);
        return;
    }
    let left = pending;
    const tick = () => {
        left -= 1;
        if (left <= 0) doneOnce();
    };
    links.forEach((link) => {
        if (link.sheet) return;
        link.addEventListener('load', tick, { once: true });
        link.addEventListener('error', tick, { once: true });
    });
    win.setTimeout(doneOnce, 2500);
}

const IFRAME_BASE_CSS = `
  html, body { margin: 0; padding: 0; background: #fff; }
  body { font-family: Inter, system-ui, -apple-system, sans-serif; }
  .sales-print-modal.modal-overlay {
    position: static !important;
    inset: auto !important;
    display: block !important;
    /* No padding here: @page already sets the paper margin (sales-print.css).
       Adding a second one indented the document on every side and squeezed the
       product table narrower than the page it was printing on. */
    padding: 0 !important;
    background: #fff !important;
    overflow: visible !important;
  }
  .sales-print-modal .modal-content {
    max-width: 100% !important;
    width: 100% !important;
    max-height: none !important;
    box-shadow: none !important;
    border-radius: 0 !important;
    margin: 0 !important;
  }
  .sales-print-modal .modal-body {
    max-height: none !important;
    overflow: visible !important;
    padding: 0 !important;
  }
`;

/**
 * Clones `.sales-print-modal` into a hidden iframe and invokes print on that document.
 */
export function printSalesModal() {
    const source =
        document.getElementById(ACTIVE_PRINT_ID) ||
        document.querySelector('.sales-print-modal');
    if (!source) {
        window.print();
        return;
    }

    const clone = source.cloneNode(true);
    stripNonPrintableFromClone(clone);

    const iframe = document.createElement('iframe');
    iframe.setAttribute('title', 'print-frame');
    iframe.setAttribute(
        'style',
        'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;pointer-events:none'
    );
    document.body.appendChild(iframe);

    const win = iframe.contentWindow;
    const doc = win.document;

    const linksHtml = collectStylesheetLinks();
    const inlineStylesHtml = collectHeadStyleTags();
    const baseHref = `${window.location.origin}${window.location.pathname}`;
    doc.open();
    doc.write(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <base href="${baseHref.replace(/"/g, '&quot;')}">
  ${linksHtml}
  ${inlineStylesHtml}
  <style>${IFRAME_BASE_CSS}</style>
</head>
<body class="ams-print-sales-doc"></body>
</html>`);
    doc.close();
    doc.body.appendChild(clone);

    const runPrint = () => {
        try {
            win.focus();
            win.print();
        } finally {
            win.setTimeout(() => {
                if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
            }, 1500);
        }
    };

    waitForIframeStyles(doc, win, () => {
        win.requestAnimationFrame(() => {
            win.requestAnimationFrame(runPrint);
        });
    });
}
