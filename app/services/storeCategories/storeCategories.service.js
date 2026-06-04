import pool from '../../config/dbConfig.js';

/**
 * Fetch all store categories (active & inactive) - for Admin
 */
export const getAdminStoreCategoriesService = async () => {
    const [rows] = await pool.query(
        'SELECT id, category_name, logo, status, created_at, updated_at FROM categories ORDER BY id ASC'
    );
    return {
        success: true,
        statusCode: 200,
        message: 'Admin store categories fetched successfully',
        data: rows
    };
};



/**
 * Create a new store category
 */
export const createStoreCategoryService = async (data) => {
    const { category_name, logo, status } = data;
    const categoryStatus = status !== undefined ? parseInt(status) : 1;

    // Check if category name already exists
    const [[existingCategory]] = await pool.query(
        'SELECT id FROM categories WHERE LOWER(category_name) = ?',
        [category_name.trim().toLowerCase()]
    );
    if (existingCategory) {
        return {
            success: false,
            statusCode: 400,
            message: 'Category name already exists'
        };
    }

    try {
        const [result] = await pool.query(
            'INSERT INTO categories (category_name, logo, status) VALUES (?, ?, ?)',
            [category_name.trim(), logo ? logo.trim() : null, categoryStatus]
        );

        const newId = result.insertId;

        return {
            success: true,
            statusCode: 200,
            message: 'Category created successfully',
            data: {
                id: newId
            }
        };
    } catch (error) {
        throw error;
    }
};

/**
 * Update an existing store category
 */
export const updateStoreCategoryService = async (id, body) => {
    const { ...updateFields } = body;

    // Step 1: Define which fields are allowed to be updated (Security Whitelist)
    const allowedFields = ['category_name', 'logo', 'status'];

    // Step 2: Filter input to keep only allowed fields that are not undefined
    const keys = Object.keys(updateFields).filter(
        key => allowedFields.includes(key) && updateFields[key] !== undefined
    );

    // Step 3: Guard clause if no valid fields are provided
    if (keys.length === 0) {
        return { success: false, statusCode: 400, message: "No valid fields provided to update." };
    }

    // Step 4: Handle specific validations (e.g. duplicate category name)
    if (keys.includes('category_name')) {
        const nameToValidate = updateFields.category_name.trim();
        // Check if category name already exists for another category
        const [[existingCategory]] = await pool.query(
            'SELECT id FROM categories WHERE LOWER(category_name) = ? AND id != ?',
            [nameToValidate.toLowerCase(), id]
        );
        if (existingCategory) {
            return {
                success: false,
                statusCode: 400,
                message: 'Category name already exists'
            };
        }
        updateFields.category_name = nameToValidate;
    }

    if (keys.includes('logo') && updateFields.logo) {
        updateFields.logo = updateFields.logo.trim();
    }

    if (keys.includes('status')) {
        updateFields.status = parseInt(updateFields.status);
    }

    // Step 5: Dynamically construct the SET clause for SQL
    const setClause = keys.map(field => `${field} = ?`).join(', ');
    
    // Step 6: Extract the matching values in the exact same order
    const values = keys.map(field => updateFields[field]);

    // Step 7: Create the full SQL query and push the 'id' parameter for the WHERE clause
    const updateQuery = `UPDATE categories SET ${setClause} WHERE id = ?`;
    values.push(id);

    // Step 8: Run the query
    const [result] = await pool.query(updateQuery, values);

    if (result.affectedRows === 0) {
        return { success: false, statusCode: 404, message: "Category not found or no changes made." };
    }

    return {
        success: true,
        statusCode: 200,
        message: "Category updated successfully",
        data: { id: parseInt(id), ...updateFields }
    };
};

/**
 * Delete a store category
 */
export const deleteStoreCategoryService = async (id) => {
    // Check if category exists
    const [[category]] = await pool.query('SELECT id FROM categories WHERE id = ?', [id]);
    if (!category) {
        return {
            success: false,
            statusCode: 404,
            message: 'Category not found'
        };
    }

    await pool.query('DELETE FROM categories WHERE id = ?', [id]);

    return {
        success: true,
        statusCode: 200,
        message: 'Category deleted successfully',
        data: { id: parseInt(id) }
    };
};
