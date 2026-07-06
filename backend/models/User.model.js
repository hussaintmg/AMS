const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const { v4: uuidv4 } = require("uuid");

const refreshTokenSchema = new mongoose.Schema(
  {
    token: { type: String },
    ipAddress: { type: String },
    userAgent: { type: String },
    expiresAt: { type: Date },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const customPermissionSchema = new mongoose.Schema(
  {
    pageKey: { type: String, trim: true },
    path: { type: String, trim: true },
    module: { type: String, trim: true },
    canView: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
  },
  { _id: false },
);

const logPermissionsSchema = new mongoose.Schema(
  {
    mode: {
      type: String,
      enum: ["own", "selected_users", "selected_roles", "all"],
      default: "own",
    },
    users: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    roles: [{ type: mongoose.Schema.Types.ObjectId, ref: "Role" }],
    updatedAt: { type: Date },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { _id: false },
);

const normalizeLogPermissions = (permissions) => {
  if (Array.isArray(permissions)) {
    const active = permissions.filter((permission) => permission?.isActive !== false);
    const users = active.filter((permission) => permission?.type === "user" && permission.refId).map((permission) => permission.refId);
    const roles = active.filter((permission) => permission?.type === "role" && permission.refId).map((permission) => permission.refId);
    if (active.some((permission) => permission?.type === "all")) return { mode: "all", users: [], roles: [] };
    if (users.length) return { mode: "selected_users", users, roles: [] };
    if (roles.length) return { mode: "selected_roles", users: [], roles };
    return { mode: "own", users: [], roles: [] };
  }
  return permissions;
};

const passwordResetSchema = new mongoose.Schema(
  {
    forgotToken: { type: String, select: false },
    forgotTokenExpiresAt: { type: Date, select: false },
    code: { type: String, select: false },
    codeExpiresAt: { type: Date, select: false },
    codeVerified: { type: Boolean, default: false, select: false },
    resetToken: { type: String, select: false },
    resetTokenExpiresAt: { type: Date, select: false },
  },
  { _id: false },
);

const userSchema = new mongoose.Schema(
  {
    uuid: {
      type: String,
      unique: true,
      default: () => uuidv4(),
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      validate: {
        validator: function (v) {
          return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
        },
        message: "Invalid email format",
      },
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      select: false,
    },
    firstName: {
      type: String,
      required: [true, "First name is required"],
      trim: true,
    },
    lastName: {
      type: String,
      trim: true,
      default: "",
    },
    phone: {
      type: String,
      trim: true,
      default: "",
    },
    role: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Role",
      required: [true, "Role is required"],
    },
    department: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Department",
      default: null,
      required: false,
      set: function (value) {
        return value === "" ? null : value;
      },
    },
    designation: {
      type: String,
      default: "",
    },
    avatar: {
      type: String,
      default: "",
    },
    employeeId: {
      type: String,
      default: "",
    },
    status: {
      type: String,
      enum: ["active", "inactive", "suspended"],
      default: "active",
    },
    joinedAt: {
      type: Date,
    },
    bio: {
      type: String,
      default: "",
    },
    gender: {
      type: String,
      enum: ["male", "female", "other", ""],
      default: "",
    },
    dateOfBirth: {
      type: Date,
    },
    residentialAddress: {
      type: String,
      default: "",
    },
    city: {
      type: String,
      default: "",
    },
    postalCode: {
      type: String,
      default: "",
    },
    country: {
      type: String,
      default: "Pakistan",
    },
    emergencyContact: {
      type: {
        name: { type: String, default: "" },
        phone: { type: String, default: "" },
        relationship: { type: String, default: "" },
      },
      default: {},
    },
    socialProfiles: {
      type: {
        linkedin: { type: String, default: "" },
        twitter: { type: String, default: "" },
        facebook: { type: String, default: "" },
        website: { type: String, default: "" },
      },
      default: {},
    },
    preferences: {
      type: {
        theme: { type: String, default: "light" },
        language: { type: String, default: "en" },
        notifications: { type: Boolean, default: true },
      },
      default: {},
    },
    customPermissions: {
      type: [customPermissionSchema],
      default: [],
    },
    logPermissionSource: {
      type: String,
      enum: ["role", "user"],
      default: "role",
    },
    logsPermissions: {
      type: logPermissionsSchema,
      set: normalizeLogPermissions,
      default: () => ({ mode: "own", users: [], roles: [] }),
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    lastLogin: {
      type: Date,
    },
    refreshTokens: {
      type: [refreshTokenSchema],
      default: [],
    },
    passwordReset: {
      type: passwordResetSchema,
      default: () => ({}),
    },
    forgotPasswordToken: {
      type: String,
      select: false,
    },
    forgotPasswordExpiresAt: {
      type: Date,
      select: false,
    },
    resetPasswordToken: {
      type: String,
      select: false,
    },
    resetPasswordExpiresAt: {
      type: Date,
      select: false,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true,
  },
);

userSchema.index({ role: 1 });
userSchema.index({ status: 1 });
userSchema.index({ isActive: 1 });
userSchema.index({ createdAt: -1 });

// Normalize legacy array logsPermissions to object shape expected by schema
userSchema.pre("init", function (doc) {
  if (Array.isArray(doc.logsPermissions)) {
    doc.logsPermissions = { mode: "own", users: [], roles: [] };
  }
});

userSchema.pre("save", async function () {
  if (this.isModified("status")) {
    this.isActive = this.status === "active";
  }
  if (!this.isModified("password")) return;
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.toSafeJSON = function () {
  const obj = this.toObject();
  delete obj.password;
  delete obj.refreshTokens;
  return obj;
};

userSchema.statics.findByEmailWithPassword = function (email) {
  return this.findOne({ email: email.toLowerCase().trim() })
    .select("+password")
    .populate("role");
};

const User = mongoose.model("User", userSchema);

module.exports = User;
