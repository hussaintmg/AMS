const mongoose = require("mongoose");

const SENSITIVE_MASKED = "[masked]";

const apiLogSchema = new mongoose.Schema(
  {
    requestId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    endpoint: {
      type: String,
      required: true,
      index: true,
    },
    method: {
      type: String,
      required: true,
      enum: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"],
      index: true,
    },
    module: {
      type: String,
      default: "",
      index: true,
    },
    controller: {
      type: String,
      default: "",
    },
    action: {
      type: String,
      default: "",
      index: true,
    },
    user: {
      id: { type: String, default: null },
      email: { type: String, default: null },
      firstName: { type: String, default: null },
      lastName: { type: String, default: null },
      role: { type: String, default: null },
    },
    ip: {
      type: String,
      default: "",
    },
    userAgent: {
      type: String,
      default: "",
    },
    headers: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    query: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    params: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    requestBody: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    responseBody: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    files: {
      type: [mongoose.Schema.Types.Mixed],
      default: [],
    },
    statusCode: {
      type: Number,
      required: true,
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
    severity: {
      type: String,
      enum: ["info", "warning", "error", "critical"],
      default: "info",
      index: true,
    },
    error: {
      name: { type: String, default: null },
      message: { type: String, default: null },
      stack: { type: String, default: null },
      code: { type: String, default: null },
    },
    logFilePath: {
      type: String,
      default: "",
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
  },
  {
    timestamps: true,
  }
);

apiLogSchema.index({ createdAt: -1 });
apiLogSchema.index({ user: 1, createdAt: -1 });
apiLogSchema.index({ role: 1, createdAt: -1 });
apiLogSchema.index({ severity: 1, statusCode: 1 });
apiLogSchema.index({ method: 1, endpoint: 1 });

module.exports = mongoose.model("ApiLog", apiLogSchema);
