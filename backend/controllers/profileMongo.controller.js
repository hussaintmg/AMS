const User = require("../models/User.model");
const { AppError } = require("../middleware/errorHandler");
const logger = require("../utils/logger");
const { logFileOperation } = require("../utils/apiLogger");
const { getPublicFileUrl } = require("../utils/url");
const fs = require("fs");
const path = require("path");

const uploadsRoot = path.resolve(__dirname, "..", "uploads");

const resolveUploadedFilePath = (storedPath, folder) => {
  if (!storedPath) return null;
  if (/^https?:\/\//i.test(storedPath)) {
    try {
      storedPath = new URL(storedPath).pathname;
    } catch (_error) {
      return null;
    }
  }
  const marker = `/uploads/${folder}/`;
  const normalized = String(storedPath).replace(/\\/g, "/");
  const markerIndex = normalized.indexOf(marker);
  if (markerIndex === -1) return null;
  const relative = normalized.slice(markerIndex + "/uploads/".length);
  const absolute = path.resolve(uploadsRoot, relative);
  if (!absolute.startsWith(uploadsRoot)) return null;
  return absolute;
};

const unlinkIfUploaded = (storedPath, folder) => {
  const filePath = resolveUploadedFilePath(storedPath, folder);
  if (!filePath) return;
  fs.unlink(filePath, (err) => {
    if (err && err.code !== "ENOENT") {
      logger.warn(`Failed to delete uploaded ${folder} file:`, err.message);
    }
  });
};

const mapProfileOutput = (user) => {
  const obj = user.toSafeJSON ? user.toSafeJSON() : user.toObject();
  return {
    ...obj,
    avatar: getPublicFileUrl(obj.avatar),
    first_name: obj.firstName,
    last_name: obj.lastName,
    full_name: `${obj.firstName || ""} ${obj.lastName || ""}`.trim(),
    employee_id: obj.employeeId,
    date_of_birth: obj.dateOfBirth ? obj.dateOfBirth.toISOString().split("T")[0] : null,
    postal_code: obj.postalCode,
    residential_address: obj.residentialAddress,
    emergency_contact_name: obj.emergencyContact?.name || "",
    emergency_contact_phone: obj.emergencyContact?.phone || "",
    emergency_contact_relation: obj.emergencyContact?.relationship || "",
    social_links: obj.socialProfiles || {},
    role_name: obj.role?.name || obj.role?.displayName || "",
    role_display_name: obj.role?.displayName || obj.role?.name || "",
    department_name: obj.department || "",
    joining_date: obj.joinedAt,
    employee_status: obj.status,
  };
};

exports.getProfile = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id).populate("role", "name displayName permissions");
    if (!user) {
      throw new AppError("Profile not found", 404);
    }

    res.json({
      success: true,
      data: mapProfileOutput(user),
    });
  } catch (error) {
    logger.error("Error fetching profile:", error);
    next(error);
  }
};

exports.updateProfile = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      throw new AppError("Profile not found", 404);
    }

    const {
      bio, address, city, country, postal_code,
      date_of_birth, gender, emergency_contact_name,
      emergency_contact_phone, emergency_contact_relation, social_links,
    } = req.body;

    if (bio !== undefined) user.bio = bio;
    if (address !== undefined) user.residentialAddress = address;
    if (city !== undefined) user.city = city;
    if (country !== undefined) user.country = country;
    if (postal_code !== undefined) user.postalCode = postal_code;
    if (date_of_birth !== undefined) user.dateOfBirth = date_of_birth || null;
    if (gender !== undefined) user.gender = gender;

    if (emergency_contact_name !== undefined || emergency_contact_phone !== undefined || emergency_contact_relation !== undefined) {
      user.emergencyContact = {
        name: emergency_contact_name !== undefined ? emergency_contact_name : (user.emergencyContact?.name || ""),
        phone: emergency_contact_phone !== undefined ? emergency_contact_phone : (user.emergencyContact?.phone || ""),
        relationship: emergency_contact_relation !== undefined ? emergency_contact_relation : (user.emergencyContact?.relationship || ""),
      };
    }

    if (social_links !== undefined) {
      user.socialProfiles = {
        linkedin: social_links.linkedin || user.socialProfiles?.linkedin || "",
        twitter: social_links.twitter || user.socialProfiles?.twitter || "",
        facebook: social_links.facebook || user.socialProfiles?.facebook || "",
        website: social_links.website || user.socialProfiles?.website || "",
      };
    }

    await user.save();

    const updated = await User.findById(req.user.id).populate("role", "name displayName permissions");

    res.json({
      success: true,
      message: "Profile updated successfully",
      data: mapProfileOutput(updated),
    });
  } catch (error) {
    logger.error("Error updating profile:", error);
    next(error);
  }
};

exports.deleteAvatar = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) throw new AppError("Profile not found", 404);

    const oldAvatarPath = user.avatar;
    user.avatar = "";
    await user.save();

    unlinkIfUploaded(oldAvatarPath, "avatars");

    const updated = await User.findById(req.user.id).populate("role", "name displayName permissions");

    res.json({
      success: true,
      message: "Avatar deleted successfully",
      data: mapProfileOutput(updated),
    });
  } catch (error) {
    logger.error("Error deleting avatar:", error);
    next(error);
  }
};

exports.uploadAvatar = async (req, res, next) => {
  try {
    if (!req.file) {
      throw new AppError("No image file provided", 400);
    }

    const current = await User.findById(req.user.id);
    if (!current) {
      throw new AppError("User not found", 404);
    }

    const oldAvatarPath = current.avatar;
    const avatarUrl = getPublicFileUrl(`/uploads/avatars/${req.file.filename}`, req);

    current.avatar = avatarUrl;
    await current.save();
    unlinkIfUploaded(oldAvatarPath, "avatars");
    const user = await User.findById(req.user.id).populate("role", "name displayName permissions");

    logFileOperation(req, {
      action: "upload",
      fileName: req.file.filename,
      filePath: req.file.path,
      size: req.file.size,
      mimeType: req.file.mimetype,
    });

    res.json({
      success: true,
      message: "Avatar uploaded successfully",
      data: mapProfileOutput(user),
    });
  } catch (error) {
    logger.error("Error uploading avatar:", error);
    next(error);
  }
};
