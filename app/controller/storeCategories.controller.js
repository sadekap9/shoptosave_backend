import * as storeCategoriesService from '../services/storeCategories/storeCategories.service.js';
import logger from '../utils/logger.js';

/**
 * Get all store categories (active & inactive) - Admin
 */
export const getAdminStoreCategories = async (req, res) => {
    try {
        const response = await storeCategoriesService.getAdminStoreCategoriesService();
        
        return res.status(response.statusCode).json({
            success: response.success,
            errors: response.success ? [] : [{ message: response.message }],
            result: {
                message: response.message,
                data: response.data
            }
        });
    } catch (error) {
        logger.error('Error in getAdminStoreCategories', { error: error.message });
        return res.status(500).json({
            success: false,
            errors: [{ message: 'Internal server error' }],
            result: {}
        });
    }
};
/**
 * Get all active store categories - Public
 */
export const getPublicStoreCategories = async (req, res) => {
    try {
        const response = await storeCategoriesService.getPublicStoreCategoriesService();
        
        return res.status(response.statusCode).json({
            success: response.success,
            errors: response.success ? [] : [{ message: response.message }],
            result: {
                message: response.message,
                data: response.data
            }
        });
    } catch (error) {
        logger.error('Error in getPublicStoreCategories', { error: error.message });
        return res.status(500).json({
            success: false,
            errors: [{ message: 'Internal server error' }],
            result: {}
        });
    }
};


/**
 * Create a new store category
 */
export const createStoreCategory = async (req, res) => {
    try {
        const { category_name, status } = req.body;
        let logo = req.body.logo;

        if (req.file) {
            logo = `/uploads/${req.file.filename}`;
        }

        const response = await storeCategoriesService.createStoreCategoryService({
            category_name,
            logo,
            status
        });
        
        if (!response.success) {
            return res.status(response.statusCode).json({
                success: false,
                errors: [{ message: response.message }],
                result: {}
            });
        }
        
        return res.status(response.statusCode).json({
            success: true,
            errors: [],
            result: {
                message: response.message,
                data: response.data
            }
        });
    } catch (error) {
        logger.error('Error in createStoreCategory', { error: error.message });
        return res.status(500).json({
            success: false,
            errors: [{ message: 'Internal server error' }],
            result: {}
        });
    }
};

/**
 * Update an existing store category
 */
export const updateStoreCategory = async (req, res) => {
    try {
        const { id } = req.params;
        const { category_name, status } = req.body;
        let logo = req.body.logo;

        if (req.file) {
            logo = `/uploads/${req.file.filename}`;
        }

        const response = await storeCategoriesService.updateStoreCategoryService(id, {
            category_name,
            logo,
            status
        });
        
        if (!response.success) {
            return res.status(response.statusCode).json({
                success: false,
                errors: [{ message: response.message }],
                result: {}
            });
        }
        
        return res.status(response.statusCode).json({
            success: true,
            errors: [],
            result: {
                message: response.message,
                data: response.data
            }
        });
    } catch (error) {
        logger.error('Error in updateStoreCategory', { error: error.message });
        return res.status(500).json({
            success: false,
            errors: [{ message: 'Internal server error' }],
            result: {}
        });
    }
};

/**
 * Delete a store category
 */
export const deleteStoreCategory = async (req, res) => {
    try {
        const { id } = req.params;
        const response = await storeCategoriesService.deleteStoreCategoryService(id);
        
        if (!response.success) {
            return res.status(response.statusCode).json({
                success: false,
                errors: [{ message: response.message }],
                result: {}
            });
        }
        
        return res.status(response.statusCode).json({
            success: true,
            errors: [],
            result: {
                message: response.message,
                data: response.data
            }
        });
    } catch (error) {
        logger.error('Error in deleteStoreCategory', { error: error.message });
        return res.status(500).json({
            success: false,
            errors: [{ message: 'Internal server error' }],
            result: {}
        });
    }
};
