const { getSafeKeys } = require('./variableRegistry');

const DANGEROUS_TAGS = ['script', 'style', 'iframe', 'object', 'embed', 'applet', 'meta', 'link', 'base'];
const DANGEROUS_ATTR_PATTERNS = [/^on/i, /^javascript:/i, /^data:/i, /^vbscript:/i];
const ALLOWED_TAGS = [
  'html', 'head', 'body', 'meta', 'title',
  'div', 'span', 'p', 'br', 'hr',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'ul', 'ol', 'li', 'dl', 'dt', 'dd',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'colgroup', 'col',
  'a', 'img', 'button',
  'strong', 'b', 'em', 'i', 'u', 's', 'strike', 'sub', 'sup', 'small', 'mark',
  'blockquote', 'pre', 'code', 'kbd',
  'figure', 'figcaption',
  'section', 'article', 'header', 'footer', 'nav', 'aside',
  'center', 'font', 'del', 'ins',
  'abbr', 'acronym', 'address', 'bdo',
  'caption', 'cite', 'code', 'col', 'colgroup',
  'dfn', 'dir', 'dl', 'dt',
  'fieldset', 'form', 'label', 'legend',
  'menu', 'noframes', 'noscript',
  'optgroup', 'option', 'progress',
  'q', 'rp', 'rt', 'ruby',
  'samp', 'select', 'textarea', 'time', 'tt',
  'var', 'wbr',
];

function sanitizeHtml(html) {
  if (!html) return '';

  let sanitized = html;

  DANGEROUS_TAGS.forEach(tag => {
    const regex = new RegExp(`<\\/?${tag}[^>]*>`, 'gi');
    sanitized = sanitized.replace(regex, '');
  });

  sanitized = sanitized.replace(/<[^>]*\s(on\w+\s*=\s*["'][^"']*["'])[^>]*>/gi, (match) => {
    return match.replace(/on\w+\s*=\s*["'][^"']*["']/gi, '');
  });

  sanitized = sanitized.replace(/<[^>]*\s(href\s*=\s*["']\s*javascript:)/gi, (match) => {
    return match.replace(/href\s*=\s*["']\s*javascript:/i, 'href="#" ');
  });

  sanitized = sanitized.replace(/on\w+\s*=\s*["'][^"']*["']/gi, '');

  return sanitized;
}

function escapeUnregisteredVariables(template, resolvedVars) {
  const safeKeys = getSafeKeys();
  const varRegex = /\{\{([^}]+)\}\}/g;

  return template.replace(varRegex, (match, varName) => {
    const trimmed = varName.trim();
    if (trimmed.startsWith('component:')) return match;
    if (resolvedVars && resolvedVars[trimmed] !== undefined) {
      return resolvedVars[trimmed];
    }
    if (safeKeys.has(trimmed)) {
      return '';
    }
    return '';
  });
}

function stripScripts(html) {
  return html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
}

module.exports = {
  sanitizeHtml,
  escapeUnregisteredVariables,
  stripScripts,
};
