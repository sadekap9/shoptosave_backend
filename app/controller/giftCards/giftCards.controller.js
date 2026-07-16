import * as giftCardsService from '../../services/giftCards/giftCards.service.js';
import logger from '../../utils/logger.js';

/**
 * Get all gift cards - Admin / Sub-Admin (Optional filter ?store_id=12)
 */
export const getGiftCards = async (req, res) => {
    try {
        const response = await giftCardsService.getGiftCardsService(req.query);
        
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
        logger.error('Error in getGiftCards', { error: error.message, stack: error.stack });
        return res.status(500).json({
            success: false,
            errors: [{ message: 'Internal server error' }],
            result: {}
        });
    }
};

/**
 * Get gift cards by store ID - Admin / Sub-Admin
 */
export const getGiftCardsByStore = async (req, res) => {
    try {
        const { storeId } = req.params;
        const { page, limit } = req.query;
        const response = await giftCardsService.getGiftCardsService({ store_id: storeId, page, limit, shortResponse: true });
        
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
        logger.error('Error in getGiftCardsByStore', { error: error.message, stack: error.stack });
        return res.status(500).json({
            success: false,
            errors: [{ message: 'Internal server error' }],
            result: {}
        });
    }
};

/**
 * Create a new gift card
 */
export const createGiftCard = async (req, res) => {
    try {
        const data = { ...req.body };
        if (req.files && req.files.giftcard_image && req.files.giftcard_image.length > 0) {
            data.giftcard_image = `/uploads/giftcards/${req.files.giftcard_image[0].filename}`;
        }
        const response = await giftCardsService.createGiftCardService(data);
        
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
        logger.error('Error in createGiftCard', { error: error.message, stack: error.stack });
        return res.status(500).json({
            success: false,
            errors: [{ message: 'Internal server error' }],
            result: {}
        });
    }
};

/**
 * Update an existing gift card
 */
export const updateGiftCard = async (req, res) => {
    try {
        const { id } = req.params;
        const data = { ...req.body };
        if (req.files && req.files.giftcard_image && req.files.giftcard_image.length > 0) {
            data.giftcard_image = `/uploads/giftcards/${req.files.giftcard_image[0].filename}`;
        }
        const response = await giftCardsService.updateGiftCardService(id, data);
        
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
        logger.error('Error in updateGiftCard', { error: error.message, stack: error.stack });
        return res.status(500).json({
            success: false,
            errors: [{ message: 'Internal server error' }],
            result: {}
        });
    }
};

/**
 * Delete a gift card
 */
export const deleteGiftCard = async (req, res) => {
    try {
        const { id } = req.params;
        const response = await giftCardsService.deleteGiftCardService(id);
        
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
        logger.error('Error in deleteGiftCard', { error: error.message, stack: error.stack });
        return res.status(500).json({
            success: false,
            errors: [{ message: 'Internal server error' }],
            result: {}
        });
    }
};

/**
 * Get single gift card details by ID
 */
export const getGiftCardById = async (req, res) => {
    try {
        const { id } = req.params;
        const response = await giftCardsService.getGiftCardByIdService(id);
        
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
        logger.error('Error in getGiftCardById', { error: error.message, stack: error.stack });
        return res.status(500).json({
            success: false,
            errors: [{ message: 'Internal server error' }],
            result: {}
        });
    }
};

/**
 * Get active gift cards - Public/Customer API
 */
export const getClientGiftCards = async (req, res) => {
    try {
        const filters = {
            store_id: req.query.store_id,
            category_id: req.query.category_id,
            search: req.query.search,
            usage_type: req.query.usage_type,
            page: req.query.page,
            limit: req.query.limit,
            sort_by: req.query.sort_by,
            sort_order: req.query.sort_order
        };

        const response = await giftCardsService.getClientGiftCardsService(filters);

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
        logger.error('Error in getClientGiftCards', { error: error.message, stack: error.stack });
        return res.status(500).json({
            success: false,
            errors: [{ message: 'Internal server error' }],
            result: {}
        });
    }
};

/**
 * Get active gift card details by ID - Public/Customer API
 */
export const getClientGiftCardById = async (req, res) => {
    try {
        const { id } = req.params;
        const response = await giftCardsService.getClientGiftCardByIdService(id);

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
        logger.error('Error in getClientGiftCardById', { error: error.message, stack: error.stack });
        return res.status(500).json({
            success: false,
            errors: [{ message: 'Internal server error' }],
            result: {}
        });
    }
};
