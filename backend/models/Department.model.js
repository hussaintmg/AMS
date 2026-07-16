const mongoose = require('mongoose');
const searchPlugin = require('../plugins/searchPlugin');

const departmentSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Department name is required'],
    trim: true,
  },
  code: {
    type: String,
    required: [true, 'Department code is required'],
    unique: true,
    trim: true,
  },
  description: {
    type: String,
    default: '',
  },
  parent: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Department',
    default: null,
  },
  manager: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  email: {
    type: String,
    trim: true,
    default: '',
  },
  phone: {
    type: String,
    trim: true,
    default: '',
  },
  location: {
    type: String,
    default: '',
  },
  budget: {
    type: Number,
    default: 0,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
}, {
  timestamps: true,
});

departmentSchema.index({ parent: 1 });
departmentSchema.index({ manager: 1 });
departmentSchema.index({ isActive: 1 });

departmentSchema.plugin(searchPlugin, { entityType: 'department' });
const Department = mongoose.model('Department', departmentSchema);
module.exports = Department;
