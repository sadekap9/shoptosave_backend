import pool from '../config/dbConfig.js';
import logger from '../utils/logger.js';

// 1. Get all store categories
export const getStoreCategories = async (req, res) => {
    try {
        const [rows] = await pool.query(
            'SELECT id, category_name, logo, status, created_at, updated_at FROM categories ORDER BY id ASC'
        );
        return res.status(200).json({
            success: true,
            message: 'Store categories fetched successfully',
            result: rows
        });
    } catch (error) {
        logger.error('Error in getStoreCategories', { error: error.message });
        return res.status(500).json({
            success: false,
            message: 'Internal server error',
            result: {}
        });
    }
};

// 2. Create store category
export const createStoreCategory = async (req, res) => {
    try {
        const { category_name, logo, status } = req.body;
        if (!category_name || !category_name.trim()) {
            return res.status(400).json({
                success: false,
                message: 'Category name is required',
                result: {}
            });
        }

        // Get max ID to simulate auto-increment since table definition doesn't have it
        const [[{ maxId }]] = await pool.query('SELECT MAX(id) AS maxId FROM categories');
        const newId = (maxId || 0) + 1;

        const categoryStatus = status !== undefined ? status : 1;

        await pool.query(
            'INSERT INTO categories (id, category_name, logo, status) VALUES (?, ?, ?, ?)',
            [newId, category_name.trim(), logo ? logo.trim() : null, categoryStatus]
        );

        return res.status(201).json({
            success: true,
            message: 'Category created successfully',
            result: {
                id: newId,
                category_name: category_name.trim(),
                logo: logo ? logo.trim() : null,
                status: categoryStatus
            }
        });
    } catch (error) {
        logger.error('Error in createStoreCategory', { error: error.message });
        return res.status(500).json({
            success: false,
            message: 'Internal server error',
            result: {}
        });
    }
};

// 3. Update store category
export const updateStoreCategory = async (req, res) => {
    try {
        const { id } = req.params;
        const { category_name, logo, status } = req.body;

        // Check if category exists
        const [[category]] = await pool.query('SELECT id FROM categories WHERE id = ?', [id]);
        if (!category) {
            return res.status(404).json({
                success: false,
                message: 'Category not found',
                result: {}
            });
        }

        // Build dynamic update fields
        const updateFields = [];
        const params = [];

        if (category_name !== undefined) {
            if (!category_name.trim()) {
                return res.status(400).json({
                    success: false,
                    message: 'Category name cannot be empty',
                    result: {}
                });
            }
            updateFields.push('category_name = ?');
            params.push(category_name.trim());
        }

        if (logo !== undefined) {
            updateFields.push('logo = ?');
            params.push(logo ? logo.trim() : null);
        }

        if (status !== undefined) {
            updateFields.push('status = ?');
            params.push(status);
        }

        if (updateFields.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No fields provided for update',
                result: {}
            });
        }

        params.push(id);
        await pool.query(
            `UPDATE categories SET ${updateFields.join(', ')} WHERE id = ?`,
            params
        );

        return res.status(200).json({
            success: true,
            message: 'Category updated successfully',
            result: { id: parseInt(id), category_name, logo, status }
        });
    } catch (error) {
        logger.error('Error in updateStoreCategory', { error: error.message });
        return res.status(500).json({
            success: false,
            message: 'Internal server error',
            result: {}
        });
    }
};

// 4. Delete store category
export const deleteStoreCategory = async (req, res) => {
    try {
        const { id } = req.params;

        // Check if category exists
        const [[category]] = await pool.query('SELECT id FROM categories WHERE id = ?', [id]);
        if (!category) {
            return res.status(404).json({
                success: false,
                message: 'Category not found',
                result: {}
            });
        }

        await pool.query('DELETE FROM categories WHERE id = ?', [id]);

        return res.status(200).json({
            success: true,
            message: 'Category deleted successfully',
            result: { id: parseInt(id) }
        });
    } catch (error) {
        logger.error('Error in deleteStoreCategory', { error: error.message });
        return res.status(500).json({
            success: false,
            message: 'Internal server error',
            result: {}
        });
    }
};
