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

/**
 * Handle Gift Card Order Placement
 */
export const placeGiftCardOrder = async (req, res) => {
    try {
        const userId = req.user.id;
        const { giftcard_id, sku, price, qty, payment_method, reference_id } = req.body;

        // Basic payload validation
        if (!giftcard_id || !sku || !price || !qty || !payment_method || !reference_id) {
            return res.status(400).json({
                success: false,
                error: 'Missing required request parameters. Check giftcard_id, sku, price, qty, payment_method, reference_id.',
                code: 'INVALID_PARAMETERS'
            });
        }

        const validMethods = ['wallet', 'upi', 'both'];
        if (!validMethods.includes(payment_method)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid payment method. Allowed options: wallet, upi, both.',
                code: 'INVALID_PAYMENT_METHOD'
            });
        }

        const response = await ordersService.placeGiftCardOrderFlow(userId, {
            giftcard_id,
            sku,
            price,
            qty,
            payment_method,
            reference_id
        });

        return res.status(200).json({
            success: true,
            result: response.data
        });

    } catch (error) {
        logger.error('[Order Controller] placeGiftCardOrder failed', { error: error.message || error });
        
        const statusCode = error.statusCode || 500;
        return res.status(statusCode).json({
            success: false,
            error: error.message || 'Internal server error during order placement',
            code: error.code || 'INTERNAL_ERROR'
        });
    }
};

/**
 * Get Order Details by ID
 */
export const getOrder = async (req, res) => {
    try {
        const { orderId } = req.params;
        if (!orderId) {
            return res.status(400).json({
                success: false,
                error: 'Order ID parameter is required',
                code: 'INVALID_PARAMETERS'
            });
        }

        const response = await ordersService.getOrderById(orderId);
        return res.status(200).json({
            success: true,
            result: response.data
        });

    } catch (error) {
        logger.error('[Order Controller] getOrder failed', { error: error.message || error });
        const statusCode = error.statusCode || 500;
        return res.status(statusCode).json({
            success: false,
            error: error.message || 'Internal server error',
            code: error.code || 'INTERNAL_ERROR'
        });
    }
};
