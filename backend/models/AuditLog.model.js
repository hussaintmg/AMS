const mongoose = require("mongoose");

const auditLogSchema = new mongoose.Schema(
  {
    requestId: {
      type: String,
      default: null,
      index: true,
    },
    actor: {
      id: { type: String, default: null },
      email: { type: String, default: null },
      name: { type: String, default: null },
      role: { type: String, default: null },
    },
    action: {
      type: String,
      required: true,
      index: true,
    },
    targetCollection: {
      type: String,
      default: "",
      index: true,
    },
    targetId: {
      type: String,
      default: null,
      index: true,
    },
    targetDisplay: {
      type: String,
      default: "",
    },
    description: {
      type: String,
      default: "",
    },
    previousData: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    newData: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    severity: {
      type: String,
      enum: ["info", "warning", "error", "critical"],
      default: "info",
      index: true,
    },
    ip: {
      type: String,
      default: "",
    },
    userAgent: {
      type: String,
      default: "",
    },
    endpoint: {
      type: String,
      default: "",
    },
    method: {
      type: String,
      default: "",
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ actor: 1, createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });
auditLogSchema.index({ targetCollection: 1, targetId: 1 });
auditLogSchema.index({ severity: 1 });

module.exports = mongoose.model("AuditLog", auditLogSchema);
