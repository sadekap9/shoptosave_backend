import * as woohooService from '../../services/categories/categories.service.js';
import logger from '../../utils/logger.js';

/**
 * Get all active categories (Full Tree)
 */
export const getCategories = async (req, res) => {
    try {
        const categories = await woohooService.getCategoriesFromDB();
        return res.status(200).json({
            success: true,
            message: 'Categories tree fetched successfully',
            result: categories
        });
    } catch (error) {
        logger.error('Error in getCategories', { error: error.message, stack: error.stack });
        return res.status(500).json({
            success: false,
            message: 'Internal server error',
            result: {}
        });
    }
};



/**
 * Manually trigger synchronization with Woohoo API (Categories)
 */
export const syncCategories = async (req, res) => {
    try {
        const result = await woohooService.syncCategoriesWithWoohoo();
        return res.status(200).json({
            success: true,
            message: 'Categories synchronized successfully with Woohoo',
            result: result
        });
    } catch (error) {
        logger.error('Error in syncCategories', { error: error.message, stack: error.stack });
        return res.status(500).json({
            success: false,
            message: error.message || 'Sync failed',
            result: {}
        });
    }
};



export {
    getProductsByCategory,
    syncProducts,
    storeProduct
} from '../products/products.controller.js';
