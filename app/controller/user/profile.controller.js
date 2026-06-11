import * as profileService from '../../services/user/profile.service.js';
import logger from '../../utils/logger.js';

/**
 * Update Profile Controller
 */
export const updateProfile = async (req, res) => {
    try {
        const userId = req.user.id;
        const profileData = req.validatedData;

        if (req.file) {
            profileData.profile_image = `/uploads/${req.file.filename}`;
        }

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

        // BOLA Check: Customers (role 3) can only access their own user profile details
        if (req.user.role === 3 && req.user.id !== parseInt(id)) {
            return res.status(403).json({
                success: false,
                errors: [{ message: 'Forbidden' }],
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

/**
 * Delete Own Profile Controller
 */
export const deleteOwnProfile = async (req, res) => {
    try {
        const userId = req.user.id;
        const response = await profileService.deleteProfileService(userId);

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
                message: response.message
            }
        });
    } catch (error) {
        logger.error('DeleteOwnProfile Error', { error: error.message, stack: error.stack });
        return res.status(500).json({
            success: false,
            errors: [{ message: 'Internal server error' }],
            result: {}
        });
    }
};

/**
 * Delete User Profile By Admin Controller
 */
export const deleteUserByAdmin = async (req, res) => {
    try {
        const { id } = req.params;

        if (!id) {
            return res.status(400).json({
                success: false,
                errors: [{ message: 'User ID is required' }],
                result: {}
            });
        }

        const response = await profileService.deleteProfileService(id);

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
                message: response.message
            }
        });
    } catch (error) {
        logger.error('DeleteUserByAdmin Error', { error: error.message, stack: error.stack });
        return res.status(500).json({
            success: false,
            errors: [{ message: 'Internal server error' }],
            result: {}
        });
    }
};

/**
 * Update User Status Controller (Admin/Sub-Admin operation)
 */
export const updateUserStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { is_active } = req.body;

        if (!id) {
            return res.status(400).json({
                success: false,
                errors: [{ message: 'User ID is required' }],
                result: {}
            });
        }

        const response = await profileService.updateUserStatusService(id, is_active);

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
        logger.error('UpdateUserStatus Error', { error: error.message, stack: error.stack });
        return res.status(500).json({
            success: false,
            errors: [{ message: 'Internal server error' }],
            result: {}
        });
    }
};
