import express from 'express';
import * as ordersController from '../controller/orders/orders.controller.js';
import authMiddleware from '../middlewares/verifyMiddleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import { placeOrderSchema } from '../validations/order.validation.js';

const router = express.Router();

/**
 * POST /api/v1/orders
 * Protected route to place a gift card order
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

// ─── NEW SCHEMA-ALIGNED ENDPOINTS ─────────────────────────────────────────────

// Place a new gift card order (Wallet, UPI, or Both split payment)
router.post('/gift-card', authMiddleware, ordersController.placeGiftCardOrder);

// Retrieve detailed order history breakdown
router.get('/:orderId', authMiddleware, ordersController.getOrder);

export default router;
