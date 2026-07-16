/**
 * Search Index Service
 * AMS ERP Global Search System
 *
 * Handles incremental upsert/remove of search documents,
 * full rebuild, search with permission filters, and analytics.
 */

const SearchDocument = require('../models/SearchDocument.model');
const SearchAnalytics = require('../models/SearchAnalytics.model');
const SearchHistory = require('../models/SearchHistory.model');
const SearchConfig = require('../models/SearchConfig.model');
const registry = require('./searchRegistry');
const { allowedOwnerIds } = require('../utils/roleJobs');
const { levenshtein, getSynonyms, tokenize, normalizeQuery, highlightMatches, fuzzyScore } = require('../utils/fuzzySearch');

let rebuildTimer = null;
let suggestionCache = new Map();
let configCache = null;

async function getSearchConfig() {
  if (configCache) return configCache;
  try {
    configCache = await SearchConfig.findOne({ key: 'global_search_config' }).lean();
    if (!configCache) {
      configCache = await SearchConfig.create({ key: 'global_search_config', modules: [] });
    }
  } catch {
    configCache = { maxResultsPerModule: 10, maxSuggestions: 8, cacheTtl: 30, analyticsEnabled: true, fuzzyMaxDistance: 2, synonymEnabled: true };
  }
  return configCache;
}

function invalidateConfigCache() {
  configCache = null;
  suggestionCache.clear();
}

async function upsertDocument(entityType, doc) {
  const moduleConfig = registry.getModule(entityType);
  if (!moduleConfig || moduleConfig.searchEnabled === false) return null;
  const searchDoc = registry.buildSearchDocument(entityType, doc);
  if (!searchDoc) return null;
  try {
    const result = await SearchDocument.findOneAndUpdate(
      { entityType: searchDoc.entityType, entityId: searchDoc.entityId },
      { ...searchDoc, updatedAt: new Date() },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    if (suggestionCache.has(entityType)) {
      const key = entityType + '_' + searchDoc.title.slice(0, 5);
      suggestionCache.delete(key);
    }
    return result;
  } catch (err) {
    if (err.code === 11000) {
      await SearchDocument.updateOne(
        { entityType: searchDoc.entityType, entityId: searchDoc.entityId },
        { ...searchDoc, updatedAt: new Date() }
      );
    }
    return null;
  }
}

async function removeDocument(entityType, entityId) {
  try {
    await SearchDocument.updateOne(
      { entityType, entityId },
      { isActive: false, updatedAt: new Date() }
    );
  } catch {
    // silent
  }
}

async function hardDeleteDocument(entityType, entityId) {
  try {
    await SearchDocument.deleteOne({ entityType, entityId });
  } catch {
    // silent
  }
}

async function rebuild() {
  const modules = registry.getSearchableModules();
  let totalCount = 0;
  for (const mod of modules) {
    try {
      let query = mod.model.find({ ...mod.conditions, isActive: { $ne: false }, deletedAt: null });
      if (mod.populate) {
        if (typeof mod.populate === 'string') query = query.populate(mod.populate);
        else if (Array.isArray(mod.populate)) {
          for (const p of mod.populate) query = query.populate(p);
        }
      }
      const docs = await query.lean().maxTimeMS(30000);
      const bulkOps = [];
      for (const doc of docs) {
        const searchDoc = registry.buildSearchDocument(mod.entityType, doc);
        if (searchDoc) {
          bulkOps.push({
            updateOne: {
              filter: { entityType: searchDoc.entityType, entityId: searchDoc.entityId },
              update: { ...searchDoc, updatedAt: new Date() },
              upsert: true,
            }
          });
        }
      }
      if (bulkOps.length > 0) {
        await SearchDocument.bulkWrite(bulkOps, { ordered: false });
        totalCount += bulkOps.length;
      }
    } catch (err) {
      console.error(`[searchIndex] rebuild error for ${mod.entityType}:`, err.message);
    }
  }
  invalidateConfigCache();
  return totalCount;
}

async function rebuildWithLog(actor) {
  const Log = require('../models/mongo/Log.model');
  try {
    const count = await rebuild();
    await Log.create({
      module: 'search', action: 'index_rebuild', method: 'POST',
      endpoint: 'internal/search/rebuild',
      user: { id: String(actor || '') },
      success: true, statusCode: 200,
      metadata: { count }
    });
    return count;
  } catch (error) {
    await Log.create({
      module: 'search', action: 'index_rebuild_failed', method: 'POST',
      endpoint: 'internal/search/rebuild',
      user: { id: String(actor || '') },
      success: false, statusCode: 500,
      error: { name: error.name, message: error.message }
    }).catch(() => {});
    throw error;
  }
}

function scheduleRebuild(actor) {
  if (rebuildTimer) clearTimeout(rebuildTimer);
  rebuildTimer = setTimeout(() => rebuildWithLog(actor).catch(() => {}), 5000);
}

function getUserPermissions(user) {
  if (user.isSuperAdmin) return null;
  const perms = (user.pagePermissions || [])
    .filter(p => p.canView === true && p.isActive !== false)
    .map(p => p.pageKey || p.path?.replace(/^\//, '') || p.module)
    .filter(Boolean);
  const uniquePerms = [...new Set(perms)];
  return uniquePerms.length > 0 ? uniquePerms : null;
}

async function buildPermissionFilter(user) {
  const perms = getUserPermissions(user);
  if (perms === null) return {};
  return { permissionKey: { $in: perms } };
}

async function buildAssignmentFilter(user, permissionKey) {
  if (user.isSuperAdmin) return {};
  const ids = await allowedOwnerIds(user, permissionKey);
  if (ids === null) return {};
  return {
    $or: [
      { assignedTo: { $in: ids.map(String) } },
      { createdBy: { $in: ids.map(String) } },
    ]
  };
}

async function applyModuleConfigFilter(baseFilter, entityType) {
  const moduleConfig = registry.getModule(entityType);
  if (!moduleConfig) return baseFilter;
  return { ...baseFilter, ...moduleConfig.defaultFilters };
}

function mergeFilters(...filters) {
  const result = { $and: [] };
  for (const f of filters) {
    if (f && typeof f === 'object' && Object.keys(f).length > 0) {
      result.$and.push(f);
    }
  }
  if (result.$and.length === 0) return {};
  if (result.$and.length === 1) return result.$and[0];
  return result;
}

async function search(query, user, options = {}) {
  const {
    limit = 10,
    type = 'all',
    page = 1,
    includeHistory = true,
    highlight = true,
  } = options;

  const q = normalizeQuery(query);
  if (!q) return { query: '', groups: [], total: 0, suggestions: [] };

  const searchLimit = Math.min(Math.max(limit, 1), 50);
  const perModuleLimit = searchLimit;

  const startTime = Date.now();
  const permissionFilter = await buildPermissionFilter(user);

  let entityTypes = null;
  if (type !== 'all') {
    const moduleConfig = registry.getModule(type);
    if (moduleConfig) entityTypes = [type];
  }

  const havePermOnType = (et) => {
    if (user.isSuperAdmin) return true;
    const mod = registry.getModule(et);
    if (!mod) return false;
    const perms = getUserPermissions(user);
    if (perms === null) return true;
    return perms.includes(mod.permissionKey);
  };

  const enabledModules = registry.getEnabledModules();
  const targetModules = entityTypes
    ? enabledModules.filter(m => entityTypes.includes(m.entityType) && havePermOnType(m.entityType))
    : enabledModules.filter(m => havePermOnType(m.entityType));

  if (targetModules.length === 0) {
    return { query: q, groups: [], total: 0, suggestions: [] };
  }

  const qTokens = tokenize(q);
  const normalizedQuery = qTokens.join(' ');
  const escapedRegex = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(escapedRegex, 'i');
  const tokenRegexes = qTokens.map(t => new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));

  const config = await getSearchConfig();

  const groups = [];
  let totalAll = 0;

  for (const mod of targetModules) {
    try {
      const baseFilter = {
        entityType: mod.entityType,
        isActive: true,
        ...permissionFilter,
        ...mod.defaultFilters,
      };
      const assignmentFilter = await buildAssignmentFilter(user, mod.permissionKey);
      const finalFilter = mergeFilters(baseFilter, assignmentFilter);

      let textSearchDocs = [];
      try {
        textSearchDocs = await SearchDocument.find({
          ...finalFilter,
          $text: { $search: normalizedQuery },
        })
          .select({ score: { $meta: 'textScore' }, title: 1, subtitle: 1, searchableText: 1, url: 1, entityType: 1, entityId: 1, moduleName: 1, keywords: 1, metadata: 1, assignedTo: 1, createdBy: 1, status: 1, permissionKey: 1 })
          .sort({ score: { $meta: 'textScore' }, updatedAt: -1 })
          .limit(perModuleLimit * 3)
          .lean()
          .maxTimeMS(5000);
      } catch { textSearchDocs = []; }

      const existingIds = new Set(textSearchDocs.map(d => d._id.toString()));

      const regexFilter = mergeFilters(finalFilter, {
        $or: [
          { title: regex },
          { subtitle: regex },
          { searchableText: regex },
          { keywords: { $in: [regex] } },
        ]
      });
      let regexDocs = await SearchDocument.find(regexFilter)
        .select('title subtitle searchableText url entityType entityId moduleName keywords metadata assignedTo createdBy status permissionKey')
        .limit(perModuleLimit)
        .lean()
        .maxTimeMS(3000);
      regexDocs = regexDocs.filter(d => !existingIds.has(d._id.toString()));

      const allDocs = [...textSearchDocs, ...regexDocs];

      const scored = allDocs.map(doc => {
        const fullText = `${doc.title} ${doc.subtitle} ${doc.searchableText} ${(doc.keywords || []).join(' ')}`;
        let score = 0;
        const textScore = typeof doc.score === 'number' ? doc.score : 0;
        score = Math.max(score, textScore * 10);
        const exactTitle = doc.title.toLowerCase() === normalizedQuery;
        if (exactTitle) score = Math.max(score, 100);
        const startsWith = doc.title.toLowerCase().startsWith(normalizedQuery);
        if (startsWith) score = Math.max(score, 90);
        const titleIncludes = doc.title.toLowerCase().includes(normalizedQuery);
        if (titleIncludes) score = Math.max(score, 70);
        const fuzzy = fuzzyScore(normalizedQuery, fullText);
        score = Math.max(score, fuzzy * 60);
        if (mod.synonyms.length > 0 || config.synonymEnabled) {
          const synonymTokens = qTokens.flatMap(t => [t, ...getSynonyms(t)]);
          const synonymMatch = synonymTokens.some(s => fullText.toLowerCase().includes(s));
          if (synonymMatch) score += 5;
        }
        const anyTokenFieldMatch = qTokens.every(t => {
          const tf = (doc.title || '').toLowerCase();
          const sf = (doc.subtitle || '').toLowerCase();
          const st = (doc.searchableText || '').toLowerCase();
          return tf.includes(t) || sf.includes(t) || st.includes(t);
        });
        if (anyTokenFieldMatch) score += 15;
        if (titleIncludes) score += 20;
        const noTokenInTitle = !qTokens.some(t => (doc.title || '').toLowerCase().includes(t));
        if (noTokenInTitle) score -= 30;
        const highlightedTitle = highlight ? highlightMatches(doc.title, normalizedQuery) : doc.title;
        const highlightedSubtitle = highlight ? highlightMatches(doc.subtitle, normalizedQuery) : doc.subtitle;
        const snippet = highlight
          ? highlightMatches(doc.searchableText?.slice(0, 200) || '', normalizedQuery)
          : (doc.searchableText?.slice(0, 200) || '');
        return {
          id: `${doc.entityType}_${doc.entityId}`,
          entityType: doc.entityType,
          entityId: doc.entityId,
          moduleName: doc.moduleName,
          title: highlightedTitle,
          subtitle: highlightedSubtitle,
          snippet,
          url: doc.url,
          icon: mod.icon,
          permissionKey: doc.permissionKey,
          status: doc.status,
          metadata: doc.metadata || {},
          score,
        };
      });

      scored.sort((a, b) => b.score - a.score);
      const topResults = scored.slice(0, perModuleLimit).map(({ score, ...rest }) => rest);

      if (topResults.length > 0) {
        groups.push({
          module: mod.moduleName,
          moduleKey: mod.entityType,
          icon: mod.icon,
          priority: mod.priority,
          total: topResults.length,
          results: topResults,
        });
        totalAll += topResults.length;
      }
    } catch (err) {
      console.error(`[searchIndex] search error for ${mod.entityType}:`, err.message);
    }
  }

  groups.sort((a, b) => (a.priority || 500) - (b.priority || 500));

  const duration = Date.now() - startTime;

  if (config?.analyticsEnabled !== false) {
    try {
      await SearchAnalytics.create({
        query: q,
        normalizedQuery,
        user: user.id,
        resultCount: totalAll,
        hasResults: totalAll > 0,
        duration,
        sessionId: options.sessionId || '',
      });
    } catch { /* silent */ }
  }

  if (includeHistory && config?.historyEnabled !== false) {
    try {
      const existingHistory = await SearchHistory.findOne({ user: user.id, query: q }).lean();
      if (existingHistory) {
        await SearchHistory.updateOne(
          { _id: existingHistory._id },
          { createdAt: new Date(), resultCount: totalAll }
        );
      } else {
        const count = await SearchHistory.countDocuments({ user: user.id });
        if (count >= (config.historyMaxEntries || 10)) {
          const oldest = await SearchHistory.findOne({ user: user.id }).sort({ createdAt: 1 }).lean();
          if (oldest) await SearchHistory.deleteOne({ _id: oldest._id });
        }
        await SearchHistory.create({
          user: user.id,
          query: q,
          resultCount: totalAll,
        });
      }
    } catch { /* silent */ }
  }

  return {
    query: q,
    groups,
    total: totalAll,
    duration,
  };
}

async function suggest(query, user) {
  const q = normalizeQuery(query);
  if (!q || q.length < 2) return { suggestions: [] };

  const permissionFilter = await buildPermissionFilter(user);
  const config = await getSearchConfig();
  const maxSuggestions = config.maxSuggestions || 8;

  const cacheKey = `${user.id}_${q}`;
  const cached = suggestionCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < ((config.cacheTtl || 30) * 1000)) {
    return cached.data;
  }

  const escapedQ = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const tokenizedQ = tokenize(q);

  const textSuggests = await SearchDocument.aggregate([
    { $match: { isActive: true, ...permissionFilter } },
    {
      $match: {
        $or: [
          { title: { $regex: `^${escapedQ}`, $options: 'i' } },
          { title: { $regex: escapedQ, $options: 'i' } },
          { subtitle: { $regex: escapedQ, $options: 'i' } },
          { keywords: { $in: [new RegExp(escapedQ, 'i')] } },
        ]
      }
    },
    {
      $group: {
        _id: '$title',
        entityType: { $first: '$entityType' },
        moduleName: { $first: '$moduleName' },
        subtitle: { $first: '$subtitle' },
        url: { $first: '$url' },
        icon: { $first: '$icon' },
        count: { $sum: 1 },
      }
    },
    { $sort: { count: -1 } },
    { $limit: maxSuggestions + 10 },
  ]);

  let titleNames = [...new Set(textSuggests.map(s => s._id).filter(Boolean))];

  if (titleNames.length < maxSuggestions) {
    const fuzzyPromises = [];
    const fuzzyDocs = await SearchDocument.find({
      isActive: true, ...permissionFilter,
      title: { $regex: escapedQ.split(/\s+/).map(t => `(?=.*${t})`).join(''), $options: 'i' },
    })
      .select('title subtitle')
      .limit(maxSuggestions * 5)
      .lean()
      .maxTimeMS(2000);

    for (const doc of fuzzyDocs) {
      const t = doc.title;
      if (t && !titleNames.includes(t)) {
        const dist = levenshtein(q.toLowerCase(), t.toLowerCase().slice(0, q.length + 3));
        if (dist <= 2 || t.toLowerCase().includes(q.toLowerCase())) {
          titleNames.push(t);
        }
      }
    }
  }

  titleNames = titleNames.slice(0, maxSuggestions);

  const suggestions = titleNames.map(title => {
    const match = textSuggests.find(s => s._id === title);
    return {
      title: highlightMatches(title, q),
      subtitle: match?.subtitle || '',
      entityType: match?.entityType || '',
      moduleName: match?.moduleName || '',
      url: match?.url || '',
      icon: match?.icon || 'File',
    };
  });

  const result = {
    suggestions,
    query: q,
    total: suggestions.length,
    searchAllUrl: `/search?q=${encodeURIComponent(q)}`,
  };

  suggestionCache.set(cacheKey, { data: result, ts: Date.now() });

  return result;
}

async function getSearchHistory(user, limit = 10) {
  try {
    const entries = await SearchHistory.find({ user: user.id })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
    return entries.map(e => ({
      query: e.query,
      entityType: e.entityType,
      resultCount: e.resultCount,
      clicked: e.clicked,
      clickedUrl: e.clickedUrl,
      createdAt: e.createdAt,
    }));
  } catch {
    return [];
  }
}

async function clearSearchHistory(user) {
  try {
    await SearchHistory.deleteMany({ user: user.id });
    return true;
  } catch {
    return false;
  }
}

async function getPopularSearches(limit = 20) {
  try {
    const popular = await SearchAnalytics.aggregate([
      { $match: { hasResults: true } },
      { $group: { _id: '$normalizedQuery', count: { $sum: 1 }, avgResults: { $avg: '$resultCount' } } },
      { $sort: { count: -1 } },
      { $limit: limit },
    ]);
    return popular.map(p => ({
      query: p._id,
      searchCount: p.count,
      avgResults: Math.round(p.avgResults),
    }));
  } catch {
    return [];
  }
}

async function getSearchAnalytics(filters = {}) {
  const match = {};
  if (filters.from) match.createdAt = { $gte: new Date(filters.from) };
  if (filters.to) match.createdAt = { ...match.createdAt, $lte: new Date(filters.to) };
  if (filters.user) match.user = filters.user;

  try {
    const [total, withResults, topQueries, dailyStats] = await Promise.all([
      SearchAnalytics.countDocuments(match),
      SearchAnalytics.countDocuments({ ...match, hasResults: true }),
      SearchAnalytics.aggregate([
        { $match: match },
        { $group: { _id: '$normalizedQuery', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 20 },
      ]),
      SearchAnalytics.aggregate([
        { $match: match },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            count: { $sum: 1 },
            avgDuration: { $avg: '$duration' },
          }
        },
        { $sort: { _id: -1 } },
        { $limit: 30 },
      ]),
    ]);

    return {
      total,
      withResults,
      noResults: total - withResults,
      topQueries: topQueries.map(q => ({ query: q._id, count: q.count })),
      dailyStats: dailyStats.map(d => ({ date: d._id, count: d.count, avgDuration: Math.round(d.avgDuration) })),
    };
  } catch {
    return { total: 0, withResults: 0, noResults: 0, topQueries: [], dailyStats: [] };
  }
}

async function recordClick(query, entityType, entityId, position, url, user) {
  try {
    await SearchHistory.updateOne(
      { user: user.id, query },
      { clicked: true, clickedUrl: url, entityType },
      { upsert: true }
    );
    await SearchAnalytics.create({
      query,
      normalizedQuery: normalizeQuery(query),
      user: user.id,
      hasResults: true,
      clickedResultId: entityId,
      clickedEntityType: entityType,
      clickedPosition: position || 0,
      duration: 0,
    });
  } catch { /* silent */ }
}

async function saveModuleConfig(entityType, settings) {
  const config = await SearchConfig.findOneAndUpdate(
    { key: 'global_search_config', 'modules.entityType': entityType },
    { $set: { 'modules.$': { entityType, ...settings, updatedAt: new Date() } } },
    { new: true }
  );
  if (!config) {
    await SearchConfig.findOneAndUpdate(
      { key: 'global_search_config' },
      { $push: { modules: { entityType, ...settings, updatedAt: new Date() } } },
      { upsert: true }
    );
  }
  invalidateConfigCache();
}

async function getModulesConfig() {
  const config = await getSearchConfig();
  const registryModules = registry.getAllModules();
  const configModules = config.modules || [];
  return registryModules.map(rm => {
    const cfg = configModules.find(c => c.entityType === rm.entityType);
    return {
      entityType: rm.entityType,
      moduleName: rm.moduleName,
      icon: rm.icon,
      priority: rm.priority,
      searchWeight: rm.searchWeight,
      searchEnabled: cfg ? cfg.searchEnabled !== false : rm.searchEnabled !== false,
      priorityDb: cfg?.priority ?? rm.priority,
      searchWeightDb: cfg?.searchWeight ?? rm.searchWeight,
    };
  });
}

module.exports = {
  upsertDocument,
  removeDocument,
  hardDeleteDocument,
  rebuild,
  rebuildWithLog,
  scheduleRebuild,
  search,
  suggest,
  getSearchHistory,
  clearSearchHistory,
  getPopularSearches,
  getSearchAnalytics,
  recordClick,
  saveModuleConfig,
  getModulesConfig,
  getSearchConfig,
  invalidateConfigCache,
};
