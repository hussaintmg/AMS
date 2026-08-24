/**
 * Which of Role Jobs' choices the screens actually honour.
 *
 * The catalog offers an administrator four kinds of screen-level control on
 * every page: which table columns, which drawer rows, which of the drawer's own
 * buttons, which "+ Create X" shortcuts inside the forms, and whose records each
 * dropdown may offer — or whether it is drawn at all. Offering a control that no
 * screen reads is worse than not offering it: the administrator unticks
 * something, saves, and the option is still there for the operator, which reads
 * as the permission engine being broken.
 *
 * Columns, drawer rows and drawer buttons are enforced centrally by
 * `frontend/src/components/ViewGate.js`, which reads the words off the DOM, so
 * they are covered on every page at once. The other two are per-screen: a form
 * has to ask before it draws a shortcut or a picker. This finds the screens that
 * do not ask.
 *
 *   node scripts/audit_view_gates.js            # the gaps
 *   node scripts/audit_view_gates.js --full     # every page, gated or not
 *   node scripts/audit_view_gates.js --json
 *
 * Reads source only — nothing needs to be running.
 */
const fs = require('fs');
const path = require('path');

const { PAGE_CATALOG } = require('../constants/pageCatalog');
const { PAGE_CAPABILITIES } = require('../constants/pageCapabilities');

const SRC = path.resolve(__dirname, '..', '..', 'frontend', 'src');

/** Every frontend source file, read once. */
function sources(dir = SRC, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) { sources(full, out); continue; }
    if (!/\.jsx?$/.test(entry.name)) continue;
    out.push({ file: path.relative(SRC, full).replace(/\\/g, '/'), text: fs.readFileSync(full, 'utf8') });
  }
  return out;
}

const FILES = sources();
const ALL = FILES.map((f) => f.text).join('\n');

/**
 * The server half. A dropdown fed by a page's own meta endpoint needs no hint
 * from the browser — the endpoint already knows which page it is, and calls
 * `filterRows(user, '<page>', FORMS, '<key>', …)` itself. Only the shared list
 * endpoints, which serve a dozen dropdowns from one route, have to be told.
 */
const CONTROLLERS = (() => {
  const dir = path.resolve(__dirname, '..', 'controllers');
  return fs.readdirSync(dir).filter((f) => f.endsWith('.js'))
    .map((f) => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');
})();

const scopedOnServer = (pageKey, key) => new RegExp(
  `filterRows\\(\\s*[\\w.]+\\s*,\\s*['"]${pageKey}['"]\\s*,[^,]+,\\s*['"]${key}['"]`,
).test(CONTROLLERS);

const has = (needle) => ALL.includes(needle);
const filesWith = (needle) => FILES.filter((f) => f.text.includes(needle)).map((f) => f.file);

// ── quick create ───────────────────────────────────────────────────────────

/**
 * A shortcut is gated when the button that draws it is behind the shared
 * helper. `MasterQuickCreate` asks for itself, so a `type="key"` usage of it
 * counts; a hand-rolled button counts only if its own file calls the helper.
 */
function quickCreateGate(key) {
  if (new RegExp(`<MasterQuickCreate[^>]*type=["']${key}["']`).test(ALL)) return 'MasterQuickCreate';
  if (key === 'customer' && has('CustomerQuickCreate')) return 'CustomerQuickCreate';
  const drawn = FILES.filter((f) => (
    new RegExp(`data-quick-create=["']${key}["']`).test(f.text)
    || new RegExp(`data-quick-create=\\{[^}]*\\}`).test(f.text)
  ));
  const gated = drawn.filter((f) => f.text.includes('canUseQuickCreate'));
  if (!drawn.length) return null;
  return gated.length === drawn.length ? gated.map((f) => f.file).join(', ') : false;
}

// ── dropdowns ──────────────────────────────────────────────────────────────

/**
 * "Hidden" is honoured when some screen asks `canSeeDropdown` for this page,
 * and asks it for this key. Scoping ("whose records may it offer") travels to
 * the server as a query hint, so `dropdownHint` for the page is what to look
 * for there.
 */
/** Does ViewGate hide dropdowns for every page, the way it hides columns? */
const CENTRAL_DROPDOWN_GATE = (() => {
  const gate = FILES.find((f) => f.file === 'components/ViewGate.js');
  return Boolean(gate && gate.text.includes('function gateDropdowns'));
})();

function dropdownGate(pageKey, key) {
  const bound = FILES.filter((f) => new RegExp(`canSeeDropdown\\(\\s*\\w+\\s*,\\s*['"]${pageKey}['"]`).test(f.text)
    || new RegExp(`canSeeDropdown\\(\\s*\\w+\\s*,\\s*\\w+\\s*,`).test(f.text) && f.text.includes(`'${pageKey}'`));
  const asked = bound.some((f) => new RegExp(`showDropdown\\(\\s*['"]${key}['"]`).test(f.text)
    || new RegExp(`canSeeDropdown\\([^)]*['"]${key}['"]`).test(f.text));
  // Either through the helper, or written out — several loaders pass the three
  // query parameters inline, which is the same request on the wire.
  const viaHelper = new RegExp(`dropdownHint\\(\\s*(['"]${pageKey}['"]|\\w+)\\s*,[^)]*['"]${key}['"]`).test(ALL);
  const inline = new RegExp(`forPage:\\s*['"]${pageKey}['"][^}]{0,160}?forField:\\s*['"]${key}['"]`).test(ALL);
  const hinted = viaHelper || inline;
  const scoped = hinted || scopedOnServer(pageKey, key);
  // Hiding is enforced centrally from the DOM, so a screen asking for itself is
  // belt and braces rather than the only thing between the role and the field.
  // Scoping cannot be: only the call site knows which request it is loading, so
  // the hint has to be sent there.
  return {
    hidden: asked || CENTRAL_DROPDOWN_GATE,
    hiddenBy: asked ? 'screen' : 'ViewGate',
    scoped,
    scopedBy: hinted ? 'query hint' : (scoped ? 'the page meta endpoint' : null),
  };
}

// ── actions ────────────────────────────────────────────────────────────────

/**
 * Pages whose write actions have endpoints but no screen behind them, so there
 * is no button to gate. Every entry is a decision, not a shrug.
 */
const NO_WRITE_SCREEN = new Map([
  ['reports', 'saved report definitions (reportsAPI create/update/delete) have endpoints, but no screen calls them — the Reports page runs the fixed analytics endpoints instead'],
]);

/** Is any write action of this page gated on the screen at all? */
function actionGate(pageKey) {
  const patterns = [
    `pageActions(user, '${pageKey}')`, `pageActions(currentUser, '${pageKey}')`,
    `pageActions(user, "${pageKey}")`, `pageActions(currentUser, "${pageKey}")`,
    `canRoleDo(user, '${pageKey}'`, `canRoleDo(currentUser, '${pageKey}'`,
    `getRoleJob(user, '${pageKey}')`, `getRoleJob(currentUser, '${pageKey}')`,
    `'${pageKey}'`,
  ];
  // The last pattern is deliberately loose: several screens resolve the page
  // key through a config object, so naming it anywhere in a file that also
  // gates is the honest signal available without running the app.
  const named = FILES.filter((f) => f.text.includes(`'${pageKey}'`) || f.text.includes(`"${pageKey}"`));
  const gating = named.filter((f) => /pageActions\(|canRoleDo\(|policyAllows\(|documentPolicy\(/.test(f.text));
  if (!named.length) return { state: 'no screen names this page', files: [] };
  if (!gating.length) return { state: 'named but never gated', files: named.map((f) => f.file) };
  return { state: 'gated', files: gating.map((f) => f.file) };
}

// ── report ─────────────────────────────────────────────────────────────────

const gaps = { quickCreate: [], dropdownHidden: [], dropdownScope: [], actions: [] };
const notes = [];
const rows = [];

for (const [pageKey, entry] of Object.entries(PAGE_CATALOG)) {
  const quick = new Map();
  for (const form of ['create', 'edit']) {
    for (const item of entry?.forms?.[form]?.quickCreate || []) {
      if (!quick.has(item.key)) quick.set(item.key, quickCreateGate(item.key));
    }
  }
  const drops = new Map();
  for (const form of ['create', 'edit', 'filters']) {
    for (const dd of entry?.forms?.[form]?.dropdowns || []) {
      if (dd.model === 'static') continue;          // a fixed list, nothing to scope
      if (!drops.has(dd.key)) drops.set(dd.key, { ...dropdownGate(pageKey, dd.key), scopeable: dd.scope });
    }
  }
  const actions = actionGate(pageKey);

  quick.forEach((where, key) => {
    if (where === null || where === false) gaps.quickCreate.push(`${pageKey} → "${key}"${where === false ? ' (drawn without the helper)' : ' (no button found)'}`);
  });
  drops.forEach((state, key) => {
    if (!state.hidden) gaps.dropdownHidden.push(`${pageKey} → "${key}"`);
    if (state.scopeable && !state.scoped) gaps.dropdownScope.push(`${pageKey} → "${key}"`);
  });
  if (actions.state !== 'gated' && (PAGE_CAPABILITIES[pageKey]?.actions || []).length) {
    if (NO_WRITE_SCREEN.has(pageKey)) notes.push(`${pageKey} — ${NO_WRITE_SCREEN.get(pageKey)}`);
    else gaps.actions.push(`${pageKey} — ${actions.state}`);
  }

  rows.push({
    pageKey,
    columns: entry.columns?.length || 0,
    drawerFields: entry.drawer?.fields?.length || 0,
    drawerExtras: entry.drawer?.extras?.length || 0,
    quickCreate: [...quick.entries()],
    dropdowns: [...drops.entries()],
    actions,
  });
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ rows, gaps }, null, 2));
  process.exit(0);
}

const total = (list) => list.length;

console.log('ROLE JOBS → SCREEN COVERAGE');
console.log('='.repeat(78));
console.log('Columns, drawer rows and drawer buttons are gated centrally by');
console.log('frontend/src/components/ViewGate.js and are not listed per page.\n');

if (process.argv.includes('--full')) {
  for (const row of rows) {
    console.log(`\n## ${row.pageKey}`);
    console.log(`   actions      : ${row.actions.state}`);
    console.log(`   catalog      : ${row.columns} column(s), ${row.drawerFields} drawer row(s), ${row.drawerExtras} drawer button(s)`);
    if (row.quickCreate.length) {
      row.quickCreate.forEach(([key, where]) => {
        console.log(`   quick create : ${key.padEnd(16)} ${where === null ? 'NO BUTTON FOUND' : where === false ? 'NOT GATED' : where}`);
      });
    }
    if (row.dropdowns.length) {
      row.dropdowns.forEach(([key, state]) => {
        const bits = [state.hidden ? 'hide: yes' : 'hide: NO', state.scopeable ? (state.scoped ? 'scope: yes' : 'scope: NO') : 'scope: n/a'];
        console.log(`   dropdown     : ${key.padEnd(16)} ${bits.join('   ')}`);
      });
    }
  }
  console.log('');
}

console.log(`\nGAPS\n${'-'.repeat(78)}`);
console.log(`\nAction buttons never gated on the screen (${total(gaps.actions)}):`);
gaps.actions.forEach((line) => console.log(`  - ${line}`));
console.log(`\n"+ Create X" shortcuts not behind canUseQuickCreate (${total(gaps.quickCreate)}):`);
gaps.quickCreate.forEach((line) => console.log(`  - ${line}`));
console.log(`\nDropdowns whose "Hidden" setting no screen reads (${total(gaps.dropdownHidden)}):`);
gaps.dropdownHidden.forEach((line) => console.log(`  - ${line}`));
console.log(`\nScopeable dropdowns that send no scope hint (${total(gaps.dropdownScope)}):`);
gaps.dropdownScope.forEach((line) => console.log(`  - ${line}`));
if (notes.length) {
  console.log('\nNoted, not counted:');
  notes.forEach((line) => console.log(`  - ${line}`));
}

const worst = total(gaps.actions) + total(gaps.quickCreate) + total(gaps.dropdownHidden) + total(gaps.dropdownScope);
console.log(`\n${worst} control(s) offered in Role Jobs that no screen honours.`);
process.exit(worst ? 1 : 0);
