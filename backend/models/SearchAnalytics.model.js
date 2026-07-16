const mongoose = require('mongoose');

const searchAnalyticsSchema = new mongoose.Schema({
  query: { type: String, required: true, index: true },
  normalizedQuery: { type: String, index: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  resultCount: { type: Number, default: 0 },
  hasResults: { type: Boolean, default: false },
  clickedResultId: { type: String, default: null },
  clickedEntityType: { type: String, default: null },
  clickedPosition: { type: Number, default: null },
  duration: { type: Number, default: 0 },
  filters: { type: mongoose.Schema.Types.Mixed, default: {} },
  ip: { type: String, default: '' },
  userAgent: { type: String, default: '' },
  sessionId: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now, index: -1 },
});

searchAnalyticsSchema.index({ normalizedQuery: 1, createdAt: -1 });
searchAnalyticsSchema.index({ user: 1, createdAt: -1 });
searchAnalyticsSchema.index({ hasResults: 1, createdAt: -1 });

module.exports = mongoose.model('SearchAnalytics', searchAnalyticsSchema);
