import React from 'react';

/**
 * Renders admin-configured HTML (from ERP Settings → Document templates).
 * Content is interpolated before passing htmlString (see documentTemplateRender).
 */
export default function RenderedHtmlDocumentTemplate({ htmlString }) {
    if (!htmlString) return null;
    return (
        <div
            className="html-sales-doc-root corp-doc"
            dangerouslySetInnerHTML={{ __html: htmlString }}
        />
    );
}
