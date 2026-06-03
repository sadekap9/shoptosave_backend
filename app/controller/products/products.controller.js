import * as productsService from '../../services/products/products.service.js';
import logger from '../../utils/logger.js';

/**
 * Get products by category ID
 */
export const getProductsByCategory = async (req, res) => {
    try {
        const { categoryId } = req.params;
        const products = await productsService.getProductsByCategoryFromDB(categoryId);
        return res.status(200).json({
            success: true,
            message: 'Products fetched successfully',
            result: products
        });
    } catch (error) {
        logger.error('Error in getProductsByCategory', { error: error.message, stack: error.stack });
        return res.status(500).json({
            success: false,
            message: 'Internal server error',
            result: {}
        });
    }
};

/**
 * Manually trigger synchronization with Woohoo API (Products)
 */
export const syncProducts = async (req, res) => {
    try {
        const result = await productsService.syncProductsWithWoohoo();
        return res.status(200).json({
            success: true,
            message: 'Products synchronized successfully with Woohoo',
            result: result
        });
    } catch (error) {
        logger.error('Error in syncProducts', { error: error.message, stack: error.stack });
        return res.status(500).json({
            success: false,
            message: error.message || 'Product sync failed',
            result: {}
        });
    }
};

/**
 * Store products in the database (Single or Bulk)
 */
export const storeProduct = async (req, res) => {
    try {
        const result = await productsService.storeProductInDB(req.body);
        return res.status(201).json({
            success: true,
            message: 'Product(s) stored successfully',
            result: {
                skus: result
            }
        });
    } catch (error) {
        logger.error('Error in storeProduct', { error: error.message, stack: error.stack });
        return res.status(400).json({
            success: false,
            message: error.message || 'Failed to store product(s)',
            result: {}
        });
    }
};

/**
 * Get product by SKU from database
 */
export const getProductBySku = async (req, res) => {
    try {
        const { sku } = req.params;
        const product = await productsService.getProductBySkuFromDB(sku);
        if (!product) {
            return res.status(404).json({
                success: false,
                message: 'Product not found in database',
                result: {}
            });
        }
        return res.status(200).json({
            success: true,
            message: 'Product fetched from database successfully',
            result: product
        });
    } catch (error) {
        logger.error('Error in getProductBySku', { error: error.message, stack: error.stack });
        return res.status(500).json({
            success: false,
            message: 'Internal server error',
            result: {}
        });
    }
};
