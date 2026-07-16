const mongoose = require('mongoose');

const searchModuleConfigSchema = new mongoose.Schema({
  entityType: { type: String, required: true },
  searchEnabled: { type: Boolean, default: true },
  priority: { type: Number, default: 500 },
  searchWeight: { type: Number, default: 5 },
  updatedAt: { type: Date, default: Date.now },
}, { _id: false });

const searchConfigSchema = new mongoose.Schema({
  key: { type: String, default: 'global_search_config', unique: true },
  modules: [searchModuleConfigSchema],
  maxResultsPerModule: { type: Number, default: 10 },
  maxSuggestions: { type: Number, default: 8 },
  cacheTtl: { type: Number, default: 30 },
  analyticsEnabled: { type: Boolean, default: true },
  historyEnabled: { type: Boolean, default: true },
  historyMaxEntries: { type: Number, default: 10 },
  popularSearchThreshold: { type: Number, default: 5 },
  synonymEnabled: { type: Boolean, default: true },
  fuzzyMaxDistance: { type: Number, default: 2 },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('SearchConfig', searchConfigSchema);
