import React from 'react';

export default function JsonViewer({ data, collapsed = false }) {
    const [isOpen, setIsOpen] = React.useState(!collapsed);

    if (data === null || data === undefined) return <span className="json-null">null</span>;
    if (typeof data === 'string') return <span className="json-string">"{data}"</span>;
    if (typeof data === 'number' || typeof data === 'boolean') return <span className="json-primitive">{String(data)}</span>;

    if (Array.isArray(data)) {
        if (data.length === 0) return <span className="json-bracket">[]</span>;
        return (
            <div className="json-block">
                <button className="json-toggle" onClick={() => setIsOpen(!isOpen)}>
                    {isOpen ? '▼' : '▶'} [{data.length}]
                </button>
                {isOpen && (
                    <div className="json-children">
                        {data.map((item, i) => (
                            <div key={i} className="json-entry">
                                <span className="json-index">{i}: </span>
                                <JsonViewer data={item} collapsed />
                            </div>
                        ))}
                    </div>
                )}
            </div>
        );
    }

    if (typeof data === 'object') {
        const entries = Object.entries(data);
        if (entries.length === 0) return <span className="json-bracket">{'{}'}</span>;
        return (
            <div className="json-block">
                <button className="json-toggle" onClick={() => setIsOpen(!isOpen)}>
                    {isOpen ? '▼' : '▶'} {'{...}'}
                </button>
                {isOpen && (
                    <div className="json-children">
                        {entries.map(([key, val]) => (
                            <div key={key} className="json-entry">
                                <span className="json-key">"{key}": </span>
                                <JsonViewer data={val} collapsed />
                            </div>
                        ))}
                    </div>
                )}
            </div>
        );
    }

    return <span>{String(data)}</span>;
}
