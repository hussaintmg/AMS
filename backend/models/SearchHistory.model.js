const mongoose = require('mongoose');

const searchHistorySchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  query: { type: String, required: true },
  entityType: { type: String, default: null },
  resultCount: { type: Number, default: 0 },
  clicked: { type: Boolean, default: false },
  clickedUrl: { type: String, default: null },
  createdAt: { type: Date, default: Date.now, index: -1 },
});

searchHistorySchema.index({ user: 1, createdAt: -1 });
searchHistorySchema.index({ user: 1, query: 1 });

module.exports = mongoose.model('SearchHistory', searchHistorySchema);
