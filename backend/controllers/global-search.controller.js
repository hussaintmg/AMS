/**
 * Global Search Controller
 * AMS ERP Global Search System
 */

const searchService = require('../services/searchIndex.service');

const text = value => String(value || '').trim();

const escapeRegex = (value) => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function scoreFor(query, values = []) {
  const normalizedQuery = text(query).toLowerCase();
  const terms = normalizedQuery.split(/\s+/).filter(Boolean);
  if (!terms.length) return 0;
  let best = 0;
  values.forEach((value) => {
    const candidate = text(value).toLowerCase();
    if (!candidate || !terms.every((term) => candidate.includes(term))) return;
    if (candidate === normalizedQuery) best = Math.max(best, /[\d-]/.test(candidate) ? 0.98 : 1);
    else if (candidate.startsWith(normalizedQuery)) best = Math.max(best, 0.9);
    else if (terms.length === 1 && candidate.split(/\s+/).some((word) => word.startsWith(terms[0]))) best = Math.max(best, 0.75);
    else best = Math.max(best, 0.6);
  });
  return best;
}

async function search(req, res, next) {
  try {
    const query = text(req.query.q || req.query.query);
    if (!query) {
      return res.json({
        success: true,
        query: '',
        groups: [],
        total: 0,
        suggestions: [],
      });
    }

    if (query.length > 200) {
      return res.status(400).json({ success: false, message: 'Search query is too long' });
    }

    const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 50);
    const type = text(req.query.type || 'all').toLowerCase();
    const page = Math.max(Number(req.query.page) || 1, 1);

    const result = await searchService.search(query, req.user, {
      limit,
      type,
      page,
      highlight: true,
      includeHistory: true,
    });

    res.json({
      success: true,
      ...result,
    });
  } catch (err) {
    next(err);
  }
}

async function suggest(req, res, next) {
  try {
    const query = text(req.query.q || req.query.query);
    if (!query || query.length < 2) {
      return res.json({ success: true, suggestions: [] });
    }

    const result = await searchService.suggest(query, req.user);
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}

async function click(req, res, next) {
  try {
    const { query, entityType, entityId, position, url } = req.body;
    if (!query || !entityType) {
      return res.status(400).json({ success: false, message: 'query and entityType are required' });
    }
    await searchService.recordClick(query, entityType, entityId, position, url, req.user);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

async function history(req, res, next) {
  try {
    const entries = await searchService.getSearchHistory(req.user);
    res.json({ success: true, history: entries });
  } catch (err) {
    next(err);
  }
}

async function clearHistory(req, res, next) {
  try {
    await searchService.clearSearchHistory(req.user);
    res.json({ success: true, message: 'Search history cleared' });
  } catch (err) {
    next(err);
  }
}

async function popular(req, res, next) {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
    const searches = await searchService.getPopularSearches(limit);
    res.json({ success: true, popular: searches });
  } catch (err) {
    next(err);
  }
}

async function analytics(req, res, next) {
  try {
    const filters = {
      from: req.query.from,
      to: req.query.to,
      user: req.query.user,
    };
    const stats = await searchService.getSearchAnalytics(filters);
    res.json({ success: true, ...stats });
  } catch (err) {
    next(err);
  }
}

async function config(req, res, next) {
  try {
    const config = await searchService.getSearchConfig();
    res.json({ success: true, config });
  } catch (err) {
    next(err);
  }
}

async function saveConfig(req, res, next) {
  try {
    const SearchConfig = require('../models/SearchConfig.model');
    const { modules } = req.body;
    if (modules && Array.isArray(modules)) {
      for (const m of modules) {
        await searchService.saveModuleConfig(m.entityType, m);
      }
    }
    const updated = await SearchConfig.findOneAndUpdate(
      { key: 'global_search_config' },
      {
        ...req.body,
        updatedBy: req.user.id,
        updatedAt: new Date(),
      },
      { new: true, upsert: true }
    );
    searchService.invalidateConfigCache();
    res.json({ success: true, config: updated });
  } catch (err) {
    next(err);
  }
}

async function modulesConfig(req, res, next) {
  try {
    const modules = await searchService.getModulesConfig();
    res.json({ success: true, modules });
  } catch (err) {
    next(err);
  }
}

async function rebuild(req, res, next) {
  try {
    const count = await searchService.rebuildWithLog(req.user.id);
    res.json({ success: true, data: { count }, message: 'Search index rebuilt successfully' });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  search,
  suggest,
  click,
  history,
  clearHistory,
  popular,
  analytics,
  config,
  saveConfig,
  modulesConfig,
  rebuild,
  scoreFor,
  escapeRegex,
};
