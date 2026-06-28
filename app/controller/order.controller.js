import * as orderService from '../services/order.service.js';
import logger from '../utils/logger.js';

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

        const response = await orderService.placeGiftCardOrderFlow(userId, {
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

        const response = await orderService.getOrderById(orderId);
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
