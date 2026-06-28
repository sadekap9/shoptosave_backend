import * as storesService from '../../services/stores/stores.service.js';
import logger from '../../utils/logger.js';

/**
 * Get all stores - Admin / Sub-Admin
 */
export const getStores = async (req, res) => {
    try {
        const { page, limit } = req.query;
        const response = await storesService.getStoresService(page, limit);
        
        return res.status(response.statusCode).json({
            success: response.success,
            errors: response.success ? [] : [{ message: response.message }],
            result: {
                message: response.message,
                data: response.data,
                pagination: response.pagination
            }
        });
    } catch (error) {
        logger.error('Error in getStores', { error: error.message });
        return res.status(500).json({
            success: false,
            errors: [{ message: 'Internal server error' }],
            result: {}
        });
    }
};

/**
 * Create a new store
 */
export const createStore = async (req, res) => {
    try {
        const { store_name, category_id, status } = req.validatedData;
        let logo = req.validatedData.logo;

        if (req.file) {
            logo = `/uploads/${req.file.filename}`;
        }

        const response = await storesService.createStoreService({
            store_name,
            logo,
            category_id: category_id !== undefined && category_id !== '' ? parseInt(category_id) : null,
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
        logger.error('Error in createStore', { error: error.message });
        return res.status(500).json({
            success: false,
            errors: [{ message: 'Internal server error' }],
            result: {}
        });
    }
};

/**
 * Update an existing store
 */
export const updateStore = async (req, res) => {
    try {
        const { id } = req.params;
        const { store_name, category_id, status } = req.validatedData;
        let logo = req.validatedData.logo;

        if (req.file) {
            logo = `/uploads/${req.file.filename}`;
        }

        const updateData = {};
        if (store_name !== undefined) updateData.store_name = store_name;
        if (logo !== undefined) updateData.logo = logo;
        if (category_id !== undefined) {
            updateData.category_id = category_id !== '' && category_id !== null && category_id !== 'null' 
                ? parseInt(category_id) 
                : null;
        }
        if (status !== undefined) updateData.status = status;

        const response = await storesService.updateStoreService(id, updateData);
        
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
        logger.error('Error in updateStore', { error: error.message });
        return res.status(500).json({
            success: false,
            errors: [{ message: 'Internal server error' }],
            result: {}
        });
    }
};

/**
 * Delete a store
 */
export const deleteStore = async (req, res) => {
    try {
        const { id } = req.params;
        const response = await storesService.deleteStoreService(id);
        
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
        logger.error('Error in deleteStore', { error: error.message });
        return res.status(500).json({
            success: false,
            errors: [{ message: 'Internal server error' }],
            result: {}
        });
    }
};
