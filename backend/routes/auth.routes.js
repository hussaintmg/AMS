const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { generateToken, generateRefreshToken, authenticate, authorizeAction, getCookieValue } = require('../middleware/auth');
const { User, Role } = require('../models');
const { AppError } = require('../middleware/errorHandler');
const logger = require('../utils/logger');
const { getPublicFileUrl } = require('../utils/url');
const { sendMail } = require('../utils/mailer');
const forgotPasswordEmailTemplate = require('../constants/forgotPasswordEmailTemplate');
const emailSender = require('../services/emailSender.service');
const { getPermissionSettings, resolvePagePermissions } = require('../utils/permissionResolver');
const { fieldPermissionsForUser } = require('../utils/fieldPermissions');
const { canonicalizeRows } = require('../utils/pageRegistry');
const { catalogForClient } = require('../constants/pageCatalog');
const { moduleFlags } = require('../utils/moduleFlags');

/**
 * The role, in the page keys this build is written against.
 *
 * A page added by hand through Frontend Management takes its key from the label
 * it was typed with, so a live install can hold the Parts Scan screen as "Parts
 * Barcode Scan". Every screen asks `canRoleDo(user, 'part_scan', 'create')`, so
 * without this the operator is told the role may not create — while Role Jobs
 * shows Create plainly ticked. Resolved by path; see `utils/pageRegistry`.
 */
const rolePayload = (role) => {
  if (!role) return null;
  const permissions = role.permissions || [];
  return {
    id: role._id?.toString() || role.toString(),
    name: role.name,
    displayName: role.displayName,
    permissions: canonicalizeRows(permissions, permissions),
    logsPermissions: role.logsPermissions || [],
    jobs: canonicalizeRows(role.jobs || [], permissions),
  };
};

const RESET_WINDOW_MS = 60 * 60 * 1000;
const isProduction = process.env.NODE_ENV === 'production';

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();
const generateResetToken = () => crypto.randomBytes(32).toString('hex');
const generateSixDigitCode = () => String(Math.floor(100000 + Math.random() * 900000));
const buildResetExpiry = () => new Date(Date.now() + RESET_WINDOW_MS);

/**
 * @swagger
 * tags:
 *   - name: Auth
 *     description: Authentication and password recovery
 *
 * /api/auth/login:
 *   post:
 *     summary: Login with email and password
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string, format: email, example: admin@example.com }
 *               password: { type: string, format: password, example: Password123! }
 *               remember: { type: boolean, example: true }
 *           example:
 *             email: admin@example.com
 *             password: Password123!
 *             remember: true
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               message: Login successful
 *               data:
 *                 user:
 *                   id: 65f1c2d3e4f5678901234567
 *                   email: admin@example.com
 *                   firstName: Admin
 *                   lastName: User
 *                 token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
 *                 refreshToken: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
 *       400: { description: Missing email or password }
 *       401: { description: Invalid credentials }
 *       403: { description: Forbidden }
 *       404: { description: Not found }
 *       500: { description: Server error }
 *
 * /api/auth/register:
 *   post:
 *     summary: Create a user account (User Management → Create)
 *     tags: [Auth]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password, firstName]
 *             properties:
 *               email: { type: string, format: email, example: customer@example.com }
 *               password: { type: string, format: password, example: Password123! }
 *               firstName: { type: string, example: Ali }
 *               lastName: { type: string, example: Khan }
 *               phone: { type: string, example: "+923001234567" }
 *               roleId: { type: string, example: 65f1c2d3e4f5678901234567 }
 *           example:
 *             email: customer@example.com
 *             password: Password123!
 *             firstName: Ali
 *             lastName: Khan
 *             phone: "+923001234567"
 *     responses:
 *       201:
 *         description: Registration successful
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               message: Registration successful
 *               data: { userId: 65f1c2d3e4f5678901234567, uuid: USR-0002 }
 *       400: { description: Validation error }
 *       401: { description: Unauthorized }
 *       403: { description: Forbidden }
 *       404: { description: Role not found }
 *       500: { description: Server error }
 *
 * /api/auth/forgot-password:
 *   post:
 *     summary: Request a password reset email
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email: { type: string, format: email, example: user@example.com }
 *           example: { email: user@example.com }
 *     responses:
 *       200: { description: Reset email queued when account exists }
 *       400: { description: Email is required }
 *       401: { description: Unauthorized }
 *       403: { description: Forbidden }
 *       404: { description: Not found }
 *       500: { description: Server error }
 *
 * /api/auth/check-forgot-token:
 *   post:
 *     summary: Validate a forgot-password token
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token]
 *             properties:
 *               token: { type: string, example: 0123456789abcdef }
 *           example: { token: 0123456789abcdef }
 *     responses:
 *       200: { description: Forgot token is valid }
 *       400: { description: Invalid or expired forgot token }
 *       401: { description: Unauthorized }
 *       403: { description: Forbidden }
 *       404: { description: Not found }
 *       500: { description: Server error }
 *
 * /api/auth/check-reset-code:
 *   post:
 *     summary: Verify password reset code
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token, code]
 *             properties:
 *               token: { type: string, example: 0123456789abcdef }
 *               code: { type: string, example: "123456" }
 *           example: { token: 0123456789abcdef, code: "123456" }
 *     responses:
 *       200: { description: Reset code verified }
 *       400: { description: Invalid or expired reset code }
 *       401: { description: Unauthorized }
 *       403: { description: Forbidden }
 *       404: { description: Not found }
 *       500: { description: Server error }
 *
 * /api/auth/check-reset-token:
 *   post:
 *     summary: Validate a reset-password token
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token]
 *             properties:
 *               token: { type: string, example: 0123456789abcdef }
 *           example: { token: 0123456789abcdef }
 *     responses:
 *       200: { description: Reset token is valid }
 *       400: { description: Invalid or expired reset token }
 *       401: { description: Unauthorized }
 *       403: { description: Forbidden }
 *       404: { description: Not found }
 *       500: { description: Server error }
 *
 * /api/auth/reset-password:
 *   post:
 *     summary: Reset password using a verified reset token
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token, password, confirmPassword]
 *             properties:
 *               token: { type: string, example: 0123456789abcdef }
 *               password: { type: string, format: password, example: NewPassword123! }
 *               confirmPassword: { type: string, format: password, example: NewPassword123! }
 *           example:
 *             token: 0123456789abcdef
 *             password: NewPassword123!
 *             confirmPassword: NewPassword123!
 *     responses:
 *       200: { description: Password reset successfully }
 *       400: { description: Validation error }
 *       401: { description: Unauthorized }
 *       403: { description: Forbidden }
 *       404: { description: Not found }
 *       500: { description: Server error }
 *
 * /api/auth/me:
 *   get:
 *     summary: Get the current authenticated user
 *     tags: [Auth]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Current user profile
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               data:
 *                 id: 65f1c2d3e4f5678901234567
 *                 email: admin@example.com
 *                 firstName: Admin
 *       400: { description: Bad request }
 *       401: { description: "Missing, expired, or invalid token" }
 *       403: { description: Forbidden }
 *       404: { description: User not found }
 *       500: { description: Server error }
 *
 * /api/auth/logout:
 *   post:
 *     summary: Logout and clear the auth cookie
 *     tags: [Auth]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Logout successful
 *         content:
 *           application/json:
 *             example: { success: true, message: Logout successful }
 *       400: { description: Bad request }
 *       401: { description: "Missing, expired, or invalid token" }
 *       403: { description: Forbidden }
 *       404: { description: User not found }
 *       500: { description: Server error }
 */

router.post('/login', async (req, res, next) => {
  try {
    const { email, password, remember = true } = req.body;

    if (!email || !password) {
      throw new AppError('Email and password are required', 400);
    }

    const user = await User.findByEmailWithPassword(email);

    if (!user) {
      throw new AppError('Invalid credentials', 401);
    }

    if (user.status !== 'active' || user.isActive === false) {
      throw new AppError('Account is inactive', 403, 'Please contact your administrator.', 'USER_INACTIVE');
    }

    const isMatch = await user.comparePassword(password);

    if (!isMatch) {
      throw new AppError('Invalid credentials', 401);
    }

    const token = generateToken(user, remember);
    const refreshToken = generateRefreshToken(user._id.toString());

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    user.refreshTokens.push({
      token: refreshToken,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      expiresAt
    });

    user.lastLogin = now;
    await user.save();

    logger.info(`User logged in: ${email}`);
    const logPermissionSettings = await getPermissionSettings();
    const effectivePagePermissions = resolvePagePermissions(user);

    // Only mark the cookie Secure when the current request is actually HTTPS.
    // This keeps local HTTP development (including the CRA proxy) authenticated
    // even when the server is started with production environment variables.
    const isHttps = req.secure || req.get('x-forwarded-proto') === 'https';
    res.cookie('token', token, {
      httpOnly: true,
      secure: isHttps,
      path: '/',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      sameSite: isHttps ? 'none' : 'lax'
    });

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        user: {
          id: user._id.toString(),
          uuid: user.uuid,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          fullName: user.fullName,
          role: rolePayload(user.role),
          customPermissions: user.customPermissions || [],
          permissions: effectivePagePermissions,
          logPermissionSource: user.logPermissionSource || 'role',
          logsPermissions: user.logsPermissions || [],
          logPermissionMode: logPermissionSettings.logPermissionMode,
          // The screen catalog the browser enforces role choices with, and which
          // optional modules (custom documents) are switched on. Both are
          // build-level, but ride on the session so the client has no second
          // table to keep in step.
          pageCatalog: catalogForClient(),
          modules: await moduleFlags(),
        },
        logPermissionMode: logPermissionSettings.logPermissionMode,
        token,
        refreshToken
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Creating a user account.
 *
 * This sat on the public half of the auth router, beside sign-in and password
 * recovery, with no check on it at all: anyone who could reach the API could
 * create an account, and `roleId` is taken straight from the request, so they
 * could choose which role it landed on. The only thing standing between an
 * anonymous caller and an administrator account was `role.count`, a seat cap
 * that most roles do not set. Nothing in the app calls this — User Management
 * posts to /api/admin/users — so it was an open door onto a room nobody used.
 *
 * It is now the same grant that screen needs.
 */
router.post('/register', authenticate, authorizeAction('user_management', 'create'), async (req, res, next) => {
  try {
    const { email, password, firstName, lastName, phone, roleId } = req.body;

    if (!email || !password || !firstName) {
      throw new AppError('Email, password, and first name are required', 400);
    }

    const existing = await User.findOne({ email: email.toLowerCase().trim() });
    if (existing) {
      throw new AppError('Email already registered', 400);
    }

    let role;
    if (roleId) {
      role = await Role.findById(roleId);
      if (!role) {
        throw new AppError('Role not found', 400);
      }
    } else {
      role = await Role.findOne({ name: 'customer' });
      if (!role) {
        throw new AppError('Default role not found', 400);
      }
    }

    if (role.count > 0) {
      const currentCount = await User.countDocuments({ role: role._id, isActive: true });
      if (currentCount >= role.count) {
        throw new AppError('Role user limit reached', 400);
      }
    }

    const user = await User.create({
      email,
      password,
      firstName,
      lastName: lastName || '',
      phone: phone || '',
      role: role._id
    });

    logger.info(`New user registered: ${email}`);

    res.status(201).json({
      success: true,
      message: 'Registration successful',
      data: { userId: user._id.toString(), uuid: user.uuid }
    });
  } catch (error) {
    next(error);
  }
});

router.post('/forgot-password', async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body.email);
    if (!email) {
      throw new AppError('Email is required', 400);
    }

    const user = await User.findOne({ email }).select('+passwordReset.forgotToken +passwordReset.code');
    const responseData = {};

    if (user && user.isActive) {
      const forgotToken = generateResetToken();
      const code = generateSixDigitCode();
      const expiresAt = buildResetExpiry();

      user.passwordReset = {
        forgotToken,
        forgotTokenExpiresAt: expiresAt,
        code,
        codeExpiresAt: expiresAt,
        codeVerified: false,
        resetToken: undefined,
        resetTokenExpiresAt: undefined
      };
      await user.save();

      const expiresInMinutes = Math.floor(RESET_WINDOW_MS / (60 * 1000));
      const resetPasswordLink = `${process.env.APP_URL || ''}/reset-password?token=${forgotToken}`;
      try {
        await emailSender.sendTemplateEmail({
          usageKey: 'forgot_password',
          to: user.email,
          context: {
            user: user.toObject ? user.toObject() : user,
            auth: {
              resetCode: code,
              resetPasswordLink,
              forgotToken,
              expiresInMinutes,
            },
            resetPasswordLink,
            resetCode: code,
            forgotToken,
            expiresInMinutes,
          },
        });
      } catch (templateError) {
        logger.warn(`Forgot password email template unavailable, using default: ${templateError.message}`);
        const template = forgotPasswordEmailTemplate({
          firstName: user.firstName,
          lastName: user.lastName,
          code,
          expiresInMinutes
        });

        await sendMail({
          to: user.email,
          subject: template.subject,
          html: template.html,
          text: template.text
        });
      }

      responseData.forgotToken = forgotToken;

      logger.info(`Password reset email sent for ${email}`);
    }

    res.json({
      success: true,
      message: 'Please check your email for the password reset code.',
      data: responseData
    });
  } catch (error) {
    next(error);
  }
});

router.post('/check-forgot-token', async (req, res, next) => {
  try {
    const { token } = req.body;
    if (!token) throw new AppError('Token is required', 400);

    const user = await User.findOne({
      'passwordReset.forgotToken': token,
      'passwordReset.forgotTokenExpiresAt': { $gt: new Date() }
    }).select('+passwordReset.forgotToken +passwordReset.forgotTokenExpiresAt');

    if (!user) {
      throw new AppError('Invalid or expired forgot token', 400);
    }

    res.json({ success: true, message: 'Forgot token is valid' });
  } catch (error) {
    next(error);
  }
});

router.post('/check-reset-code', async (req, res, next) => {
  try {
    const { token, code } = req.body;
    if (!token || !code) {
      throw new AppError('Token and code are required', 400);
    }

    const user = await User.findOne({
      'passwordReset.forgotToken': token,
      'passwordReset.forgotTokenExpiresAt': { $gt: new Date() },
      'passwordReset.codeExpiresAt': { $gt: new Date() }
    }).select('+passwordReset.forgotToken +passwordReset.code +passwordReset.codeExpiresAt');

    if (!user || String(user.passwordReset?.code) !== String(code).trim()) {
      throw new AppError('Invalid or expired reset code', 400);
    }

    const resetToken = generateResetToken();
    user.passwordReset.codeVerified = true;
    user.passwordReset.resetToken = resetToken;
    user.passwordReset.resetTokenExpiresAt = buildResetExpiry();
    await user.save();

    res.json({
      success: true,
      message: 'Reset code verified',
      data: { resetToken }
    });
  } catch (error) {
    next(error);
  }
});

router.post('/check-reset-token', async (req, res, next) => {
  try {
    const { token } = req.body;
    if (!token) throw new AppError('Token is required', 400);

    const user = await User.findOne({
      'passwordReset.resetToken': token,
      'passwordReset.resetTokenExpiresAt': { $gt: new Date() },
      'passwordReset.codeVerified': true
    }).select('+passwordReset.resetToken +passwordReset.resetTokenExpiresAt +passwordReset.codeVerified');

    if (!user) {
      throw new AppError('Invalid or expired reset token', 400);
    }

    res.json({ success: true, message: 'Reset token is valid' });
  } catch (error) {
    next(error);
  }
});

router.post('/reset-password', async (req, res, next) => {
  try {
    const { token, password, confirmPassword } = req.body;
    if (!token || !password || !confirmPassword) {
      throw new AppError('Token, password, and confirm password are required', 400);
    }
    if (password !== confirmPassword) {
      throw new AppError('Password and confirm password do not match', 400);
    }
    if (password.length < 8) {
      throw new AppError('Password must be at least 8 characters long', 400);
    }

    const user = await User.findOne({
      'passwordReset.resetToken': token,
      'passwordReset.resetTokenExpiresAt': { $gt: new Date() },
      'passwordReset.codeVerified': true
    }).select('+password +passwordReset.resetToken +passwordReset.resetTokenExpiresAt +passwordReset.codeVerified');

    if (!user) {
      throw new AppError('Invalid or expired reset request', 400);
    }

    user.password = password;
    user.passwordReset = {};
    user.forgotPasswordToken = undefined;
    user.forgotPasswordExpiresAt = undefined;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpiresAt = undefined;
    user.refreshTokens = [];
    await user.save();

    logger.info(`Password reset completed for ${user.email}`);
    res.json({ success: true, message: 'Password reset successfully' });
  } catch (error) {
    next(error);
  }
});

router.get('/me', authenticate, async (req, res) => {
  const roleObj = req.user.role;
  const modules = await moduleFlags();
  res.json({
    success: true,
    message: 'Current user loaded',
    data: {
      id: req.user.id,
      uuid: req.user.uuid,
      email: req.user.email,
      firstName: req.user.firstName,
      lastName: req.user.lastName,
      fullName: req.user.fullName,
      phone: req.user.phone,
      avatar: getPublicFileUrl(req.user.avatar),
      role: roleObj ? rolePayload(roleObj) : req.user.role_name,
      customPermissions: req.user.customPermissions || [],
      permissions: req.user.pagePermissions,
      // Only the pages whose columns are restricted appear here; an absent page
      // means "show everything".
      fieldPermissions: fieldPermissionsForUser(req.user),
      logPermissionSource: req.user.logPermissionSource || 'role',
      logsPermissions: req.user.logsPermissions || [],
      logPermissionMode: req.user.effectiveLogPermission?.source || 'role',
      lastLogin: req.user.lastLogin,
      pageCatalog: catalogForClient(),
      modules,
    }
  });
});

router.post('/logout', authenticate, async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const currentToken = getCookieValue(req, 'token') || authHeader?.split(' ')[1];

    const user = await User.findById(req.user.id);

    if (user) {
      if (currentToken) {
        user.refreshTokens = user.refreshTokens.filter(
          rt => rt.token !== currentToken
        );
      } else {
        user.refreshTokens = [];
      }
      await user.save();
    }

    logger.info(`User logged out: ${req.user.email}`);
    res.clearCookie('token', {
      httpOnly: process.env.NODE_ENV === 'production',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
    });
    res.json({ success: true, message: 'Logout successful' });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
