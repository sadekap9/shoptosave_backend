import express from 'express';
import * as ordersController from '../controller/orders/orders.controller.js';
import authMiddleware from '../middlewares/verifyMiddleware.js';
import { validate, validateParams } from '../middlewares/validate.middleware.js';
import { placeOrderSchema, giftCardOrderSchema, orderIdParamSchema } from '../validations/order.validation.js';

const router = express.Router();

/**
 * POST /api/v1/orders
 * Protected route to place a gift card order (legacy — wallet only)
 * Debits user wallet, invokes Woohoo Order API, and returns order result
 */
router.post(
    '/',
    authMiddleware,
    validate(placeOrderSchema),
    ordersController.placeOrder
);

/**
 * GET /api/v1/orders/history
 * Fetch authenticated user's gift card orders history
 */
router.get(
    '/history',
    authMiddleware,
    ordersController.getOrderHistory
);

/**
 * POST /api/v1/orders/gift-card
 * Place a new gift card order (Wallet, Online, or Split payment)
 */
router.post('/gift-card', authMiddleware, validate(giftCardOrderSchema), ordersController.placeGiftCardOrder);

/**
 * POST /api/v1/orders/:orderId/refund
 * Refund a successful order's wallet portion back to the user's wallet
 */
router.post('/:orderId/refund', authMiddleware, validateParams(orderIdParamSchema), ordersController.refundOrderToWallet);

/**
 * GET /api/v1/orders/:orderId
 * Retrieve detailed order breakdown by ID
 */
router.get('/:orderId', authMiddleware, validateParams(orderIdParamSchema), ordersController.getOrder);


export default router;
