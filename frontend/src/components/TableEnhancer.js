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

const enhanceTable = (table) => {
    if (table.dataset.tableEnhancer === 'true') {
        return;
    }

    const thead = table.querySelector('thead');
    const headerRow = thead?.querySelector('tr');
    if (!thead || !headerRow) return;

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
        }

        filterRow.appendChild(filterCell);

        if (!skipEnhancement) {
            th.classList.add('sortable');
            th.tabIndex = 0;
            const sortArrow = document.createElement('span');
            sortArrow.className = 'sort-arrow';
            th.appendChild(sortArrow);
            th.addEventListener('click', () => sortTable(table, index));
            th.addEventListener('keydown', (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    sortTable(table, index);
                }
            });
        }
    });

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
                    } else if (node.querySelector) {
                        const nestedTables = node.querySelectorAll('table.data-table');
                        nestedTables.forEach(enhanceTable);
                    }
                });
            });
        });

        observer.observe(document.body, { childList: true, subtree: true });
        return () => observer.disconnect();
    }, [location.pathname]);

    return null;
};

export default TableEnhancer;
