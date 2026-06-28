import bcrypt from 'bcryptjs';
import { executeQuery } from '../../config/dbConfig.js';
import { normalizePhone } from '../auth/auth.service.js';
import { sanitizePaginationParams, buildPagination } from '../../helpers/pagination.helper.js';

/**
 * Update Profile Service
 */
export const updateProfileService = async (userId, profileData) => {
    const { name, email, dob, profile_image, phone, password } = profileData;

    // Check if user exists (should exist if logged in, but being safe)
    const users = await executeQuery('SELECT id, email, phone FROM user_master WHERE id = ?', [userId]);
    
    if (users.length === 0) {
        return {
            success: false,
            statusCode: 404,
            message: 'User not found'
        };
    }

    const updateFields = [];
    const updateParams = [];

    // Dynamically build update fields
    if (name !== undefined) {
        updateFields.push('name = ?');
        updateParams.push(name || null);
    }

    if (email !== undefined) {
        const normalizedEmail = email ? email.toLowerCase().trim() : null;
        if (normalizedEmail) {
            // Check uniqueness
            const emailCheck = await executeQuery('SELECT id FROM user_master WHERE email = ? AND id != ?', [normalizedEmail, userId]);
            if (emailCheck.length > 0) {
                return {
                    success: false,
                    statusCode: 400,
                    message: 'Email address already in use'
                };
            }
        }
        updateFields.push('email = ?');
        updateParams.push(normalizedEmail);
    }

    if (phone !== undefined) {
        let normalizedPhone = null;
        if (phone) {
            normalizedPhone = normalizePhone(phone);
            // Check uniqueness
            const phoneCheck = await executeQuery('SELECT id FROM user_master WHERE phone = ? AND id != ?', [normalizedPhone, userId]);
            if (phoneCheck.length > 0) {
                return {
                    success: false,
                    statusCode: 400,
                    message: 'Phone number already in use'
                };
            }
        }
        updateFields.push('phone = ?');
        updateParams.push(normalizedPhone);
    }

    if (password !== undefined) {
        if (!password) {
            return {
                success: false,
                statusCode: 400,
                message: 'Password cannot be empty'
            };
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        updateFields.push('password = ?');
        updateParams.push(hashedPassword);
    }

    if (dob !== undefined) {
        updateFields.push('dob = ?');
        updateParams.push(dob || null);
    }

    if (profile_image !== undefined) {
        updateFields.push('profile_image = ?');
        updateParams.push(profile_image || null);
    }

    if (updateFields.length === 0) {
        return {
            success: false,
            statusCode: 400,
            message: 'No fields to update'
        };
    }

    // Append userId for the WHERE clause
    updateParams.push(userId);

    const updateQuery = `
        UPDATE user_master 
        SET ${updateFields.join(', ')}
        WHERE id = ?
    `;

    await executeQuery(updateQuery, updateParams);

    // Fetch updated user details
    const updatedUsers = await executeQuery(
        'SELECT id, name, email, phone, dob, profile_image, role FROM user_master WHERE id = ?', 
        [userId]
    );

    return {
        success: true,
        statusCode: 200,
        message: 'Profile updated successfully',
        data: updatedUsers[0]
    };
};

export const listUsersService = async (page, limit) => {
    try {
        const countResult = await executeQuery('SELECT COUNT(*) AS total FROM user_master WHERE role = 3');
        const total = countResult[0]?.total || 0;

        const sanitized = sanitizePaginationParams(page, limit);

        const users = await executeQuery(
            'SELECT id, name, email, phone, dob, profile_image, is_active, createdAt, modifiedAt FROM user_master WHERE role = 3 ORDER BY id DESC LIMIT ? OFFSET ?',
            [sanitized.limit, sanitized.offset]
        );

        return {
            success: true,
            statusCode: 200,
            message: 'Users retrieved successfully',
            data: users,
            pagination: buildPagination(total, sanitized.page, sanitized.limit)
        };
    } catch (error) {
        return {
            success: false,
            statusCode: 500,
            message: 'Error listing users'
        };
    }
};

/**
 * Get User By ID Service (returns customer details, role = 3)
 */
export const getUserByIdService = async (userId) => {
    try {
        const users = await executeQuery(
            'SELECT id, name, email, phone, dob, profile_image, is_active, createdAt, modifiedAt FROM user_master WHERE id = ? AND role = 3',
            [userId]
        );

        if (users.length === 0) {
            return {
                success: false,
                statusCode: 404,
                message: 'User not found'
            };
        }

        return {
            success: true,
            statusCode: 200,
            message: 'User retrieved successfully',
            data: users[0]
        };
    } catch (error) {
        return {
            success: false,
            statusCode: 500,
            message: 'Error retrieving user'
        };
    }
};

/**
 * Delete Profile Service
 */
export const deleteProfileService = async (userId) => {
    try {
        // Check if user exists
        const users = await executeQuery('SELECT id FROM user_master WHERE id = ?', [userId]);
        if (users.length === 0) {
            return {
                success: false,
                statusCode: 404,
                message: 'User not found'
            };
        }

        // Delete user (associated sessions are cascade deleted via foreign key constraint)
        await executeQuery('DELETE FROM user_master WHERE id = ?', [userId]);

        return {
            success: true,
            statusCode: 200,
            message: 'User profile deleted successfully'
        };
    } catch (error) {
        return {
            success: false,
            statusCode: 500,
            message: 'Error deleting user profile'
        };
    }
};

/**
 * Update User Status Service (Admin/Sub-Admin operation)
 */
export const updateUserStatusService = async (targetUserId, isActiveVal) => {
    try {
        const isActive = (isActiveVal === true || isActiveVal === 'true' || isActiveVal === 1 || isActiveVal === '1') ? 1 : 0;

        // Check if user exists
        const users = await executeQuery('SELECT id FROM user_master WHERE id = ?', [targetUserId]);
        if (users.length === 0) {
            return {
                success: false,
                statusCode: 404,
                message: 'User not found'
            };
        }

        // Update status
        await executeQuery('UPDATE user_master SET is_active = ? WHERE id = ?', [isActive, targetUserId]);

        // If inactive, revoke all active sessions for the user to force log them out
        if (isActive === 0) {
            await executeQuery('UPDATE session_master SET is_revoked = 1 WHERE user_id = ?', [targetUserId]);
        }

        return {
            success: true,
            statusCode: 200,
            message: `User status updated successfully to ${isActive === 1 ? 'Active' : 'Inactive'}`,
            data: {
                id: parseInt(targetUserId),
                is_active: isActive
            }
        };
    } catch (error) {
        return {
            success: false,
            statusCode: 500,
            message: 'Error updating user status'
        };
    }
};
