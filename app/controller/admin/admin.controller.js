import * as adminService from '../../services/admin/admin.service.js';
import logger from '../../utils/logger.js';

/**
 * GET /api/v1/admin/wallets/topups
 * List pending requests with filters, pagination, and searches
 */
export const getTopups = async (req, res) => {
    try {
        const filters = req.validatedData;
        const response = await adminService.getTopupRequests(filters);

        return res.status(response.statusCode).json({
            success: response.success,
            errors: [],
            result: {
                message: response.message,
                data: response.data,
                pagination: response.pagination
            }
        });
    } catch (error) {
        logger.error('[Admin Controller] Error in getTopups', { error: error.message, stack: error.stack });
        return res.status(500).json({
            success: false,
            message: 'Internal server error',
            errors: []
        });
    }
};

/**
 * GET /api/v1/admin/orders
 * List all orders with filters, pagination, and searches
 */
export const getOrdersList = async (req, res) => {
    try {
        const filters = req.validatedData;
        const response = await adminService.getOrders(filters);

        return res.status(response.statusCode).json({
            success: response.success,
            errors: [],
            result: {
                message: response.message,
                data: response.data,
                pagination: response.pagination
            }
        });
    } catch (error) {
        logger.error('[Admin Controller] Error in getOrdersList', { error: error.message, stack: error.stack });
        return res.status(500).json({
            success: false,
            message: 'Internal server error',
            errors: []
        });
    }
};

/**
 * GET /api/v1/admin/order/:id
 * Retrieve comprehensive details of a single order
 */
export const getOrder = async (req, res) => {
    try {
        const { id } = req.params;
        const response = await adminService.getOrderDetails(id);

        if (!response.success) {
            return res.status(response.statusCode).json({
                success: false,
                message: response.message,
                errors: []
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
        logger.error('[Admin Controller] Error in getOrder', { error: error.message, stack: error.stack });
        return res.status(500).json({
            success: false,
            message: 'Internal server error',
            errors: []
        });
    }
};

/**
 * POST /api/v1/admin/order/refund
 * Processes manual refund and credits user wallet
 */
export const manualRefund = async (req, res) => {
    try {
        const adminId = req.user.id;
        const { orderId, remarks } = req.validatedData;

        logger.info(`[Admin Controller] Admin ${adminId} is initiating a manual refund for Order ID: ${orderId}`);
        const response = await adminService.refundOrderManually(adminId, orderId, remarks);

        if (!response.success) {
            return res.status(response.statusCode).json({
                success: false,
                message: response.message,
                errors: []
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
        logger.error('[Admin Controller] Error in manualRefund', { error: error.message, stack: error.stack });
        return res.status(500).json({
            success: false,
            message: 'Internal server error',
            errors: []
        });
    }
};
