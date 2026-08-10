const mongoose = require('mongoose');

const pageSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  label: { type: String, required: true, trim: true },
  path: { type: String, required: true, unique: true, trim: true },
  module: { type: String, trim: true },
  group: { type: String, trim: true },
  icon: { type: String, trim: true },
  sortOrder: { type: Number, default: 0 },
  description: { type: String, default: '' },
  isCore: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, {
  timestamps: true
});

pageSchema.index({ isActive: 1, sortOrder: 1 });
pageSchema.index({ group: 1 });

/**
 * Permission checks resolve a page key through its path, from a cache of this
 * collection (see `utils/pageRegistry`). Renaming or moving a page here has to
 * reach that cache, or the running process keeps deciding access from the layout
 * the pages had at boot. Hooked on the model rather than in the three controller
 * handlers that write pages, so a fourth one cannot forget.
 */
const refreshPageRegistry = () => {
  // Required lazily: the registry reads the model index this file is part of.
  require('../utils/pageRegistry').prime().catch(() => {});
};

pageSchema.post('save', refreshPageRegistry);
pageSchema.post('findOneAndUpdate', refreshPageRegistry);
pageSchema.post('findOneAndDelete', refreshPageRegistry);
pageSchema.post('deleteMany', refreshPageRegistry);
pageSchema.post('insertMany', refreshPageRegistry);

module.exports = mongoose.model('Page', pageSchema);
