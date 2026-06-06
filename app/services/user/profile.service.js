import bcrypt from 'bcryptjs';
import { executeQuery } from '../../config/dbConfig.js';
import { normalizePhone } from '../auth/auth.service.js';

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
