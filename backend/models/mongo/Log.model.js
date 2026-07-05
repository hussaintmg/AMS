const mongoose = require("mongoose");

const userSummarySchema = new mongoose.Schema({
  id: { type: String, default: null },
  email: { type: String, default: null },
  firstName: { type: String, default: null },
  lastName: { type: String, default: null },
  role: { type: String, default: null },
}, { _id: false });

const errorSchema = new mongoose.Schema({
  name: { type: String, default: null },
  message: { type: String, default: null },
  stack: { type: String, default: null },
  code: { type: String, default: null },
}, { _id: false });

const logSchema = new mongoose.Schema({
  requestId: {
    type: String,
    default: null,
    index: true,
  },
  endpoint: {
    type: String,
    default: "",
    index: true,
  },
  method: {
    type: String,
    enum: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD", ""],
    default: "",
    index: true,
  },
  module: {
    type: String,
    default: "",
    index: true,
  },
  action: {
    type: String,
    default: "",
    index: true,
  },
  user: {
    type: userSummarySchema,
    default: () => ({}),
  },
  ip: {
    type: String,
    default: "",
  },
  ipAddress: {
    type: String,
    default: "",
  },
  userAgent: {
    type: String,
    default: "",
  },
  requestBody: {
    type: mongoose.Schema.Types.Mixed,
    default: null,
  },
  responseBody: {
    type: mongoose.Schema.Types.Mixed,
    default: null,
  },
  query: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
  params: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
  headers: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
  files: {
    type: [mongoose.Schema.Types.Mixed],
    default: [],
  },
  statusCode: {
    type: Number,
    default: 200,
    index: true,
  },
  success: {
    type: Boolean,
    default: true,
  },
  executionTime: {
    type: Number,
    default: 0,
  },
  durationMs: {
    type: Number,
    default: 0,
  },
  severity: {
    type: String,
    enum: ["info", "warning", "error", "critical"],
    default: "info",
    index: true,
  },
  error: {
    type: errorSchema,
    default: null,
  },
  logFilePath: {
    type: String,
    default: "",
  },
  physicalLogPath: {
    type: String,
    default: "",
  },
  serverError: {
    type: Boolean,
    default: false,
    index: true,
  },
  isDeleted: {
    type: Boolean,
    default: false,
    index: true,
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
}, {
  timestamps: true,
});

logSchema.index({ createdAt: -1 });
logSchema.index({ "user.id": 1, createdAt: -1 });
logSchema.index({ severity: 1, statusCode: 1 });
logSchema.index({ method: 1, endpoint: 1 });
logSchema.index({ isDeleted: 1, createdAt: -1 });
logSchema.index({ isDeleted: 1, "user.id": 1, createdAt: -1 });

module.exports = mongoose.model("Log", logSchema);
