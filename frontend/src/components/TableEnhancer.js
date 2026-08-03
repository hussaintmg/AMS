import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { GripVertical, Settings2, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const STORAGE_PREFIX = 'ams-table-columns:';
const clean = (value) => String(value || '').replace(/[\u2191\u2193\u2195]/g, '').trim();
const isFixed = (name) => !name || /action(s)?|operation(s)?/i.test(name);

const bindSorting = (table) => {
  const header = table.querySelector('thead tr:first-child');
  if (!header || header.dataset.sortBound) return;
  header.dataset.sortBound = 'true';
  header.addEventListener('click', (event) => {
    const cell = event.target.closest('th');
    if (!cell || cell.parentElement !== header || isFixed(clean(cell.textContent))) return;
    const body = table.tBodies[0];
    if (!body) return;
    const index = cell.cellIndex;
    const direction = cell.dataset.sortDirection === 'asc' ? 'desc' : 'asc';
    Array.from(header.cells).forEach((th) => { th.classList.remove('sort-asc', 'sort-desc'); delete th.dataset.sortDirection; });
    Array.from(body.rows).sort((a, b) => {
      const left = clean(a.cells[index]?.textContent);
      const right = clean(b.cells[index]?.textContent);
      return left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' }) * (direction === 'asc' ? 1 : -1);
    }).forEach((row) => body.appendChild(row));
    cell.dataset.sortDirection = direction;
    cell.classList.add(`sort-${direction}`);
  });
  Array.from(header.cells).forEach((cell) => { if (!isFixed(clean(cell.textContent))) cell.classList.add('sortable'); });
};

const tableKey = (table, pathname, index) => {
  const headings = Array.from(table.querySelectorAll('thead tr:first-child th')).map((th) => clean(th.textContent));
  return `${STORAGE_PREFIX}${pathname}:${table.dataset.tableId || index}:${headings.slice().sort().join('|')}`;
};

const moveCells = (table, orderedNames) => {
  const header = table.querySelector('thead tr:first-child');
  if (!header || !orderedNames?.length) return;
  const current = Array.from(header.cells);
  const byName = new Map(current.map((cell) => [clean(cell.textContent), cell]));
  const ordered = orderedNames.map((name) => byName.get(name)).filter(Boolean);
  current.forEach((cell) => { if (!ordered.includes(cell)) ordered.push(cell); });
  if (ordered.every((cell, index) => cell === current[index])) return;
  const indices = ordered.map((cell) => current.indexOf(cell));
  Array.from(table.rows).forEach((row) => {
    if (row === header || row.dataset.filterRow) return;
    const cells = Array.from(row.cells);
    if (cells.length !== current.length) return;
    indices.forEach((cellIndex) => row.appendChild(cells[cellIndex]));
  });
  ordered.forEach((cell) => header.appendChild(cell));
  const filterRow = table.querySelector('thead tr[data-filter-row]');
  if (filterRow) {
    const cells = Array.from(filterRow.cells);
    if (cells.length === indices.length) indices.forEach((cellIndex) => filterRow.appendChild(cells[cellIndex]));
  }
};

const enhanceTable = (table, pathname, index) => {
  table.classList.add('data-table', 'data-table--shared');
  const key = tableKey(table, pathname, index);
  table.dataset.columnSettingsKey = key;
  try { moveCells(table, JSON.parse(localStorage.getItem(key))); } catch (_) { /* ignore invalid old preference */ }
  bindSorting(table);
};

const enhanceAll = (pathname) => {
  const tables = Array.from(document.querySelectorAll('.main-content table'));
  tables.forEach((table, index) => enhanceTable(table, pathname, index));
  return tables;
};

const TableEnhancer = () => {
  const { pathname } = useLocation();
  const { isSuperAdmin } = useAuth();
  const [open, setOpen] = useState(false);
  const [tables, setTables] = useState([]);
  const [selected, setSelected] = useState(0);
  const [columns, setColumns] = useState([]);
  const [dragged, setDragged] = useState(null);
  const scan = useCallback(() => setTables(enhanceAll(pathname)), [pathname]);

  useEffect(() => {
    scan();
    const observer = new MutationObserver(scan);
    const root = document.querySelector('.main-content');
    if (root) observer.observe(root, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [scan]);

  useEffect(() => {
    if (!open) return;
    setColumns(Array.from(tables[selected]?.querySelectorAll('thead tr:first-child th') || []).map((th) => clean(th.textContent)));
  }, [open, selected, tables]);

  const labels = useMemo(() => tables.map((table, index) => {
    const first = clean(table.querySelector('thead th')?.textContent);
    return `Table ${index + 1}${first ? ` - ${first}` : ''}`;
  }), [tables]);

  const dropAt = (target) => {
    if (dragged === null || dragged === target || isFixed(columns[dragged]) || isFixed(columns[target])) return;
    setColumns((items) => {
      const next = [...items];
      const [item] = next.splice(dragged, 1);
      next.splice(target, 0, item);
      return next;
    });
    setDragged(null);
  };

  const save = () => {
    const table = tables[selected];
    if (!table) return;
    localStorage.setItem(table.dataset.columnSettingsKey, JSON.stringify(columns));
    moveCells(table, columns);
    setOpen(false);
  };

  if (!isSuperAdmin || !tables.length) return null;
  return <>
    <button className="table-settings-trigger" onClick={() => { scan(); setOpen(true); }} title="Arrange table columns"><Settings2 size={17} /> Table settings</button>
    {open && <div className="table-settings-overlay" onMouseDown={() => setOpen(false)}>
      <div className="table-settings-modal" onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="Table column settings">
        <div className="table-settings-header"><div><h3>Arrange table columns</h3><p>Drag headings into the order you want.</p></div><button onClick={() => setOpen(false)} aria-label="Close"><X size={20}/></button></div>
        {tables.length > 1 && <label className="table-settings-select">Choose table<select value={selected} onChange={(event) => setSelected(Number(event.target.value))}>{labels.map((label, index) => <option key={label} value={index}>{label}</option>)}</select></label>}
        <div className="table-column-list">{columns.map((name, index) => <div key={`${name}-${index}`} className={`table-column-item ${isFixed(name) ? 'fixed' : ''}`} draggable={!isFixed(name)} onDragStart={() => setDragged(index)} onDragOver={(event) => event.preventDefault()} onDrop={() => dropAt(index)}><GripVertical size={17}/><span>{name || 'Selection'}</span>{isFixed(name) && <small>fixed</small>}</div>)}</div>
        <div className="table-settings-actions"><button className="btn btn-secondary" onClick={() => setOpen(false)}>Cancel</button><button className="btn btn-primary" onClick={save}>Save settings</button></div>
      </div>
    </div>}
  </>;
};

export default TableEnhancer;
