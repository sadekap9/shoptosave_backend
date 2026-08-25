import * as sellGiftCardService from '../../services/sellGiftCard/sellGiftCard.service.js';
import logger from '../../utils/logger.js';

/**
 * Search active gift card brands
 */
export const searchGiftCardBrands = async (req, res) => {
    try {
        const response = await sellGiftCardService.searchGiftCardBrandsService(req.query);
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
        logger.error('[SellGiftCard Controller] Error in searchGiftCardBrands', { error: error.message, stack: error.stack });
        return res.status(error.statusCode || 500).json({
            success: false,
            errors: [{ message: error.message || 'Internal server error' }],
            result: {}
        });
    }
};

/**
 * Submit sell gift card request
 */
export const submitSellRequest = async (req, res) => {
    try {
        const userId = req.user.id;
        const response = await sellGiftCardService.submitSellRequestService(userId, req.validatedData);
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
        logger.error('[SellGiftCard Controller] Error in submitSellRequest', { error: error.message, stack: error.stack });
        return res.status(error.statusCode || 500).json({
            success: false,
            errors: [{ message: error.message || 'Internal server error' }],
            result: {}
        });
    }
};

/**
 * Get authenticated user's requests
 */
export const getMyRequests = async (req, res) => {
    try {
        const userId = req.user.id;
        const response = await sellGiftCardService.getMyRequestsService(userId, req.query);
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
        logger.error('[SellGiftCard Controller] Error in getMyRequests', { error: error.message, stack: error.stack });
        return res.status(error.statusCode || 500).json({
            success: false,
            errors: [{ message: error.message || 'Internal server error' }],
            result: {}
        });
    }
};

/**
 * Get specific request details for user
 */
export const getRequestDetails = async (req, res) => {
    try {
        const userId = req.user.id;
        const { id } = req.params;
        const response = await sellGiftCardService.getRequestDetailsService(userId, id);
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
        logger.error('[SellGiftCard Controller] Error in getRequestDetails', { error: error.message, stack: error.stack });
        return res.status(error.statusCode || 500).json({
            success: false,
            errors: [{ message: error.message || 'Internal server error' }],
            result: {}
        });
    }
};

/**
 * Admin list requests
 */
export const adminListRequests = async (req, res) => {
    try {
        const response = await sellGiftCardService.adminListRequestsService(req.query);
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
        logger.error('[SellGiftCard Controller] Error in adminListRequests', { error: error.message, stack: error.stack });
        return res.status(error.statusCode || 500).json({
            success: false,
            errors: [{ message: error.message || 'Internal server error' }],
            result: {}
        });
    }
};

/**
 * Admin request details
 */
export const adminGetRequestDetails = async (req, res) => {
    try {
        const { id } = req.params;
        const response = await sellGiftCardService.adminGetRequestDetailsService(id);
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
        logger.error('[SellGiftCard Controller] Error in adminGetRequestDetails', { error: error.message, stack: error.stack });
        return res.status(error.statusCode || 500).json({
            success: false,
            errors: [{ message: error.message || 'Internal server error' }],
            result: {}
        });
    }
};

/**
 * Approve request
 */
export const adminApproveRequest = async (req, res) => {
    try {
        const { id } = req.params;
        const { offered_amount } = req.validatedData;
        const adminId = req.user.id;
        const response = await sellGiftCardService.adminApproveRequestService(id, offered_amount, adminId);
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
        logger.error('[SellGiftCard Controller] Error in adminApproveRequest', { error: error.message, stack: error.stack });
        return res.status(error.statusCode || 500).json({
            success: false,
            errors: [{ message: error.message || 'Internal server error' }],
            result: {}
        });
    }
};

/**
 * Reject request
 */
export const adminRejectRequest = async (req, res) => {
    try {
        const { id } = req.params;
        const { rejection_reason } = req.validatedData;
        const adminId = req.user.id;
        const response = await sellGiftCardService.adminRejectRequestService(id, rejection_reason, adminId);
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
        logger.error('[SellGiftCard Controller] Error in adminRejectRequest', { error: error.message, stack: error.stack });
        return res.status(error.statusCode || 500).json({
            success: false,
            errors: [{ message: error.message || 'Internal server error' }],
            result: {}
        });
    }
};
