import React, { useEffect, useState, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Search, ArrowLeft, Loader2, ExternalLink, ChevronDown, ChevronUp } from 'lucide-react';
import { searchAPI } from '../services/api';
import '../styles/searchResults.css';

const ICON_EMOJI = {
  UserPlus: '👤',
  Users: '👥',
  FileText: '📄',
  ShoppingCart: '🛒',
  CalendarCheck: '📅',
  Truck: '🚛',
  Package: '📦',
  Briefcase: '💼',
  Calendar: '📋',
  DollarSign: '💰',
  BookOpen: '📖',
  UserCircle: '👤',
  Building2: '🏢',
  Wrench: '🔧',
  ClipboardList: '📋',
  Warehouse: '🏭',
  Mail: '📧',
  Layout: '📐',
  CreditCard: '💳',
  CheckCircle2: '✅',
  File: '📁',
};

function stripHtml(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return doc.body.textContent || '';
}

export default function SearchResults() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const q = params.get('q') || '';
  const type = params.get('type') || 'all';
  const page = Number(params.get('page') || 1);
  const [draftQuery, setDraftQuery] = useState(q);
  const [groups, setGroups] = useState([]);
  const [total, setTotal] = useState(0);
  const [duration, setDuration] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [expandedGroups, setExpandedGroups] = useState({});

  useEffect(() => {
    setDraftQuery(q);
  }, [q]);

  const fetchResults = useCallback(async () => {
    if (!q) {
      setGroups([]);
      setTotal(0);
      setDuration(0);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await searchAPI.search(q, 20, type, { page });
      const data = res.data;
      setGroups(data?.groups || []);
      setTotal(data?.total || 0);
      setDuration(data?.duration || 0);
      const expanded = {};
      (data?.groups || []).forEach(g => { expanded[g.moduleKey] = true; });
      setExpandedGroups(expanded);
    } catch (err) {
      setError(err.response?.data?.message || 'Search failed. Please try again.');
      setGroups([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [q, type, page]);

  useEffect(() => {
    fetchResults();
  }, [fetchResults]);

  const updateParams = (next) => {
    const nextParams = { q, type, ...next };
    Object.keys(nextParams).forEach((key) => { if (!nextParams[key]) delete nextParams[key]; });
    setParams(nextParams);
  };

  const submitSearch = (event) => {
    event.preventDefault();
    updateParams({ q: draftQuery.trim(), page: 1 });
  };

  const toggleGroup = (moduleKey) => {
    setExpandedGroups(prev => ({ ...prev, [moduleKey]: !prev[moduleKey] }));
  };

  const getEntityTypes = () => {
    const types = ['all'];
    groups.forEach(g => {
      if (!types.includes(g.moduleKey)) types.push(g.moduleKey);
    });
    return types;
  };

  const hasMore = total > groups.reduce((sum, g) => sum + g.results?.length, 0);

  if (!q) {
    return (
      <div className="search-results-page">
        <header>
          <div>
            <button className="icon-btn" title="Back" onClick={() => navigate(-1)}>
              <ArrowLeft size={18} />
            </button>
            <h1>Search</h1>
            <p>Enter a search term to find records across all modules.</p>
          </div>
          <form className="search-results-input" onSubmit={submitSearch}>
            <Search size={17} />
            <input value={draftQuery} onChange={(e) => setDraftQuery(e.target.value)} placeholder="Search all modules" inputMode="search" />
            <button type="submit">Search</button>
          </form>
        </header>
        <div className="search-results-state">
          <Search size={40} />
          <h2>Search across the entire ERP</h2>
          <p>Leads, Customers, Invoices, Vehicles, Parts, Employees, and more...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="search-results-page">
      <header>
        <div>
          <button className="icon-btn" title="Back" onClick={() => navigate(-1)}>
            <ArrowLeft size={18} />
          </button>
          <h1>Search results</h1>
          <p>
            {loading ? 'Searching...' : (
              <>About {total} result{total !== 1 ? 's' : ''} for <strong>"{q}"</strong>
              {duration > 0 && <span className="search-duration"> ({Math.round(duration)}ms)</span>}</>
            )}
          </p>
        </div>
        <form className="search-results-input" onSubmit={submitSearch}>
          <Search size={17} />
          <input
            value={draftQuery}
            onChange={(e) => setDraftQuery(e.target.value)}
            placeholder="Search all modules"
            inputMode="search"
          />
          <button type="submit">Search</button>
        </form>
      </header>

      <div className="search-results-filters">
        <button className={type === 'all' ? 'active' : ''} onClick={() => updateParams({ type: 'all', page: 1 })}>
          All {total > 0 && <span className="filter-count">({total})</span>}
        </button>
        {getEntityTypes().filter(t => t !== 'all').map((itemType) => {
          const group = groups.find(g => g.moduleKey === itemType);
          const count = group?.total || 0;
          return (
            <button
              key={itemType}
              className={type === itemType ? 'active' : ''}
              onClick={() => updateParams({ type: itemType, page: 1 })}
            >
              {group?.icon ? ICON_EMOJI[group.icon] || '' : ''} {group?.module || itemType}
              {count > 0 && <span className="filter-count">({count})</span>}
            </button>
          );
        })}
      </div>

      {loading && (
        <div className="search-results-state">
          <Loader2 size={32} className="search-spinner" />
          <p>Searching across all modules...</p>
        </div>
      )}

      {error && !loading && (
        <div className="search-results-state search-error">
          <p>{error}</p>
          <button onClick={fetchResults}>Try Again</button>
        </div>
      )}

      {!loading && !error && total === 0 && (
        <div className="search-results-state">
          <Search size={32} />
          <h3>No results found</h3>
          <p>Try different keywords or check your spelling.</p>
          <div className="search-tips">
            <h4>Search tips:</h4>
            <ul>
              <li>Use specific terms like invoice numbers, names, or phone numbers</li>
              <li>Try shorter keywords</li>
              <li>Check for typos or alternate spellings</li>
              <li>Use "Ctrl+K" for the command palette to navigate directly</li>
            </ul>
          </div>
        </div>
      )}

      {!loading && !error && groups.length > 0 && (
        <div className="search-results-content">
          {groups.map((group) => {
            const isExpanded = expandedGroups[group.moduleKey] !== false;
            const displayResults = isExpanded ? group.results : group.results.slice(0, 3);
            return (
              <div key={group.moduleKey} className="search-result-group">
                <div className="search-result-group-header" onClick={() => toggleGroup(group.moduleKey)}>
                  <div className="search-group-title">
                    <span className="search-group-icon">{ICON_EMOJI[group.icon] || '📄'}</span>
                    <h2>{group.module}</h2>
                    <span className="search-group-count">{group.total} result{group.total !== 1 ? 's' : ''}</span>
                  </div>
                  <button className="search-group-toggle" title={isExpanded ? 'Collapse' : 'Expand'}>
                    {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>
                </div>

                <div className="search-result-group-body">
                  {displayResults.map((result) => (
                    <div
                      key={result.id}
                      className="search-result-item"
                      onClick={() => {
                        navigate(result.url);
                      }}
                    >
                      <div className="search-result-icon">
                        {ICON_EMOJI[result.icon] || '📄'}
                      </div>
                      <div className="search-result-text">
                        <span className="search-result-module-badge">{result.moduleName}</span>
                        <span
                          className="search-result-title"
                          dangerouslySetInnerHTML={{ __html: result.title || 'Untitled' }}
                        />
                        {result.subtitle && (
                          <span
                            className="search-result-subtitle"
                            dangerouslySetInnerHTML={{ __html: result.subtitle }}
                          />
                        )}
                        {result.snippet && (
                          <p
                            className="search-result-snippet"
                            dangerouslySetInnerHTML={{ __html: result.snippet.slice(0, 300) + (result.snippet.length > 300 ? '...' : '') }}
                          />
                        )}
                        <span className="search-result-url">{result.url}</span>
                      </div>
                      <div className="search-result-actions">
                        <button
                          className="search-result-open-btn"
                          title="Open"
                          onClick={(e) => { e.stopPropagation(); navigate(result.url); }}
                        >
                          <ExternalLink size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {!isExpanded && group.results.length > 3 && (
                  <button className="search-group-show-more" onClick={() => toggleGroup(group.moduleKey)}>
                    Show all {group.results.length} results
                  </button>
                )}
              </div>
            );
          })}

          <div className="search-results-footer">
            <p>
              Showing results for "<strong>{q}</strong>"
              {total > 20 && <span>. Refine your search or use filters above.</span>}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
