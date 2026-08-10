/**
 * Every button in the app that changes something, and whether a permission
 * decides that it is shown.
 *
 * The permission model has three places an action can go wrong, and only two of
 * them were ever checked. `audit_page_operations.js` proves each endpoint has a
 * guard and that `PAGE_CAPABILITIES` offers exactly the actions the routes
 * implement. Neither says anything about the *button*. A button drawn with no
 * condition in front of it is offered to every role, and the only thing that
 * stops it is the 403 that comes back after the operator has already filled in
 * the form — which reads as the system being broken, not as a permission.
 *
 * Quotations → Convert was exactly that: rendered whenever the quotation was
 * approved, guarded on the server by `quotations.edit`, and gated in the UI by
 * nothing at all.
 *
 *   node scripts/audit_action_buttons.js           # readable report
 *   node scripts/audit_action_buttons.js --json
 *
 * Static, like its sibling: no server, no browser. It finds handlers that call a
 * mutating API, follows them to where they are wired into JSX, and reports the
 * condition guarding that spot.
 */
const fs = require('fs');
const path = require('path');

const SRC = path.resolve(__dirname, '..', '..', 'frontend', 'src');

const files = [];
const walk = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.jsx?$/.test(entry.name)) files.push(full);
  }
};
['pages', 'components'].forEach((dir) => walk(path.join(SRC, dir)));

/** An API call that changes something on the server. */
const MUTATING_CALL = /\b(?:API|api)\w*\.(?:create|update|delete|remove|convert|approve|reject|allocate|deliver|send\w*|post|put|patch|generate|cancel|lock|post\w*|pay|record|bulk\w*|toggle|assign|import|restore|duplicate)\w*\s*\(/;
const MUTATING_VERB = /\.(?:post|put|patch|delete)\s*\(/;

/** Anything that reads like a permission decision. */
const GUARD = /\bcan[A-Z]\w*|policyAllows|canRoleDo|isSuperAdmin|allow[A-Z]\w*|show(?:Edit|Delete|Create|View)\b|permissions?\./;

/** Handlers whose name says they only open a form; the form's own submit is
 *  where the write happens and where the guard belongs. */
const OPENS_ONLY = /^(?:openModal|openDrawer|handleView|onView|setDrawer)/;

/**
 * Handlers that mutate, following one hop of indirection.
 *
 * A row action usually opens a modal — `handleConvertClick` sets some state, the
 * modal's `handleConvertConfirm` does the write. Only the second one calls an
 * API, so looking for API calls alone finds the submit button inside a modal
 * that is already only reachable from the row action, and misses the row action
 * itself, which is the button whose visibility the permission is supposed to
 * decide. So an opener that shares a stem with a mutating handler counts too.
 */
function mutatingHandlers(source) {
  const positions = [];
  const declaration = /(?:const|function)\s+(handle\w+|submit\w*|save\w*|do\w+)\s*[=(]/g;
  let match;
  while ((match = declaration.exec(source))) positions.push({ name: match[1], start: match.index });

  const mutating = new Set();
  const all = new Set();
  positions.forEach((item, index) => {
    all.add(item.name);
    const end = index + 1 < positions.length ? positions[index + 1].start : source.length;
    const body = source.slice(item.start, end);
    if (OPENS_ONLY.test(item.name)) return;
    if (MUTATING_CALL.test(body) || MUTATING_VERB.test(body)) mutating.add(item.name);
  });

  // `handleConvertConfirm` mutating makes `handleConvertClick` an action too.
  const stem = (name) => name.replace(/^handle/, '').replace(/(Click|Confirm|Submit|Save)$/, '');
  const mutatingStems = new Set([...mutating].map(stem));
  all.forEach((name) => { if (mutatingStems.has(stem(name))) mutating.add(name); });
  return [...mutating];
}

/**
 * The condition in front of a JSX spot, if any.
 *
 * Both shapes this codebase uses are handled: the `...(cond ? [{…}] : [])`
 * spread inside a `customActions` array, and `{cond && <button …>}`. The
 * condition is whatever sits between the last `(`/`{` opener on the line — or
 * the preceding lines of the same entry — and the `?`/`&&`.
 */
function guardFor(lines, index) {
  const window = lines.slice(Math.max(0, index - 6), index + 1).join('\n');
  const spread = window.match(/\.\.\.\(([^?]*)\?/);
  if (spread) return { text: spread[1].trim(), guarded: GUARD.test(spread[1]) };
  const conditional = window.match(/\{\s*([^{}]*?)\s*&&\s*<(?:button|Button)/);
  if (conditional) return { text: conditional[1].trim(), guarded: GUARD.test(conditional[1]) };
  const onLine = lines[index];
  if (GUARD.test(onLine)) return { text: onLine.trim().slice(0, 80), guarded: true };
  // A button that is always drawn but disabled on the permission is guarded
  // too — the scanner's submit works this way, so that the operator can see the
  // action exists and read why it is unavailable.
  const nearby = lines.slice(index, index + 8).join('\n');
  const disabled = nearby.match(/disabled=\{([^}]*)\}/);
  if (disabled && GUARD.test(disabled[1])) return { text: `disabled on ${disabled[1].trim().slice(0, 50)}`, guarded: true };
  return { text: '', guarded: false };
}

const report = [];
for (const file of files) {
  const source = fs.readFileSync(file, 'utf8');
  const handlers = mutatingHandlers(source);
  if (!handlers.length) continue;
  const lines = source.split(/\r?\n/);
  const relative = path.relative(SRC, file).replace(/\\/g, '/');

  handlers.forEach((handler) => {
    lines.forEach((line, index) => {
      // Where the handler is wired to something clickable.
      if (!new RegExp(`on(?:Click|Submit)[=:]\\s*[({][^\\n]*\\b${handler}\\b`).test(line)) return;
      const guard = guardFor(lines, index);
      report.push({ file: relative, line: index + 1, handler, guarded: guard.guarded, condition: guard.text });
    });
  });
}

const ungated = report.filter((entry) => !entry.guarded);

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ total: report.length, ungated }, null, 2));
} else {
  console.log(`Clickable spots wired to a mutating handler: ${report.length}`);
  console.log(`Shown without any permission condition:      ${ungated.length}\n`);
  if (ungated.length) {
    ungated.forEach((entry) => console.log(
      `  ${(entry.file + ':' + entry.line).padEnd(38)} ${entry.handler}${entry.condition ? `   [${entry.condition.slice(0, 46)}]` : ''}`,
    ));
    console.log('\nA form submit inside a modal that only a permitted button can open is');
    console.log('fine — check the opener. Anything else is a button every role is offered.');
  }
}

process.exitCode = 0;
