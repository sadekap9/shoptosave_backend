import * as giftCardsService from '../services/giftCards/giftCards.service.js';
import logger from '../utils/logger.js';

/**
 * Get all gift cards - Admin / Sub-Admin
 */
export const getGiftCards = async (req, res) => {
    try {
        const response = await giftCardsService.getGiftCardsService();
        
        return res.status(response.statusCode).json({
            success: response.success,
            errors: response.success ? [] : [{ message: response.message }],
            result: {
                message: response.message,
                data: response.data
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
 * Create a new gift card
 */
export const createGiftCard = async (req, res) => {
    try {
        const response = await giftCardsService.createGiftCardService(req.body, req.files);
        
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
        const response = await giftCardsService.updateGiftCardService(id, req.body, req.files);
        
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
