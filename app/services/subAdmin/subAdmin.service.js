import bcrypt from 'bcryptjs';
import { executeQuery } from '../../config/dbConfig.js';
import { normalizePhone } from '../auth/auth.service.js';
import logger from '../../utils/logger.js';
import { sanitizePaginationParams, buildPagination } from '../../helpers/pagination.helper.js';

/**
 * Add Sub-Admin Service
 */
export const addSubAdminService = async (data) => {
    const { name, email, password, phone, menu_access } = data;

    if (!email || !password) {
        return {
            success: false,
            statusCode: 400,
            message: 'Email and password are required'
        };
    }

    const normalizedEmail = email.toLowerCase().trim();

    try {
        // Check if email already exists
        const emailCheck = await executeQuery('SELECT id FROM user_master WHERE email = ?', [normalizedEmail]);
        if (emailCheck.length > 0) {
            return {
                success: false,
                statusCode: 400,
                message: 'Email address already in use'
            };
        }

        // Check if phone already exists (if provided)
        let normalizedPhone = null;
        if (phone) {
            normalizedPhone = normalizePhone(phone);
            const phoneCheck = await executeQuery('SELECT id FROM user_master WHERE phone = ?', [normalizedPhone]);
            if (phoneCheck.length > 0) {
                return {
                    success: false,
                    statusCode: 400,
                    message: 'Phone number already in use'
                };
            }
        }

        // Hash the password
        const hashedPassword = await bcrypt.hash(password, 10);
        const menuAccessJSON = menu_access ? JSON.stringify(menu_access) : null;

        // Insert user with role SUB_ADMIN (2)
        const insertQuery = `
            INSERT INTO user_master (name, email, phone, password, role, is_active, menu_access)
            VALUES (?, ?, ?, ?, 2, 1, ?)
        `;
        const result = await executeQuery(insertQuery, [
            name || null,
            normalizedEmail,
            normalizedPhone,
            hashedPassword,
            menuAccessJSON
        ]);

        const newSubAdminId = result.insertId;

        return {
            success: true,
            statusCode: 200,
            message: 'Sub-admin created successfully',
            data: {
                id: newSubAdminId
            }
        };
    } catch (error) {
        logger.error('AddSubAdmin Service Error', { error: error.message });
        return {
            success: false,
            statusCode: 500,
            message: 'Error during sub-admin account creation'
        };
    }
};

/**
 * Update Sub-Admin Service
 */
export const updateSubAdminService = async (id, data) => {
    try {
        // Check if sub-admin exists
        const users = await executeQuery('SELECT id, role FROM user_master WHERE id = ?', [id]);
        if (users.length === 0) {
            return {
                success: false,
                statusCode: 404,
                message: 'Sub-admin not found'
            };
        }

        const user = users[0];
        if (user.role !== 2) {
            return {
                success: false,
                statusCode: 400,
                message: 'Specified user is not a sub-admin'
            };
        }

        const { name, email, password, phone, is_active, menu_access } = data;
        const updateFields = [];
        const updateParams = [];

        // Build update fields dynamically
        if (name !== undefined) {
            updateFields.push('name = ?');
            updateParams.push(name || null);
        }

        if (email !== undefined) {
            const normalizedEmail = email.toLowerCase().trim();
            // Check email uniqueness
            const emailCheck = await executeQuery('SELECT id FROM user_master WHERE email = ? AND id != ?', [normalizedEmail, id]);
            if (emailCheck.length > 0) {
                return {
                    success: false,
                    statusCode: 400,
                    message: 'Email address already in use'
                };
            }
            updateFields.push('email = ?');
            updateParams.push(normalizedEmail);
        }

        if (phone !== undefined) {
            let normalizedPhone = null;
            if (phone) {
                normalizedPhone = normalizePhone(phone);
                // Check phone uniqueness
                const phoneCheck = await executeQuery('SELECT id FROM user_master WHERE phone = ? AND id != ?', [normalizedPhone, id]);
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

        if (is_active !== undefined) {
            updateFields.push('is_active = ?');
            updateParams.push(is_active);
        }

        if (menu_access !== undefined) {
            updateFields.push('menu_access = ?');
            updateParams.push(menu_access ? JSON.stringify(menu_access) : null);
        }

        if (updateFields.length === 0) {
            return {
                success: false,
                statusCode: 400,
                message: 'No fields to update'
            };
        }

        // Append id to params for WHERE clause
        updateParams.push(id);

        const updateQuery = `
            UPDATE user_master
            SET ${updateFields.join(', ')}
            WHERE id = ?
        `;

        await executeQuery(updateQuery, updateParams);

        // Fetch updated user
        const updatedUsers = await executeQuery(
            'SELECT id, name, email, phone, role, menu_access, is_active FROM user_master WHERE id = ?',
            [id]
        );

        const updatedUser = updatedUsers[0];
        let parsedMenuAccess = [];
        try {
            if (updatedUser.menu_access) {
                parsedMenuAccess = typeof updatedUser.menu_access === 'string'
                    ? JSON.parse(updatedUser.menu_access)
                    : updatedUser.menu_access;
            }
        } catch (e) {
            parsedMenuAccess = [];
        }

        return {
            success: true,
            statusCode: 200,
            message: 'Sub-admin updated successfully',
            data: {
                ...updatedUser,
                menu_access: parsedMenuAccess
            }
        };

    } catch (error) {
        logger.error('UpdateSubAdmin Service Error', { error: error.message });
        return {
            success: false,
            statusCode: 500,
            message: 'Error updating sub-admin credentials'
        };
    }
};

/**
 * Delete Sub-Admin Service
 */
export const deleteSubAdminService = async (id) => {
    try {
        // Check if sub-admin exists
        const users = await executeQuery('SELECT id, role FROM user_master WHERE id = ?', [id]);
        if (users.length === 0) {
            return {
                success: false,
                statusCode: 404,
                message: 'Sub-admin not found'
            };
        }

        const user = users[0];
        if (user.role !== 2) {
            return {
                success: false,
                statusCode: 400,
                message: 'Specified user is not a sub-admin'
            };
        }

        // Delete sub-admin (sessions are cascade deleted due to FK constraint)
        await executeQuery('DELETE FROM user_master WHERE id = ?', [id]);

        return {
            success: true,
            statusCode: 200,
            message: 'Sub-admin deleted successfully'
        };
    } catch (error) {
        logger.error('DeleteSubAdmin Service Error', { error: error.message });
        return {
            success: false,
            statusCode: 500,
            message: 'Error deleting sub-admin'
        };
    }
};

/**
 * List Sub-Admins Service
 */
export const listSubAdminsService = async (page, limit) => {
    try {
        const countResult = await executeQuery('SELECT COUNT(*) AS total FROM user_master WHERE role = 2');
        const total = countResult[0]?.total || 0;
        
        const sanitized = sanitizePaginationParams(page, limit);

        const subAdmins = await executeQuery(
            'SELECT id, name, email, phone, role, menu_access, is_active, createdAt, modifiedAt FROM user_master WHERE role = 2 ORDER BY id DESC LIMIT ? OFFSET ?',
            [sanitized.limit, sanitized.offset]
        );

        const mappedSubAdmins = subAdmins.map(sub => {
            let parsedMenuAccess = [];
            try {
                if (sub.menu_access) {
                    parsedMenuAccess = typeof sub.menu_access === 'string'
                        ? JSON.parse(sub.menu_access)
                        : sub.menu_access;
                }
            } catch (e) {
                parsedMenuAccess = [];
            }
            return {
                ...sub,
                menu_access: parsedMenuAccess
            };
        });

        return {
            success: true,
            statusCode: 200,
            message: 'Sub-admins retrieved successfully',
            data: mappedSubAdmins,
            pagination: buildPagination(total, sanitized.page, sanitized.limit)
        };
    } catch (error) {
        logger.error('ListSubAdmins Service Error', { error: error.message });
        return {
            success: false,
            statusCode: 500,
            message: 'Error listing sub-admins'
        };
    }
};
