import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

/**
 * The last thing standing between a render error and a white screen.
 *
 * React unmounts the whole tree when a component throws while rendering, so one
 * bad row on one tab took the entire page with it and the operator was left
 * staring at nothing — no message, no way back, nothing to report but "the
 * screen goes blank". This catches it, keeps the rest of the app mounted, and
 * says what happened and where.
 *
 * Wrapped around the routed page (App.js) and around each screen's own body
 * where a single tab can fail on its own.
 */
class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { error: null, info: null };
    }

    static getDerivedStateFromError(error) {
        return { error };
    }

    componentDidCatch(error, info) {
        // Left in on purpose: this is the only trace of the failure that
        // survives, and it is what a screenshot from the client has to show.
        // eslint-disable-next-line no-console
        console.error('[ErrorBoundary]', this.props.where || 'page', error, info?.componentStack);
        this.setState({ info });
    }

    componentDidUpdate(prevProps) {
        // A new route (or a new tab, when the caller passes `resetKey`) gets a
        // clean slate — otherwise one failure would freeze the screen for good.
        if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
            this.setState({ error: null, info: null });
        }
    }

    render() {
        if (!this.state.error) return this.props.children;
        const where = this.props.where ? ` on ${this.props.where}` : '';
        return (
            <div className="card" style={{ padding: '2rem', textAlign: 'center' }}>
                <AlertTriangle size={34} style={{ color: '#dc2626', marginBottom: 12 }} />
                <h3 style={{ margin: '0 0 6px' }}>This screen could not be drawn</h3>
                <p style={{ color: '#64748b', margin: '0 0 4px' }}>
                    Something went wrong{where}. Nothing was saved or changed — your data is untouched.
                </p>
                <p style={{ color: '#94a3b8', fontSize: 12, margin: '0 0 16px', wordBreak: 'break-word' }}>
                    {String(this.state.error?.message || this.state.error)}
                </p>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                    <button type="button" className="btn btn-primary" onClick={() => this.setState({ error: null, info: null })}>
                        <RotateCcw size={16} /> Try again
                    </button>
                    <button type="button" className="btn btn-secondary" onClick={() => window.location.reload()}>
                        Reload the page
                    </button>
                </div>
            </div>
        );
    }
}

export default ErrorBoundary;
