const { EmailUsage, EmailTemplate, EmailComponent, EmailTemplateVersion, EmailVariable } = require('../models');
const variableRegistry = require('./variableRegistry');
const sanitizer = require('./emailSanitizer.service');
const { enrichContext } = require('./emailContext');
const logger = require('../utils/logger');

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function resolveNestedPath(obj, path) {
  if (!obj || !path) return undefined;
  const parts = path.split('.');
  let current = obj;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== 'object') return undefined;
    current = current[part];
  }
  return current;
}

function formatDate(value) {
  if (!value) return '';
  const d = new Date(value);
  if (isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function resolvePlaceholders(text, context = {}, adminVarDefaults = {}) {
  const varRegex = /\{\{([^}]+)\}\}/g;
  return text.replace(varRegex, (match, inner) => {
    const trimmed = inner.trim();

    if (trimmed.startsWith('component:') || trimmed.startsWith('param.') || trimmed.startsWith('param:')) return match;

    let varPath = trimmed;
    let defaultValue = '';
    const defaultMatch = trimmed.match(/^(.+?)\s*\|\|\s*(.+)$/);
    if (defaultMatch) {
      varPath = defaultMatch[1].trim();
      defaultValue = defaultMatch[2].trim().replace(/^['"]|['"]$/g, '');
    }

    let resolved = resolveNestedPath(context, varPath);

    if (resolved === undefined && context[varPath] !== undefined) {
      resolved = context[varPath];
    }

    if ((resolved === undefined || resolved === null || resolved === '') && adminVarDefaults[varPath] !== undefined) {
      resolved = adminVarDefaults[varPath];
    }

    if (resolved === undefined || resolved === null || resolved === '') {
      // Never leak the raw token (e.g. "company.phone") into a real email —
      // use the inline default if provided, otherwise render nothing.
      return defaultValue;
    }

    if (resolved instanceof Date) {
      return formatDate(resolved);
    }
    // Only auto-format strings that are unambiguously ISO dates. The old
    // heuristic parsed any string with digits, turning document numbers like
    // "QT-2026-000002" into "Feb 1, 2026". Providers already format dates.
    if (typeof resolved === 'string' && /^\d{4}-\d{2}-\d{2}(?:[T ]\d|\b)/.test(resolved)) {
      const parsed = Date.parse(resolved);
      if (!isNaN(parsed)) {
        return formatDate(resolved);
      }
    }

    return String(resolved);
  });
}

async function renderEmail(usageKey, context = {}, options = {}) {
  const { templateId } = options;

  const usage = await EmailUsage.findOne({ key: usageKey, isDeleted: false, isActive: true }).lean();
  if (!usage) {
    throw new Error(`Email usage not found: ${usageKey}`);
  }

  const template = templateId
    ? await EmailTemplate.findOne({ _id: templateId, isDeleted: false }).lean()
    : await EmailTemplate.findOne({ _id: usage.template, isDeleted: false, isActive: true }).lean();

  if (!template) {
    throw new Error(`No active template found for usage: ${usageKey}`);
  }

  return renderWithTemplate(template, usage, context);
}

async function renderWithTemplate(template, usage, rawContext = {}) {
  let html = template.html || '';
  let subject = template.subject || '';
  let plainText = template.plainText || '';

  // Enrich once so company.*, document.* and customer.company always resolve.
  const context = await enrichContext(rawContext);

  html = await resolveGlobalComponents(html, context?.components || {});

  const adminVars = await EmailVariable.find({ isDeleted: false, isActive: true }).lean();
  const adminVarDefaults = {};
  adminVars.forEach(v => {
    if (v.defaultValue) adminVarDefaults[v.reference] = v.defaultValue;
  });

  const registryVars = variableRegistry.resolveVariables(context);

  const mappingMap = {};
  if (usage && usage.variableMappings) {
    usage.variableMappings.forEach(m => {
      mappingMap[m.templateVariable] = m.sourceVariable;
    });
  }

  const remappedVars = { ...registryVars };
  Object.entries(mappingMap).forEach(([templateVar, sourceVar]) => {
    if (registryVars[sourceVar] !== undefined) {
      remappedVars[templateVar] = registryVars[sourceVar];
    }
  });

  const fullContext = { ...context, ...remappedVars };

  html = resolvePlaceholders(html, fullContext, adminVarDefaults);
  subject = resolvePlaceholders(subject, fullContext, adminVarDefaults);
  plainText = resolvePlaceholders(plainText, fullContext, adminVarDefaults);

  if (template.css) {
    const cssBlock = `<style type="text/css">\n${template.css}\n</style>`;
    if (!html.includes('</head>') && !html.includes('<head>')) {
      html = `<!DOCTYPE html>\n<html>\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1.0">\n${cssBlock}\n</head>\n<body>\n${html}\n</body>\n</html>`;
    } else {
      html = html.replace('</head>', `${cssBlock}\n</head>`);
    }
  }

  html = sanitizer.sanitizeHtml(html);
  html = sanitizer.stripScripts(html);

  if (!plainText) {
    plainText = html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  }

  return {
    subject,
    html,
    text: plainText,
    usage,
    template,
    resolvedVars: remappedVars,
  };
}

async function resolveGlobalComponents(html, paramValues = {}) {
  const componentRegex = /\{\{component:([^}]+)\}\}/g;
  const matches = [];
  let match;
  while ((match = componentRegex.exec(html)) !== null) {
    matches.push(match[1].trim());
  }

  if (matches.length === 0) return html;

  const components = await EmailComponent.find({
    $or: [
      { key: { $in: matches } },
      { name: { $in: matches } },
    ],
    isDeleted: false,
    isActive: true,
  }).lean();

  const componentMap = {};
  components.forEach(c => {
    let compHtml = c.html || '';
    if (c.parameters && c.parameters.length > 0) {
      const compParams = paramValues[c.key] || {};
      c.parameters.forEach(p => {
        const value = compParams[p.key] !== undefined ? compParams[p.key] : (p.defaultValue || '');
        compHtml = compHtml
          .replace(new RegExp(`\\{\\{param\\.${escapeRegex(p.key)}\\}\\}`, 'g'), value)
          .replace(new RegExp(`\\{\\{param:${escapeRegex(p.key)}\\}\\}`, 'g'), value);
      });
    }
    componentMap[c.key] = compHtml;
    componentMap[c.name] = compHtml;
  });

  return html.replace(componentRegex, (_, key) => {
    return componentMap[key.trim()] || '';
  });
}

async function renderAndSaveVersion(template) {
  await EmailTemplateVersion.create({
    template: template._id,
    version: template.version,
    templateName: template.templateName,
    subject: template.subject,
    description: template.description || '',
    tags: template.tags || [],
    html: template.html,
    css: template.css,
    plainText: template.plainText,
    status: template.status || 'draft',
    isActive: template.isActive,
    changeNote: template.changeNote || '',
    createdBy: template.updatedBy,
  });
}

async function renderByUsageWithValidation(usageKey, context = {}) {
  const usage = await EmailUsage.findOne({ key: usageKey, isDeleted: false }).lean();
  if (!usage) throw new Error(`Usage not found: ${usageKey}`);

  if (!usage.template) {
    return {
      valid: false,
      errors: [{ message: 'No template assigned to this usage' }],
      rendered: null,
    };
  }

  const errors = [];

  const template = await EmailTemplate.findOne({ _id: usage.template, isDeleted: false }).lean();
  if (!template) {
    errors.push({ message: 'Assigned template not found or deleted' });
    return { valid: false, errors, rendered: null };
  }

  const varRegex = /\{\{([^}]+)\}\}/g;
  const templateVars = new Set();
  let vMatch;
  while ((vMatch = varRegex.exec(template.html || '')) !== null) {
    const v = vMatch[1].trim();
    if (!v.startsWith('component:') && !v.startsWith('param.') && !v.startsWith('param:')) templateVars.add(v);
  }
  while ((vMatch = varRegex.exec(template.subject || '')) !== null) {
    const v = vMatch[1].trim();
    if (!v.startsWith('component:') && !v.startsWith('param.') && !v.startsWith('param:')) templateVars.add(v);
  }

  const mappingVars = new Set(usage.variableMappings.map(m => m.sourceVariable));
  const registryVars = variableRegistry.getSafeKeys();
  const adminVars = await EmailVariable.find({ isDeleted: false, isActive: true }).lean();
  const adminVarKeys = new Set(adminVars.map(v => v.reference));

  templateVars.forEach(v => {
    if (!mappingVars.has(v) && !registryVars.has(v) && !adminVarKeys.has(v)) {
      errors.push({ variable: v, message: `Variable {{${v}}} has no mapping and is not in registry` });
    }
  });

  const rendered = await renderWithTemplate(template, usage, context);

  return {
    valid: errors.length === 0,
    errors,
    rendered,
  };
}

module.exports = {
  renderEmail,
  renderWithTemplate,
  resolveGlobalComponents,
  resolvePlaceholders,
  renderAndSaveVersion,
  renderByUsageWithValidation,
};
