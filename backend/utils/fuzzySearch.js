/**
 * Fuzzy search utilities: Levenshtein distance, synonym engine, phonetic matching
 * AMS ERP Global Search System
 */

const SYNONYM_MAP = new Map([
  ['car', ['vehicle', 'auto', 'automobile', 'sedan', 'suv']],
  ['vehicle', ['car', 'auto', 'automobile', 'sedan', 'suv']],
  ['auto', ['car', 'vehicle', 'automobile']],
  ['automobile', ['car', 'vehicle', 'auto']],
  ['employee', ['staff', 'worker', 'personnel', 'team member']],
  ['staff', ['employee', 'worker', 'personnel']],
  ['worker', ['employee', 'staff', 'personnel']],
  ['client', ['customer', 'buyer', 'purchaser']],
  ['customer', ['client', 'buyer', 'purchaser']],
  ['buyer', ['customer', 'client', 'purchaser']],
  ['invoice', ['bill', 'receipt', 'payment']],
  ['bill', ['invoice', 'receipt']],
  ['lead', ['prospect', 'opportunity', 'potential']],
  ['prospect', ['lead', 'opportunity']],
  ['part', ['spare', 'component', 'item', 'product']],
  ['spare', ['part', 'component']],
  ['component', ['part', 'spare']],
  ['product', ['part', 'item', 'spare']],
  ['warehouse', ['store', 'inventory', 'stock']],
  ['store', ['warehouse', 'inventory']],
  ['inventory', ['stock', 'warehouse', 'store']],
  ['quotation', ['quote', 'estimate', 'proposal']],
  ['quote', ['quotation', 'estimate', 'proposal']],
  ['estimate', ['quote', 'quotation']],
  ['booking', ['reservation', 'appointment', 'slot']],
  ['reservation', ['booking', 'appointment']],
  ['appointment', ['booking', 'reservation', 'slot']],
  ['repair', ['service', 'maintenance', 'fix']],
  ['service', ['repair', 'maintenance', 'fix']],
  ['maintenance', ['service', 'repair']],
  ['expense', ['cost', 'spending', 'payment', 'expenditure']],
  ['cost', ['expense', 'spending', 'expenditure']],
  ['leave', ['vacation', 'holiday', 'time off', 'absence']],
  ['vacation', ['leave', 'holiday', 'time off']],
  ['salary', ['pay', 'wage', 'compensation', 'payroll']],
  ['payroll', ['salary', 'wage', 'compensation']],
  ['wage', ['salary', 'pay', 'compensation']],
  ['report', ['analytics', 'summary', 'statement']],
  ['analytics', ['report', 'metrics', 'statistics']],
  ['user', ['employee', 'staff', 'account', 'login']],
  ['account', ['user', 'login', 'profile']],
  ['profile', ['user', 'account']],
  ['department', ['team', 'division', 'unit', 'group']],
  ['team', ['department', 'division', 'group']],
  ['manager', ['supervisor', 'lead', 'head', 'director']],
  ['admin', ['administrator', 'super admin', 'root']],
  ['administrator', ['admin', 'super admin']],
  ['email', ['mail', 'e-mail', 'electronic mail']],
  ['mail', ['email', 'e-mail']],
]);

function levenshtein(a, b, maxDistance = 2) {
  const aLen = a.length;
  const bLen = b.length;
  if (Math.abs(aLen - bLen) > maxDistance) return maxDistance + 1;
  if (aLen === 0) return bLen;
  if (bLen === 0) return aLen;
  let prevRow = Array.from({ length: bLen + 1 }, (_, i) => i);
  for (let i = 1; i <= aLen; i++) {
    let curRow = [i];
    for (let j = 1; j <= bLen; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curRow[j] = Math.min(
        prevRow[j] + 1,
        curRow[j - 1] + 1,
        prevRow[j - 1] + cost
      );
    }
    prevRow = curRow;
  }
  return prevRow[bLen];
}

function getSynonyms(word) {
  const w = word.toLowerCase().trim();
  const direct = SYNONYM_MAP.get(w) || [];
  const expanded = new Set([w, ...direct]);
  for (const [, values] of SYNONYM_MAP) {
    if (values.includes(w)) {
      for (const v of values) expanded.add(v);
    }
  }
  expanded.delete(w);
  return [...expanded];
}

function expandWithSynonyms(tokens) {
  const expanded = new Set();
  for (const token of tokens) {
    expanded.add(token);
    getSynonyms(token).forEach(s => expanded.add(s));
  }
  return [...expanded];
}

function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function normalizeQuery(text) {
  return String(text || '').trim().replace(/\s+/g, ' ');
}

function highlightMatches(text, query, format = 'mark') {
  if (!text || !query) return String(text || '');
  const tokens = tokenize(query);
  if (!tokens.length) return String(text);
  let result = String(text);
  for (const token of tokens) {
    const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escaped})`, 'gi');
    result = result.replace(regex, (match) =>
      format === 'mark' ? `<mark>${match}</mark>` : `**${match}**`
    );
  }
  return result;
}

const fuzzyScore = (query, targetText) => {
  const q = String(query || '').toLowerCase().trim();
  const t = String(targetText || '').toLowerCase().trim();
  if (!q || !t) return 0;
  if (t === q) return 1.0;
  if (t.startsWith(q)) return 0.95;
  if (t.includes(q)) return 0.85;
  const qTokens = tokenize(q);
  const tTokens = tokenize(t);
  const matched = qTokens.filter(qt => tTokens.some(tt => tt.includes(qt) || qt.includes(tt)));
  if (matched.length === qTokens.length) return 0.7;
  if (matched.length / qTokens.length >= 0.6) return 0.5;
  const anyTokenMatch = qTokens.some(qt => {
    const dist = Math.min(...tTokens.map(tt => levenshtein(qt, tt)));
    return dist <= 2;
  });
  if (anyTokenMatch) return 0.3;
  return 0;
};

module.exports = {
  levenshtein,
  getSynonyms,
  expandWithSynonyms,
  tokenize,
  normalizeQuery,
  highlightMatches,
  fuzzyScore,
  SYNONYM_MAP,
};
