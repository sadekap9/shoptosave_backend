import pool from '../../config/dbConfig.js';
import { sanitizePaginationParams, buildPagination } from '../../helpers/pagination.helper.js';

/**
 * Fetch all banners
 */
export const getBannersService = async (userRole = null, page, limit) => {
    try {
        let countQuery = 'SELECT COUNT(*) AS total FROM banners';
        let query = 'SELECT * FROM banners';
        let whereClause = '';
        if (userRole === 3) {
            whereClause = ' WHERE status = 1 AND (start_date IS NULL OR start_date <= NOW()) AND (end_date IS NULL OR end_date >= NOW())';
        }
        
        countQuery += whereClause;
        query += whereClause;
        query += ' ORDER BY display_order ASC, id DESC LIMIT ? OFFSET ?';

        const [[{ total }]] = await pool.query(countQuery);
        const sanitized = sanitizePaginationParams(page, limit);

        const [rows] = await pool.query(query, [sanitized.limit, sanitized.offset]);
        return {
            success: true,
            statusCode: 200,
            message: 'Banners fetched successfully',
            data: rows,
            pagination: buildPagination(total, sanitized.page, sanitized.limit)
        };
    } catch (error) {
        throw error;
    }
};

/**
 * Fetch single banner or list of banners by ID(s)
 */
export const getBannerByIdService = async (idStr, userRole = null) => {
    try {
        const ids = idStr.split(',').map(item => parseInt(item.trim())).filter(num => !isNaN(num));
        if (ids.length === 0) {
            return {
                success: false,
                statusCode: 400,
                message: 'Invalid banner ID(s)'
            };
        }

        const isMultiple = idStr.includes(',') || ids.length > 1;

        let query = 'SELECT * FROM banners WHERE id IN (?)';
        const params = [ids];

        // Public or role 3 (Customer) should only see active and scheduled banners
        if (userRole === null || userRole === 3) {
            query += ' AND status = 1 AND (start_date IS NULL OR start_date <= NOW()) AND (end_date IS NULL OR end_date >= NOW())';
        }

        query += ' ORDER BY display_order ASC, id DESC';

        const [rows] = await pool.query(query, params);

        if (isMultiple) {
            return {
                success: true,
                statusCode: 200,
                message: 'Banners fetched successfully',
                data: rows
            };
        } else {
            if (rows.length === 0) {
                return {
                    success: false,
                    statusCode: 404,
                    message: 'Banner not found'
                };
            }
            return {
                success: true,
                statusCode: 200,
                message: 'Banner fetched successfully',
                data: rows[0]
            };
        }
    } catch (error) {
        throw error;
    }
};

/**
 * Create a new banner
 */
export const createBannerService = async (data) => {
    const {
        banner_name, title, highlighted_text, subtitle, offer_text,
        banner_image, background_color, primary_button_text, primary_button_link,
        secondary_button_text, secondary_button_link, banner_type, redirect_type,
        redirect_value, display_order, start_date, end_date, status
    } = data;

    // Only check for duplicate banner name if one is provided
    if (banner_name && banner_name.trim()) {
        const [[existingBanner]] = await pool.query(
            'SELECT id FROM banners WHERE LOWER(banner_name) = ?',
            [banner_name.trim().toLowerCase()]
        );
        if (existingBanner) {
            return {
                success: false,
                statusCode: 400,
                message: 'Banner name already exists'
            };
        }
    }

    try {
        const [result] = await pool.query(
            `INSERT INTO banners 
            (banner_name, title, highlighted_text, subtitle, offer_text, 
             banner_image, background_color, primary_button_text, primary_button_link,
             secondary_button_text, secondary_button_link, banner_type, redirect_type,
             redirect_value, display_order, start_date, end_date, status) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                banner_name ? banner_name.trim() : null,
                title ? title.trim() : null,
                highlighted_text || null,
                subtitle || null,
                offer_text || null,
                banner_image || null,
                background_color || '#F5F3FF',
                primary_button_text || null,
                primary_button_link || null,
                secondary_button_text || null,
                secondary_button_link || null,
                banner_type !== undefined ? banner_type : null,
                redirect_type !== undefined ? redirect_type : null,
                redirect_value || null,
                display_order !== undefined ? display_order : 0,
                start_date || null,
                end_date || null,
                status !== undefined ? status : 1
            ]
        );

        // Fetch the newly created banner
        const [[newBanner]] = await pool.query('SELECT * FROM banners WHERE id = ?', [result.insertId]);

        return {
            success: true,
            statusCode: 200,
            message: 'Banner created successfully',
            data: newBanner
        };
    } catch (error) {
        throw error;
    }
};

/**
 * Update an existing banner
 */
export const updateBannerService = async (id, body) => {
    const { ...updateFields } = body;

    // Check if banner exists
    const [[banner]] = await pool.query('SELECT id FROM banners WHERE id = ?', [id]);
    if (!banner) {
        return {
            success: false,
            statusCode: 404,
            message: 'Banner not found'
        };
    }

    // Define allowed fields
    const allowedFields = [
        'banner_name', 'title', 'highlighted_text', 'subtitle', 'offer_text',
        'banner_image', 'background_color', 'primary_button_text', 'primary_button_link',
        'secondary_button_text', 'secondary_button_link', 'banner_type', 'redirect_type',
        'redirect_value', 'display_order', 'start_date', 'end_date', 'status'
    ];

    // Filter keys
    const keys = Object.keys(updateFields).filter(
        key => allowedFields.includes(key) && updateFields[key] !== undefined
    );

    if (keys.length === 0) {
        return { success: false, statusCode: 400, message: 'No valid fields provided to update.' };
    }

    // Check banner_name uniqueness if updated
    if (keys.includes('banner_name')) {
        const nameToValidate = updateFields.banner_name.trim();
        const [[existingBanner]] = await pool.query(
            'SELECT id FROM banners WHERE LOWER(banner_name) = ? AND id != ?',
            [nameToValidate.toLowerCase(), id]
        );
        if (existingBanner) {
            return {
                success: false,
                statusCode: 400,
                message: 'Banner name already exists'
            };
        }
        updateFields.banner_name = nameToValidate;
    }

    // Trim string fields
    const stringFields = [
        'title', 'highlighted_text', 'subtitle', 'offer_text',
        'banner_image', 'background_color', 'primary_button_text', 'primary_button_link',
        'secondary_button_text', 'secondary_button_link', 'redirect_value'
    ];
    for (const key of keys) {
        if (stringFields.includes(key) && typeof updateFields[key] === 'string') {
            updateFields[key] = updateFields[key].trim();
        }
    }

    // Dynamically construct SET clause
    const setClause = keys.map(field => `${field} = ?`).join(', ');
    const values = keys.map(field => updateFields[field]);
    const updateQuery = `UPDATE banners SET ${setClause} WHERE id = ?`;
    values.push(id);

    await pool.query(updateQuery, values);

    // Fetch updated banner
    const [[updatedBanner]] = await pool.query('SELECT * FROM banners WHERE id = ?', [id]);

    return {
        success: true,
        statusCode: 200,
        message: 'Banner updated successfully',
        data: updatedBanner
    };
};

/**
 * Delete a banner
 */
export const deleteBannerService = async (id) => {
    // Check if banner exists
    const [[banner]] = await pool.query('SELECT id FROM banners WHERE id = ?', [id]);
    if (!banner) {
        return {
            success: false,
            statusCode: 404,
            message: 'Banner not found'
        };
    }

    await pool.query('DELETE FROM banners WHERE id = ?', [id]);

    return {
        success: true,
        statusCode: 200,
        message: 'Banner deleted successfully',
        data: { id: parseInt(id) }
    };
};

