import pool from '../../config/dbConfig.js';
import { sanitizePaginationParams, buildPagination } from '../../helpers/pagination.helper.js';

/**
 * Fetch all store categories (active & inactive) - for Admin
 * Supports filtering by status and search keyword
 */
export const getAdminStoreCategoriesService = async (page, limit, filters = {}) => {
    try {
        const { status, search } = filters;
        const whereClauses = [];
        const queryParams = [];

        // Check and filter by status parameter safely
        if (status !== undefined && status !== null && status !== 'All' && String(status).trim() !== '') {
            whereClauses.push('status = ?');
            const isActive = status === 'Active' || String(status) === '1';
            queryParams.push(isActive ? 1 : 0);
        }

        // Check and search by keyword parameter, ignoring whitespace-only strings
        if (search && String(search).trim() !== '') {
            whereClauses.push('(category_name LIKE ? OR id LIKE ?)');
            const searchPattern = `%${String(search).trim()}%`;
            queryParams.push(searchPattern);
            queryParams.push(searchPattern);
        }

        const whereSql = whereClauses.length > 0 ? ` WHERE ${whereClauses.join(' AND ')}` : '';

        const sanitized = sanitizePaginationParams(page, limit);
        const selectParams = [...queryParams, sanitized.limit, sanitized.offset];
        
        // Execute count and list queries in parallel
        const [totalResult, rowsResult] = await Promise.all([
            pool.query(`SELECT COUNT(*) AS total FROM categories${whereSql}`, queryParams),
            pool.query(
                `SELECT id, category_name, logo, status, created_at, updated_at FROM categories${whereSql} ORDER BY id ASC LIMIT ? OFFSET ?`,
                selectParams
            )
        ]);
        const [[{ total }]] = totalResult;
        const [rows] = rowsResult;

        return {
            success: true,
            statusCode: 200,
            message: 'Admin store categories fetched successfully',
            data: rows,
            pagination: buildPagination(total, sanitized.page, sanitized.limit)
        };
    } catch (error) {
        throw error;
    }
};

/**
 * Fetch active store categories - Public
 */
export const getPublicStoreCategoriesService = async (page, limit) => {
    try {
        const sanitized = sanitizePaginationParams(page, limit);
        const [totalResult, rowsResult] = await Promise.all([
            pool.query('SELECT COUNT(*) AS total FROM categories WHERE status = 1'),
            pool.query(
                'SELECT id, category_name, logo, status FROM categories WHERE status = 1 ORDER BY id DESC LIMIT ? OFFSET ?',
                [sanitized.limit, sanitized.offset]
            )
        ]);
        const [[{ total }]] = totalResult;
        const [rows] = rowsResult;
        return {
            success: true,
            statusCode: 200,
            message: 'Store categories fetched successfully',
            data: rows,
            pagination: buildPagination(total, sanitized.page, sanitized.limit)
        };
    } catch (error) {
        throw error;
    }
};

/**
 * Create a new store category
 */
export const createStoreCategoryService = async (data) => {
    const { category_name, logo, status } = data;
    const categoryStatus = status !== undefined ? Number(status) : 1;
    const trimmedName = category_name?.trim() || '';

    // Check if category name already exists
    const [[existingCategory]] = await pool.query(
        'SELECT id FROM categories WHERE LOWER(category_name) = ?',
        [trimmedName.toLowerCase()]
    );
    if (existingCategory) {
        throw {
            statusCode: 400,
            message: 'Category name already exists'
        };
    }

    try {
        const trimmedLogo = logo?.trim() || null;
        const [result] = await pool.query(
            'INSERT INTO categories (category_name, logo, status) VALUES (?, ?, ?)',
            [trimmedName, trimmedLogo, categoryStatus]
        );

        return {
            success: true,
            statusCode: 200,
            message: 'Category created successfully',
            data: {
                id: result.insertId
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
    const allowedFields = ['category_name', 'logo', 'status'];

    // Map body attributes to separate sanitized storage to avoid parameter mutation
    const updateFields = {};
    for (const key of allowedFields) {
        if (body[key] !== undefined) {
            updateFields[key] = body[key];
        }
    }

    const keys = Object.keys(updateFields);

    if (keys.length === 0) {
        throw { 
            statusCode: 400, 
            message: "No valid fields provided to update." 
        };
    }

    // Specific key validation rules
    if (updateFields.category_name !== undefined) {
        const trimmedName = updateFields.category_name.trim();
        const [[existingCategory]] = await pool.query(
            'SELECT id FROM categories WHERE LOWER(category_name) = ? AND id != ?',
            [trimmedName.toLowerCase(), id]
        );
        if (existingCategory) {
            throw {
                statusCode: 400,
                message: 'Category name already exists'
            };
        }
        updateFields.category_name = trimmedName;
    }

    if (updateFields.logo !== undefined) {
        updateFields.logo = updateFields.logo ? updateFields.logo.trim() : null;
    }

    if (updateFields.status !== undefined) {
        updateFields.status = Number(updateFields.status);
    }

    const setClause = keys.map(field => `${field} = ?`).join(', ');
    const values = keys.map(field => updateFields[field]);
    const queryParams = [...values, id];

    const [result] = await pool.query(
        `UPDATE categories SET ${setClause} WHERE id = ?`,
        queryParams
    );

    if (result.affectedRows === 0) {
        return { 
            success: false, 
            statusCode: 404, 
            message: "Category not found or no changes made." 
        };
    }

    return {
        success: true,
        statusCode: 200,
        message: "Category updated successfully",
        data: { 
            id: Number(id), 
            ...updateFields 
        }
    };
};

/**
 * Delete a store category
 */
export const deleteStoreCategoryService = async (id) => {
    // Check if category exists
    const [[category]] = await pool.query('SELECT id FROM categories WHERE id = ?', [id]);
    if (!category) {
        throw {
            statusCode: 404,
            message: 'Category not found'
        };
    }

    const connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
        // Reassign stores of this category to NULL to satisfy foreign key constraint
        await connection.query('UPDATE stores SET category_id = NULL WHERE category_id = ?', [id]);

        // Delete the category
        await connection.query('DELETE FROM categories WHERE id = ?', [id]);

        await connection.commit();

        return {
            success: true,
            statusCode: 200,
            message: 'Category deleted successfully',
            data: { id: Number(id) }
        };
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
};
