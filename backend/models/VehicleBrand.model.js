const mongoose = require('mongoose');

const vehicleBrandSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    logo_url: { type: String, default: '' },
    country_of_origin: { type: String, default: '' },
    established_year: { type: Number, default: null },
    website: { type: String, default: '' },
    is_active: { type: Boolean, default: true },
    display_order: { type: Number, default: 0 },
    deleted_at: { type: Date, default: null },
    created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updated_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

vehicleBrandSchema.index({ name: 1 });
vehicleBrandSchema.index({ is_active: 1, deleted_at: 1 });

module.exports = mongoose.model('VehicleBrand', vehicleBrandSchema);
