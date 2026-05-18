import { executeQuery } from '../../utils/db.js';

/**
 * Update Profile Service
 */
export const updateProfileService = async (userId, profileData) => {
    const { name, email, dob, profile_image } = profileData;

    // Check if user exists (should exist if logged in, but being safe)
    const users = await executeQuery('SELECT id FROM user_master WHERE id = ?', [userId]);
    
    if (users.length === 0) {
        return {
            success: false,
            statusCode: 404,
            message: 'User not found'
        };
    }

    // Update user details
    // We use COALESCE to keep existing values if new ones are null/undefined
    const updateQuery = `
        UPDATE user_master 
        SET 
            name = COALESCE(?, name),
            email = COALESCE(?, email),
            dob = COALESCE(?, dob),
            profile_image = COALESCE(?, profile_image)
        WHERE id = ?
    `;

    await executeQuery(updateQuery, [name, email, dob, profile_image, userId]);

    // Fetch updated user
    const updatedUsers = await executeQuery('SELECT id, name, email, phone, dob, profile_image, role FROM user_master WHERE id = ?', [userId]);

    return {
        success: true,
        statusCode: 200,
        message: 'Profile updated successfully',
        data: updatedUsers[0]
    };
};
