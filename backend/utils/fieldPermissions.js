/**
 * Enforcement side of the field-visibility catalog.
 *
 * `fieldMask(pageKey)` is an Express middleware: it wraps `res.json` so that
 * whatever the controller finally sends has the role's withheld columns removed
 * before it leaves the process. Doing it at the edge rather than inside every
 * controller means a new endpoint on an already-guarded router is covered the
 * moment it is added, and there is exactly one place where "hidden" is decided.
 *
 * Masking deletes keys instead of blanking them, so a client can tell "you may
 * not see this" apart from "this is empty".
 */
const { FIELD_CATALOG } = require('../constants/fieldPermissions');
const { getJob } = require('./roleJobs');

/** Record arrays hide under these keys in the various response envelopes. */
const COLLECTION_KEYS = [
  'parts', 'items', 'rows', 'records', 'results', 'docs', 'list',
  'customers', 'leads', 'vehicles', 'employees',
  'quotations', 'bookings', 'orders', 'invoices',
  'quotation', 'booking', 'order', 'invoice', 'customer', 'lead', 'vehicle', 'part', 'employee',
];

/** Product-line arrays inside a single record. */
const LINE_KEYS = ['line_items', 'lineItems', 'items'];

/**
 * What this user may not see on `pageKey`.
 * Returns null when nothing is withheld (super admin, no job, or mode "all").
 *
 * `pageKey` may be a list, for endpoints several pages can reach (the parts
 * screens share the vehicle sales endpoints, the scanner raises documents it
 * has no list page for). The first page the role actually holds a job on wins,
 * so the rules that apply are the ones set on the screen they came from.
 */
const withheldKeys = (user, pageKey) => {
  const candidates = (Array.isArray(pageKey) ? pageKey : [pageKey]).filter((key) => FIELD_CATALOG[key]);
  const resolved = candidates.find((key) => getJob(user, key)) || candidates[0];
  const page = FIELD_CATALOG[resolved];
  if (!page) return null;
  const job = getJob(user, resolved);
  if (!job || job.superAdmin) return null;
  const fields = job.fields || {};
  if (fields.mode !== 'selected') return null;

  const allowed = new Set(Array.isArray(fields.allowed) ? fields.allowed.map(String) : []);
  const keys = new Set();
  const lineKeys = new Set();
  page.fields.forEach((field) => {
    if (allowed.has(field.key)) return;
    (field.keys || []).forEach((key) => keys.add(key));
    (field.lineKeys || []).forEach((key) => lineKeys.add(key));
  });
  if (!keys.size && !lineKeys.size) return null;
  return { keys, lineKeys };
};

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

/**
 * A Mongoose document, as opposed to a plain object or a Date.
 *
 * `toObject` is the tell: Dates have `toJSON` but not `toObject`, so testing for
 * both keeps a date value from being flattened into a string on its way past.
 */
const isMongooseDoc = (value) => typeof value?.toObject === 'function' && typeof value?.toJSON === 'function';

/**
 * Withheld keys are removed from a *plain* copy, because `delete doc.email` on
 * a Mongoose document is a silent no-op — the value lives in the document's
 * internal state and comes back the moment Express serialises it. Controllers
 * that end in `.lean()` were masked correctly; the ones that send documents
 * (Employees is one) leaked every withheld column into the payload while the
 * table above them dutifully hid it.
 *
 * Returns the record to store back in its parent, which is a new object
 * whenever a document had to be converted.
 */
const maskRecord = (record, withheld) => {
  if (!isRecord(record)) return record;
  const target = isMongooseDoc(record) ? record.toJSON() : record;
  withheld.keys.forEach((key) => { delete target[key]; });
  if (withheld.lineKeys.size) {
    LINE_KEYS.forEach((listKey) => {
      const lines = target[listKey];
      if (!Array.isArray(lines)) return;
      lines.forEach((line, index) => {
        if (!isRecord(line)) return;
        // Sub-documents need the same treatment as their parent.
        const lineTarget = isMongooseDoc(line) ? line.toJSON() : line;
        withheld.lineKeys.forEach((key) => { delete lineTarget[key]; });
        lines[index] = lineTarget;
      });
    });
  }
  return target;
};

/**
 * Mask every record reachable from a response payload. Only one level of
 * nesting is followed — the record itself and the collections it is wrapped in
 * — so a lookup list hanging off the same payload (statuses, cities, users…)
 * keeps its own `name`/`email` keys.
 */
const maskPayload = (payload, withheld) => {
  if (Array.isArray(payload)) {
    // Written back by index: masking a document yields a new plain object, so
    // mutating in place alone would leave the original in the array.
    payload.forEach((item, index) => { payload[index] = maskRecord(item, withheld); });
    return payload;
  }
  if (!isRecord(payload)) return payload;
  const masked = maskRecord(payload, withheld);
  COLLECTION_KEYS.forEach((key) => {
    const value = masked[key];
    if (Array.isArray(value)) value.forEach((item, index) => { value[index] = maskRecord(item, withheld); });
    else if (isRecord(value)) masked[key] = maskRecord(value, withheld);
  });
  return masked;
};

/** Mask an already-built object (for controllers that need it inline). */
const maskForUser = (user, pageKey, payload) => {
  const withheld = withheldKeys(user, pageKey);
  return withheld ? maskPayload(payload, withheld) : payload;
};

/**
 * Express middleware, mounted with `router.use()` at the top of a router whose
 * page appears in the catalog. The role is read when the response is written
 * rather than when the middleware runs, so it can sit ahead of `authenticate`
 * without needing a second token verification of its own.
 */
const fieldMask = (pageKey) => (req, res, next) => {
  const send = res.json.bind(res);
  res.json = (body) => {
    const withheld = withheldKeys(req.user, pageKey);
    if (!withheld) return send(body);
    // Assigned back, not just mutated: masking a Mongoose document returns a
    // new plain object, and dropping it would send the unmasked original.
    if (body && typeof body === 'object' && 'data' in body) {
      body.data = maskPayload(body.data, withheld);
      return send(body);
    }
    return send(maskPayload(body, withheld));
  };
  next();
};

/**
 * The role's field settings for every catalog page, for /auth/me. Super admins
 * and roles with no restriction return an empty object, which the frontend
 * reads as "show everything".
 */
const fieldPermissionsForUser = (user) => {
  if (!user || user.isSuperAdmin) return {};
  const result = {};
  Object.keys(FIELD_CATALOG).forEach((pageKey) => {
    const job = getJob(user, pageKey);
    const fields = job?.fields;
    if (fields?.mode === 'selected') {
      result[pageKey] = { mode: 'selected', allowed: Array.isArray(fields.allowed) ? fields.allowed.map(String) : [] };
    }
  });
  return result;
};

module.exports = { fieldMask, maskForUser, withheldKeys, fieldPermissionsForUser };
