const mongoose = require('mongoose');

// Where a part comes from (OEM, aftermarket, a specific importer …). Dealers keep
// adding categories of their own, so this is data rather than an enum: the parts
// inventory tabs and the Add Part form are both built from this collection.
const partSourceTypeSchema = new mongoose.Schema({
  // Stored on Part.sourceType and used as the filter value in the URL/query.
  value: { type: String, required: [true, 'Source type value is required'], trim: true, lowercase: true },
  name: { type: String, required: [true, 'Source type name is required'], trim: true },
  description: { type: String, trim: true, default: '' },
  sortOrder: { type: Number, default: 100 },
  // The two built-in types the rest of the system reports on; they may be renamed
  // but never deleted.
  isSystem: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

partSourceTypeSchema.index({ value: 1 }, { unique: true });
partSourceTypeSchema.index({ isActive: 1 });

const PartSourceType = mongoose.model('PartSourceType', partSourceTypeSchema);
module.exports = PartSourceType;
