import pool from '../../config/dbConfig.js';
import { sanitizePaginationParams, buildPagination } from '../../helpers/pagination.helper.js';

/**
 * Fetch all stores (with optional category information)
 */
export const getStoresService = async (page, limit) => {
    try {
        const sanitized = sanitizePaginationParams(page, limit);
        const [totalResult, rowsResult] = await Promise.all([
            pool.query('SELECT COUNT(*) AS total FROM stores'),
            pool.query(`
                SELECT s.id, s.store_name, s.logo, s.status, s.created_at, s.updated_at,
                       COALESCE(gc.voucher_count, 0) AS voucher_count
                FROM stores s 
                LEFT JOIN (
                    SELECT store_id, COUNT(*) AS voucher_count 
                    FROM gift_cards 
                    GROUP BY store_id
                ) gc ON s.id = gc.store_id
                ORDER BY s.id ASC
                LIMIT ? OFFSET ?
            `, [sanitized.limit, sanitized.offset])
        ]);
        const [[{ total }]] = totalResult;
        const [rows] = rowsResult;

        return {
            success: true,
            statusCode: 200,
            message: 'Stores fetched successfully',
            data: rows,
            pagination: buildPagination(total, sanitized.page, sanitized.limit)
        };
    } catch (error) {
        throw error;
    }
};

/**
 * Create a new store
 */
export const createStoreService = async (data) => {
    const { store_name, logo, status } = data;
    const storeStatus = status !== undefined ? parseInt(status) : 1;

    // Check if store name already exists (case-insensitive duplicate check)
    const [[existingStore]] = await pool.query(
        'SELECT id FROM stores WHERE LOWER(store_name) = ?',
        [store_name.trim().toLowerCase()]
    );
    if (existingStore) {
        return {
            success: false,
            statusCode: 400,
            message: 'Store name already exists'
        };
    }

    try {
        const [result] = await pool.query(
            'INSERT INTO stores (store_name, logo, status) VALUES (?, ?, ?)',
            [
                store_name.trim(), 
                logo ? logo.trim() : null, 
                storeStatus
            ]
        );

        return {
            success: true,
            statusCode: 200,
            message: 'Store created successfully',
            data: {
                id: result.insertId
            }
        };
    } catch (error) {
        throw error;
    }
};

/**
 * Update an existing store
 */
export const updateStoreService = async (id, body) => {
    const { ...updateFields } = body;

    // Step 1: Check if store exists
    const [[store]] = await pool.query('SELECT id FROM stores WHERE id = ?', [id]);
    if (!store) {
        return {
            success: false,
            statusCode: 404,
            message: 'Store not found'
        };
    }

    // Step 2: Define allowed fields
    const allowedFields = ['store_name', 'logo', 'status'];

    // Step 3: Filter keys
    const keys = Object.keys(updateFields).filter(
        key => allowedFields.includes(key) && updateFields[key] !== undefined
    );

    if (keys.length === 0) {
        return { success: false, statusCode: 400, message: "No valid fields provided to update." };
    }

    // Step 4: Handle validations
    if (keys.includes('store_name')) {
        const nameToValidate = updateFields.store_name.trim();
        const [[existingStore]] = await pool.query(
            'SELECT id FROM stores WHERE LOWER(store_name) = ? AND id != ?',
            [nameToValidate.toLowerCase(), id]
        );
        if (existingStore) {
            return {
                success: false,
                statusCode: 400,
                message: 'Store name already exists'
            };
        }
        updateFields.store_name = nameToValidate;
    }

    // category_id checks removed as store no longer holds category

    if (keys.includes('logo') && updateFields.logo) {
        updateFields.logo = updateFields.logo.trim();
    }

    if (keys.includes('status')) {
        updateFields.status = parseInt(updateFields.status);
    }

    // Step 5: Dynamically construct SET clause
    const setClause = keys.map(field => `${field} = ?`).join(', ');
    const values = keys.map(field => updateFields[field]);
    const updateQuery = `UPDATE stores SET ${setClause} WHERE id = ?`;
    values.push(id);

    // Step 6: Execute UPDATE
    await pool.query(updateQuery, values);

    return {
        success: true,
        statusCode: 200,
        message: "Store updated successfully",
        data: { id: parseInt(id), ...updateFields }
    };
};

/**
 * Delete a store
 */
export const deleteStoreService = async (id) => {
    // Check if store exists
    const [[store]] = await pool.query('SELECT id FROM stores WHERE id = ?', [id]);
    if (!store) {
        return {
            success: false,
            statusCode: 404,
            message: 'Store not found'
        };
    }

    await pool.query('DELETE FROM stores WHERE id = ?', [id]);

    return {
        success: true,
        statusCode: 200,
        message: 'Store deleted successfully',
        data: { id: parseInt(id) }
    };
};
