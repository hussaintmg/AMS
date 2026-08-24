import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  getRoleJob, canSeeColumn, canSeeDrawerField, canUseDrawerExtra, canSeeDropdown,
  pageKeyForPath, catalogSlug,
} from '../utils/roleJobs';

/**
 * Enforces the role's screen-level choices — table columns, drawer rows,
 * drawer buttons — on every page, from one place.
 *
 * Role Jobs lets an administrator untick "Selling Price" on Vehicles or "Record
 * Payment" in the invoice drawer. Forty screens draw their tables and drawers
 * forty different ways, and rewriting each of them to ask permission per
 * column would have taken weeks and still missed the next screen. Instead the
 * catalog (constants/pageCatalog.js on the server) keys every column by the
 * slug of its header text and every drawer row by the slug of its label — the
 * words already on screen — and this component reads those words back from
 * the DOM and hides what the role may not see.
 *
 * It watches the document with a MutationObserver, so a table that re-renders
 * on the next page of results, or a drawer that opens later, is gated too. It
 * does nothing at all for a role with no screen-level restriction, which is
 * every role until an administrator configures one.
 *
 * This is presentation: the data the server sends is decided by the field mask
 * (utils/fieldPermissions.js), which is unchanged. What this hides is what a
 * role should not be *shown*, on top of what it may not *receive*.
 */

const HIDDEN_CLASS = 'vg-hidden';

const cellText = (cell) => cellText.strip(cell?.textContent || '');
cellText.strip = (text) => text.replace(/\s+/g, ' ').trim();

/** Header text of a `th`, ignoring sort arrows and settings icons. */
const headerLabel = (th) => {
  // The selection column carries a checkbox and no words.
  if (th.querySelector('input[type="checkbox"]') && !cellText(th)) return '';
  return cellText(th);
};

function gateTables(user, pageKey, root) {
  const tables = root.querySelectorAll('table');
  tables.forEach((table) => {
    const headRow = table.tHead?.rows?.[0];
    if (!headRow) return;
    const hidden = [];
    [...headRow.cells].forEach((th, index) => {
      const label = headerLabel(th);
      const show = !label || canSeeColumn(user, pageKey, label);
      th.classList.toggle(HIDDEN_CLASS, !show);
      if (!show) hidden.push(index);
    });
    if (!hidden.length) {
      // Clear anything a previous, stricter render left behind.
      table.querySelectorAll(`tbody td.${HIDDEN_CLASS}`).forEach((td) => td.classList.remove(HIDDEN_CLASS));
      return;
    }
    const hiddenSet = new Set(hidden);
    [...(table.tBodies || [])].forEach((body) => [...body.rows].forEach((row) => {
      // A colspan message row ("No data") spans the table; leave it alone.
      if (row.cells.length === 1 && row.cells[0].colSpan > 1) return;
      [...row.cells].forEach((td, index) => td.classList.toggle(HIDDEN_CLASS, hiddenSet.has(index)));
    }));
  });
}

/** Every drawer row pattern the app uses: a label element beside a value. */
const DRAWER_ROW = '.drawer-detail-row, .email-drawer-row, .sm-detail-row, .drawer-row';
const DRAWER_LABEL = '.drawer-detail-label, .email-drawer-label, .sm-detail-label, .drawer-label';
const DRAWER_ROOT = '.drawer-overlay, .email-drawer-overlay, .drawer, .email-drawer, .lead-drawer, .customer-drawer, .sales-drawer';

function gateDrawers(user, pageKey, root) {
  const drawers = root.querySelectorAll(DRAWER_ROOT);
  if (!drawers.length) return;
  const catalog = user?.pageCatalog?.[pageKey];
  const extras = catalog?.drawer?.extras || [];
  drawers.forEach((drawer) => {
    // Rows.
    drawer.querySelectorAll(DRAWER_ROW).forEach((rowEl) => {
      const label = cellText(rowEl.querySelector(DRAWER_LABEL));
      if (!label) return;
      rowEl.classList.toggle(HIDDEN_CLASS, !canSeeDrawerField(user, pageKey, label));
    });
    // Section headings (h4) double as drawer fields for the document drawers
    // ("Payment Summary", "Payment History", "Items"): hide the heading and
    // everything up to the next heading.
    drawer.querySelectorAll('h4').forEach((heading) => {
      const label = cellText(heading);
      if (!label) return;
      const show = canSeeDrawerField(user, pageKey, label);
      const section = heading.closest('.email-drawer-section, .drawer-section, section') || heading.parentElement;
      if (section && section !== drawer) section.classList.toggle(HIDDEN_CLASS, !show);
      else heading.classList.toggle(HIDDEN_CLASS, !show);
    });
    // The drawer's own buttons, matched by title or text against the catalog.
    if (!extras.length) return;
    const buttons = drawer.querySelectorAll('button, a.btn');
    buttons.forEach((button) => {
      const words = `${button.getAttribute('title') || ''} ${cellText(button)}`.trim();
      if (!words) return;
      const wordSlug = catalogSlug(words);
      const extra = extras.find((item) => (item.match || []).some((phrase) => {
        const p = catalogSlug(phrase);
        return p && (wordSlug === p || wordSlug.startsWith(`${p}_`) || wordSlug.endsWith(`_${p}`) || wordSlug.includes(`_${p}_`));
      }));
      if (!extra) return;
      button.classList.toggle(HIDDEN_CLASS, !canUseDrawerExtra(user, pageKey, extra.key));
    });
  });
}

/**
 * Which of a page's three forms a control is sitting in.
 *
 * The catalog keeps create, edit and filters apart, because they are different
 * questions — a clerk may pick an assignee when raising a record and not when
 * changing one. The DOM does not say which form it is, but the dialog above it
 * does: every screen writes "New …" or "Add …" when it is creating and "Edit …"
 * when it is not. A control outside a dialog is on the list itself, which is
 * where the filters live.
 */
const formKindOf = (element) => {
  const dialog = element.closest('.modal-content, .modal-overlay, .drawer, .email-drawer');
  if (!dialog) return 'filters';
  const heading = dialog.querySelector('.modal-header h2, .modal-header h3, h2, h3');
  return /^edit/i.test(cellText(heading)) ? 'edit' : 'create';
};

/**
 * The words naming a form field, and only those.
 *
 * A caption is rarely just its caption: it carries the little round help button
 * (which reads as the letter "i"), the "+ Create X" shortcut beside it, and a
 * required asterisk. Reading the element's text raw gives
 * "Categoryi+ Create Category", which matches no catalog key. Everything that
 * is a control rather than a word comes out first.
 */
const fieldLabel = (group) => {
  const label = group.querySelector('label, .form-label-add');
  if (!label) return '';
  const words = label.cloneNode(true);
  words.querySelectorAll('button, a, svg, input, select, textarea, [data-quick-create]').forEach((el) => el.remove());
  return cellText(words).replace(/\s*\*\s*$/, '').trim();
};

/**
 * A dropdown Role Jobs has set to "Hidden" is not drawn.
 *
 * The alternative was to teach forty forms to ask before drawing each picker,
 * and forty more the next time a screen is added. The catalog already names
 * every dropdown by the words beside it, which is the same handle the column and
 * drawer rules use, so the field is found the same way — by reading the label
 * off the screen. The whole form group goes, not just the select: a caption
 * hanging over nothing is worse than the field being absent.
 */
function gateDropdowns(user, pageKey, root) {
  const catalog = user?.pageCatalog?.[pageKey];
  if (!catalog) return;
  root.querySelectorAll('.form-group, .filter-group').forEach((group) => {
    const label = fieldLabel(group);
    if (!label) return;
    const slug = catalogSlug(label);
    if (!slug) return;
    const form = formKindOf(group);
    const entry = (catalog.forms?.[form]?.dropdowns || [])
      .find((dd) => catalogSlug(dd.label) === slug || catalogSlug(dd.key) === slug);
    if (!entry) return;
    group.classList.toggle(HIDDEN_CLASS, !canSeeDropdown(user, pageKey, form, entry.key));
  });
}

/** Whether this role has any screen-level restriction on this page at all. */
const hasScreenRules = (user, pageKey) => {
  const job = getRoleJob(user, pageKey);
  if (!job || job.superAdmin) return false;
  return job.columns?.mode === 'selected'
    || job.drawerFields?.mode === 'selected'
    || job.drawerExtras?.mode === 'selected'
    // A dropdown rule is a row per field, so any row at all is a restriction.
    || (Array.isArray(job.dropdowns) && job.dropdowns.length > 0);
};

export default function ViewGate() {
  const { user } = useAuth();
  const { pathname } = useLocation();

  useEffect(() => {
    if (!user) return undefined;
    const pageKey = pageKeyForPath(user, pathname);
    // The body, not the React root: a dialog opened from a form is portalled to
    // the end of `<body>` (components/ModalPortal.js), which is outside `#root`
    // and so was never reached by the gate. Anything portalled — a drawer raised
    // from a modal, a table inside one — has to be gated like the rest.
    const root = document.body;
    if (!pageKey || !hasScreenRules(user, pageKey)) {
      // Nothing to enforce here: undo any gating a previous page left behind.
      root.querySelectorAll(`.${HIDDEN_CLASS}`).forEach((el) => el.classList.remove(HIDDEN_CLASS));
      return undefined;
    }

    let scheduled = null;
    const run = () => {
      scheduled = null;
      // Pause the observer while we write classes, or we would observe our
      // own changes forever.
      observer.disconnect();
      try {
        gateTables(user, pageKey, root);
        gateDrawers(user, pageKey, root);
        gateDropdowns(user, pageKey, root);
      } finally {
        observer.observe(root, { childList: true, subtree: true });
      }
    };
    const schedule = () => { if (!scheduled) scheduled = setTimeout(run, 0); };
    const observer = new MutationObserver(schedule);
    observer.observe(root, { childList: true, subtree: true });
    run();
    return () => {
      observer.disconnect();
      if (scheduled) clearTimeout(scheduled);
    };
  }, [user, pathname]);

  return null;
}
