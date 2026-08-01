'use strict';
/**
 * Block helpers for PDF and email templates: repeat a chunk of markup once per
 * line item, and hide a chunk when a value is empty.
 *
 *   {{#each items}}
 *     <tr><td>{{this.name}}</td><td>{{this.quantity}}</td><td>{{this.totalPrice}}</td></tr>
 *   {{/each}}
 *
 *   {{#if document.notes}}<p>{{document.notes}}</p>{{/if}}
 *
 * Inside a loop the current row is `this` (or the bare field name), plus
 * `@index` (0-based), `@number` (1-based), `@first` and `@last`. Loops may nest.
 *
 * Both renderers run their own `{{token}}` pass afterwards, so this module only
 * expands the blocks and hands back plain markup with the row's own values
 * substituted — that keeps one formatting implementation per renderer.
 */

const BLOCK_RE = /\{\{\s*#(each|if|unless)\s+([^}]+?)\s*\}\}([\s\S]*?)\{\{\s*\/\1\s*\}\}/;

function getPath(source, path) {
  if (!path) return undefined;
  return String(path).split('.').reduce((value, part) => {
    if (value == null) return undefined;
    if (part === 'this' || part === '.') return value;
    return value[part];
  }, source);
}

function isEmpty(value) {
  if (value == null || value === false || value === '') return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'number') return value === 0;
  if (typeof value === 'object') return Object.keys(value).length === 0;
  return false;
}

/**
 * Substitute a row's own fields into the loop body. `{{this.x}}`, `{{x}}` and
 * the `@`-helpers resolve here; anything the row does not have (e.g. a
 * `{{customer.name}}` inside a row) is left for the outer renderer pass.
 */
function substituteRow(body, row, meta, format) {
  return body.replace(/\{\{\s*([^#/{}][^}]*?)\s*\}\}/g, (match, rawKey) => {
    const key = String(rawKey).trim();
    if (key.startsWith('@')) {
      const helper = key.slice(1);
      if (helper in meta) return String(meta[helper]);
      return match;
    }
    const looksLikeRowField = key === 'this' || key.startsWith('this.')
      || (row && typeof row === 'object' && !Array.isArray(row) && Object.prototype.hasOwnProperty.call(row, key.split('.')[0]));
    if (!looksLikeRowField) return match;
    const value = key === 'this' ? row : getPath(row, key);
    if (value === undefined) return match;
    return format ? format(value, key) : (value == null ? '' : String(value));
  });
}

/**
 * Expand every `#each` / `#if` / `#unless` block in `text` against `data`.
 * @param {string}   text
 * @param {object}   data
 * @param {function} format  optional (value, key) => string used for row fields
 */
function expandBlocks(text, data = {}, format = null) {
  let output = String(text == null ? '' : text);
  // Bounded so a malformed template can never spin forever; nesting is handled
  // by re-scanning the expanded output each pass.
  for (let pass = 0; pass < 100; pass += 1) {
    const match = BLOCK_RE.exec(output);
    if (!match) break;
    const [full, helper, rawPath, body] = match;
    const path = rawPath.trim();
    const value = getPath(data, path);

    let replacement = '';
    if (helper === 'each') {
      const rows = Array.isArray(value) ? value : (value && typeof value === 'object' ? Object.values(value) : []);
      replacement = rows.map((row, index) => {
        const meta = {
          index,
          number: index + 1,
          first: index === 0,
          last: index === rows.length - 1,
          count: rows.length,
        };
        // Nested blocks inside the row see the row itself as their data.
        const inner = expandBlocks(body, (row && typeof row === 'object') ? { ...data, ...row, this: row } : data, format);
        return substituteRow(inner, row, meta, format);
      }).join('');
    } else if (helper === 'if') {
      replacement = isEmpty(value) ? '' : expandBlocks(body, data, format);
    } else if (helper === 'unless') {
      replacement = isEmpty(value) ? expandBlocks(body, data, format) : '';
    }
    output = output.slice(0, match.index) + replacement + output.slice(match.index + full.length);
  }
  return output;
}

/** True when the template uses any block helper (lets callers skip the work). */
function hasBlocks(text) {
  return /\{\{\s*#(each|if|unless)\s+/.test(String(text == null ? '' : text));
}

module.exports = { expandBlocks, hasBlocks, getPath, isEmpty };
