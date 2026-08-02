import * as disputesService from '../../services/disputes/disputes.service.js';
import logger from '../../utils/logger.js';

/**
 * Create a new dispute
 */
export const createDispute = async (req, res) => {
    try {
        const userId = req.user.id;
        const payload = req.validatedData;

        logger.info(`[Disputes Controller] User ${userId} is creating a dispute for order ${payload.orderId}`);

        const result = await disputesService.createDisputeService(userId, payload);

        if (!result.success) {
            return res.status(result.statusCode).json({
                success: false,
                errors: [{ message: result.message }],
                result: {}
            });
        }

        return res.status(result.statusCode).json({
            success: true,
            errors: [],
            result: {
                message: result.message,
                data: result.data
            }
        });
    } catch (error) {
        logger.error('[Disputes Controller] Error in createDispute', { error: error.message, stack: error.stack });
        return res.status(500).json({
            success: false,
            errors: [{ message: error.message || 'Internal server error' }],
            result: {}
        });
    }
};

/**
 * Retrieve disputes list (Admins see all, standard users see their own)
 */
export const getDisputes = async (req, res) => {
    try {
        const user = req.user;
        const { page, limit } = req.query;

        logger.info(`[Disputes Controller] User ${user.id} (Role: ${user.role}) is fetching disputes (Page: ${page}, Limit: ${limit})`);

        const result = await disputesService.getDisputesService(user, page, limit);

        return res.status(result.statusCode).json({
            success: true,
            errors: [],
            result: {
                message: result.message,
                data: result.data,
                pagination: result.pagination
            }
        });
    } catch (error) {
        logger.error('[Disputes Controller] Error in getDisputes', { error: error.message, stack: error.stack });
        return res.status(500).json({
            success: false,
            errors: [{ message: error.message || 'Internal server error' }],
            result: {}
        });
    }
};

/**
 * Retrieve a specific dispute by ID
 */
export const getDisputeById = async (req, res) => {
    try {
        const user = req.user;
        const { disputeId } = req.params;

        logger.info(`[Disputes Controller] User ${user.id} fetching dispute #${disputeId}`);

        const result = await disputesService.getDisputeByIdService(user, disputeId);

        if (!result.success) {
            return res.status(result.statusCode).json({
                success: false,
                errors: [{ message: result.message }],
                result: {}
            });
        }

        return res.status(result.statusCode).json({
            success: true,
            errors: [],
            result: {
                message: result.message,
                data: result.data
            }
        });
    } catch (error) {
        logger.error('[Disputes Controller] Error in getDisputeById', { error: error.message, stack: error.stack });
        return res.status(500).json({
            success: false,
            errors: [{ message: error.message || 'Internal server error' }],
            result: {}
        });
    }
};

/**
 * Update dispute status (Admins/Sub-Admins only)
 */
export const updateDisputeStatus = async (req, res) => {
    try {
        const { disputeId } = req.params;
        const { status } = req.body;

        logger.info(`[Disputes Controller] Admin ${req.user.id} updating status of dispute #${disputeId} to ${status}`);

        const result = await disputesService.updateDisputeStatusService(disputeId, status);

        if (!result.success) {
            return res.status(result.statusCode).json({
                success: false,
                errors: [{ message: result.message }],
                result: {}
            });
        }

        return res.status(result.statusCode).json({
            success: true,
            errors: [],
            result: {
                message: result.message,
                data: result.data
            }
        });
    } catch (error) {
        logger.error('[Disputes Controller] Error in updateDisputeStatus', { error: error.message, stack: error.stack });
        return res.status(500).json({
            success: false,
            errors: [{ message: error.message || 'Internal server error' }],
            result: {}
        });
    }
};
