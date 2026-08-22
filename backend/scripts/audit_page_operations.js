/**
 * Static audit of "what actually happens on each page".
 *
 * Walks every mounted router, resolves the page/action guard on each endpoint,
 * follows the endpoint to its controller function and reports which Mongoose
 * models that function reads and which it writes. The result is the ground
 * truth behind two things:
 *
 *   - the Role Jobs screen, which should only offer actions a page really has;
 *   - any answer to "can this role see customer phone numbers on Invoices?".
 *
 *   node scripts/audit_page_operations.js            # readable report
 *   node scripts/audit_page_operations.js --json     # machine-readable
 *   node scripts/audit_page_operations.js --capabilities  # PAGE_CAPABILITIES shape
 *
 * It is deliberately static — no server, no database. Regex-level analysis of
 * a codebase this consistent is accurate enough to drive the UI, and anything
 * it cannot resolve is reported as "unguarded"/"unknown" rather than guessed.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ROUTES_DIR = path.join(ROOT, 'routes');
const CONTROLLERS_DIR = path.join(ROOT, 'controllers');

const read = (file) => fs.readFileSync(file, 'utf8');

// ── mount table ────────────────────────────────────────────────────────────

/** `app.use("/api/x", yRoutes)` + `const yRoutes = require("./routes/z")`. */
function readMounts() {
  const server = read(path.join(ROOT, 'server.js'));
  const requires = new Map();
  for (const m of server.matchAll(/const\s+(\w+)\s*=\s*require\(["']\.\/routes\/([\w.-]+)["']\)/g)) {
    requires.set(m[1], `${m[2]}.js`.replace(/\.js\.js$/, '.js'));
  }
  const mounts = [];
  for (const m of server.matchAll(/app\.use\(\s*["']([^"']+)["']\s*,\s*(\w+)\s*\)/g)) {
    const file = requires.get(m[2]);
    if (file) mounts.push({ base: m[1], file });
  }
  return mounts;
}

// ── route extraction ───────────────────────────────────────────────────────

const METHODS = ['get', 'post', 'put', 'patch', 'delete'];

/**
 * `authorizeAction('quotations', …)` also accepts Vehicle Scan, because the
 * scanner raises documents it has no list page for. The table lives in the
 * middleware, so read it from there rather than restating it.
 */
const MIDDLEWARE_ALIASES = (() => {
  const source = read(path.join(ROOT, 'middleware', 'auth.js'));
  const block = source.match(/const PAGE_ALIASES\s*=\s*\{([\s\S]*?)\n\};/);
  const table = {};
  // `const SCAN_CREATE_ONLY = { page: 'vehicle_scan', actions: ['create'] }`
  const consts = new Map();
  for (const m of source.matchAll(/const\s+(\w+)\s*=\s*\{\s*page:\s*['"]([\w-]+)['"]\s*,\s*actions:\s*\[([^\]]*)\]/g)) {
    consts.set(m[1], { page: m[2], actions: m[3].split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean) });
  }
  if (block) {
    for (const m of block[1].matchAll(/(\w+)\s*:\s*\[([^\]]*)\]/g)) {
      table[m[1]] = m[2].split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean)
        .map((entry) => consts.get(entry) || entry);
    }
  }
  return table;
})();

/** Keep only the alias entries that apply to `action`. */
const applicable = (entries, action) => entries
  .filter((entry) => typeof entry === 'string' || !entry.actions || entry.actions.includes(action))
  .map((entry) => (typeof entry === 'string' ? entry : entry.page));

/**
 * Guards are written four ways in this codebase; all of them end up naming a
 * page and an action, so they are normalised to one shape here.
 */
function guardResolver(source) {
  // `const canView = authorizeAction('parts', 'view')` and the array form
  // `const canView = [authenticate, authorizeAction('customers', 'view')]`.
  const aliases = new Map();
  for (const m of source.matchAll(/const\s+(\w+)\s*=\s*[^;\n]*?authorizeAction\(\s*(\[[^\]]*\]|["'][\w-]+["'])\s*(?:,\s*["'](\w+)["'])?\s*\)/g)) {
    aliases.set(m[1], { page: m[2], action: m[3] || 'view' });
  }
  // `const can = (page, action) => authorizeAction(PARTS_PAGES[page] || page, action)`
  const hasCanHelper = /const\s+can\s*=\s*\(/.test(source);
  // Action-scoped entries the local page table refers to, e.g.
  // `const SCAN = { page: 'part_scan', actions: ['create'] }`.
  const localConsts = new Map();
  for (const m of source.matchAll(/const\s+(\w+)\s*=\s*\{\s*page:\s*['"]([\w-]+)['"]\s*,\s*actions:\s*\[([^\]]*)\]/g)) {
    localConsts.set(m[1], { page: m[2], actions: m[3].split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean) });
  }
  // `const PARTS_PAGES = { quotations: [...] }`
  const pageMaps = {};
  for (const m of source.matchAll(/const\s+(\w*PAGES?\w*)\s*=\s*\{([\s\S]*?)\n\};/g)) {
    const table = {};
    for (const e of m[2].matchAll(/(\w+)\s*:\s*\[([^\]]*)\]/g)) {
      table[e[1]] = e[2].split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean)
        .map((entry) => localConsts.get(entry) || entry);
    }
    if (Object.keys(table).length) pageMaps[m[1]] = table;
  }
  const partsTable = pageMaps.PARTS_PAGES || null;

  const cleanPage = (raw, action) => {
    if (!raw) return null;
    if (raw.startsWith('[')) {
      const entries = raw.slice(1, -1).split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean)
        .map((entry) => localConsts.get(entry) || MIDDLEWARE_ALIASES[entry] || entry);
      return applicable(entries.flat(), action);
    }
    const single = raw.replace(/^['"]|['"]$/g, '');
    if (partsTable && partsTable[single]) return applicable(partsTable[single], action);
    return applicable(MIDDLEWARE_ALIASES[single] || [single], action);
  };

  // `authorizeRouter('page', [{ pattern: /…/, method: 'POST', action: 'edit' }])`
  // guards a whole router by HTTP method, so the action depends on the request
  // rather than the line. Parse the page and its overrides once.
  const parseRouterGuard = (text) => {
    const m = text.match(/authorizeRouter\(\s*["']([\w-]+)["']\s*(?:,\s*\[([\s\S]*?)\]\s*)?\)/);
    if (!m) return null;
    const overrides = [];
    if (m[2]) {
      for (const o of m[2].matchAll(/\{\s*pattern:\s*\/((?:[^/\\]|\\.)*)\/\w*\s*(?:,\s*method:\s*["'](\w+)["'])?\s*,\s*action:\s*["'](\w+)["']/g)) {
        overrides.push({ pattern: new RegExp(o[1]), method: o[2] || null, action: o[3] });
      }
    }
    return { page: m[1], overrides };
  };

  const METHOD_ACTIONS = { GET: 'view', HEAD: 'view', POST: 'create', PUT: 'edit', PATCH: 'edit', DELETE: 'delete' };
  const routerAction = (guard, method, routerPath) => {
    const rule = guard.overrides.find((o) => o.pattern.test(routerPath) && (!o.method || o.method === method));
    return rule?.action || METHOD_ACTIONS[method] || 'view';
  };

  // Router-wide guards: `router.use([mountPath,] …, authorizeRouter('page'))`.
  const routerGuards = [];
  for (const m of source.matchAll(/router\.use\(([\s\S]*?)\);/g)) {
    const guard = parseRouterGuard(m[1]);
    if (!guard) continue;
    const mount = m[1].match(/^\s*["']([^"']+)["']\s*,/);
    routerGuards.push({ ...guard, mount: mount ? mount[1] : '' });
  }

  // Aliases can hold a router guard too: `const admin = [authenticate, authorizeRouter('pdf_management')]`.
  const routerAliases = new Map();
  // Walk to each `authorizeRouter(` and look *backwards* for the const it
  // belongs to. Matching forwards from `const … = [` instead would happily span
  // an unrelated array declared earlier in the file, and excluding `;` from the
  // gap is no help — the comments in between contain semicolons of their own.
  for (const m of source.matchAll(/authorizeRouter\(/g)) {
    const before = source.slice(0, m.index);
    const owner = [...before.matchAll(/const\s+(\w+)\s*=\s*\[/g)].pop();
    if (!owner) continue;
    // Only if nothing closed that statement in between.
    if (/;\s*$/.test(before.slice(owner.index).replace(/\/\/[^\n]*/g, ''))) continue;
    const guard = parseRouterGuard(source.slice(m.index));
    if (guard) routerAliases.set(owner[1], guard);
  }

  return (argsText, method = 'GET', routePath = '/') => {
    let m = argsText.match(/authorizeAction\(\s*(\[[^\]]*\]|["'][\w-]+["'])\s*(?:,\s*["'](\w+)["'])?/);
    if (m) return { pages: cleanPage(m[1], m[2] || 'view'), action: m[2] || 'view' };
    if (hasCanHelper) {
      m = argsText.match(/\bcan\(\s*["']([\w-]+)["']\s*,\s*["'](\w+)["']/);
      if (m) return { pages: cleanPage(`'${m[1]}'`, m[2]), action: m[2] };
    }
    // `authorizePicker('customers', 'Customer')` — the owning page, or any page
    // whose catalog says its form is filled from that list. Read-only, so the
    // action it grants is always view.
    m = argsText.match(/authorizePicker\(\s*["']([\w-]+)["']/);
    if (m) return { pages: [m[1]], action: 'view' };
    m = argsText.match(/authorizePage\(\s*["']([\w-]+)["']/);
    if (m) return { pages: [m[1]], action: 'view' };
    m = argsText.match(/bulkPermission\(\s*["']([\w-]+)["']/);
    if (m) return { pages: [m[1]], action: 'bulk' };
    for (const [alias, guard] of routerAliases) {
      if (new RegExp(`(^|[\\s,(])${alias}([\\s,)]|$)`).test(argsText)) {
        const action = routerAction(guard, method, routePath);
        return { pages: cleanPage(`'${guard.page}'`, action), action };
      }
    }
    for (const [alias, info] of aliases) {
      if (new RegExp(`(^|[\\s,(])${alias}([\\s,)]|$)`).test(argsText)) {
        return { pages: cleanPage(info.page, info.action), action: info.action };
      }
    }
    if (/requireSuperAdmin/.test(argsText)) return { pages: ['server_management'], action: 'superAdmin' };
    // Nothing on the line — fall back to a guard mounted over the whole router.
    const mounted = routerGuards
      .filter((g) => !g.mount || routePath === g.mount || routePath.startsWith(`${g.mount}/`))
      .sort((a, b) => b.mount.length - a.mount.length)[0];
    if (mounted) {
      const relative = mounted.mount ? routePath.slice(mounted.mount.length) || '/' : routePath;
      const action = routerAction(mounted, method, relative);
      return { pages: cleanPage(`'${mounted.page}'`, action), action };
    }
    return null;
  };
}

function extractRoutes(file, base) {
  const source = read(path.join(ROUTES_DIR, file));
  const resolve = guardResolver(source);
  // `const controller = require('../controllers/x.controller')` — so a handler
  // written `controller.getAllBookings` is looked up in the right file, not in
  // whichever controller happens to export the same function name.
  const controllerFiles = new Map();
  for (const m of source.matchAll(/const\s+(?:\{\s*[\w,\s]+\s*\}|(\w+))\s*=\s*require\(["']\.\.\/controllers\/([\w.-]+)["']\)/g)) {
    if (m[1]) controllerFiles.set(m[1], m[2].endsWith('.js') ? m[2] : `${m[2]}.js`);
  }
  const routes = [];
  const re = new RegExp(`router\\.(${METHODS.join('|')})\\(\\s*(\`[^\`]*\`|["'][^"']*["'])\\s*,([\\s\\S]*?)\\);`, 'g');
  for (const m of source.matchAll(re)) {
    const args = m[3];
    // The handler is the last identifier of the form `something.fn` or `fn`.
    const handlers = [...args.matchAll(/([\w]+)\.([\w]+)\s*(?:\)|$|,\s*$)/g)];
    const last = handlers[handlers.length - 1];
    const method = m[1].toUpperCase();
    const routerPath = m[2].replace(/[`'"]/g, '') || '/';
    routes.push({
      method,
      path: base + routerPath.replace(/^\/$/, ''),
      guard: resolve(args, method, routerPath),
      controller: last ? `${last[1]}.${last[2]}` : null,
      controllerFile: last ? controllerFiles.get(last[1]) || null : null,
      routeFile: file,
    });
  }
  return routes;
}

// ── controller → models ────────────────────────────────────────────────────

const MODEL_NAMES = fs.readdirSync(path.join(ROOT, 'models'))
  .filter((f) => f.endsWith('.model.js'))
  .map((f) => f.replace('.model.js', ''));

const WRITE_CALLS = /\.(create|insertMany|updateOne|updateMany|findOneAndUpdate|findByIdAndUpdate|deleteOne|deleteMany|findByIdAndDelete|findOneAndDelete|bulkWrite|save)\s*\(/;

/** Split a controller file into its exported functions. */
function controllerFunctions(file) {
  const source = read(path.join(CONTROLLERS_DIR, file));
  const marks = [];
  const patterns = [
    /exports\.(\w+)\s*=/g,
    /const\s+(\w+)\s*=\s*async\s*\(/g,
    /^const\s+(\w+)\s*=\s*\(/gm,
    /^(?:async\s+)?function\s+(\w+)\s*\(/gm,
  ];
  patterns.forEach((re) => { for (const m of source.matchAll(re)) marks.push({ name: m[1], at: m.index }); });
  marks.sort((a, b) => a.at - b.at);

  const fns = new Map();
  marks.forEach((mark, i) => {
    const end = i + 1 < marks.length ? marks[i + 1].at : source.length;
    const body = source.slice(mark.at, end);
    // Later definitions of the same name (re-export lines) must not blank it out.
    if (!fns.has(mark.name) || body.length > fns.get(mark.name).length) fns.set(mark.name, body);
  });
  return fns;
}

const controllerCache = new Map();
function analyseController(ref, preferredFile) {
  if (!ref) return null;
  const [, fnName] = ref.split('.');
  const all = fs.readdirSync(CONTROLLERS_DIR).filter((f) => f.endsWith('.js'));
  // The router says which controller module it imported; only fall back to a
  // name search when it didn't (destructured import, helper indirection).
  const candidates = preferredFile && all.includes(preferredFile) ? [preferredFile] : all;
  for (const file of candidates) {
    if (!controllerCache.has(file)) controllerCache.set(file, controllerFunctions(file));
    const fns = controllerCache.get(file);
    if (!fns.has(fnName)) continue;
    const body = fns.get(fnName);
    const reads = new Set();
    const writes = new Set();
    MODEL_NAMES.forEach((model) => {
      const uses = new RegExp(`\\b${model}\\s*\\.`, 'g');
      if (!uses.test(body)) return;
      reads.add(model);
      const writeNear = new RegExp(`\\b${model}\\s*${WRITE_CALLS.source}`);
      if (writeNear.test(body)) writes.add(model);
    });
    // `doc.save()` on a fetched document is a write of whatever was fetched.
    if (/\.save\(\)/.test(body)) reads.forEach((model) => {
      if (new RegExp(`${model}\\.(findOne|findById|find)\\b`).test(body)) writes.add(model);
    });
    return { file, reads: [...reads], writes: [...writes] };
  }
  return null;
}

// ── assembly ───────────────────────────────────────────────────────────────

function build() {
  const pages = new Map();
  const unguarded = [];

  readMounts().forEach(({ base, file }) => {
    if (!fs.existsSync(path.join(ROUTES_DIR, file))) return;
    extractRoutes(file, base).forEach((route) => {
      const info = analyseController(route.controller, route.controllerFile);
      const entry = {
        method: route.method,
        path: route.path,
        action: route.guard?.action || null,
        controller: route.controller,
        reads: info?.reads || [],
        writes: info?.writes || [],
      };
      if (!route.guard) { unguarded.push(entry); return; }
      route.guard.pages.forEach((page) => {
        if (!pages.has(page)) pages.set(page, { pageKey: page, endpoints: [], actions: new Set(), reads: new Set(), writes: new Set() });
        const bucket = pages.get(page);
        bucket.endpoints.push(entry);
        if (route.guard.action) bucket.actions.add(route.guard.action);
        entry.reads.forEach((m) => bucket.reads.add(m));
        entry.writes.forEach((m) => bucket.writes.add(m));
      });
    });
  });

  return {
    pages: [...pages.values()]
      .map((p) => ({ ...p, actions: [...p.actions].sort(), reads: [...p.reads].sort(), writes: [...p.writes].sort() }))
      .sort((a, b) => a.pageKey.localeCompare(b.pageKey)),
    unguarded,
  };
}

// ── outputs ────────────────────────────────────────────────────────────────

/** The per-page action list the Role Jobs UI should render. */
function capabilities(report) {
  const out = {};
  report.pages.forEach((page) => {
    const actions = page.actions.filter((a) => !['view', 'bulk', 'superAdmin'].includes(a));
    out[page.pageKey] = {
      actions,
      // Ownership-scoped pages are the ones whose records carry a creator.
      writes: page.writes,
    };
  });
  return out;
}

function main() {
  const report = build();
  if (process.argv.includes('--json')) { console.log(JSON.stringify(report, null, 2)); return; }
  if (process.argv.includes('--capabilities')) { console.log(JSON.stringify(capabilities(report), null, 2)); return; }

  console.log('PAGE OPERATIONS AUDIT\n' + '='.repeat(78));
  report.pages.forEach((page) => {
    console.log(`\n## ${page.pageKey}`);
    console.log(`   actions : ${page.actions.join(', ') || '(none)'}`);
    console.log(`   reads   : ${page.reads.join(', ') || '(none)'}`);
    console.log(`   writes  : ${page.writes.join(', ') || '(none)'}`);
    page.endpoints.forEach((e) => {
      const models = [e.writes.length ? `W:${e.writes.join('/')}` : '', e.reads.length ? `R:${e.reads.join('/')}` : '']
        .filter(Boolean).join('  ');
      console.log(`     ${String(e.action || '-').padEnd(12)} ${e.method.padEnd(6)} ${e.path.padEnd(52)} ${models}`);
    });
  });

  if (report.unguarded.length) {
    console.log(`\n\n## ENDPOINTS WITH NO PAGE GUARD (${report.unguarded.length})`);
    console.log('   Any signed-in user can call these. Read-only lookups are fine here;');
    console.log('   anything that writes is a hole.');
    report.unguarded
      .sort((a, b) => (b.writes.length - a.writes.length) || a.path.localeCompare(b.path))
      .forEach((e) => {
        const flag = e.writes.length ? 'WRITES' : '      ';
        console.log(`   ${flag} ${e.method.padEnd(6)} ${e.path.padEnd(52)} ${e.writes.join('/') || e.reads.join('/')}`);
      });
  }
}

if (require.main === module) main();
module.exports = { build, capabilities };
