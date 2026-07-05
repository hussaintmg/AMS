import React from 'react';

export default function LogFilters({ filters, filterOptions = {}, onChange, onApply, onReset }) {
    const options = {
        users: [],
        roles: [],
        methods: [],
        severities: [],
        statusCodes: [],
        endpoints: [],
        hasServerErrors: false,
        ...filterOptions
    };

    const handleChange = (key, value) => {
        onChange({ ...filters, [key]: value });
    };

    return (
        <div className="log-filters">
            <div className="log-filters-row">
                <div className="log-filter-group">
                    <label>Search Logs</label>
                    <input className="form-control" value={filters.search || ''} onChange={(e) => handleChange('search', e.target.value)} placeholder="Search endpoint, user, action..." />
                </div>
                <div className="log-filter-group">
                    <label>Logs Of</label>
                    <select className="form-control" value={filters.logsOf || ''} onChange={(e) => handleChange('logsOf', e.target.value)}>
                        <option value="">All allowed logs</option>
                        {options.hasServerErrors && <option value="server-errors">Server Errors</option>}
                        {options.users.map((user) => <option key={user.id} value={user.id}>{user.name || user.email || user.id}</option>)}
                    </select>
                </div>
                <div className="log-filter-group">
                    <label>Role</label>
                    <select className="form-control" value={filters.roleName || filters.role || ''} onChange={(e) => handleChange('roleName', e.target.value)}>
                        <option value="">All Roles</option>
                        {options.roles.map((role) => <option key={role.id || role.name} value={role.name}>{role.displayName || role.name}</option>)}
                    </select>
                </div>
                <div className="log-filter-group"><label>Date From</label><input type="date" className="form-control" value={filters.dateFrom || filters.startDate || ''} onChange={(e) => handleChange('dateFrom', e.target.value)} /></div>
                <div className="log-filter-group"><label>Date To</label><input type="date" className="form-control" value={filters.dateTo || filters.endDate || ''} onChange={(e) => handleChange('dateTo', e.target.value)} /></div>
                <div className="log-filter-group"><label>Time From</label><input type="time" className="form-control" value={filters.timeFrom || ''} onChange={(e) => handleChange('timeFrom', e.target.value)} /></div>
                <div className="log-filter-group"><label>Time To</label><input type="time" className="form-control" value={filters.timeTo || ''} onChange={(e) => handleChange('timeTo', e.target.value)} /></div>
                <div className="log-filter-group">
                    <label>Method</label>
                    <select className="form-control" value={filters.method || ''} onChange={(e) => handleChange('method', e.target.value)}>
                        <option value="">All Methods</option>
                        {(options.methods.length ? options.methods : ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).map((method) => <option key={method} value={method}>{method}</option>)}
                    </select>
                </div>
                <div className="log-filter-group">
                    <label>Status</label>
                    <select className="form-control" value={filters.status || ''} onChange={(e) => handleChange('status', e.target.value)}>
                        <option value="">All</option>
                        <option value="success">Success</option>
                        <option value="failed">Failed</option>
                    </select>
                </div>
                <div className="log-filter-group">
                    <label>Status Code</label>
                    <select className="form-control" value={filters.statusCode || ''} onChange={(e) => handleChange('statusCode', e.target.value)}>
                        <option value="">All Codes</option>
                        {options.statusCodes.map((code) => <option key={code} value={code}>{code}</option>)}
                    </select>
                </div>
                <div className="log-filter-group">
                    <label>Severity</label>
                    <select className="form-control" value={filters.severity || ''} onChange={(e) => handleChange('severity', e.target.value)}>
                        <option value="">All Severities</option>
                        {(options.severities.length ? options.severities : ['info', 'warning', 'error', 'critical']).map((severity) => <option key={severity} value={severity}>{severity}</option>)}
                    </select>
                </div>
                <div className="log-filter-group">
                    <label>Server Error</label>
                    <select className="form-control" value={filters.serverError || ''} onChange={(e) => handleChange('serverError', e.target.value)}>
                        <option value="">All</option>
                        <option value="yes">Yes</option>
                        <option value="no">No</option>
                    </select>
                </div>
                <div className="log-filter-group">
                    <label>Endpoint/API</label>
                    <input className="form-control" list="log-filter-endpoints" value={filters.endpoint || ''} onChange={(e) => handleChange('endpoint', e.target.value)} placeholder="Filter by path..." />
                    <datalist id="log-filter-endpoints">
                        {options.endpoints.map((endpoint) => <option key={endpoint} value={endpoint} />)}
                    </datalist>
                </div>
                <div className="log-filter-group">
                    <label>&nbsp;</label>
                    <button className="btn btn-primary" onClick={onApply}>Apply</button>
                </div>
                {onReset && (
                    <div className="log-filter-group">
                        <label>&nbsp;</label>
                        <button className="btn btn-secondary" onClick={onReset}>Reset</button>
                    </div>
                )}
            </div>
        </div>
    );
}
