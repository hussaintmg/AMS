/**
 * Profile Routes — MongoDB
 * Maintained by Hussain Developer
 * hussaintmerng@gmail.com | +92 319 1634446
 * AMS ERP
 */

const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const router = express.Router();
const profileController = require("../controllers/profileMongo.controller");
const { authenticate } = require("../middleware/auth");

const uploadDir = path.join(__dirname, "..", "uploads", "avatars");
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `avatar-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  },
});

const upload = multer({
  storage,
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      return cb(new Error("Only image uploads are allowed"));
    }
    cb(null, true);
  },
  limits: { fileSize: 2 * 1024 * 1024 },
});

/**
 * @swagger
 * tags:
 *   - name: Profile
 *     description: Authenticated user profile management
 *
 * /api/profile:
 *   get:
 *     summary: Get current user profile
 *     tags: [Profile]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Profile returned
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               data:
 *                 email: user@example.com
 *                 firstName: Ali
 *                 lastName: Khan
 *       400: { description: Bad request }
 *       401: { description: Unauthorized }
 *       403: { description: Forbidden }
 *       404: { description: Profile not found }
 *       500: { description: Server error }
 *   put:
 *     summary: Update current user profile
 *     tags: [Profile]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               bio: { type: string, example: Service advisor }
 *               address: { type: string, example: Main Boulevard }
 *               city: { type: string, example: Lahore }
 *               country: { type: string, example: Pakistan }
 *               postal_code: { type: string, example: "54000" }
 *               date_of_birth: { type: string, format: date, example: "1990-01-15" }
 *               gender: { type: string, example: male }
 *               emergency_contact_name: { type: string, example: Sara Khan }
 *               emergency_contact_phone: { type: string, example: "+923001234567" }
 *               emergency_contact_relation: { type: string, example: Spouse }
 *               social_links: { type: object, example: { linkedin: "https://linkedin.com/in/user" } }
 *           example:
 *             city: Lahore
 *             country: Pakistan
 *             bio: Service advisor
 *     responses:
 *       200: { description: Profile updated successfully }
 *       400: { description: Validation error }
 *       401: { description: Unauthorized }
 *       403: { description: Forbidden }
 *       404: { description: Profile not found }
 *       500: { description: Server error }
 *
 * /api/profile/avatar:
 *   post:
 *     summary: Upload profile avatar
 *     tags: [Profile]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [avatar]
 *             properties:
 *               avatar:
 *                 type: string
 *                 format: binary
 *           encoding:
 *             avatar:
 *               contentType: image/png, image/jpeg
 *     responses:
 *       200:
 *         description: Avatar uploaded successfully
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               message: Avatar uploaded successfully
 *       400: { description: No image file provided or invalid file }
 *       401: { description: Unauthorized }
 *       403: { description: Forbidden }
 *       404: { description: User not found }
 *       500: { description: Server error }
 *   delete:
 *     summary: Delete profile avatar
 *     tags: [Profile]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Avatar deleted successfully
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               message: Avatar deleted successfully
 *       401: { description: Unauthorized }
 *       404: { description: Profile not found }
 *       500: { description: Server error }
 */

router.get("/", authenticate, profileController.getProfile);

router.put("/", authenticate, profileController.updateProfile);

router.post("/avatar", authenticate, upload.single("avatar"), profileController.uploadAvatar);

router.delete("/avatar", authenticate, profileController.deleteAvatar);

module.exports = router;
