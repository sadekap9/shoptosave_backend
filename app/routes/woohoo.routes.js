import express from 'express';
import * as woohooController from '../controller/woohoo/woohoo.controller.js';
import authMiddleware, { authorizeRole } from '../middlewares/verifyMiddleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import {
    generateTokenSchema,
    placeOrderSchema,
    checkBalanceSchema,
    resendCardsSchema
} from '../validations/woohoo.validation.js';

const router = express.Router();

// ─── AUTHENTICATION ────────────────────────────────────────────────────────────

/**
 * POST /api/v1/woohoo/auth/generate-code
 * Step 1: Generate Authorization Code from Woohoo
 * No body required — credentials are read from .env
 */
router.post('/auth/generate-code', woohooController.generateAuthCode);

/**
 * POST /api/v1/woohoo/auth/generate-token
 * Step 2: Exchange Authorization Code for a Bearer Token
 * Body: { "authorizationCode": "..." }
 */
router.post('/auth/generate-token', validate(generateTokenSchema), woohooController.generateBearerToken);

// ─── CATALOG ──────────────────────────────────────────────────────────────────

/**
 * GET /api/v1/woohoo/catalog/categories
 * Fetch all gift card categories
 * Header: Authorization: Bearer <woohoo_bearer_token>
 */
router.get('/catalog/categories', woohooController.getCategories);

/**
 * GET /api/v1/woohoo/catalog/db-categories
 * Fetch all gift card categories from database
 */
router.get('/catalog/db-categories', woohooController.getDBCategories);

/**
 * GET /api/v1/woohoo/catalog/categories/db
 * Fetch all gift card categories from database (alternative route)
 */
router.get('/catalog/categories/db', woohooController.getDBCategories);

/**
 * GET /api/v1/woohoo/catalog/categories/:categoryId/products
 * Fetch products in a given category
 * Header: Authorization: Bearer <woohoo_bearer_token>
 */
router.get('/catalog/categories/:categoryId/products', woohooController.getProductsByCategory);

/**
 * GET /api/v1/woohoo/catalog/products/:sku
 * Fetch a single product by SKU (e.g. CNPIN)
 * Header: Authorization: Bearer <woohoo_bearer_token>
 */
router.get('/catalog/products/:sku', woohooController.getProduct);

// ─── ORDERS ───────────────────────────────────────────────────────────────────

/**
 * POST /api/v1/woohoo/orders
 * Place a new gift card order
 * Header: Authorization: Bearer <woohoo_bearer_token>
 * Body: { address, payments, refno, syncOnly, deliveryMode, products }
 */
router.post('/orders', validate(placeOrderSchema), woohooController.placeOrder);

/**
 * GET /api/v1/woohoo/orders/:orderId/status
 * Get the status of an order
 * Header: Authorization: Bearer <woohoo_bearer_token>
 */
router.get('/orders/:orderId/status', woohooController.getOrderStatus);

/**
 * GET /api/v1/woohoo/orders/:orderId/cards
 * Get activated cards for an order
 * Header: Authorization: Bearer <woohoo_bearer_token>
 * Query: ?offset=0&limit=10
 */
router.get('/orders/:orderId/cards', woohooController.getActivatedCards);

/**
 * GET /api/v1/woohoo/orders/:orderId
 * Get full order details
 * Header: Authorization: Bearer <woohoo_bearer_token>
 */
router.get('/orders/:orderId', woohooController.getOrderDetails);

// ─── CARD BALANCE ─────────────────────────────────────────────────────────────

/**
 * POST /api/v1/woohoo/balance
 * Check gift card balance
 * Header: Authorization: Bearer <woohoo_bearer_token>
 * Body: { "cardNumber": "1122001540000247" }
 */
router.post('/balance', validate(checkBalanceSchema), woohooController.getCardBalance);

// ─── RESEND ───────────────────────────────────────────────────────────────────

/**
 * POST /api/v1/woohoo/orders/:orderId/resend
 * Resend gift cards to recipients
 * Header: Authorization: Bearer <woohoo_bearer_token>
 * Body: { "cards": [{ "id": 1366668, "name": "...", "telephone": "...", "email": "..." }] }
 */
router.post('/orders/:orderId/resend', validate(resendCardsSchema), woohooController.resendCards);

// Synced Woohoo products endpoints (restricted to admin/subadmin)
router.get('/products', authMiddleware, authorizeRole([1, 2]), woohooController.getSyncedProductsList);
router.get('/products/sku/:sku', authMiddleware, authorizeRole([1, 2]), woohooController.getSyncedProductBySku);
router.get('/products/:id', authMiddleware, authorizeRole([1, 2]), woohooController.getSyncedProductDetails);

export default router;
