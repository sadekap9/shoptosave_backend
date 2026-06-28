import * as ordersService from '../../services/orders/orders.service.js';
import logger from '../../utils/logger.js';

/**
 * Controller to handle ordering a gift card
 */
export const placeOrder = async (req, res) => {
    try {
        const userId = req.user.id;
        const orderData = req.validatedData;

        logger.info(`[Orders Controller] User ${userId} is placing an order for SKU ${orderData.sku}`);

        const response = await ordersService.placeOrderService(userId, orderData);

        if (!response.success) {
            return res.status(response.statusCode).json({
                success: false,
                errors: [{ message: response.message }],
                result: response.result || {}
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
        logger.error('[Orders Controller] Error in placeOrder', { error: error.message, stack: error.stack });
        return res.status(500).json({
            success: false,
            errors: [{ message: 'Internal server error' }],
            result: {}
        });
    }
};

/**
 * Fetch authenticated customer's order history (Step 12)
 */
export const getOrderHistory = async (req, res) => {
    try {
        const userId = req.user.id;
        const response = await ordersService.getOrderHistoryService(userId);

        return res.status(response.statusCode).json({
            success: response.success,
            errors: [],
            result: {
                message: response.message,
                data: response.data
            }
        });
    } catch (error) {
        logger.error('[Orders Controller] Error in getOrderHistory', { error: error.message, stack: error.stack });
        return res.status(500).json({
            success: false,
            errors: [{ message: 'Internal server error' }],
            result: {}
        });
    }
};
