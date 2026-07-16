/**
 * Mongoose Search Plugin
 * AMS ERP Global Search System
 *
 * Automatically updates the SearchDocument index when a model
 * performs create, update, or delete operations.
 *
 * Usage:
 *   MySchema.plugin(searchPlugin, { entityType: 'my_entity' });
 *
 * Uses lazy require() to break circular dependencies.
 * Module existence is NOT checked at init time -- it's checked
 * lazily when a hook actually fires, because the search registry
 * is populated after all models are loaded.
 */

function requireService() {
  return require('../services/searchIndex.service');
}

function searchPlugin(schema, options = {}) {
  const { entityType } = options;
  if (!entityType) {
    throw new Error('searchPlugin requires an entityType option');
  }

  schema.post('save', async function (doc) {
    try {
      const svc = requireService();
      if (doc.isActive === false || doc.deletedAt) {
        await svc.removeDocument(entityType, String(doc._id));
      } else {
        await svc.upsertDocument(entityType, doc);
      }
    } catch (err) {
      console.error(`[searchPlugin] post('save') error for ${entityType}:`, err.message);
    }
  });

  schema.post('findOneAndUpdate', async function (result) {
    try {
      if (!result) return;
      const svc = requireService();
      if (result.isActive === false || result.deletedAt) {
        await svc.removeDocument(entityType, String(result._id));
      } else {
        await svc.upsertDocument(entityType, result);
      }
    } catch (err) {
      console.error(`[searchPlugin] post('findOneAndUpdate') error for ${entityType}:`, err.message);
    }
  });

  schema.post('findOneAndDelete', async function (doc) {
    try {
      if (!doc) return;
      const svc = requireService();
      await svc.removeDocument(entityType, String(doc._id));
    } catch (err) {
      console.error(`[searchPlugin] post('findOneAndDelete') error for ${entityType}:`, err.message);
    }
  });

  schema.post('deleteOne', async function () {
    try {
      const filter = this.getFilter && this.getFilter();
      if (filter?._id) {
        const svc = requireService();
        await svc.removeDocument(entityType, String(filter._id));
      }
    } catch (err) {
      console.error(`[searchPlugin] post('deleteOne') error for ${entityType}:`, err.message);
    }
  });

  schema.post('deleteMany', async function () {
    try {
      const filter = this.getFilter && this.getFilter();
      if (filter?._id && Array.isArray(filter._id.$in)) {
        const svc = requireService();
        for (const id of filter._id.$in) {
          await svc.removeDocument(entityType, String(id));
        }
      }
    } catch (err) {
      // silent
    }
  });
}

module.exports = searchPlugin;
