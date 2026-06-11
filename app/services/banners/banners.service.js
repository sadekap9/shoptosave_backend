import pool from '../../config/dbConfig.js';

/**
 * Fetch all banners
 */
export const getBannersService = async () => {
    try {
        const [rows] = await pool.query(
            'SELECT * FROM banners ORDER BY display_order ASC, id DESC'
        );
        return {
            success: true,
            statusCode: 200,
            message: 'Banners fetched successfully',
            data: rows
        };
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

    try {
        const [result] = await pool.query(
            `INSERT INTO banners 
            (banner_name, title, highlighted_text, subtitle, offer_text, 
             banner_image, background_color, primary_button_text, primary_button_link,
             secondary_button_text, secondary_button_link, banner_type, redirect_type,
             redirect_value, display_order, start_date, end_date, status) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                banner_name.trim(),
                title.trim(),
                highlighted_text || null,
                subtitle || null,
                offer_text || null,
                banner_image || null,
                background_color || '#F5F3FF',
                primary_button_text || null,
                primary_button_link || null,
                secondary_button_text || null,
                secondary_button_link || null,
                banner_type,
                redirect_type,
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

    // Trim string fields
    const stringFields = [
        'banner_name', 'title', 'highlighted_text', 'subtitle', 'offer_text',
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
