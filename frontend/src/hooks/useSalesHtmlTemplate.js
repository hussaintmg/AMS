import { useState, useEffect } from 'react';
import { erpSettingsAPI } from '../services/api';

function extractTemplateRow(res) {
    const payload = res && res.data !== undefined ? res.data : res;
    if (!payload || typeof payload !== 'object') return null;
    const row = Object.prototype.hasOwnProperty.call(payload, 'data') ? payload.data : payload;
    if (!row || typeof row !== 'object') return null;
    const raw = row.html_content ?? row.htmlContent ?? row.HTML_CONTENT;
    if (raw == null || !String(raw).trim()) return null;
    return String(raw);
}

/**
 * Loads the active HTML print template for a sales document type (ERP Settings).
 * @param {string} documentType quotation | booking | order | invoice
 * @param {number|string|undefined} companyId optional company scope for default template
 * @param {boolean} enabled when false, skips fetch (e.g. list view — fetch when print modal opens)
 */
export function useSalesHtmlTemplate(documentType, companyId, enabled = true) {
    const [templateHtml, setTemplateHtml] = useState(null);
    const [templateLoading, setTemplateLoading] = useState(!!enabled);

    useEffect(() => {
        let cancelled = false;

        if (!enabled) {
            setTemplateLoading(false);
            return () => { cancelled = true; };
        }

        (async () => {
            try {
                setTemplateLoading(true);
                const params = companyId != null && companyId !== '' ? { companyId } : {};
                const res = await erpSettingsAPI.getDocumentTemplateDefault(documentType, params);
                const html = extractTemplateRow(res);
                if (!cancelled) setTemplateHtml(html);
            } catch (e) {
                if (!cancelled) setTemplateHtml(null);
            } finally {
                if (!cancelled) setTemplateLoading(false);
            }
        })();

        return () => { cancelled = true; };
    }, [documentType, companyId, enabled]);

    return { templateHtml, templateLoading };
}
