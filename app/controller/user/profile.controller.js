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

/**
 * List Users Controller
 */
export const listUsers = async (req, res) => {
    try {
        const response = await profileService.listUsersService();

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
        logger.error('ListUsers Error', { error: error.message, stack: error.stack });
        return res.status(500).json({
            success: false,
            errors: [{ message: 'Internal server error' }],
            result: {}
        });
    }
};

/**
 * Get User By ID Controller
 */
export const getUserById = async (req, res) => {
    try {
        const { id } = req.params;

        if (!id) {
            return res.status(400).json({
                success: false,
                errors: [{ message: 'User ID is required' }],
                result: {}
            });
        }

        const response = await profileService.getUserByIdService(id);

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
        logger.error('GetUserById Error', { error: error.message, stack: error.stack });
        return res.status(500).json({
            success: false,
            errors: [{ message: 'Internal server error' }],
            result: {}
        });
    }
};
