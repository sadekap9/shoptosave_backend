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

// Generate Authorization Code from Woohoo
router.post('/auth/generate-code', woohooController.generateAuthCode);

// Exchange Authorization Code for a Bearer Token
router.post('/auth/generate-token', validate(generateTokenSchema), woohooController.generateBearerToken);

// Fetch all gift card categories from Woohoo
router.get('/catalog/categories', woohooController.getCategories);

// Fetch all gift card categories from local database
router.get('/catalog/db-categories', woohooController.getDBCategories);

// Fetch all gift card categories from local database (alternative route)
router.get('/catalog/categories/db', woohooController.getDBCategories);

// Fetch products in a given category
router.get('/catalog/categories/:categoryId/products', woohooController.getProductsByCategory);

// Fetch a single product by SKU
router.get('/catalog/products/:sku', woohooController.getProduct);

// Place a new gift card order
router.post('/orders', validate(placeOrderSchema), woohooController.placeOrder);

// Get the status of an order
router.get('/orders/:orderId/status', woohooController.getOrderStatus);

// Get activated cards for an order
router.get('/orders/:orderId/cards', woohooController.getActivatedCards);

// Get full order details
router.get('/orders/:orderId', woohooController.getOrderDetails);

// Check gift card balance
router.post('/balance', validate(checkBalanceSchema), woohooController.getCardBalance);

// Resend gift cards to recipients
router.post('/orders/:orderId/resend', validate(resendCardsSchema), woohooController.resendCards);

// Synced Woohoo products endpoints (restricted to admin/subadmin)
router.get('/products', authMiddleware, authorizeRole([1, 2]), woohooController.getSyncedProductsList);
router.get('/products/sku/:sku', authMiddleware, authorizeRole([1, 2]), woohooController.getSyncedProductBySku);
router.get('/products/:id', authMiddleware, authorizeRole([1, 2]), woohooController.getSyncedProductDetails);

export default router;
