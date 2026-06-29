import * as ordersService from '../../services/orders/orders.service.js';
import logger from '../../utils/logger.js';

/**
 * Controller to handle ordering a gift card (legacy — wallet only)
 */
export const placeOrder = async (req, res) => {
    try {
        const userId = req.user.id;
        const orderData = req.validatedData;

        logger.info(`[Orders Controller] User ${userId} is placing an order for gift card ${orderData.gift_card_id}`);

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
 * Fetch authenticated customer's order history
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
 * Handle Gift Card Order Placement (supports Wallet, Online, Split payment)
 */
export const placeGiftCardOrder = async (req, res) => {
    try {
        const userId = req.user.id;
        const {
            giftcard_id, sku, price, qty,
            payment_type, payment_method,
            is_self_purchase,
            recipient_name, recipient_email, recipient_mobile,
            gift_message
        } = req.body;

        // Basic payload validation
        if (!giftcard_id || !sku || !price || !qty || !payment_type) {
            return res.status(400).json({
                success: false,
                error: 'Missing required request parameters. Check giftcard_id, sku, price, qty, payment_type.',
                code: 'INVALID_PARAMETERS'
            });
        }

        const response = await ordersService.placeGiftCardOrderFlow(userId, {
            giftcard_id,
            sku,
            price,
            qty,
            payment_type,
            payment_method,
            is_self_purchase,
            recipient_name,
            recipient_email,
            recipient_mobile,
            gift_message
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

/**
 * POST /api/v1/orders/:orderId/refund
 * Refund a successful order's wallet portion back to the user's wallet.
 */
export const refundOrderToWallet = async (req, res) => {
    try {
        const userId = req.user.id;
        const { orderId } = req.params;

        if (!orderId) {
            return res.status(400).json({
                success: false,
                error: 'Order ID parameter is required',
                code: 'INVALID_PARAMETERS'
            });
        }

        const response = await ordersService.refundOrderToWalletService(userId, parseInt(orderId));

        return res.status(200).json({
            success: true,
            message: response.message,
            data: {
                refunded_amount: response.refunded_amount,
                new_balance: response.new_balance,
                transaction_no: response.transaction_no
            }
        });

    } catch (error) {
        logger.error('[Order Controller] refundOrderToWallet failed', { error: error.message || error });
        const statusCode = error.statusCode || 500;
        return res.status(statusCode).json({
            success: false,
            error: error.message || 'Refund failed',
            code: error.code || 'REFUND_FAILED'
        });
    }
};
