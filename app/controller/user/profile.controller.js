import * as profileService from '../../services/user/profile.service.js';
import logger from '../../utils/logger.js';

/**
 * Update Profile Controller
 */
export const updateProfile = async (req, res) => {
    try {
        const userId = req.user.id;
        const profileData = req.validatedData;

        const response = await profileService.updateProfileService(userId, profileData);

        if (!response.success) {
            return res.status(response.statusCode).json({
                success: false,
                errors: [{ message: response.message }],
                result: {}
            });
        }

        return res.status(response.statusCode).json({
            success: true,
            errors: [],
            result: {
                message: response.message,
                data: response.data
            }
        });

    } catch (error) {
        logger.error('UpdateProfile Error', { error: error.message, stack: error.stack });
        return res.status(500).json({
            success: false,
            errors: [{ message: 'Internal server error' }],
            result: {}
        });
    }
};
