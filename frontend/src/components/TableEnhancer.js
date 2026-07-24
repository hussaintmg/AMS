import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

const getCellText = (cell) => (cell ? cell.textContent.trim() : '');

const compareValues = (a, b, direction) => {
    const aNum = parseFloat(a.replace(/,/g, ''));
    const bNum = parseFloat(b.replace(/,/g, ''));
    const numeric = !Number.isNaN(aNum) && !Number.isNaN(bNum);

    if (numeric) {
        return direction === 'asc' ? aNum - bNum : bNum - aNum;
    }

    return direction === 'asc'
        ? a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
        : b.localeCompare(a, undefined, { numeric: true, sensitivity: 'base' });
};

const isActionHeader = (headerText) => /action(s)?|operation(s)?/i.test(headerText);
const isSelectionHeader = (header) => !getCellText(header) || Boolean(header?.querySelector('input[type="checkbox"]'));

const updateSortStyles = (table, activeIndex, direction) => {
    const headerCells = table.querySelectorAll('thead tr:first-child th');
    headerCells.forEach((th, index) => {
        th.classList.toggle('sort-asc', index === activeIndex && direction === 'asc');
        th.classList.toggle('sort-desc', index === activeIndex && direction === 'desc');
    });
};

const filterTable = (table) => {
    const filterRow = table.querySelector('thead tr[data-filter-row]');
    const filters = Array.from(filterRow?.cells || []).map((cell) => {
        const input = cell.querySelector('input');
        return input ? input.value.trim().toLowerCase() : '';
    });

    const rows = Array.from(table.tBodies[0]?.rows || []);
    rows.forEach((row) => {
        const cells = Array.from(row.cells);
        const visible = filters.every((filter, index) => {
            if (!filter) return true;
            const cellText = getCellText(cells[index]).toLowerCase();
            return cellText.includes(filter);
        });

        row.style.display = visible ? '' : 'none';
    });
};

const sortTable = (table, columnIndex) => {
    const tbody = table.tBodies[0];
    if (!tbody) return;

    const currentIndex = Number(table.dataset.sortColumn);
    const currentDirection = table.dataset.sortDirection || 'none';
    const nextDirection = currentIndex === columnIndex && currentDirection === 'asc' ? 'desc' : 'asc';

    const rows = Array.from(tbody.rows).slice();
    rows.sort((rowA, rowB) => {
        const a = getCellText(rowA.cells[columnIndex]);
        const b = getCellText(rowB.cells[columnIndex]);
        return compareValues(a, b, nextDirection);
    });

    rows.forEach((row) => tbody.appendChild(row));
    table.dataset.sortColumn = String(columnIndex);
    table.dataset.sortDirection = nextDirection;
    updateSortStyles(table, columnIndex, nextDirection);
};

/**
 * Sorting is delegated from the header row so the handler always reads the
 * current cellIndex. Binding per-cell would capture an index that goes stale
 * when a re-render changes the column set.
 */
const bindHeaderSorting = (table, headerRow) => {
    if (headerRow.dataset.sortBound === 'true') return;

    const targetHeader = (event) => {
        const th = event.target.closest('th');
        if (!th || th.parentElement !== headerRow) return null;
        if (isActionHeader(th.textContent || '') || isSelectionHeader(th)) return null;
        return th;
    };

    headerRow.addEventListener('click', (event) => {
        const th = targetHeader(event);
        if (th) sortTable(table, th.cellIndex);
    });
    headerRow.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        const th = targetHeader(event);
        if (!th) return;
        event.preventDefault();
        sortTable(table, th.cellIndex);
    });

    headerRow.dataset.sortBound = 'true';
};

const enhanceTable = (table) => {
    const thead = table.querySelector('thead');
    const headerRow = thead?.querySelector('tr:not([data-filter-row])');
    if (!thead || !headerRow) return;

    const existingFilterRow = thead.querySelector('tr[data-filter-row]');

    // A re-render can reuse the same <table> with a different column set (e.g.
    // switching Lead Master Data tabs). The injected filter row is invisible to
    // React, so a stale one keeps the previous tab's width and shows up as a
    // phantom extra column. Rebuild it whenever the widths disagree.
    if (existingFilterRow && existingFilterRow.cells.length === headerRow.cells.length) {
        return;
    }
    if (existingFilterRow) existingFilterRow.remove();

    const filterRow = document.createElement('tr');
    filterRow.dataset.filterRow = 'true';

    Array.from(headerRow.cells).forEach((th, index) => {
        const filterCell = document.createElement('th');
        filterCell.className = 'table-filter-cell';

        const skipEnhancement = isActionHeader(th.textContent || '') || isSelectionHeader(th);

        if (!skipEnhancement) {
            const input = document.createElement('input');
            input.type = 'text';
            input.className = 'table-filter-input';
            input.placeholder = 'Filter';
            input.dataset.columnIndex = String(index);
            input.addEventListener('input', () => filterTable(table));
            filterCell.appendChild(input);

            th.classList.add('sortable');
            th.tabIndex = 0;
            if (!th.querySelector('.sort-arrow')) {
                const sortArrow = document.createElement('span');
                sortArrow.className = 'sort-arrow';
                th.appendChild(sortArrow);
            }
        }

        filterRow.appendChild(filterCell);
    });

    bindHeaderSorting(table, headerRow);
    thead.appendChild(filterRow);
    table.dataset.tableEnhancer = 'true';
};

const enhanceAllTables = () => {
    const tables = Array.from(document.querySelectorAll('table.data-table'));
    tables.forEach(enhanceTable);
};

const TableEnhancer = () => {
    const location = useLocation();

    useEffect(() => {
        enhanceAllTables();
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (!(node instanceof HTMLElement)) return;
                    if (node.matches('table.data-table')) {
                        enhanceTable(node);
                        return;
                    }
                    if (node.querySelectorAll) {
                        node.querySelectorAll('table.data-table').forEach(enhanceTable);
                    }
                    // Header cells can be swapped inside a table that already
                    // exists, so re-sync the table this node landed in too.
                    const parentTable = node.closest?.('table.data-table');
                    if (parentTable) enhanceTable(parentTable);
                });
            });
        });

        observer.observe(document.body, { childList: true, subtree: true });
        return () => observer.disconnect();
    }, [location.pathname]);

    return null;
};

export default TableEnhancer;
