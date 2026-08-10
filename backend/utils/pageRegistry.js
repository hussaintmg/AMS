/**
 * What a page key means, resolved by path rather than by string equality.
 *
 * A permission check has three separate ideas of a page's name: the literal a
 * route guard was written with (`authorizeAction('part_scan', …)`), the `name`
 * on the Page document the Role Jobs card is built from, and the `pageKey` a
 * saved job carries. They only match because they were all seeded from the same
 * table — and on an installation seeded at a different time, or migrated from an
 * older key, they are not the same string. The administrator ticks Create on the
 * card in front of them, the guard looks up a name nothing in that role uses,
 * and the operator is refused with nothing on either side explaining it.
 *
 * A path is the stable identity: `/parts-sales/barcode-scan` is the Parts Scan
 * screen whatever the key in front of it is called. This module resolves keys
 * through paths, so a name that misses can still be matched.
 *
 * Lookups are synchronous because every caller is (middleware, `getJob`). The
 * built-in table in `constants/pages` answers on its own, and a live overlay
 * read from the Page collection is layered on top when the database has been
 * customised. The overlay is primed at boot and refreshed after page writes;
 * until it arrives the built-in table is already correct for a stock install.
 */
const { PAGES, normalizePath } = require('../constants/pages');

/** name → Set of normalised paths, from the built-in table. */
const staticPaths = new Map(
  PAGES.map((page) => [page.name, new Set([page.path, ...(page.legacy || [])].map(normalizePath))]),
);
const staticModules = new Map(PAGES.map((page) => [page.name, page.module]));

/** The same, read from the Page collection. Empty until primed. */
let livePaths = new Map();
let liveModules = new Map();
let primedAt = 0;
let priming = null;

/**
 * How long the overlay is trusted before a lookup quietly refreshes it.
 *
 * The model's write hook only fires in the process that did the write. Under a
 * process manager running several workers — which is how this is deployed — a
 * page renamed on one worker would never reach the others, and they would go on
 * deciding access from the layout the pages had when they booted. The refresh
 * runs in the background and never blocks the lookup that triggered it, so the
 * worst case is one more request answered from slightly stale data.
 */
const OVERLAY_TTL_MS = 5 * 60 * 1000;

const refreshIfStale = () => {
  if (priming || Date.now() - primedAt < OVERLAY_TTL_MS) return;
  priming = prime().finally(() => { priming = null; });
};

/**
 * Read the Page collection into the overlay.
 *
 * Called once at boot and again whenever pages are written. Never throws into
 * its caller: a registry that could not load leaves the built-in table in
 * charge, which is the behaviour every check had before this module existed.
 */
async function prime() {
  try {
    const { Page } = require('../models');
    const pages = await Page.find({}).select('name path module').lean();
    const paths = new Map();
    const modules = new Map();
    pages.forEach((page) => {
      if (!page?.name) return;
      const normalized = normalizePath(page.path);
      if (normalized) paths.set(page.name, new Set([normalized]));
      if (page.module) modules.set(page.name, page.module);
    });
    livePaths = paths;
    liveModules = modules;
    primedAt = Date.now();
    return paths.size;
  } catch {
    // Try again on the next lookup rather than sitting on a failed load for the
    // whole TTL; the built-in table answers in the meantime.
    primedAt = 0;
    return 0;
  }
}

/** Every path that has ever meant this page, built-in and live alike. */
const pathsFor = (pageKey) => {
  refreshIfStale();
  const set = new Set(staticPaths.get(pageKey) || []);
  (livePaths.get(pageKey) || []).forEach((item) => set.add(item));
  return set;
};

/** The path a page lives at now, preferring what the database actually holds. */
const pathFor = (pageKey) => {
  const live = livePaths.get(pageKey);
  if (live && live.size) return [...live][0];
  const table = PAGES.find((page) => page.name === pageKey);
  return table ? normalizePath(table.path) : '';
};

const moduleFor = (pageKey) => liveModules.get(pageKey) || staticModules.get(pageKey) || '';

/**
 * Every key that names the same screen as `pageKey`.
 *
 * Always includes `pageKey` itself. Adds any other page — built-in or live —
 * sitting on one of its paths, and any of `permissions`' own rows whose stored
 * path points there. That last source is what rescues an installation whose
 * Page collection has drifted: the role still carries the path it was granted
 * under, so the path maps back to whatever key that role actually uses.
 */
const keysForPage = (pageKey, permissions = []) => {
  refreshIfStale();
  const keys = new Set([pageKey]);
  const paths = pathsFor(pageKey);
  if (!paths.size) return keys;

  const add = (name, candidatePaths) => {
    if (!name || keys.has(name)) return;
    if ([...candidatePaths].some((item) => paths.has(item))) keys.add(name);
  };

  PAGES.forEach((page) => add(page.name, new Set([page.path, ...(page.legacy || [])].map(normalizePath))));
  livePaths.forEach((set, name) => add(name, set));
  (Array.isArray(permissions) ? permissions : []).forEach((permission) => {
    const stored = normalizePath(permission?.path);
    if (stored && paths.has(stored) && permission.pageKey) keys.add(permission.pageKey);
  });

  return keys;
};

/**
 * The built-in key for whatever this database calls the page.
 *
 * Pages added by hand through Frontend Management take their key from the label
 * they were typed with, so a live install can hold the Parts Scan screen as
 * "Parts Barcode Scan". Route guards, the capability table and the frontend all
 * look for `part_scan`. Translating on the way out — see the auth routes — means
 * the rest of the application only ever sees the key it was written against.
 *
 * `permissions` is consulted the same way `keysForPage` does, because a role's
 * own rows carry the path even where the Page collection has drifted too.
 * Returns the key unchanged when it names no page this build knows.
 */
const canonicalKey = (pageKey, permissions = []) => {
  if (staticPaths.has(pageKey)) return pageKey;
  const paths = new Set();
  (livePaths.get(pageKey) || []).forEach((item) => paths.add(item));
  (Array.isArray(permissions) ? permissions : []).forEach((permission) => {
    if (permission?.pageKey === pageKey) {
      const stored = normalizePath(permission.path);
      if (stored) paths.add(stored);
    }
  });
  if (!paths.size) return pageKey;
  const match = PAGES.find((page) => [page.path, ...(page.legacy || [])]
    .map(normalizePath)
    .some((item) => paths.has(item)));
  return match ? match.name : pageKey;
};

/**
 * The page an incoming *frontend* path belongs to — the longest page path that
 * the request path starts on, so `/parts-sales/barcode-scan?doc=quotation`
 * resolves to Parts Scan and never to a shorter unrelated page.
 */
const keyForPath = (requestPath) => {
  const target = normalizePath(requestPath);
  if (!target) return '';
  let best = '';
  let bestLength = 0;
  const consider = (name, candidate) => {
    if (!candidate) return;
    const matches = target === candidate || target.startsWith(`${candidate}/`);
    if (matches && candidate.length > bestLength) { best = name; bestLength = candidate.length; }
  };
  PAGES.forEach((page) => [page.path, ...(page.legacy || [])].forEach((item) => consider(page.name, normalizePath(item))));
  livePaths.forEach((set, name) => set.forEach((item) => consider(name, item)));
  return best;
};

/**
 * A role's stored rows, restated in the keys this build uses.
 *
 * Applied to what the auth routes hand the browser: the frontend decides what a
 * screen may offer by looking its own page key up in `role.jobs`, and it has no
 * page table of its own to resolve a database that calls the page something
 * else. Translating here keeps that table in one place — this one — instead of
 * shipping a second copy to the client that could drift from it.
 */
const canonicalizeRows = (rows, permissions) => {
  const seen = new Set();
  return (Array.isArray(rows) ? rows : []).map((row) => {
    const source = typeof row?.toObject === 'function' ? row.toObject() : row;
    if (!source?.pageKey) return source;
    const key = canonicalKey(source.pageKey, permissions);
    // Two rows can normalise onto one page — a leftover under the old key and
    // the one in use. The first wins; a later duplicate keeps its own key so it
    // is still visible rather than silently masking the row in front of it.
    if (key !== source.pageKey && seen.has(key)) return source;
    seen.add(key);
    return { ...source, pageKey: key };
  });
};

module.exports = {
  prime, pathFor, pathsFor, moduleFor, keysForPage, keyForPath, canonicalKey, canonicalizeRows, normalizePath,
};
