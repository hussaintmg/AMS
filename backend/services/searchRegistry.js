/**
 * Enhanced Search Module Registry
 * AMS ERP Global Search System
 *
 * Every searchable module registers here. The registry provides:
 * - Entity type & model mapping
 * - Display priority & search weight
 * - Visibility/assignment resolvers (per-module)
 * - Highlight fields configuration
 * - Related entity mapping
 * - Synonym expansions
 * - URL generation
 * - Search enable/disable control
 */

class SearchRegistry {
  constructor() {
    this._modules = new Map();
    this._entityTypes = [];
  }

  registerModule(config) {
    const {
      entityType,
      moduleName,
      model,
      permissionKey,
      icon = 'File',
      priority = 500,
      searchWeight = 5,
      searchEnabled = true,
      titleField = 'name',
      subtitleField = '',
      searchableFields = [],
      keywordFields = [],
      highlightFields = [],
      assignmentFields = ['assignedTo'],
      creatorField = 'createdBy',
      companyField = 'company',
      branchField = 'branch',
      organizationField = 'organization',
      statusField = 'status',
      conditions = {},
      urlFn = null,
      urlPattern = null,
      populate = null,
      visibilityResolver = null,
      relatedEntities = [],
      getSearchDocument = null,
      defaultFilters = {},
      synonyms = [],
    } = config;

    if (!entityType || !moduleName || !model) {
      throw new Error(`SearchRegistry: entityType, moduleName, and model are required for "${entityType || 'unknown'}"`);
    }

    this._modules.set(entityType, {
      entityType,
      moduleName,
      model,
      permissionKey: permissionKey || entityType,
      icon,
      priority,
      searchWeight,
      searchEnabled,
      titleField,
      subtitleField,
      searchableFields: Array.isArray(searchableFields) ? searchableFields : [searchableFields].filter(Boolean),
      keywordFields: Array.isArray(keywordFields) ? keywordFields : [keywordFields].filter(Boolean),
      highlightFields: Array.isArray(highlightFields) ? highlightFields : [highlightFields].filter(Boolean),
      assignmentFields: Array.isArray(assignmentFields) ? assignmentFields : [assignmentFields].filter(Boolean),
      creatorField,
      companyField,
      branchField,
      organizationField,
      statusField,
      conditions: typeof conditions === 'object' && conditions !== null ? conditions : {},
      urlFn: typeof urlFn === 'function' ? urlFn : null,
      urlPattern: typeof urlPattern === 'string' ? urlPattern : null,
      populate: populate || null,
      visibilityResolver: typeof visibilityResolver === 'function' ? visibilityResolver : null,
      relatedEntities: Array.isArray(relatedEntities) ? relatedEntities : [],
      getSearchDocument: typeof getSearchDocument === 'function' ? getSearchDocument : null,
      defaultFilters: typeof defaultFilters === 'object' && defaultFilters !== null ? defaultFilters : {},
      synonyms: Array.isArray(synonyms) ? synonyms : [],
    });

    if (!this._entityTypes.includes(entityType)) {
      this._entityTypes.push(entityType);
    }
    this._entityTypes.sort((a, b) => {
      const mA = this._modules.get(a);
      const mB = this._modules.get(b);
      return (mA?.priority || 500) - (mB?.priority || 500);
    });

    return this;
  }

  getModule(entityType) {
    return this._modules.get(entityType) || null;
  }

  getAllModules() {
    return this._entityTypes.map(t => this._modules.get(t)).filter(Boolean);
  }

  getEnabledModules() {
    return this.getAllModules().filter(m => m.searchEnabled !== false);
  }

  getSearchableModules() {
    return this.getEnabledModules();
  }

  buildSearchDocument(entityType, doc) {
    const module = this.getModule(entityType);
    if (!module) return null;

    if (module.getSearchDocument) {
      return module.getSearchDocument(doc);
    }

    const title = this._resolveField(doc, module.titleField) || '';
    const subtitle = module.subtitleField ? (this._resolveField(doc, module.subtitleField) || '') : '';
    const searchableParts = module.searchableFields.map(f => this._resolveField(doc, f)).filter(Boolean);
    const searchableText = searchableParts.join(' ');

    let keywords = [];
    for (const f of module.keywordFields) {
      const val = this._resolveField(doc, f);
      if (val) keywords.push(String(val));
    }
    const assignedTo = this._resolveField(doc, module.assignmentFields[0] || 'assignedTo');
    const createdBy = this._resolveField(doc, module.creatorField);
    const status = module.statusField ? (this._resolveField(doc, module.statusField) || '') : '';
    const companyId = this._resolveField(doc, module.companyField);
    const branchId = this._resolveField(doc, module.branchField);

    return {
      entityType,
      moduleName: module.moduleName,
      entityId: String(doc._id || doc.id),
      title,
      subtitle,
      searchableText,
      keywords: [...new Set(keywords)],
      url: this._buildUrl(module, doc),
      permissionKey: module.permissionKey,
      assignedTo: assignedTo ? String(assignedTo._id || assignedTo) : null,
      createdBy: createdBy ? String(createdBy._id || createdBy) : null,
      companyId: companyId ? String(companyId._id || companyId) : null,
      branchId: branchId ? String(branchId._id || branchId) : null,
      status: String(status),
      isActive: doc.isActive !== false && !doc.deletedAt,
      score: module.searchWeight || 5,
      metadata: {},
    };
  }

  _resolveField(doc, fieldPath) {
    if (!fieldPath || !doc) return null;
    const parts = String(fieldPath).split('.');
    let val = doc;
    for (const p of parts) {
      if (val == null || typeof val !== 'object') return null;
      val = val[p];
    }
    return val != null ? val : null;
  }

  _buildUrl(module, doc) {
    if (module.urlFn) return module.urlFn(doc);
    if (module.urlPattern) {
      return module.urlPattern.replace(/:id/g, String(doc._id || doc.id));
    }
    return `/${module.entityType}?id=${doc._id || doc.id}`;
  }

  async checkVisibility(moduleConfig, doc, user) {
    if (!moduleConfig || !doc || !user) return false;
    if (user.isSuperAdmin) return true;
    if (moduleConfig.visibilityResolver) {
      return moduleConfig.visibilityResolver(doc, user);
    }
    const userId = String(user.id || user._id || '');
    for (const field of moduleConfig.assignmentFields) {
      const val = this._resolveField(doc, field);
      if (val && String(val._id || val) === userId) return true;
    }
    if (moduleConfig.creatorField) {
      const creator = this._resolveField(doc, moduleConfig.creatorField);
      if (creator && String(creator._id || creator) === userId) return true;
    }
    return true;
  }
}

const registry = new SearchRegistry();

module.exports = registry;
