import { useState, useEffect } from 'react';
import { pdfManagementAPI } from '../services/api';

/**
 * The open sales document rendered server-side in the same layout its PDF
 * download uses, so View, Print and Download all show one document.
 *
 * The server needs the record id (not the row already in memory) because the
 * printed document carries more than a list row does — company letterhead,
 * preparer, full customer block, every product line, notes and terms.
 *
 * @param {string} documentType quotation | booking | order | invoice
 * @param {string|undefined} id  record id; skipped while absent
 * @param {boolean} enabled      false while the view modal is closed
 */
export function useSalesDocumentPrintHtml(documentType, id, enabled = true) {
    const [documentHtml, setDocumentHtml] = useState(null);
    const [documentLoading, setDocumentLoading] = useState(Boolean(enabled && id));

    useEffect(() => {
        let cancelled = false;

        if (!enabled || !id) {
            setDocumentHtml(null);
            setDocumentLoading(false);
            return () => { cancelled = true; };
        }

        (async () => {
            try {
                setDocumentLoading(true);
                const res = await pdfManagementAPI.getPrintHtml(documentType, id);
                const html = res?.data?.data?.html;
                if (!cancelled) setDocumentHtml(html && String(html).trim() ? String(html) : null);
            } catch (error) {
                // The caller falls back to its own on-screen layout rather than
                // showing nothing at all.
                if (!cancelled) setDocumentHtml(null);
            } finally {
                if (!cancelled) setDocumentLoading(false);
            }
        })();

        return () => { cancelled = true; };
    }, [documentType, id, enabled]);

    return { documentHtml, documentLoading };
}

export default useSalesDocumentPrintHtml;
