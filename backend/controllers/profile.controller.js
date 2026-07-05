/**
 * Profile Management Controller
 * Created by LOGIXINVENTOR (PVT) Ltd.
 * info@logixinventor.com +92 333 3836851
 * www.logixinventor.com | AMS
 */

const { query } = require('../config/database');
const { AppError } = require('../middleware/errorHandler');
const logger = require('../utils/logger');
const { normalizePhone } = require('../utils/phone.util');

/**
 * Get current user profile
 * @route GET /api/profile
 */
const getProfile = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const results = await query('CALL sp_get_user_profile(?)', [userId]);

        if (results[0].length === 0) {
            throw new AppError('Profile not found', 404);
        }

        res.json({
            success: true,
            data: results[0][0]
        });
    } catch (error) {
        logger.error('Error fetching profile:', error);
        next(error);
    }
};

/**
 * Update current user profile
 * @route PUT /api/profile
 */
const updateProfile = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const {
            bio, address, city, country, postal_code,
            date_of_birth, gender, emergency_contact_name,
            emergency_contact_phone, emergency_contact_relation, social_links
        } = req.body;
        const normalizedEmergencyPhone = emergency_contact_phone ? normalizePhone(emergency_contact_phone) : null;

        await query('CALL sp_upsert_user_profile(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [
            userId,
            bio || null,
            address || null,
            city || null,
            country || 'Pakistan',
            postal_code || null,
            date_of_birth || null,
            gender || null,
            emergency_contact_name || null,
            normalizedEmergencyPhone,
            emergency_contact_relation || null,
            social_links ? JSON.stringify(social_links) : null
        ]);

        await logActivity(userId, 'update', 'profile', userId, 'Updated personal profile', req);

        res.json({
            success: true,
            message: 'Profile updated successfully'
        });
    } catch (error) {
        logger.error('Error updating profile:', error);
        next(error);
    }
};

/**
 * Helper function to log user activity
 * Note: user_activity_logs schema uses action/entity_type/entity_id/details
 * instead of action_type/record_id/description/request_url.
 */
const logActivity = async (userId, actionType, module, recordId, description, req) => {
    try {
        const detailsJson = JSON.stringify({
            description: description || null,
            request_url: req ? req.originalUrl || null : null
        });
        await query(`
            INSERT INTO user_activity_logs (
                user_id, action, module, entity_type, entity_id, details,
                ip_address, user_agent
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            userId,
            actionType,
            module,
            module || 'system',
            recordId,
            detailsJson,
            req ? (req.ip || req.connection.remoteAddress) : null,
            req ? req.get('User-Agent') : null
        ]);
    } catch (error) {
        logger.error('Error logging activity:', error);
    }
};

module.exports = {
    getProfile,
    updateProfile
};
