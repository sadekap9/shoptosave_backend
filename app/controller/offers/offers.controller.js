import * as offersService from '../../services/offers/offers.service.js';
import logger from '../../utils/logger.js';

/**
 * Create a new offer
 */
export const createOffer = async (req, res) => {
    try {
        const payload = req.validatedData || req.body;
        const response = await offersService.createOfferService(payload);

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
        logger.error('Error in createOffer controller', { error: error.message, stack: error.stack });
        return res.status(500).json({
            success: false,
            errors: [{ message: 'Internal server error' }],
            result: {}
        });
    }
};

/**
 * Get all offers with filters
 */
export const getOffers = async (req, res) => {
    try {
        const userRole = req.user?.role;
        let response;

        if (userRole === 1 || userRole === 2) {
            // Admin and Sub-admin get all offers with filters
            response = await offersService.getOffersService(req.query);
        } else {
            // Regular users get active/valid offers only
            response = await offersService.getActiveOffersService();
        }

        return res.status(response.statusCode).json({
            success: true,
            errors: [],
            result: {
                message: response.message,
                data: response.data,
                pagination: response.pagination,
                statistics: response.statistics
            }
        });
    } catch (error) {
        logger.error('Error in getOffers controller', { error: error.message, stack: error.stack });
        return res.status(error.statusCode || 500).json({
            success: false,
            errors: [{ message: error.message || 'Internal server error' }],
            result: {}
        });
    }
};

/**
 * Get offer details by ID
 */
export const getOfferById = async (req, res) => {
    try {
        const { id } = req.params;
        const response = await offersService.getOfferByIdService(id);

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
        logger.error('Error in getOfferById controller', { error: error.message, stack: error.stack });
        return res.status(500).json({
            success: false,
            errors: [{ message: 'Internal server error' }],
            result: {}
        });
    }
};

/**
 * Update an existing offer
 */
export const updateOffer = async (req, res) => {
    try {
        const { id } = req.params;
        const payload = req.validatedData || req.body;
        const response = await offersService.updateOfferService(id, payload);

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
                message: response.message
            }
        });
    } catch (error) {
        logger.error('Error in updateOffer controller', { error: error.message, stack: error.stack });
        return res.status(500).json({
            success: false,
            errors: [{ message: 'Internal server error' }],
            result: {}
        });
    }
};

/**
 * Delete an offer
 */
export const deleteOffer = async (req, res) => {
    try {
        const { id } = req.params;
        const response = await offersService.deleteOfferService(id);

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
                message: response.message
            }
        });
    } catch (error) {
        logger.error('Error in deleteOffer controller', { error: error.message, stack: error.stack });
        return res.status(500).json({
            success: false,
            errors: [{ message: 'Internal server error' }],
            result: {}
        });
    }
};

/**
 * Change status of an offer (Active / Inactive)
 */
export const changeOfferStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.validatedData || req.body;
        const response = await offersService.changeOfferStatusService(id, status);

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
                message: response.message
            }
        });
    } catch (error) {
        logger.error('Error in changeOfferStatus controller', { error: error.message, stack: error.stack });
        return res.status(500).json({
            success: false,
            errors: [{ message: 'Internal server error' }],
            result: {}
        });
    }
};

/**
 * View usage history logs for offers
 */
export const getOfferUsageHistory = async (req, res) => {
    try {
        const response = await offersService.getOfferUsageHistoryService(req.query);

        return res.status(response.statusCode).json({
            success: true,
            errors: [],
            result: {
                message: response.message,
                data: response.data,
                pagination: response.pagination
            }
        });
    } catch (error) {
        logger.error('Error in getOfferUsageHistory controller', { error: error.message, stack: error.stack });
        return res.status(500).json({
            success: false,
            errors: [{ message: 'Internal server error' }],
            result: {}
        });
    }
};

/**
 * Get only active and valid offers for user (frontend)
 */
export const getActiveOffers = async (req, res) => {
    try {
        const response = await offersService.getActiveOffersService();

        return res.status(response.statusCode).json({
            success: true,
            errors: [],
            result: {
                message: response.message,
                data: response.data
            }
        });
    } catch (error) {
        logger.error('Error in getActiveOffers controller', { error: error.message, stack: error.stack });
        return res.status(500).json({
            success: false,
            errors: [{ message: 'Internal server error' }],
            result: {}
        });
    }
};

/**
 * Validate and apply a promo code without placing an order
 */
export const applyPromoCode = async (req, res) => {
    try {
        const { promo_code, gift_card_id, amount, user_id } = req.validatedData || req.body;
        const targetUserId = user_id || req.user.id;

        const response = await offersService.applyPromoService(targetUserId, promo_code, gift_card_id, amount);

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
        logger.error('Error in applyPromoCode controller', { error: error.message, stack: error.stack });
        return res.status(500).json({
            success: false,
            errors: [{ message: 'Internal server error' }],
            result: {}
        });
    }
};
