const mongoose = require('mongoose');

const systemSettingSchema = new mongoose.Schema({
  key: {
    type: String,
    required: [true, 'Setting key is required'],
    unique: true,
    trim: true
  },
  value: {
    type: mongoose.Schema.Types.Mixed
  },
  category: {
    type: String,
    trim: true
  },
  description: {
    type: String
  }
}, {
  timestamps: true
});

systemSettingSchema.index({ category: 1 });

const SystemSetting = mongoose.model('SystemSetting', systemSettingSchema);

module.exports = SystemSetting;
